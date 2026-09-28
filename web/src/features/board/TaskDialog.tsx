import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ExecutorSettings, Profile, Workspace } from "../../api"
import { api, getExecutorSettings } from "../../api"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sparkles, Loader2, Paperclip } from "lucide-react"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import { uploadAttachment, type Attachment } from "../../api"

const EXECUTOR_LABELS: Record<string, string> = {
  auto: "Auto (workspace policy)",
  hermes: "Hermes",
  codex: "Codex",
  commandcode: "Command Code",
  dsh: "DeepSeek Harness",
  omp: "omp (oh-my-pi)",
  shell: "Shell agent (workspace access)",
}

const FALLBACK_EXECUTORS: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "dsh", "omp", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

// A settings load must never leave the picker empty: fall back to the full list
// until the real config arrives, and always keep "auto".
export function visibleExecutorsFor(settings?: ExecutorSettings): string[] {
  const s = settings ?? FALLBACK_EXECUTORS
  return s.order.filter((e) => e === "auto" || !s.disabled.includes(e))
}

function isRemoteWorkspace(w: Workspace): boolean {
  if (w.host && w.host !== "localhost" && w.host !== "127.0.0.1") return true
  if (/^[A-Za-z]:[\\/]/.test(w.path)) return true
  if (w.path.startsWith("/Users/")) return true
  return false
}

function isSshWorkspace(w: Workspace): boolean {
  return !!w.host && w.host !== "localhost" && w.host !== "127.0.0.1"
}

function isLive(w: Workspace): boolean {
  return w.status === "connected" || w.status === "local"
}

function defaultWorkspacePath(workspaces: Workspace[]): string {
  if (workspaces.length === 0) return ""
  const local = workspaces.find((w) => !isRemoteWorkspace(w))
  return local?.path ?? workspaces[0].path
}

export default function TaskDialog({
  slug,
  workspaces,
  profiles,
  onClose,
  onCreate,
}: {
  slug: string
  workspaces: Workspace[]
  profiles: Profile[]
  onClose: () => void
  onCreate: (p: Record<string, unknown>) => Promise<unknown>
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [ws, setWs] = useState(() => defaultWorkspacePath(workspaces))
  const [assignee, setAssignee] = useState(profiles[0]?.name ?? "default")
  const [executor, setExecutor] = useState<"auto" | "hermes" | "codex" | "commandcode" | "dsh" | "omp" | "shell">("auto")
  const [executionMode, setExecutionMode] = useState<"direct" | "agentic">("direct")
  const [maxIterations, setMaxIterations] = useState("6")
  const [priority, setPriority] = useState("0")
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMode, setAiMode] = useState<"fast" | "deep" | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const improveCache = useRef(new Map<string, string>())

  // Executor visibility and the default mode come from Settings, so a board can
  // hide executors it does not use without touching this dialog.
  const { data: executorSettings } = useQuery({ queryKey: ["executor-settings"], queryFn: getExecutorSettings })
  const visibleExecutors = useMemo(
    () => visibleExecutorsFor(executorSettings),
    [executorSettings],
  )

  // Seed the default mode once, without stomping a user change on re-render.
  const seededMode = useRef(false)
  useEffect(() => {
    if (seededMode.current || !executorSettings) return
    setExecutionMode(executorSettings.default_execution_mode)
    seededMode.current = true
  }, [executorSettings])

  async function improveBody(mode: "fast" | "deep") {
    if (!body.trim()) return
    const cacheKey = `${title.trim()}::${body.trim()}::${mode}`
    const cached = improveCache.current.get(cacheKey)
    if (cached) {
      setBody(cached)
      return
    }
    if (aiBusy) return
    setAiBusy(true); setAiMode(mode); setErr(null)
    const requestBody = body.trim()
    const requestTitle = title.trim()
    try {
      if (mode === "deep") {
        // Show deterministic structure while model works. User sees useful output now.
        const fast = await api<{ improved: string }>("/api/ai/improve-prompt", {
          method: "POST",
          body: JSON.stringify({ title: requestTitle, body: requestBody, mode: "fast" }),
        })
        setBody(fast.improved)
      }
      const res = await api<{ improved: string }>("/api/ai/improve-prompt", {
        method: "POST",
        body: JSON.stringify({ title: requestTitle, body: requestBody, mode }),
      })
      improveCache.current.set(cacheKey, res.improved)
      setBody(res.improved)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setAiBusy(false); setAiMode(null)
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files as FileList)
    if (!list.length) return
    setUploading(true)
    for (const f of list) {
      try {
        const att = await uploadAttachment(f as File)
        setPendingAtts((prev) => [...prev, att])
      } catch (e) { setErr((e as Error).message) }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function submit() {
    if (uploading) { setErr("Wait for attachment upload to finish"); return }
    if (!title.trim()) { setErr("Title required"); return }
    // This dialog has no command field, so a shell task can never satisfy the
    // backend's "direct shell requires command" rule: keep it on the agentic path.
    const effectiveMode = executor === "shell" ? "agentic" : executionMode
    setBusy(true); setErr(null)
    let created: unknown = null
    try {
      created = await onCreate({
        title: title.trim(),
        body: body.trim(),
        // Max iterations only mean something for bounded agentic runs.
        ...(effectiveMode === "agentic" ? { execution_mode: "agentic", max_iterations: Number(maxIterations) || 6 } : { execution_mode: "direct" }),
        workspace_path: ws,
        assignee,
        executor,
        priority: Number(priority),
        status: "todo",
      })
    } catch (e) { setErr((e as Error).message); setBusy(false); return }
    // link pending attachments to the created task
    if (pendingAtts.length > 0) {
      const rec = created as { id?: string } | null
      const taskId = rec?.id ? String(rec.id) : ""
      if (taskId && slug) {
        try {
          await Promise.all(pendingAtts.map((a) => api(`/api/boards/${slug}/tasks/${taskId}/attachments`, { method: "POST", body: JSON.stringify({ attachment_id: a.id }) })))
        } catch (e) {
          setErr(`Task created, but attachment link failed: ${(e as Error).message}`)
          setBusy(false)
          return
        }
      }
    }
    onClose()
  }

  const selCls = "w-full border-[var(--color-line)] bg-[var(--color-bg)] text-sm data-[size=default]:h-9"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel-raised w-full max-w-lg rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">New Task</h2>
        <Label className="mt-3 block text-xs text-ink-3">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul task"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
        <div className="mt-3 flex items-center justify-between">
          <Label className="text-xs text-ink-3">Body</Label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm"
              disabled={aiBusy || !body.trim()}
              onClick={() => improveBody("fast")}
              className="h-6 gap-1 border-[var(--color-accent)]/40 px-2 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
              title="Improve instan pakai template (tanpa AI call)"
            >
              <Sparkles className="size-3" />
              Fast
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={aiBusy || !body.trim()}
              onClick={() => improveBody("deep")}
              className="h-6 gap-1 border-[var(--color-line)] px-2 text-[11px] text-ink-2 hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
              title="Improve pakai AI model (lebih lambat, hasil lebih kontekstual)"
            >
              {aiMode === "deep" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {aiMode === "deep" ? "Improving…" : "Deep"}
            </Button>
          </div>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Deskripsi (opsional) — klik AI improve biar prompt-nya dirapikan"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)] text-sm" />
        {executor === "shell" && <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-200">Autonomous shell access</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-3">Orchestrator akan membaca workspace, mengedit file, menjalankan test, dan retry command sampai task siap direview.</p>
        </div>}
        {executionMode === "agentic" && <div className="mt-3 flex items-center gap-2">
          <Label className="text-[11px] text-ink-3">Max iterations</Label>
          <Input type="number" min="1" max="24" value={maxIterations} onChange={(e) => setMaxIterations(e.target.value)} className="h-7 w-20 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
        </div>}
        <Label className="mt-3 block text-xs text-ink-3">Agent Profile</Label>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className={`mt-1 ${selCls}`}>
            <SelectValue placeholder="profile" />
          </SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            {profiles.map((p) => (
              <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar className="size-4 shrink-0">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.name} />}
                    <AvatarFallback className="bg-[var(--color-inset)] text-[7px] text-[var(--color-accent)]">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">{p.name}{p.model ? ` — ${p.model}` : ""}{p.active ? " (active)" : ""}{!p.valid ? " (broken config)" : ""}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="mt-3 block text-xs text-ink-3">Execution</Label>
        <Select value={executor} onValueChange={(v) => setExecutor(v as typeof executor)}>
          <SelectTrigger className={`mt-1 ${selCls}`}><SelectValue /></SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            {visibleExecutors.map((e) => (
              <SelectItem key={e} value={e} className="text-sm">{EXECUTOR_LABELS[e] ?? e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="mt-3 block text-xs text-ink-3">Execution mode</Label>
        <Select value={executionMode} onValueChange={(v) => setExecutionMode(v as typeof executionMode)}>
          <SelectTrigger className={`mt-1 ${selCls}`}><SelectValue /></SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            <SelectItem value="direct" className="text-sm">Direct</SelectItem>
            <SelectItem value="agentic" className="text-sm">Agentic (plan and iterate)</SelectItem>
          </SelectContent>
        </Select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label className="block text-xs text-ink-3">Workspace</Label>
            <Select value={ws || "__scratch"} onValueChange={(v) => setWs(v === "__scratch" ? "" : v)}>
              <SelectTrigger className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                <SelectValue placeholder="workspace" />
              </SelectTrigger>
              <SelectContent className="max-w-[22rem] border-[var(--color-line)] bg-[var(--color-surface)]">
                {workspaces.map((w) => {
                  const ssh = isSshWorkspace(w)
                  const live = isLive(w)
                  const os = (w.os || "").toLowerCase()
                  const osLabel = os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""
                  return (
                    <SelectItem key={w.id} value={w.path} className="text-sm" title={`${w.name} — ${w.path}${w.host ? ` (${w.host})` : ""}${w.status ? ` · ${w.status}` : ""}`}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" title={w.status === "local" ? "local" : `connected ${w.ping_ms != null ? Math.round(w.ping_ms) + "ms" : ""}`} />}
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        {ssh && <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 px-1 py-0 text-[9px] leading-none text-violet-300">ssh</Badge>}
                        {osLabel && <Badge variant="outline" className="shrink-0 border-[var(--color-line)] bg-[var(--color-bg)] px-1 py-0 text-[9px] leading-none text-ink-3">{osLabel}</Badge>}
                      </span>
                    </SelectItem>
                  )
                })}
                <SelectItem value="__scratch" className="text-sm">(no workspace — scratch)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="block text-xs text-ink-3">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className={`mt-1 ${selCls}`}>
                <SelectValue placeholder="priority" />
              </SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                <SelectItem value="0" className="text-sm">0 — normal</SelectItem>
                <SelectItem value="1" className="text-sm">1</SelectItem>
                <SelectItem value="2" className="text-sm">2 — high</SelectItem>
                <SelectItem value="3" className="text-sm">3 — urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        <div className="mt-3">
          <Label className="block text-xs text-ink-3">Attachments (image / PDF)</Label>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files ?? [])} />
          <Button type="button" size="sm" variant="outline" className="mt-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip className="mr-1 size-3" /> {uploading ? "Uploading…" : "Attach file"}
          </Button>
          {pendingAtts.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{pendingAtts.map((a) => <AttachmentChip key={a.id} att={a} onRemove={() => setPendingAtts((prev) => prev.filter((x) => x.id !== a.id))} />)}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy || uploading} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}
