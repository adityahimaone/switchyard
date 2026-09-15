# Continuation flow + stacked results + per-file commit 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 review-continuation 路由（comment @agent 触发 todo->running->review），在详情页增加可复用 ResultStack 展示历史结果，Review Diff 扫描包含 untracked 文件并支持 per-file 选择性 commit。

**架构：** 保持现有单 DB + SSH 分发架构不变。continuation 注入在 claim 前拼装 [CONTINUATION]+旧结果+最近评论。历史结果从 task_events completed 事件派生（event-sourced），不做新表。review diff 通过 SSH `git diff HEAD` + untracked `git diff --no-index` 循环生成，approve 支持 `files[]` 选择性 `git add --`。

**技术栈：** Go（net/http + sqlite）、React + TanStack Query、Tailwind、Vite

---

## 文件结构

### 修改

- `cmd/server/ssh_dispatch.go:104-260` — continuation 拼装、shell executor command 校验、consecutive_failures reset 时机调整、timeout 10m→25m
- `cmd/server/review.go:57-172` — `reviewWorkspaceClean` 增加 untracked 检测、`handleTaskDiff` 增加 untracked diff 扫描、`handleTaskApprove` 增加 per-file `files[]` 选择性 `git add`
- `internal/kanban/comments.go:81-92` — continuation requeue 清除 `completed_at`、SSE broadcastEvent
- `internal/kanban/chat_exec.go` — 非本计划范围（已在 working tree 中修改），不触及
- `web/src/api.ts` — 无变更（approve files 通过 fetch body 传递，无需新 helper）
- `web/src/features/board/TaskDetailPage.tsx` — CommentSection 增加 ReplyStatus 步骤指示、ReviewSection 改为 DiffDisclosure per-file 展示 + collapse、替换 ResultPanel 为 ResultStack
- `web/src/features/board/OutputPanels.tsx` — 新增 ResultStack 组件（从 task_events 派生历史）

### 不变

- `internal/kanban/kanban.go` — 表结构不变
- `web/src/features/board/TaskDetail.tsx` — drawer 使用 TaskDetailPage 的共享组件
- `cmd/server/main.go` — 路由表不变（diff/approve 已注册）

---

## 任务 1：Backend continuation 拼装 + claim 逻辑修正

**文件：**
- 修改：`cmd/server/ssh_dispatch.go:104-260`

**目标：** dispatcher claim todo task 时，如果 task 有旧 result，拼装 [CONTINUATION] 前缀；注入最近 5 条 comments；requeue 不 reset consecutive_failures（仅 success 时 reset）。

- [ ] **步骤 1：确认现有 query 已包含 result 列**

`ssh_dispatch.go:107` 当前 query 未 SELECT result——diff 中已修改为 SELECT `COALESCE(result,'')`。确认此变更存在；若不存在，补上。

```sql
SELECT id, title, COALESCE(body,''), COALESCE(result,''), workspace_path,
  COALESCE(workspace_transport,''), COALESCE(workspace_ssh_target,''),
  COALESCE(executor,'auto'), COALESCE(command,'')
FROM tasks WHERE status IN ('todo','ready') AND workspace_path IS NOT NULL AND workspace_path != '' LIMIT 1
```

对应 struct 增加 `result string` 字段并 Scan。

- [ ] **步骤 2：拼装 continuation message**

在 claim 之前（db 仍 open），拼装：

```go
msg := r.body
if msg == "" { msg = r.title }
if r.result != "" {
    trunc := r.result
    if len(trunc) > 800 { trunc = trunc[:800] + "\n... [truncated]" }
    msg = fmt.Sprintf("[CONTINUATION] This task was previously completed and requeued for follow-up.\n\n--- Previous Result ---\n%s\n--- End Previous Result ---\n\nUser comments requested a follow-up. Continue from where you left off:\n\n%s", trunc, msg)
}
```

- [ ] **步骤 3：注入最近 comments（db open 时）**

```go
if cr, _ := db.Query(`SELECT author, body FROM task_comments WHERE task_id=? ORDER BY id DESC LIMIT 5`, r.id); cr != nil {
    var cmt []string
    for cr.Next() {
        var author, body string
        if err := cr.Scan(&author, &body); err == nil {
            cmt = append(cmt, fmt.Sprintf("@%s: %s", author, body))
        }
    }
    cr.Close()
    if len(cmt) > 0 {
        for i, j := 0, len(cmt)-1; i < j; i, j = i+1, j-1 { cmt[i], cmt[j] = cmt[j], cmt[i] }
        msg += "\n\n--- Recent Comments ---\n" + strings.Join(cmt, "\n")
    }
}
```

- [ ] **步骤 4：claim 不 reset consecutive_failures**

将原 claim SQL 从 `consecutive_failures=0` 改为去掉该字段：

```go
_, _ = db.Exec(`UPDATE tasks SET status='running', started_at=?, completed_at=NULL WHERE id=? AND status IN ('todo','ready')`, startedAt, r.id)
```

success 分支才 reset：

```go
_, _ = db2.Exec(`UPDATE tasks SET status='review', completed_at=?, result=?, consecutive_failures=0, last_failure_error='' WHERE id=?`, now, output, r.id)
```

- [ ] **步骤 5：shell executor 校验 command 字段**

```go
if r.executor == "shell" {
    cmd := strings.TrimSpace(r.command)
    if cmd == "" {
        // block with error message
        db2, _ := sql.Open(...)
        _, _ = db2.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=?`,
            time.Now().Unix(), "shell executor requires command (set Command, not Body)", r.id)
        db2.Close()
        continue
    }
    // dispatch with msg (not r.body)
}
```

- [ ] **步骤 6：timeout 提升到 25m**

所有 `DispatchRemote` 调用 timeout 从 `10*time.Minute` 改为 `25*time.Minute`。

- [ ] **步骤 7：Run `go vet ./...` 确认编译通过**

```bash
cd /home/adityahimaone/apps/kanban-board && go vet ./...
```

预期：无输出（exit 0）。

- [ ] **步骤 8：Commit**

```bash
git add cmd/server/ssh_dispatch.go
git commit -m "feat: continuation injection + claim fix + 25m timeout"
```

---

## 任务 2：Backend review diff — untracked 扫描

**文件：**
- 修改：`cmd/server/review.go:57-98`

**目标：** `handleTaskDiff` 返回的 stat/diff 包含 untracked 文件（通过 `git ls-files --others --exclude-standard` 循环 + `git diff --no-index`）。

- [ ] **步骤 1：修改 `reviewWorkspaceClean` 检测 untracked**

```go
func reviewWorkspaceClean(t *reviewTask) (bool, string, int) {
    out, code := runGit(t, `git diff --quiet HEAD -- .; diff_code=$?; untracked=$(git ls-files --others --exclude-standard | head -20); if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi; exit $diff_code`)
    if code == 0 { return true, out, 0 }
    if code == 1 { return false, out, 0 }
    return false, out, code
}
```

- [ ] **步骤 2：修改 `handleTaskDiff` 增加 untracked 扫描**

```go
stat, code1 := runGit(t, `git diff --stat HEAD -- .; for f in $(git ls-files --others --exclude-standard); do git diff --no-index --stat /dev/null "$f" || true; done | tail -40`)
diff, code2 := runGit(t, `git diff HEAD -- .; for f in $(git ls-files --others --exclude-standard); do git diff --no-index /dev/null "$f" || true; done | head -8000`)
```

- [ ] **步骤 3：`go vet` 确认**

```bash
go vet ./...
```

- [ ] **步骤 4：Commit**

```bash
git add cmd/server/review.go
git commit -m "feat: review diff includes untracked files via git ls-files --others"
```

---

## 任务 3：Backend approve — per-file 选择性 git add

**文件：**
- 修改：`cmd/server/review.go:100-172`

**目标：** `POST /approve` 新增可选 `files` 字段；当提供时执行 `git add -- <files>` 而非 `git add -A`。验证每个 path 不含 `..`，不在 workdir 外。

- [ ] **步骤 1：扩展 request struct**

```go
var req struct {
    Action  string   `json:"action"`
    Message string   `json:"message,omitempty"`
    Files   []string `json:"files,omitempty"`
}
```

- [ ] **步骤 2：validate file paths**

```go
func validateCommitFiles(files []string) error {
    for _, f := range files {
        if f == "" { return fmt.Errorf("empty file path") }
        if strings.Contains(f, "..") { return fmt.Errorf("path traversal rejected: %s", f) }
        if filepath.IsAbs(f) { return fmt.Errorf("absolute path rejected: %s", f) }
    }
    return nil
}
```

- [ ] **步骤 3：选择性 git add**

```go
var script string
if len(req.Files) > 0 {
    if err := validateCommitFiles(req.Files); err != nil { fail(w, err, 400); return }
    quoted := make([]string, len(req.Files))
    for i, f := range req.Files { quoted[i] = shellQuote(f) }
    script = fmt.Sprintf("git add -- %s && git commit -m %s", strings.Join(quoted, " "), shellQuote(msg))
} else {
    script = fmt.Sprintf("git add -A && git commit -m %s", shellQuote(msg))
}
if req.Action == "commit_push" { script += " && git push" }
```

`shellQuote` 实现（加在文件末尾）：

```go
func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'" }
```

- [ ] **步骤 4：`go vet` 确认**

```bash
go vet ./...
```

- [ ] **步骤 5：Commit**

```bash
git add cmd/server/review.go
git commit -m "feat: approve supports per-file selective git add"
```

---

## 任务 4：Frontend — DiffDisclosure per-file 展示

**文件：**
- 修改：`web/src/features/board/TaskDetailPage.tsx:149-295`

**目标：** ReviewSection 解析 diff 为 per-file 列表，每文件可折叠，显示 `+N -M` 统计，header 展示总 additions/removals 和文件数。

- [ ] **步骤 1：添加 `parseDiffFiles` 函数**

```ts
type DiffLine = { type: "context" | "added" | "removed"; oldLine?: number; newLine?: number; content: string }
type DiffFile = { name: string; lines: DiffLine[] }

function parseDiffFiles(raw: string): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | null = null
  let oldLine = 0, newLine = 0
  for (const source of raw.split("\n")) {
    if (source.startsWith("diff --git ")) {
      const match = source.match(/ b\/(.+)$/)
      file = { name: match?.[1] || "changed file", lines: [] }
      files.push(file)
      continue
    }
    if (!file) file = { name: "changed file", lines: [] }
    const header = source.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      const numbers = source.match(/^@@ -(\d+)/)
      oldLine = Number(numbers?.[1] || 0)
      newLine = Number(header[1])
      continue
    }
    if (source.startsWith("--- ") || source.startsWith("+++ ") || source.startsWith("index ") || source.startsWith("new file")) continue
    const type = source.startsWith("+") ? "added" : source.startsWith("-") ? "removed" : "context"
    const content = type === "context" ? source : source.slice(1)
    if (type === "removed") file.lines.push({ type, oldLine: oldLine++, content })
    else if (type === "added") file.lines.push({ type, newLine: newLine++, content })
    else if (source && (oldLine || newLine)) file.lines.push({ type, oldLine: oldLine++, newLine: newLine++, content })
  }
  return files.length ? files : [{ name: "workspace changes", lines: raw ? raw.split("\n").map((c) => ({ type: "context" as const, content: c })) : [] }]
}
```

- [ ] **步骤 2：添加 `DiffDisclosure` 组件**

每文件一个 collapsible section，header 显示文件名 + `+added -removed` + copy 按钮。使用 lucide `ChevronDown`/`FileCode2`/`Plus`/`Minus`/`Copy`/`Check`。

```tsx
function DiffDisclosure({ file, complete, copyText }: { file: DiffFile; complete: boolean; copyText: string }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const added = file.lines.filter((l) => l.type === "added").length
  const removed = file.lines.filter((l) => l.type === "removed").length
  async function copy() { await navigator.clipboard.writeText(copyText); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-black/10">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-white/[0.025] px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-neutral-200">
          <ChevronDown className={`size-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "" : "-rotate-90"}`} />
          <FileCode2 className="size-3.5 shrink-0 text-violet-300" />
          <span className="truncate font-mono" title={file.name}>{file.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
            <span className="text-emerald-300">+{added}</span><span className="text-rose-300">-{removed}</span>
          </span>
        </button>
        <button type="button" onClick={copy} className="rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-neutral-200" title="Copy diff">
          {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {open && <div className="max-h-72 overflow-auto py-1 font-mono text-[11px] leading-5">
        {file.lines.map((line, index) => (
          <div key={`${file.name}-${index}`} className={`grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] ${line.type === "added" ? "bg-emerald-500/10 text-emerald-100" : line.type === "removed" ? "bg-rose-500/10 text-rose-100" : "text-neutral-400"}`}>
            <span className="select-none pr-2 text-right text-neutral-600">{line.oldLine ?? ""}</span>
            <span className="select-none pr-2 text-right text-neutral-600">{line.newLine ?? ""}</span>
            <span className={`select-none text-center ${line.type === "added" ? "text-emerald-300" : line.type === "removed" ? "text-rose-300" : "text-neutral-600"}`}>{line.type === "added" ? <Plus className="mx-auto size-3" /> : line.type === "removed" ? <Minus className="mx-auto size-3" /> : " "}</span>
            <span className="whitespace-pre-wrap break-words pr-3">{line.content || " "}</span>
          </div>
        ))}
        {!file.lines.length && <p className="px-3 py-4 text-neutral-600">No textual lines returned.</p>}
      </div>}
    </section>
  )
}
```

- [ ] **步骤 3：重构 `ReviewSection` 使用 DiffDisclosure**

```tsx
function ReviewSection({ slug, task, onDone }) {
  // ... existing state + diff query ...
  const files = parseDiffFiles(diff.data?.diff || "")
  const complete = !diff.isLoading
  const additions = files.flatMap((f) => f.lines).filter((l) => l.type === "added").length
  const removals = files.flatMap((f) => f.lines).filter((l) => l.type === "removed").length
  return (
    <div className="glass-inset-card overflow-hidden rounded-xl border border-violet-500/30">
      <div className="flex items-center gap-3 border-b border-violet-500/15 bg-violet-500/[0.06] px-3 py-3">
        {/* collapse button + stats + action select + approve button */}
      </div>
      {open && <div className="space-y-2 p-2">
        {diff.isLoading ? <Loader2 ... /> : diff.data?.clean ? <p>No workspace changes.</p> : files.map((f) => <DiffDisclosure key={f.name} file={f} complete={complete} copyText={...} />)}
      </div>}
    </div>
  )
}
```

- [ ] **步骤 4：imports 补全**

```ts
import { ArrowLeft, Check, ChevronDown, Copy, FileCode2, Loader2, Minus, Plus, Send, Square } from "lucide-react"
```

- [ ] **步骤 5：`pnpm build` in `web/` 确认无 TS 错误**

```bash
cd /home/adityahimaone/apps/kanban-board/web && pnpm build
```

预期：exit 0，无 TS errors。

- [ ] **步骤 6：Commit**

```bash
git add web/src/features/board/TaskDetailPage.tsx
git commit -m "feat: review diff per-file disclosure with collapse + stats"
```

---

## 任务 5：Frontend — ResultStack 历史结果栈

**文件：**
- 修改：`web/src/features/board/OutputPanels.tsx`（新增 ResultStack 导出）
- 修改：`web/src/features/board/TaskDetailPage.tsx`（替换 ResultPanel 使用 ResultStack）

**目标：** 最新结果展开，历史结果折叠；数据来源 `task.result` + `task_events` completed payloads（dedup by equality）。

- [ ] **步骤 1：在 OutputPanels.tsx 新增 `ResultStack`**

```tsx
export function ResultStack({ task, events }: { task: Task; events: TaskEvent[] }) {
  const completedEvents = useMemo(() =>
    events.filter((e) => e.kind === "completed" && e.payload).reverse(),
    [events]
  )
  const results = useMemo(() => {
    const out: { index: number; text: string; outcome: string }[] = []
    const seen = new Set<string>()
    for (const ev of completedEvents) {
      try {
        const p = JSON.parse(ev.payload)
        const text = p.output || p.text || ""
        if (!text || seen.has(text)) continue
        seen.add(text)
        out.push({ index: out.length + 1, text, outcome: p.outcome || "success" })
      } catch { /* skip malformed */ }
    }
    if (task.result && !seen.has(task.result)) {
      out.push({ index: out.length + 1, text: task.result, outcome: "latest" })
    }
    return out
  }, [completedEvents, task.result])

  if (!results.length) return null

  return (
    <div className="space-y-2">
      <h4 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Results · {results.length}</h4>
      {results.map((r, i) => (
        <ResultPanel key={i} text={r.text} hasWorking={false} title={`Result ${r.index} · ${r.outcome}`} defaultOpen={i === results.length - 1} />
      ))}
    </div>
  )
}
```

注意：需扩展 `ResultPanel` 接受可选 `title` 和 `defaultOpen` props（向后兼容）。

- [ ] **步骤 2：扩展 `ResultPanel` 支持 title + defaultOpen**

```tsx
export function ResultPanel({ text, hasWorking, title, defaultOpen }: {
  text: string; hasWorking: boolean; title?: string; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen !== false)
  // ... rest same, wrap body in {open && ...}
  // header label uses title || "Result"
}
```

- [ ] **步骤 3：TaskDetailPage 替换 ResultPanel 为 ResultStack**

```tsx
import { ResultEmpty, ResultStack, WorkerLogPanel } from "./OutputPanels"

// in component body:
const events = useQuery({ queryKey: ["events", slug, task.id], ... })

{resultSplit ? (
  <ResultStack task={task} events={events.data || []} />
) : task.status !== "running" ? <ResultEmpty running={false} /> : null}
```

保留 WorkerLogPanel 不变（仅 running 时显示）。

- [ ] **步骤 4：`pnpm build` in `web/` 确认**

```bash
pnpm build
```

- [ ] **步骤 5：Commit**

```bash
git add web/src/features/board/OutputPanels.tsx web/src/features/board/TaskDetailPage.tsx
git commit -m "feat: result history stack from task_events completed payloads"
```

---

## 任务 6：Frontend — CommentSection ReplyStatus 步骤指示

**文件：**
- 修改：`web/src/features/board/TaskDetailPage.tsx:19-149`

**目标：** 发送 comment 后显示 Sent → Agent notified → Agent replied 步骤状态，SSE 事件驱动 invalidation。

- [ ] **步骤 1：添加 ReplyState 类型 + ReplyStatus 组件**

```tsx
type ReplyState = "idle" | "sent" | "notified" | "replied"

function ReplyStatus({ state }: { state: ReplyState }) {
  if (state === "idle") return null
  const steps = [
    ["Sent", true],
    ["Agent notified", state === "notified" || state === "replied"],
    ["Agent replied", state === "replied"],
  ] as const
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]" aria-live="polite">
      {steps.map(([label, active], index) => (
        <span key={label} className={`rounded-full border px-2 py-0.5 ${active ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-[var(--color-line)] text-neutral-600"}`}>
          {active ? "✓ " : "○ "}{label}
          {index < steps.length - 1 && <span className="ml-1.5 text-neutral-600">·</span>}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **步骤 2：CommentSection 增加 replyState + SSE useEffect**

```tsx
const [replyState, setReplyState] = useState<ReplyState>("idle")
const [lastSentAt, setLastSentAt] = useState(0)

useEffect(() => {
  const latest = comments.data?.[comments.data.length - 1]
  if (!latest) return
  if (replyState === "sent") setReplyState("notified")
  if (lastSentAt && latest.created_at >= lastSentAt && latest.author !== "board-ui") setReplyState("replied")
}, [comments.data, lastSentAt, replyState])

useEffect(() => openEventStream((event) => {
  if (event.data.task_id !== task.id) return
  if (["commented", "task_event", "task_updated", "status_changed"].includes(event.kind)) {
    qc.invalidateQueries({ queryKey: ["comments", slug, task.id] })
    qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
  }
}), [qc, slug, task.id])
```

- [ ] **步骤 3：onSuccess 更新 replyState**

```tsx
onSuccess: (comment: TaskComment) => {
  setDraft("")
  setLastSentAt(comment.created_at)
  setReplyState("sent")
  toastGlobal("Reply sent · agent notified", "success")
  // ... invalidations
}
```

- [ ] **步骤 4：JSX 添加 `<ReplyStatus state={replyState} />`**

在 textarea 和 error 之间插入。

- [ ] **步骤 5：`pnpm build` 确认**

- [ ] **步骤 6：Commit**

```bash
git add web/src/features/board/TaskDetailPage.tsx
git commit -m "feat: comment reply status stepper with SSE invalidation"
```

---

## 任务 7：Backend comments.go — continuation requeue 修正

**文件：**
- 修改：`internal/kanban/comments.go:81-92`

**目标：** `AddComment` @mention requeue 时清除 `completed_at` 并 broadcast SSE。

- [ ] **步骤 1：确认 diff 已包含两处修正**

1. `UPDATE tasks SET status='todo', completed_at=NULL WHERE id=?`（加 `completed_at=NULL`）
2. 末尾 `broadcastEvent("commented", ...)`

若不存在，手动 patch。

- [ ] **步骤 2：`go vet` 确认**

```bash
go vet ./internal/kanban
```

- [ ] **步骤 3：Commit**

```bash
git add internal/kanban/comments.go
git commit -m "fix: continuation requeue clears completed_at + broadcasts SSE"
```

---

## 任务 8：集成验证

- [ ] **步骤 1：Backend 全量 `go vet` + `go test`**

```bash
cd /home/adityahimaone/apps/kanban-board
go vet ./...
go test ./internal/kanban -count=1 -v 2>&1 | tail -30
```

预期：vet 无输出，tests PASS（或仅 skip unrelated）。

- [ ] **步骤 2：Frontend build**

```bash
cd web && pnpm build
```

预期：exit 0，bundle hash rotation。

- [ ] **步骤 3：手动 API 验证（需运行 server）**

如果 server 在运行：

```bash
# 1. 检查某个 review task 的 diff 是否包含 untracked
curl -s http://127.0.0.1:8790/api/boards/default/tasks/<REVIEW_TASK_ID>/diff | jq '.stat' | head -5

# 2. 发 comment 触发 continuation
curl -s -X POST http://127.0.0.1:8790/api/boards/default/tasks/<REVIEW_TASK_ID>/comments \
  -H 'Content-Type: application/json' \
  -d '{"body":"@default opsi 1 please fix","author":"board-ui"}' | jq .

# 3. 检查 task 状态变为 todo
curl -s http://127.0.0.1:8790/api/boards/default/tasks/<REVIEW_TASK_ID> | jq '.status'
# 期望: "todo"
```

- [ ] **步骤 4：Final commit（如有未提交变更）**

```bash
git status --short
# 若有未提交，git add + commit
```

---

## 自检

- 规格覆盖度：continuation 拼装（任务1）✓ result history（任务5）✓ per-file diff（任务4）✓ selective commit（任务3）✓ worker log 单实例（不变）✓
- 无占位符：每个步骤含完整代码或精确命令
- 类型一致：DiffFile/DiffLine/ResultStack types 跨任务一致；shellQuote 路径验证逻辑在任务3定义
- 无遗漏：SSE invalidation（任务6）✓ completed_at=NULL（任务7）✓
