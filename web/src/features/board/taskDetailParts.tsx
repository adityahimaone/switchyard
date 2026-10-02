/* Shared vocabulary for both task-detail surfaces (drawer + page).

   The drawer and the page previously each hand-maintained their own copy of the
   status chip map, agent picker, run-control row and status-move row. That
   duplication is what let the type scale and surface treatments drift apart.
   Everything shared lives here; each surface composes from it. */

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Apple, HardDrive, Laptop, Monitor, Square } from "lucide-react"
import { COLUMNS, type Profile, type Status, type Task, type Workspace } from "../../api"

/* ---------------------------------------------------------------- tokens -- */

/* Status uses the nine lamp colours, not hand-mixed Tailwind hues. */
export const STATUS_CHIP: Record<string, string> = {
  done: "border-success/30 bg-success-tint text-success-text-text",
  running: "border-accent/30 bg-accent-tint text-accent-text",
  blocked: "border-danger/30 bg-danger-tint text-danger-text",
  review: "border-review/30 bg-review-tint text-review-text",
  archived: "border-line bg-well text-ink-3",
}

export const STATUS_FALLBACK_CHIP = "border-line bg-well text-ink-2"

/* --------------------------------------------------------------- section -- */

/* Section header. h2, not h3: the page title is the h1, so a section that
   jumped to h3 skipped a level and broke the document outline. */
export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-2xs font-semibold tracking-[0.14em] text-ink-3 uppercase ${className}`}>
      {children}
    </h2>
  )
}

export function Section({ title, children, className = "", bodyClassName = "" }: {
  title?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface p-3 ${className}`}>
      {title && <SectionTitle>{title}</SectionTitle>}
      <div className={title ? `mt-2 ${bodyClassName}` : bodyClassName}>{children}</div>
    </section>
  )
}

/* ----------------------------------------------------------------- field -- */

/* Label/value row. Sentence-case label, tabular value, hairline separators.
   Replaces the three near-identical `Row` / `StatusLine` definitions. */
export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${className}`}>
      <dt className="shrink-0 text-meta text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right text-body text-ink-2">{children}</dd>
    </div>
  )
}

export function FieldList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`divide-y divide-[var(--c-line)]/60 ${className}`}>{children}</dl>
}

/* ------------------------------------------------------------ empty state -- */

export function EmptyNote({ icon, title, hint, className = "" }: {
  icon?: ReactNode
  title: string
  hint?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-md border border-dashed border-[var(--c-line)] px-3 py-4 text-center ${className}`}>
      {icon && <span className="text-ink-3" aria-hidden>{icon}</span>}
      <p className="text-meta text-ink-3">{title}</p>
      {hint && <p className="max-w-[28ch] text-2xs leading-relaxed text-ink-3">{hint}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- os icon -- */

export function OsIcon({ ws }: { ws?: Workspace }) {
  const os = (ws?.os || "").toLowerCase()
  const path = ws?.path || ""
  const host = (ws?.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || /^[A-Za-z]:[\\/]/.test(path)) return <Laptop className="size-3 shrink-0" />
  if (os === "mac" || host.includes("mac") || path.startsWith("/Users/")) return <Apple className="size-3 shrink-0" />
  if (os === "linux" || ws) return <HardDrive className="size-3 shrink-0" />
  return <Monitor className="size-3 shrink-0" />
}

/* --------------------------------------------------------- status badges -- */

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-2xs leading-none ${STATUS_CHIP[status] ?? STATUS_FALLBACK_CHIP}`}>
      {status}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: number }) {
  if (!(priority > 0)) return null
  return (
    <Badge
      variant="outline"
      className="border-line bg-well px-1.5 py-0 text-2xs leading-none text-ink-2"
    >
      P{priority}
    </Badge>
  )
}

/* ------------------------------------------------------------ agent pick -- */

export function AgentPicker({ task, profiles, onReassign, onError, className = "" }: {
  task: Task
  profiles: Profile[]
  onReassign: (assignee: string) => Promise<void>
  onError: (message: string) => void
  className?: string
}) {
  const profile = profiles.find((p) => p.name === task.assignee)
  const id = `agent-${task.id}`
  return (
    <Section title={<label htmlFor={id}>Agent</label>} className={className}>
      <Select
        value={task.assignee || "unassigned"}
        onValueChange={(v) => onReassign(v === "unassigned" ? "" : v).catch((err: Error) => onError(err.message))}
        disabled={task.status === "running"}
      >
        <SelectTrigger id={id} className="h-8 w-full text-body disabled:opacity-50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
          <SelectItem value="unassigned" className="text-body">unassigned</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-body">
              {p.name}{p.active ? " (active)" : ""}{!p.valid ? " (broken)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {profile && (
        <p className="mt-1.5 truncate text-2xs text-ink-3" title={`${profile.model || "—" } · ${profile.provider || "—"}`}>
          {profile.model || "—"} · {profile.provider || "—"}
        </p>
      )}
      {profile && !profile.valid && (
        <p className="mt-1 text-2xs text-danger-text">Provider invalid — the worker will crash on start.</p>
      )}
    </Section>
  )
}

/* --------------------------------------------------------------- actions -- */

/* Run controls + status moves, shared by both surfaces. One stop button, one
   label. Everything sits on the same `size="xs"` control height. */
export function TaskActions({
  task,
  health,
  canRelease,
  onRun,
  onStop,
  onMove,
  onControl,
  controlPending = false,
  runPending = false,
  stopPending = false,
  runDisabledReason,
  error,
  showRun = true,
  className = "",
}: {
  task: Task
  health?: { health: string; reason?: string }
  canRelease: boolean
  onRun: () => void
  onStop: () => void
  onMove: (status: Status) => void
  onControl: (action: "retry" | "release" | "clone") => void
  controlPending?: boolean
  runPending?: boolean
  stopPending?: boolean
  runDisabledReason?: string | null
  error?: string
  showRun?: boolean
  className?: string
}) {
  const running = task.status === "running"
  const healthTone =
    health?.health === "healthy" ? "text-success-text"
    : health?.health === "silent" ? "text-warning"
    : "text-danger-text"

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {showRun && !running && task.status !== "archived" && (
          <Button
            variant="outline"
            size="xs"
            disabled={!!runDisabledReason || runPending}
            onClick={onRun}
            title={runDisabledReason ?? "Queue task now"}
          >
            {runPending ? "Queueing…" : "Run now"}
          </Button>
        )}
        {running && (
          <Button
            variant="outline"
            size="xs"
            disabled={stopPending}
            onClick={onStop}
            className="gap-1 text-danger-text hover:border-danger/50 hover:bg-danger/10"
          >
            <Square className="size-2.5 fill-current" />
            {stopPending ? "Stopping…" : "Stop task"}
          </Button>
        )}
        {running && health && (
          <span className={`text-2xs uppercase tracking-wider ${healthTone}`} title={health.reason}>
            health: {health.health}
          </span>
        )}
        {!running && task.status !== "archived" && (
          <Button variant="outline" size="xs" disabled={controlPending} onClick={() => onControl("retry")}>
            Retry
          </Button>
        )}
        {canRelease && (
          <Button
            variant="outline"
            size="xs"
            disabled={controlPending}
            onClick={() => onControl("release")}
            className="text-danger-text hover:border-danger/50 hover:bg-danger/10"
          >
            Release stale run
          </Button>
        )}
        {!running && (
          <Button variant="outline" size="xs" disabled={controlPending} onClick={() => onControl("clone")}>
            Clone
          </Button>
        )}
        {error && <span className="text-2xs text-danger-text">{error}</span>}
      </div>

      {!running && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {COLUMNS.filter((s) => s !== task.status).map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="xs"
              onClick={() => onMove(s)}
              className="text-ink-3 hover:border-[var(--c-line-strong)] hover:text-[var(--c-accent)]"
            >
              → {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------- failure block -- */

export function FailureBlock({ message, title = "Last failure", className = "" }: { message: string; title?: string; className?: string }) {
  return (
    <div className={`rounded-lg border border-danger/30 bg-danger/10 p-2.5 ${className}`}>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-danger-text">{title}</p>
      <p className="mt-1 max-h-24 overflow-y-auto break-words text-body leading-relaxed text-danger-text">{message}</p>
    </div>
  )
}
