import type { CSSProperties, ReactNode } from "react"
import { AlertTriangle, Apple, ArrowRightLeft, ChevronDown, ExternalLink, HardDrive, Laptop } from "lucide-react"
import type { Profile, Status, Task, TaskHealth, Workspace } from "@/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusLamp, STATUS_LABEL, statusColor } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

const HEALTH_TONE: Record<string, string> = {
  healthy: "text-success",
  silent: "text-warning",
  stuck: "text-danger-text",
  lost: "text-danger-text",
}

function HostChip({ ws }: { ws?: Workspace }) {
  const os = (ws?.os ?? "").toLowerCase()
  const Icon = os === "windows" ? Laptop : os === "mac" ? Apple : HardDrive
  if (!ws) return null
  const label = os === "windows" ? "Windows" : os === "mac" ? "Mac" : "Linux"
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-3" title={ws.name}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim())?.trim() ?? ""

export interface TaskCardProps {
  task: Task
  profiles: Profile[]
  workspace?: Workspace
  health?: TaskHealth
  /** Statuses this task may move to (from STATUS_TARGETS). */
  moveTargets: Status[]
  selected?: boolean
  /** Slot for the elapsed-time indicator on running cards. */
  runtime?: ReactNode
  onOpen: () => void
  onOpenPage: () => void
  onMove: (status: Status) => void
  onReassign: (assignee: string) => void
  onToggleSelect?: (taskId: string, next: boolean) => void
  onDragStart?: (taskId: string) => void
  onDragEnd?: () => void
}

export default function TaskCard({
  task, profiles, workspace, health, moveTargets, selected, runtime,
  onOpen, onOpenPage, onMove, onReassign, onToggleSelect, onDragStart, onDragEnd,
}: TaskCardProps) {
  const profile = profiles.find((p) => p.name === task.assignee)
  const summary = firstLine(task.result || task.body)
  const running = task.status === "running"

  return (
    <article
      draggable={!running}
      data-status={task.status}
      data-selected={selected || undefined}
      onDragStart={(e) => {
        if (running) return e.preventDefault()
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
        "active:cursor-grabbing",
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
              "mt-0.5 size-3.5 shrink-0 accent-[var(--c-lantern)] transition-opacity",
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
          <span className={cn("text-xs", HEALTH_TONE[health?.health ?? ""] ?? "text-ink-3")} title={health?.reason}>
            {runtime}
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
          <HostChip ws={workspace} />
          {task.consecutive_failures > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-danger-text">
              <AlertTriangle className="size-3" aria-hidden />
              {task.consecutive_failures} failed
            </span>
          )}
          {moveTargets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Move task">
                  <ArrowRightLeft />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {moveTargets.map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => onMove(s)}>
                    Move to {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </footer>
    </article>
  )
}
