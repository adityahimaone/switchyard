import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addTaskDependency, api, cancelRun, openEventStream, queueReason, removeTaskDependency, runControl, runTask, taskDependencies, taskHealth, taskRuns, toastGlobal, COLUMNS, type Profile, type Status, type Task, type TaskComment, type TaskEvent, type Workspace, type TaskHealth as TH } from "../../api"
import { parseEventCards, TONE_BORDER, TONE_DOT, TONE_TEXT, FIELD_TRUNCATE_LEN, type EventGroup, type EventCard } from "./eventCards"
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Send, Square } from "lucide-react"
import { AttachmentChip } from "@/components/AttachmentChip"
import type { Attachment } from "../../api"
import { AgentTaskStatus, splitAgentResult } from "./AgentStatus"
import { ResultEmpty, ResultStack, WorkerLogPanel } from "./OutputPanels"
import { ReviewSection } from "./ReviewSection"
import TaskRuntimeStatus from "./TaskRuntimeStatus"

const STATUS_CHIP: Record<string, string> = {
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  running: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  review: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  archived: "border-[var(--color-line)] bg-[var(--color-inset)] text-neutral-400",
}

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

function CommentSection({ slug, task, profiles }: { slug: string; task: Task; profiles: Profile[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [replyState, setReplyState] = useState<ReplyState>("idle")
  const [lastSentAt, setLastSentAt] = useState(0)

  const comments = useQuery({
    queryKey: ["comments", slug, task.id],
    queryFn: () => api<TaskComment[]>(`/api/boards/${slug}/tasks/${task.id}/comments`),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    const latest = comments.data?.[comments.data.length - 1]
    if (!latest) return
    if (replyState === "sent") setReplyState("notified")
    if (lastSentAt && latest.created_at >= lastSentAt && latest.author !== "board-ui") setReplyState("replied")
  }, [comments.data, lastSentAt, replyState])

  useEffect(() => openEventStream((event) => {
    if (event.data.task_id !== task.id) return
    if (event.kind === "commented" || event.kind === "task_event" || event.kind === "task_updated" || event.kind === "status_changed") {
      qc.invalidateQueries({ queryKey: ["comments", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
    }
  }), [qc, slug, task.id])

  const post = useMutation({
    mutationFn: (body: string) =>
      api<TaskComment>(`/api/boards/${slug}/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, author: "board-ui" }),
      }),
    onSuccess: (comment) => {
      setDraft("")
      setLastSentAt(comment.created_at)
      setReplyState("sent")
      toastGlobal("Reply sent · agent notified", "success")
      qc.invalidateQueries({ queryKey: ["comments", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
    },
    onError: (e: Error) => setErr(e.message),
  })

  // @mention chips: insert "@name " into draft
  function mention(name: string) {
    setDraft((d) => (d.endsWith(" ") || d === "" ? `${d}@${name} ` : `${d} @${name} `))
  }

  return (
    <div className="glass-inset-card rounded-lg p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Reply to agent</h3>
        <div className="ml-auto flex flex-wrap gap-1">
          {profiles.filter((p) => p.valid).map((p) => (
            <button
              key={p.name}
              onClick={() => mention(p.name)}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${task.assignee === p.name ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "border-[var(--color-line)] text-neutral-400 hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)]"}`}
              title={`tag @${p.name}`}
            >
              @{p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
        {(comments.data ?? []).map((c) => (
          <div key={c.id} className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5">
            <p className="text-[10px] text-neutral-500">
              <span className="font-medium text-neutral-300">{c.author}</span> · {new Date(c.created_at * 1000).toLocaleString()}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-300">{c.body}</p>
          </div>
        ))}
        {comments.isLoading && <p className="text-[11px] text-neutral-600">Loading comments…</p>}
        {!comments.isLoading && !(comments.data ?? []).length && (
          <p className="text-[11px] text-neutral-600">Belum ada komentar — tag agent buat ngobrol.</p>
        )}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder={`Tulis balasan… tag @${task.assignee || "agent"} buat minta dia respond`}
        className="mt-2 min-h-0 resize-none border-[var(--color-line)] bg-[var(--color-surface)] text-xs"
      />
      <ReplyStatus state={replyState} />
      {err && <p className="mt-1 text-[11px] text-red-400">{err}</p>}
      <div className="mt-1.5 flex justify-end">
        <Button
          size="sm"
          disabled={!draft.trim() || post.isPending}
          onClick={() => { setErr(null); post.mutate(draft.trim()) }}
          className="gap-1 bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90"
        >
          {post.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          Send
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-neutral-600">
        Komen masuk ke worker context — kalau task done/blocked dan tag assignee, task auto balik ke todo biar agent respawn & bales.
      </p>
    </div>
  )
}

function TruncValue({ value, mono, tone }: { value: string; mono?: boolean; tone?: string }) {
  const long = value.length > FIELD_TRUNCATE_LEN
  const [expanded, setExpanded] = useState(false)
  const toneCls = tone === "danger" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-neutral-200"
  if (!long) return <dd className={`break-all text-[11px] ${mono ? "font-mono" : ""} ${toneCls}`}>{value}</dd>
  return (
    <dd className={`break-all text-[11px] ${mono ? "font-mono" : ""} ${toneCls}`}>
      {expanded ? value : value.slice(0, FIELD_TRUNCATE_LEN) + "…"}
      <button type="button" onClick={() => setExpanded(v => !v)} className="ml-1 inline text-[10px] text-sky-400 hover:text-sky-300">
        {expanded ? "collapse" : "expand"}
      </button>
    </dd>
  )
}

/* Single event card — with collapsible fields for long values */
function EventCardNode({ card }: { card: EventCard }) {
  const [open, setOpen] = useState(true)
  const hasContent = !!card.note || card.fields.length > 0
  return (
    <article className={`rounded-md border p-2 ${TONE_BORDER[card.tone]}`}>
      <div className="flex items-center gap-2">
        {hasContent && (
          <button type="button" onClick={() => setOpen(v => !v)} className="shrink-0 text-neutral-500 hover:text-neutral-300">
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        )}
        {!hasContent && <span className="size-3" />}
        <span className="text-sm">{card.icon}</span>
        <span className={`text-xs font-medium ${TONE_TEXT[card.tone]}`}>{card.label}</span>
        <span className="ml-auto text-[10px] text-neutral-500">
          {new Date(card.at * 1000).toLocaleTimeString()}
        </span>
      </div>
      {open && hasContent && (
        <>
          {card.note && (
            <p className="mt-1 ml-5 break-words font-mono text-[11px] leading-relaxed text-neutral-300">{card.note}</p>
          )}
          {card.fields.length > 0 && (
            <dl className="mt-1 ml-5 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5">
              {card.fields.map((f, i) => (
                <div key={i} className="col-span-2 grid grid-cols-subgrid">
                  <dt className="text-[10px] text-neutral-500">{f.label}</dt>
                  <TruncValue value={f.value} mono={f.mono} tone={f.tone} />
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </article>
  )
}

/* Collapsible event group (Outcome/Problem etc) — collapsed by default for Problem */
function CollapsibleGroup({ group }: { group: EventGroup }) {
  const isProblem = group.title === "Problem"
  const [open, setOpen] = useState(!isProblem)
  return (
    <section className="glass-inset-card min-w-0 rounded-lg p-3">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 text-left hover:opacity-80">
        {open ? <ChevronDown className="size-3.5 shrink-0 text-neutral-500" /> : <ChevronRight className="size-3.5 shrink-0 text-neutral-500" />}
        <span className={`size-2 rounded-full ${TONE_DOT[group.tone]}`} />
        <h4 className={`text-[11px] font-semibold uppercase tracking-wider ${TONE_TEXT[group.tone]}`}>
          {group.title}
        </h4>
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        <span className="text-[10px] text-neutral-600">{group.cards.length}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {group.cards.map((c) => (
            <EventCardNode key={`${c.kind}-${c.at}-${c.fields.map((f) => f.value).join("|")}`} card={c} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function TaskDetailPage({
  slug,
  task,
  profiles,
  workspaces,
  onBack,
  onMove,
  onStop,
  onReassign,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  workspaces: Workspace[]
  onBack: () => void
  onMove: (s: Status) => Promise<void>
  onStop: () => Promise<void>
  onReassign: (a: string) => Promise<void>
}) {
  const qc = useQueryClient()
  const attachments = useQuery<Attachment[]>({
    queryKey: ["attachments", slug, task.id],
    queryFn: () => api<Attachment[]>(`/api/boards/${slug}/tasks/${task.id}/attachments`),
  })
  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = workspaces.find((w) => w.path === task.workspace_path)
  const health = useQuery<TH>({
    queryKey: ["health", slug, task.id],
    queryFn: () => taskHealth(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const runs = useQuery({
    queryKey: ["runs", slug, task.id],
    queryFn: () => taskRuns(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const dependencies = useQuery({
    queryKey: ["dependencies", slug, task.id],
    queryFn: () => taskDependencies(slug, task.id),
  })
  const [dependencyId, setDependencyId] = useState("")
  const boardTasks = useQuery({ queryKey: ["tasks", slug], queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`) })
  const dependencyChoices = useMemo(() => {
    const taken = new Set((dependencies.data ?? []).map((d) => d.depends_on_id))
    return (boardTasks.data ?? []).filter((t) => t.id !== task.id && !taken.has(t.id)).map((t) => ({ id: t.id, title: t.title, status: t.status }))
  }, [boardTasks.data, dependencies.data, task.id])
  const dependencyMutation = useMutation({
    mutationFn: (dependsOnId: string) => addTaskDependency(slug, task.id, dependsOnId),
    onSuccess: () => {
      setDependencyId("")
      qc.invalidateQueries({ queryKey: ["dependencies", slug, task.id] })
      toastGlobal("Dependency added", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const removeDependency = useMutation({
    mutationFn: (dependsOnId: string) => removeTaskDependency(slug, task.id, dependsOnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", slug, task.id] })
      toastGlobal("Dependency removed", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const runMutation = useMutation({
    mutationFn: () => runTask(slug, task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["runs", slug, task.id] })
      toastGlobal("Task queued", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const cancelMutation = useMutation({
    mutationFn: () => cancelRun(slug, task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["runs", slug, task.id] })
      toastGlobal("Run stopped", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const control = useMutation({
    mutationFn: (action: "retry" | "release" | "clone") => runControl(slug, task.id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["health", slug, task.id] })
    },
  })
  const healthTone = health.data?.health === "healthy" ? "text-emerald-300" : health.data?.health === "silent" ? "text-amber-300" : "text-red-300"
  const canRelease = health.data?.health === "stuck" || health.data?.health === "lost"
  const groups = events.data ? parseEventCards(events.data) : []
  const resultSplit = task.result ? splitAgentResult(task.result) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
      {/* top bar: back + title */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1 border-[var(--color-line)] bg-[var(--color-surface)] text-neutral-300">
          <ArrowLeft className="size-3.5" /> Board
        </Button>
        <h1 className="truncate text-base font-semibold">{task.title}</h1>
      </div>

      {/* header card */}
      <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[9px] leading-none text-neutral-400">{task.id}</Badge>
          <Badge variant="outline" className={`px-1.5 py-0 text-[9px] leading-none ${STATUS_CHIP[task.status] ?? "border-[var(--color-line)] bg-[var(--color-inset)] text-neutral-300"}`}>{task.status}</Badge>
          {task.priority > 0 && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] leading-none text-amber-300">P{task.priority}</Badge>
          )}
          <span>dibuat {new Date(task.created_at * 1000).toLocaleString()}</span>
          {task.completed_at && <span>· selesai {new Date(task.completed_at * 1000).toLocaleString()}</span>}
        </div>
        <AgentTaskStatus task={task} events={events.data ?? []} />
        <TaskRuntimeStatus task={task} profile={profile} workspace={ws} events={events.data ?? []} tasks={boardTasks.data ?? []} />

        {/* meta grid */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="glass-inset-card rounded-lg p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Agent</label>
            <Select
              value={task.assignee || "unassigned"}
              onValueChange={(v) => onReassign(v === "unassigned" ? "" : v).catch((err: Error) => toastGlobal(err.message, "error"))}
              disabled={task.status === "running"}
            >
              <SelectTrigger className="mt-1 h-8 w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs disabled:opacity-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-[var(--color-line)] bg-[var(--color-surface)]">
                <SelectItem value="unassigned" className="text-xs">unassigned</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-xs">
                    {p.name}{p.active ? " (active)" : ""}{!p.valid ? " (broken)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {profile && (
              <p className="mt-1 truncate text-[10px] text-neutral-500" title={`${profile.model || "—"} · ${profile.provider || "—"}`}>
                {profile.model || "—"} · {profile.provider || "—"}
              </p>
            )}
            {profile && !profile.valid && (
              <p className="mt-0.5 text-[10px] text-red-400">Provider invalid — worker bakal crash.</p>
            )}
          </div>
          <div className="min-w-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Workspace</label>
            <p className="mt-1 truncate text-xs text-neutral-300" title={task.workspace_path || "scratch"}>
              {ws ? ws.name : task.workspace_path ? task.workspace_path.split(/[\\/]/).pop() : "scratch"}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">{task.workspace_kind || "dir"}{ws?.host ? ` · ${ws.host}` : ""}</p>
            {task.consecutive_failures > 0 && (
              <p className="mt-0.5 text-[10px] text-red-400">{task.consecutive_failures} consecutive failures</p>
            )}
          </div>
        </div>

        {task.body && (
          <div className="glass-inset-card mt-3 max-h-28 overflow-y-auto rounded-lg p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Deskripsi</label>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-300">{task.body}</p>
          </div>
        )}
        {(attachments.data ?? []).length > 0 && (
          <div className="glass-inset-card mt-3 rounded-lg p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Attachments</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.data!.map((a) => <AttachmentChip key={a.id} att={a} showPreview />)}
            </div>
          </div>
        )}
        {task.last_failure_error && (
          <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] leading-relaxed text-red-300">{task.last_failure_error}</p>
        )}
        {task.status === "running" && (
          <div className="mt-3">
            <WorkerLogPanel text={resultSplit?.working ?? ""} running slug={slug} taskId={task.id} />
          </div>
        )}
        {resultSplit ? (
          <div className="mt-3">
            <ResultStack task={task} events={events.data || []} />
          </div>
        ) : task.status !== "running" ? (
          <div className="mt-3">
            <ResultEmpty running={false} />
          </div>
        ) : null}

        {task.status === "review" && (
          <div className="mt-3">
            <ReviewSection slug={slug} task={task} onDone={onBack} />
          </div>
        )}

        {/* run-control */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.status !== "running" && task.status !== "archived" && (() => {
            const reason = queueReason(task, profile)
            return <Button variant="outline" size="sm" disabled={!!reason || runMutation.isPending} onClick={() => runMutation.mutate()} title={reason ?? "Queue task now"} className="h-6 px-2 text-[10px]">{runMutation.isPending ? "Queueing…" : "Run now"}</Button>
          })()}
          {task.status === "running" && (
            <Button variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()} className="h-6 gap-1 rounded border-red-500/40 px-2 text-[10px] text-red-300"><Square className="size-2.5 fill-current" /> {cancelMutation.isPending ? "Stopping…" : "Stop run"}</Button>
          )}
          {task.status === "running" && health.data && (
            <span className={`text-[10px] uppercase tracking-wider ${healthTone}`} title={health.data.reason}>
              health: {health.data.health}
            </span>
          )}
          {task.status !== "running" && task.status !== "archived" && (
            <Button variant="outline" size="sm" disabled={control.isPending} onClick={() => control.mutate("retry")} className="h-6 px-2 text-[10px]">Retry</Button>
          )}
          {canRelease && (
            <Button variant="outline" size="sm" disabled={control.isPending} onClick={() => control.mutate("release")} className="h-6 border-red-500/40 px-2 text-[10px] text-red-300">Release stale run</Button>
          )}
          {task.status !== "running" && (
            <Button variant="outline" size="sm" disabled={control.isPending} onClick={() => control.mutate("clone")} className="h-6 px-2 text-[10px]">Clone</Button>
          )}
          {control.error && <span className="text-[10px] text-red-300">{(control.error as Error).message}</span>}
        </div>

        {/* status moves */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {task.status === "running" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStop().catch((e: Error) => toastGlobal(e.message, "error"))}
              className="h-6 gap-1 rounded border-red-500/40 px-2 text-[10px] text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              <Square className="size-2.5 fill-current" /> Stop task
            </Button>
          )}
          {task.status !== "running" && COLUMNS.filter((s) => s !== task.status).map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => onMove(s).catch((e: Error) => toastGlobal(e.message, "error"))}
              className="h-6 rounded px-2 text-[10px] text-neutral-400 hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]"
            >
              → {s}
            </Button>
          ))}
        </div>
      </div>

      {/* reply */}
      <div className="mt-4">
        <CommentSection slug={slug} task={task} profiles={profiles} />
      </div>

      <section className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <div className="glass-inset-card rounded-lg p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Dependencies</h3>
          <div className="mt-2 space-y-1">
            {(dependencies.data ?? []).map((d) => {
              const dep = boardTasks.data?.find((t) => t.id === d.depends_on_id)
              return <div key={d.depends_on_id} className="flex items-center gap-2 rounded border border-[var(--color-line)] px-2 py-1.5 text-[11px]"><span className="min-w-0 flex-1 truncate font-mono" title={dep ? `${dep.id} · ${dep.title}` : d.depends_on_id}>{dep ? `${dep.id} — ${dep.title}` : d.depends_on_id}</span><span className="shrink-0 text-[10px] text-neutral-500">{dep?.status ?? ""}</span><Button variant="ghost" size="sm" onClick={() => removeDependency.mutate(d.depends_on_id)} disabled={removeDependency.isPending} className="h-6 px-1.5 text-[10px] text-red-300">Remove</Button></div>
            })}
            {(dependencies.data ?? []).length === 0 && <p className="text-[11px] text-neutral-600">No dependencies</p>}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Input value={dependencyId} onChange={(e) => setDependencyId(e.target.value)} placeholder="Task ID…" className="h-8 min-w-0 flex-1 border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs" />
            <Select value={dependencyId} onValueChange={setDependencyId}>
              <SelectTrigger className="h-8 w-28 border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent className="max-h-64 border-[var(--color-line)] bg-[var(--color-surface)]">
                {dependencyChoices.map((t) => <SelectItem key={t.id} value={t.id} className="font-mono text-xs">{t.id} · {t.title.slice(0, 28)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!dependencyId.trim() || dependencyMutation.isPending} onClick={() => dependencyMutation.mutate(dependencyId.trim())}>Add</Button>
          </div>
        </div>
        <div className="glass-inset-card rounded-lg p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Runs</h3>
          <div className="mt-2 space-y-1.5">
            {(runs.data ?? []).map((run) => <div key={run.index} className="flex items-center gap-2 rounded border border-[var(--color-line)] px-2 py-1.5 text-[11px]"><span className="font-mono">Attempt {run.index}</span><span className="text-neutral-500">{run.outcome}</span><span className="ml-auto text-[10px] text-neutral-600">{run.events.length} events</span></div>)}
            {!runs.data?.length && <p className="text-[11px] text-neutral-600">No runs</p>}
          </div>
        </div>
      </section>

      {/* history — grouped columns */}
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        History {events.data ? `· ${events.data.length} event` : ""}
      </h3>
      <div className="mt-2.5 grid grid-cols-1 gap-3.5 pb-5 lg:grid-cols-3">
        {events.isLoading ? (
          <p className="text-xs text-neutral-500">Loading…</p>
        ) : !events.data?.length ? (
          <p className="text-xs text-neutral-500">No events</p>
        ) : (
          groups.map((g) => (
            <CollapsibleGroup key={g.title} group={g} />
          ))
        )}
      </div>
    </div>
  )
}
