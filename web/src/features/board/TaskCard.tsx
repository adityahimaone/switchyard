import type { CSSProperties } from "react"
import {
  AlertTriangle, Apple, ArrowRightLeft, ChevronDown, ExternalLink, HardDrive, Laptop, Square,
} from "lucide-react"
import { parseTaskExecutionMeta, type Profile, type Status, type Task, type TaskHealth, type Workspace } from "@/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusLamp, STATUS_LABEL, statusColor } from "@/components/ui/status-lamp"
import { RunningIndicator } from "./AgentStatus"
import { cn } from "@/lib/utils"

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

/** Health is text plus the lamp, never color alone. */
const HEALTH_TONE: Record<string, string> = {
  healthy: "text-success",
  silent: "text-warning",
  stuck: "text-danger-text",
  lost: "text-danger-text",
}

function HostChip({ ws }: { ws?: Workspace }) {
  if (!ws) return null
  const os = (ws.os || "").toLowerCase()
  const path = ws.path || ""
  const host = (ws.host || "").toLowerCase()
  const isWindows = os === "windows" || host.includes("windows") || /^[A-Za-z]:[\\/]/.test(path)
  const isMac = os === "mac" || host.includes("mac") || path.startsWith("/Users/")
  const Icon = isWindows ? Laptop : isMac ? Apple : HardDrive
  const label = isWindows ? "Windows" : isMac ? "Mac" : ws.os ? ws.os : "Linux"
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3" title={ws.name}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim())?.trim() ?? ""

export interface TaskCardProps {
  task: Task
  profiles: Profile[]
  workspaces?: Workspace[]
  health?: TaskHealth
  selected?: boolean
  onOpen: () => void
  onOpenPage: () => void
  onMove: (status: Status) => void
  onStop?: () => void
  onReassign: (assignee: string) => void
  onToggleSelect?: (taskId: string, next: boolean) => void
  onDragStart?: (taskId: string) => void
  onDragEnd?: () => void
}

export default function TaskCard({
  task, profiles, workspaces, health, selected,
  onOpen, onOpenPage, onMove, onStop, onReassign, onToggleSelect, onDragStart, onDragEnd,
}: TaskCardProps) {
  const targets = STATUS_TARGETS[task.status] ?? []
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = (workspaces ?? []).find((w) => w.path === task.workspace_path)
  const running = task.status === "running"
  const summary = firstLine(task.result || task.body || "")
  const jev = parseTaskExecutionMeta(task.execution_meta)

  return (
    <article
      draggable={!running}
      data-status={task.status}
      data-selected={selected || undefined}
      onDragStart={(e) => {
        if (running) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", task.id)
        onDragStart?.(task.id)
      }}
      onDragEnd={onDragEnd}
      style={{ "--lamp": statusColor(task.status) } as CSSProperties}
      className={cn(
        "group relative rounded-card border border-line bg-surface p-[var(--card-pad)] pl-4",
        "transition-[border-color,background-color] duration-100",
        "hover:border-line-strong focus-within:border-line-strong",
        "data-[selected]:border-lantern data-[selected]:bg-lantern-tint",
        "data-[dragging=true]:opacity-40 active:cursor-grabbing",
      )}
    >
      {/* coupler tick: the card's link to its track */}
      <span aria-hidden className="absolute top-3 left-0 h-5 w-[3px] rounded-r-full bg-[var(--lamp)]" />

      <div className="flex items-start gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            aria-label={`Select ${task.title}`}
            checked={!!selected}
            onChange={(e) => onToggleSelect(task.id, e.currentTarget.checked)}
            className={cn(
              "mt-0.5 size-3.5 shrink-0 accent-lantern transition-opacity",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 checked:opacity-100",
            )}
          />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-control text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <h3 className="line-clamp-2 font-sans text-sm leading-5 font-medium tracking-normal text-ink">
            {task.title}
          </h3>
        </button>
        <Button variant="ghost" size="icon-xs" aria-label="Open task page" onClick={onOpenPage}>
          <ExternalLink />
        </Button>
      </div>

      {summary && (
        <p className="mt-1.5 truncate font-mono text-2xs text-ink-3" title={summary}>
          {summary}
        </p>
      )}

      {running && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <StatusLamp status="running" label={health?.health ?? "active"} />
          <span className={cn("text-xs tabular", HEALTH_TONE[health?.health ?? ""] ?? "text-ink-3")} title={health?.reason}>
            <RunningIndicator startedAt={task.started_at} compact />
          </span>
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="-ml-1.5 max-w-36" aria-label="Change assignee">
              <Avatar className="size-4">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                <AvatarFallback className="bg-well text-[8px] text-ink-2">
                  {(profile?.name ?? "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{task.assignee || "Unassigned"}</span>
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onReassign("")}>Unassigned</DropdownMenuItem>
            {profiles.map((p) => (
              <DropdownMenuItem key={p.name} disabled={!p.valid} onSelect={() => onReassign(p.name)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-2">
          <HostChip ws={ws} />
          {task.priority > 0 && (
            <span className="shrink-0 text-xs text-ink-3" title={`Priority ${task.priority}`}>
              P{task.priority}
            </span>
          )}
          {task.consecutive_failures > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-danger-text">
              <AlertTriangle className="size-3" aria-hidden />
              {task.consecutive_failures} failed
            </span>
          )}
          {running && onStop && (
            <Button variant="ghost" size="icon-xs" aria-label="Stop task" onClick={onStop}>
              <Square className="fill-current" />
            </Button>
          )}
          {targets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Move task">
                  <ArrowRightLeft />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {targets.map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                    Move to {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </footer>

      {jev && (
        <p
          className="mt-2 truncate text-2xs text-ink-4"
          title={`JEV: ${jev.case} · ${jev.scope} · ${jev.source} · confidence ${(jev.confidence * 100).toFixed(0)}%`}
        >
          {jev.case} · {jev.scope}
        </p>
      )}
    </article>
  )
}
