import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, parseTaskExecutionMeta, runControl, taskHealth, toastGlobal, COLUMNS, type Profile, type Status, type Task, type TaskEvent, type Workspace, type TaskHealth } from "../../api"
import { Apple, ExternalLink, HardDrive, Laptop, Monitor, Square, X } from "lucide-react"
import { AgentTaskStatus, splitAgentResult } from "./AgentStatus"
import { ResultEmpty, ResultPanel, WorkerLogPanel } from "./OutputPanels"
import { ReviewSection } from "./ReviewSection"
import TaskRuntimeStatus from "./TaskRuntimeStatus"

const STATUS_CHIP: Record<string, string> = {
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  running: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  review: "border-violet-500/40 bg-violet-500/10 text-violet-300",
}

function OsIcon({ ws }: { ws?: Workspace }) {
  const os = (ws?.os || "").toLowerCase()
  const path = ws?.path || ""
  const host = (ws?.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || /^[A-Za-z]:[\\/]/.test(path)) return <Laptop className="size-3" />
  if (os === "mac" || host.includes("mac") || path.startsWith("/Users/")) return <Apple className="size-3" />
  if (os === "linux" || ws) return <HardDrive className="size-3" />
  return <Monitor className="size-3" />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px] text-neutral-300">{children}</span>
    </div>
  )
}

export default function TaskDetail({
  slug,
  task,
  profiles,
  workspaces,
  onClose,
  onMove,
  onStop,
  onReassign,
  onOpenPage,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  workspaces: Workspace[]
  onClose: () => void
  onMove: (s: Status) => Promise<void>
  onStop: () => Promise<void>
  onReassign: (a: string) => Promise<void>
  onOpenPage: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = workspaces.find((w) => w.path === task.workspace_path)
  const wsIsSsh = !!ws?.host && ws.host !== "localhost" && ws.host !== "127.0.0.1"
  const qc = useQueryClient()
  const health = useQuery<TaskHealth>({
    queryKey: ["health", slug, task.id],
    queryFn: () => taskHealth(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
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
  const resultSplit = task.result ? splitAgentResult(task.result) : null
  const jev = parseTaskExecutionMeta(task.execution_meta)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 p-0 sm:p-3" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="task-detail-drawer glass-panel flex h-full w-full max-w-md flex-col overflow-hidden rounded-none border-y-0 border-l-0 pb-[env(safe-area-inset-bottom)] sm:rounded-xl sm:border sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">Task details</p>
              <h2 id="task-detail-title" className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-neutral-100">{task.title}</h2>
            </div>
            <Button variant="outline" size="sm" aria-label="Close task details" className="size-10 shrink-0 p-0" onClick={onClose}><X className="size-4" /></Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
            <Badge variant="outline" className={`px-1.5 py-0 text-[9px] leading-none ${STATUS_CHIP[task.status] ?? "border-[var(--color-line)] bg-[var(--color-inset)] text-neutral-300"}`}>{task.status}</Badge>
            {task.priority > 0 && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] leading-none text-amber-300">P{task.priority}</Badge>}
            <span className="max-w-full truncate font-mono text-[10px] text-neutral-500/60">{task.id}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">


        <AgentTaskStatus task={task} events={events.data ?? []} />
        <TaskRuntimeStatus task={task} profile={profile} workspace={ws} events={events.data ?? []} compact />

        {/* agent */}
        <div className="glass-inset-card rounded-lg p-2.5">
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Agent</label>
          <Select
            value={task.assignee || "unassigned"}
            onValueChange={(v) => onReassign(v === "unassigned" ? "" : v).catch((err: Error) => toastGlobal(err.message, "error"))}
            disabled={task.status === "running"}
          >
            <SelectTrigger className="mt-1 h-8 w-full border-[var(--color-line)] bg-[var(--color-surface)] text-xs disabled:opacity-50">
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

        {/* meta rows */}
        <div className="glass-inset-card divide-y divide-[var(--color-line)]/60 rounded-lg px-2.5">
          <Row label="Workspace">
            {task.workspace_path
              ? <span className="flex items-center justify-end gap-1.5" title={task.workspace_path}>
                  <OsIcon ws={ws} />
                  {ws?.name ?? task.workspace_path.split(/[\\/]/).pop()}
                  {wsIsSsh && <span className="text-neutral-500">· ssh</span>}
                </span>
              : "scratch"}
          </Row>
          <Row label="Kind">{task.workspace_kind || "dir"}</Row>
          <Row label="Execution">{task.executor || "auto"}{task.execution_mode === "agentic" ? " · agentic" : task.command ? " · " + task.command : ""}</Row>
          {jev && (
            <div className="border-t border-[var(--color-line)]/60 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-violet-300/80">JEV routing</span>
                <span className="text-[10px] text-neutral-500">{jev.source}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="border-violet-400/25 bg-violet-400/10 px-1.5 py-0 text-[9px] text-violet-200">{jev.case}</Badge>
                <Badge variant="outline" className="border-violet-400/25 bg-violet-400/10 px-1.5 py-0 text-[9px] text-violet-200">scope: {jev.scope}</Badge>
                <span className="self-center text-[10px] text-neutral-500">confidence {(jev.confidence * 100).toFixed(0)}%</span>
              </div>
              {(jev.model || jev.input_tokens) && <p className="mt-1 truncate text-[10px] text-neutral-600" title={jev.model}>{jev.model || "local"}{jev.input_tokens ? ` · ${jev.input_tokens} input tokens` : ""}</p>}
            </div>
          )}
          <Row label="Dibuat">{new Date(task.created_at * 1000).toLocaleString()}</Row>
          {task.started_at && <Row label="Mulai">{new Date(task.started_at * 1000).toLocaleString()}</Row>}
          {task.completed_at && <Row label="Selesai">{new Date(task.completed_at * 1000).toLocaleString()}</Row>}
          <Row label="Creator">{task.created_by || "—"}</Row>
          <Row label="Events">{events.data?.length ?? 0} tercatat</Row>
        </div>

        {task.body && (
          <div className="glass-inset-card rounded-lg p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Deskripsi</label>
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-300">{task.body}</p>
          </div>
        )}
        {task.last_failure_error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-red-300">Last failure</label>
            <p className="mt-1 max-h-20 overflow-y-auto break-words text-[11px] leading-relaxed text-red-300">{task.last_failure_error}</p>
          </div>
        )}
        <div className="space-y-2">
          {task.status === "running" ? (
            <WorkerLogPanel text={resultSplit?.working ?? ""} running slug={slug} taskId={task.id} />
          ) : resultSplit?.final ? (
            <>
              <WorkerLogPanel text={resultSplit.working} slug={slug} taskId={task.id} />
              <ResultPanel text={resultSplit.final} hasWorking={!!resultSplit.working} />
            </>
          ) : resultSplit?.working ? (
            <ResultPanel text={resultSplit.working} hasWorking={false} />
          ) : (
            <ResultEmpty />
          )}
        </div>

        {/* prototype stack: review follows result */}
        {task.status === "review" && (
          <div className="mt-3">
            <ReviewSection slug={slug} task={task} onDone={onOpenPage} />
          </div>
        )}

        {/* run-control */}
        <div className="flex flex-wrap items-center gap-1.5">
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
        <div className="flex flex-wrap gap-1.5">
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
        <div className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 p-3 backdrop-blur-xl">
          <Button onClick={onOpenPage} size="sm" className="w-full gap-1.5 bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90 active:scale-[.98]">
            <ExternalLink className="size-3.5" /> Open full detail page
          </Button>
        </div>
      </aside>
    </div>
  )
}
