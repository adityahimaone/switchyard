import { parseTaskExecutionMeta, type Profile, type Status, type Task, type TaskHealth, type Workspace } from "../../api"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Apple, ExternalLink, HardDrive, Laptop, Square, X } from "lucide-react"
import { RunningIndicator } from "./AgentStatus"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const HEALTH_TONE: Record<string, string> = { healthy: "text-emerald-300", silent: "text-amber-300", stuck: "text-red-300", lost: "text-red-300/70" }
const STATUS_TARGETS: Record<Status, Status[]> = {
  triage: ["todo", "ready"],
  todo: ["ready", "blocked", "triage"],
  scheduled: ["ready", "todo"],
  ready: ["todo", "blocked"],
  running: [],
  blocked: ["todo", "ready"],
  review: ["done", "blocked", "todo"],
  done: [],
  archived: [],
}

function isSshPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/Users/")
}

function OsInfo({ ws }: { ws?: Workspace }) {
  const os = (ws?.os || "").toLowerCase()
  const path = ws?.path || ""
  const host = (ws?.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || /^[A-Za-z]:[\\/]/.test(path)) {
    return <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-500/70"><Laptop className="size-3" />win</span>
  }
  if (os === "mac" || host.includes("mac") || path.startsWith("/Users/")) {
    return <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-500/70"><Apple className="size-3" />mac</span>
  }
  if (os === "linux" || ws) {
    return <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-500/70"><HardDrive className="size-3" />linux</span>
  }
  return null
}

export default function TaskCard({ task, profiles, health, workspaces, onOpen, onOpenPage, onMove, onStop, onReassign, onDragStart, onDragEnd, selected, onToggleSelect }: {
  task: Task
  profiles: Profile[]
  health?: TaskHealth
  workspaces?: Workspace[]
  onOpen: () => void
  onOpenPage: () => void
  onMove: (s: Status) => void
  onStop: () => void
  onReassign: (a: string) => void
  onDragStart?: (taskId: string) => void
  onDragEnd?: () => void
  selected?: boolean
  onToggleSelect?: (taskId: string, next: boolean) => void
}) {
  const targets = STATUS_TARGETS[task.status] ?? []
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = (workspaces ?? []).find((w) => w.path === task.workspace_path)
  const wsIsSsh = ws ? !!ws.host && ws.host !== "localhost" && ws.host !== "127.0.0.1" : isSshPath(task.workspace_path || "")
  const desc = task.result || task.body
  const jev = parseTaskExecutionMeta(task.execution_meta)
  return (
    <article
      draggable={task.status !== "running"}
      onDragStart={(e) => { if (task.status === "running") { e.preventDefault(); return }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); onDragStart?.(task.id) }}
      onDragEnd={onDragEnd}
      className="decorative-card kanban-task-card group shrink-0 rounded-lg border border-line/60 bg-surface/45 p-3.5 shadow-none transition-[border-color,background-color,box-shadow,transform] duration-150 hover:border-line-strong hover:bg-inset/45 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur supports-[backdrop-filter]:bg-surface/45 data-[dragging=true]:opacity-50"
    >
      {onToggleSelect && (
        <div className="mb-1.5 -ml-1">
          <label className="inline-flex items-center gap-1.5 text-[10px] leading-none text-neutral-500">
            <input type="checkbox" checked={!!selected} onChange={(e) => onToggleSelect(task.id, e.currentTarget.checked)} className="size-3.5 rounded border-[var(--color-line)] bg-[var(--color-inset)] accent-[var(--color-accent)]" />
            select
          </label>
        </div>
      )}
      {/* title + open-page icon */}
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-neutral-100">{task.title}</h3>
        </button>
        <button
          onClick={onOpenPage}
          title="Buka detail page"
          className="shrink-0 rounded p-1 text-neutral-500 hover:text-[var(--color-accent)]"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      {/* description */}
      {desc && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-neutral-400">{desc}</p>
      )}

      {task.status === "running" && (
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[10px] uppercase tracking-wider ${HEALTH_TONE[health?.health ?? ""] ?? "text-amber-300/80"}`} title={health?.reason}>{health?.health ?? "active"}</span>
          <RunningIndicator startedAt={task.started_at} compact />
        </div>
      )}

      {/* metadata — 2-row hierarchy */}
      <div className="space-y-2 pt-2">
        {/* primary: agent + failure */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Select value={task.assignee || "__none"} onValueChange={(v) => onReassign(v === "__none" ? "" : v)}>
            <SelectTrigger
              size="sm"
              title={profile ? `${profile.name} — ${profile.model}` : "Agent profile"}
              className="h-7 w-auto max-w-32 gap-1 rounded-md border-none bg-[var(--color-inset)] px-2.5 text-xs font-medium text-neutral-200 shadow-none hover:bg-[var(--color-line)] focus-visible:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
              <SelectItem value="__none" className="text-[11px]">unassigned</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-[11px]">{p.name}</SelectItem>
              ))}
            </SelectContent>
            </Select>
            {profile && (
              <Avatar className="size-5 shrink-0" title={profile.name}>
                {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.name} />}
                <AvatarFallback className="bg-[var(--color-inset)] text-[9px] text-[var(--color-accent)]">
                  {profile.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          {profile && !profile.valid && (
            <span className="shrink-0 text-[11px] font-medium text-red-400" title={`provider ${profile.provider} invalid — worker crash`}>broken</span>
          )}
          {task.consecutive_failures > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-red-400">
              <X className="size-3" /> {task.consecutive_failures} fail{task.consecutive_failures > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* secondary: env · os · id */}
        <div className="flex min-w-0 items-center gap-2 text-xs text-neutral-500">
          {(task.workspace_path || task.priority > 0) && (
            <span className="min-w-0 truncate" title={task.workspace_path}>
              {wsIsSsh && "ssh · "}{ws?.name ?? (task.workspace_path ? task.workspace_path.split(/[\\/]/).pop() : "")}
              {task.priority > 0 && <span className="ml-1.5 font-medium text-amber-300/90">P{task.priority}</span>}
            </span>
          )}
          <OsInfo ws={ws} />
          {jev && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-violet-300/80" title={`JEV: ${jev.case} · ${jev.scope} · ${jev.source} · confidence ${(jev.confidence * 100).toFixed(0)}%`}>
              <span className="rounded border border-violet-400/20 bg-violet-400/10 px-1 py-0.5">{jev.case}</span>
              <span className="text-violet-300/50">{jev.scope}</span>
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-500/40">{task.id}</span>
        </div>
      </div>

      {/* status moves — hover only */}
      {(targets.length > 0 || task.status === "running") && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--color-line)]/40 pt-2">
          {task.status === "running" && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
            >
              <Square className="size-2.5 fill-current" /> stop
            </button>
          )}
          {targets.map((s) => (
            <button
              key={s}
              onClick={() => onMove(s)}
              className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 transition-colors hover:bg-[var(--color-line)] hover:text-[var(--color-accent)]"
            >
              → {s}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
