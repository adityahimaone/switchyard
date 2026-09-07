import type { Profile, Status, Task, Workspace } from "../../api"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Apple, ExternalLink, HardDrive, Laptop, X } from "lucide-react"
import { RunningIndicator } from "./AgentStatus"

const STATUS_TARGETS: Record<Status, Status[]> = {
  triage: ["todo", "ready"],
  todo: ["ready", "blocked", "triage"],
  scheduled: ["ready", "todo"],
  ready: ["todo", "blocked"],
  running: ["blocked", "review", "done"],
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

export default function TaskCard({ task, profiles, workspaces, onOpen, onOpenPage, onMove, onReassign }: {
  task: Task
  profiles: Profile[]
  workspaces?: Workspace[]
  onOpen: () => void
  onOpenPage: () => void
  onMove: (s: Status) => void
  onReassign: (a: string) => void
}) {
  const targets = STATUS_TARGETS[task.status] ?? []
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = (workspaces ?? []).find((w) => w.path === task.workspace_path)
  const wsIsSsh = ws ? !!ws.host && ws.host !== "localhost" && ws.host !== "127.0.0.1" : isSshPath(task.workspace_path || "")
  const desc = task.result || task.body
  return (
    <article className={`group relative rounded-2xl border border-border-default bg-background-primary p-3.5 shadow-card transition-colors duration-150 hover:border-border-strong hover:bg-background-primary-hover ${task.status === "running" ? "edge-live" : ""}`}>
      {/* title + open-page icon */}
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <h3 className="line-clamp-2 text-headline-semibold text-text-primary">{task.title}</h3>
        </button>
        <button
          onClick={onOpenPage}
          title="Buka detail page"
          className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-background-tertiary hover:text-accent-400"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      {/* description */}
      {desc && (
        <p className="mt-1.5 line-clamp-2 text-body-2-regular text-text-secondary">{desc}</p>
      )}

      {task.status === "running" && (
        <div className="mt-2 flex justify-end">
          <RunningIndicator startedAt={task.started_at} compact />
        </div>
      )}

      {/* metadata — 2-row hierarchy */}
      <div className="flex flex-col gap-2 pt-2">
        {/* primary: agent + failure */}
        <div className="flex items-center justify-between gap-2">
          <Select value={task.assignee || "__none"} onValueChange={(v) => onReassign(v === "__none" ? "" : v)}>
            <SelectTrigger
              size="sm"
              title={profile ? `${profile.name} — ${profile.model}` : "Agent profile"}
              className="h-7 w-auto max-w-32 gap-1 rounded-xl border border-border-default bg-background-tertiary px-2.5 text-body-2-medium text-text-primary shadow-none hover:bg-background-primary-hover focus-visible:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border-default bg-background-primary shadow-dropdown">
              <SelectItem value="__none" className="text-[11px]">unassigned</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-[11px]">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="flex min-w-0 items-center gap-2 text-caption-1-regular text-text-tertiary">
          {(task.workspace_path || task.priority > 0) && (
            <span className="min-w-0 truncate" title={task.workspace_path}>
              {wsIsSsh && "ssh · "}{ws?.name ?? (task.workspace_path ? task.workspace_path.split(/[\\/]/).pop() : "")}
              {task.priority > 0 && <span className="ml-1.5 font-medium text-amber-300/90">P{task.priority}</span>}
            </span>
          )}
          <OsInfo ws={ws} />
          <span className="ml-auto shrink-0 font-mono text-[10px] text-text-tertiary">{task.id}</span>
        </div>
      </div>

      {/* status moves stay visible: task actions must not depend on hover */}
      {targets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border-default pt-2">
          {targets.map((s) => (
            <button
              key={s}
              onClick={() => onMove(s)}
              className="rounded-lg px-1.5 py-0.5 text-caption-2-medium text-text-secondary transition-colors hover:bg-background-tertiary hover:text-accent-400"
            >
              → {s}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
