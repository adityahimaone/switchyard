import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { Task, TaskEvent } from "../../api"

const CHEVRON = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3)
  const column = index % 3
  return (column + Math.abs(row - 1)) * 90
})

const EVENT_LABELS: Record<string, string> = {
  created: "Task created",
  updated: "Task updated",
  assigned: "Agent assigned",
  unassigned: "Agent unassigned",
  promoted: "Moved to ready",
  demoted: "Moved to todo",
  scheduled: "Scheduled",
  claimed: "Worker claimed task",
  spawned: "Worker started",
  heartbeat: "Heartbeat",
  reclaimed: "Worker reclaimed",
  completed: "Completed",
  failed: "Failed",
  spawn_failed: "Spawn failed",
  blocked: "Blocked",
  gave_up: "Stopped",
  protocol_violation: "Protocol violation",
  status_changed: "Status changed",
}

const FAILURE_EVENTS = new Set(["failed", "spawn_failed", "blocked", "gave_up", "protocol_violation"])
const END_EVENTS = new Set(["completed", ...FAILURE_EVENTS])

export function useElapsed(startedAt?: number | null, endAt?: number | null, active = true) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active || endAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [active, endAt])

  const baseMs = startedAt ? startedAt * 1000 : null
  if (baseMs == null) return "0.0s"
  const seconds = Math.max(0, ((endAt ? endAt * 1000 : now) - baseMs) / 1000)
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function LoaderGrid() {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {CHEVRON.map((delay, index) => (
        <span
          key={index}
          className="size-1 rounded-[1px] bg-[var(--color-accent)]"
          style={{ opacity: 0.18, animation: `pixel-on 650ms ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  )
}

/* Synchronized circular progress ring: arc sweeps the circumference once per
   `period` so consecutive steps advance on the same beat. */
function ProgressRing({ step, total, period = 1100 }: { step: number; total: number; period?: number }) {
  const size = 24
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const share = Math.max(0.12, 1 / Math.max(1, total))

  return (
    <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={12} cy={12} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={12}
          cy={12}
          r={radius}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * share} ${circumference * (1 - share)}`}
          style={{ animation: `ring-sweep ${period}ms linear infinite`, transformOrigin: "12px 12px", transform: `rotate(${(step - 1) * 137.5}deg)` }}
        />
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-ink">{step}</span>
    </span>
  )
}

function Badge({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return (
    <span
      className={`flex size-5.5 shrink-0 items-center justify-center rounded-full text-white ${tone === "red" ? "bg-red" : "bg-green"}`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  )
}

const CheckIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
const XIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
const RetryIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>

function eventLabel(event: TaskEvent) {
  return EVENT_LABELS[event.kind] ?? event.kind.replaceAll("_", " ")
}

function eventData(event: TaskEvent) {
  if (!event.payload) return [] as [string, string][]
  try {
    return Object.entries(JSON.parse(event.payload) as Record<string, unknown>)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => {
        let display = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)
        if (typeof value === "string" && (value.trim().startsWith("{") || value.trim().startsWith("["))) {
          try { display = JSON.stringify(JSON.parse(value), null, 2) } catch { /* plain text */ }
        }
        return [key.replaceAll("_", " "), display] as [string, string]
      })
  } catch {
    return [["payload", event.payload]] as [string, string][]
  }
}

function eventTone(kind: string) {
  if (FAILURE_EVENTS.has(kind)) return "red"
  if (kind === "completed") return "green"
  if (kind === "claimed" || kind === "spawned" || kind === "heartbeat") return "running"
  return "pending"
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function RunningIndicator({ startedAt, endAt, compact = false }: { startedAt?: number | null; endAt?: number | null; compact?: boolean }) {
  const elapsed = useElapsed(startedAt, endAt, !endAt)
  return (
    <span role="status" aria-label={`Running for ${elapsed}`} className={`inline-flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <LoaderGrid />
      <span className="font-mono text-[11px] tabular-nums text-neutral-400">{elapsed}</span>
    </span>
  )
}

export function splitAgentResult(result: string) {
  const markers = [...result.matchAll(/╭─\s*C:\\>\s*HERMES\s*─+/g)]
  if (markers.length < 2) return { working: result.trim(), final: "" }
  const finalStart = markers[markers.length - 1].index ?? 0
  return { working: result.slice(0, finalStart).trim(), final: result.slice(finalStart).trim() }
}

/* Agent Progress — collapsible multi-step block over real task events.
   Steps stagger in, the active step carries the synchronized ring, and the
   block can minimize while keeping its progress state mounted. */
export function AgentTaskStatus({ task, events }: { task: Task; events: TaskEvent[] }) {
  const [minimized, setMinimized] = useState(false)
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState(false)
  const rows = useMemo(() => [...events].sort((a, b) => a.created_at - b.created_at), [events])
  const startedEvent = rows.find((event) => event.kind === "claimed" || event.kind === "spawned")
  const finishedEvent = [...rows].reverse().find((event) => END_EVENTS.has(event.kind))
  const startedAt = task.started_at ?? startedEvent?.created_at
  const completedAt = task.completed_at ?? finishedEvent?.created_at
  const live = task.status === "running" && !completedAt
  const elapsed = useElapsed(startedAt, completedAt, live)
  const visibleRows = expanded ? rows : rows.slice(-6)
  const activeIndex = live ? visibleRows.length - 1 : -1
  const activeEvent = live ? visibleRows[activeIndex] : null
  const remote = /^\/Users\//.test(task.workspace_path) || /^[A-Za-z]:[\\/]/.test(task.workspace_path)
  const settled = completedAt && startedAt
  const totalSeconds = settled ? Math.max(0, (completedAt - startedAt)) : null

  return (
    <section className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5" aria-label="Agent progress">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {live ? <LoaderGrid /> : <span className={`size-2 rounded-full ${task.status === "done" || task.status === "review" ? "bg-emerald-400" : "bg-neutral-500"}`} />}
          <h3 className="truncate text-[10px] font-semibold uppercase tracking-wider text-sky-300">Agent progress</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-neutral-400">
            {totalSeconds != null && !live
              ? `done in ${totalSeconds < 60 ? `${totalSeconds}s` : `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`}`
              : elapsed}
          </span>
          <button
            type="button"
            aria-expanded={!minimized}
            aria-label={minimized ? "Expand agent progress" : "Minimize agent progress"}
            onClick={() => setMinimized((value) => !value)}
            className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-inset hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300" style={{ transform: minimized ? "rotate(0)" : "rotate(180deg)" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* minimized keeps the active step visible so progress is preserved */}
      {minimized ? (
        <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-2">
          {activeEvent ? (
            <>
              <ProgressRing step={rows.findIndex((row) => row.id === activeEvent.id) + 1} total={rows.length} />
              <span className="truncate">{eventLabel(activeEvent)}</span>
            </>
          ) : (
            <span className="truncate">{rows.length ? `${rows.length} steps recorded` : "Waiting for worker events…"}</span>
          )}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
            <span className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-1.5 py-0.5">{task.status}</span>
            {task.assignee && <span>agent: {task.assignee}</span>}
            {remote && <span>node: remote workspace</span>}
          </div>

          {rows.length > 0 ? (
            <div className="mt-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                {visibleRows.map((event, index) => {
                  const tone = eventTone(event.kind)
                  const details = eventData(event)
                  const isActive = index === activeIndex
                  const open = openRows[event.id] ?? isActive
                  const sequenceIndex = expanded ? rows.findIndex((row) => row.id === event.id) : index
                  return (
                    <div key={event.id} className="overflow-hidden rounded-[14px] bg-surface shadow-card" style={{ animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${sequenceIndex * 80}ms both` }}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-2.5 px-2.5 text-left hover:bg-inset"
                        aria-expanded={open}
                        onClick={() => setOpenRows((current) => ({ ...current, [event.id]: !open }))}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center">
                          {tone === "running" && isActive
                            ? <ProgressRing step={rows.findIndex((row) => row.id === event.id) + 1} total={rows.length} />
                            : tone === "green"
                              ? <Badge tone="green">{CheckIcon}</Badge>
                              : tone === "red"
                                ? <Badge tone="red">{XIcon}</Badge>
                                : <ProgressRing step={sequenceIndex + 1} total={rows.length} period={0} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{eventLabel(event)}</span>
                        {tone === "red" && <span className="inline-flex h-5.5 items-center gap-1.5 rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red">Failed <span className="flex" style={{ animation: "spin 1.2s linear infinite" }}>{RetryIcon}</span></span>}
                        {tone === "green" && <span className="inline-flex h-5.5 items-center rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green">Completed</span>}
                        <span className="shrink-0 font-mono text-[10px] text-ink-3">{formatTime(event.created_at)}</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-ink-3 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <div className="grid transition-[grid-template-rows,opacity] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}>
                        <div className="overflow-hidden">
                          <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                            <span aria-hidden className="mx-auto h-full w-px bg-line" />
                            <div className="flex flex-col gap-1.5">
                              {details.length > 0 ? details.map(([key, value], detailIndex) => (
                                <div key={`${key}-${value}`} className="flex items-center justify-between gap-3" style={{ animation: open ? `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + detailIndex * 80}ms both` : undefined }}>
                                  <span className="truncate text-[12px] capitalize text-ink-2">{key}</span>
                                  <span className="max-w-[62%] whitespace-pre-wrap break-words text-right font-mono text-[11.5px] text-ink-3 tabular-nums">{value}</span>
                                </div>
                              )) : <span className="text-[12px] text-ink-3">No event details</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <p className="mt-2 text-[11px] text-neutral-500">Waiting for worker events…</p>}

          {rows.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-2 text-[10px] text-sky-300 hover:text-sky-200">{expanded ? "Show latest 6" : `Show full timeline (${rows.length})`}</button>}
        </>
      )}
    </section>
  )
}
