import type { TaskEvent, TaskRun } from "@/api"
import type { TraceSpan } from "@/components/ui/agent-trace"

/**
 * Derives an AgentTrace from a task's history.
 *
 * Events are points, not durations, so each event becomes a span
 * that runs until the next one: the axis then shows where the
 * task's time actually went — the dispatch span is the executor
 * at work, and the gate and verify spans are the checks that
 * followed it. Nothing is invented: every span is an event that
 * really happened, and its length is the gap until the next one.
 */

/** Event kind -> trace span kind. The executor's dispatch and the
 * worker it spawns are the agent; gates and verification are
 * tools; assignment is the model's decision; the rest is io. */
const SPAN_KIND: Record<string, TraceSpan["kind"]> = {
  remote_dispatched: "agent",
  spawned: "agent",
  assigned: "model",
  unassigned: "model",
  gate_started: "tool",
  gate_failed: "tool",
  gate_overridden: "tool",
  start_deferred: "tool",
  verify_started: "tool",
  verify_failed: "tool",
  verify_passed: "tool",
  verify_skipped: "tool",
  verify_unavailable: "tool",
  verify_overridden: "tool",
  claimed: "tool",
  reclaimed: "tool",
  run_requested: "tool",
  shell_iteration: "tool",
}

const ERROR_KINDS = new Set([
  "failed",
  "gave_up",
  "blocked",
  "protocol_violation",
  "spawn_failed",
  "gate_failed",
  "verify_failed",
  "verify_unavailable",
  "worktree_merge_conflict",
])

const LABELS: Record<string, string> = {
  created: "task.created",
  updated: "task.updated",
  assigned: "agent.assigned",
  unassigned: "agent.unassigned",
  promoted: "task.promoted",
  demoted: "task.demoted",
  scheduled: "task.scheduled",
  status_changed: "task.status",
  task_fields_updated: "task.fields",
  claimed: "task.claimed",
  spawned: "worker.spawned",
  heartbeat: "task.heartbeat",
  reclaimed: "task.reclaimed",
  run_requested: "task.run",
  started: "task.started",
  remote_dispatched: "agent.dispatch",
  shell_iteration: "shell.iteration",
  worker_output: "worker.output",
  gate_started: "gate.run",
  gate_failed: "gate.failed",
  gate_overridden: "gate.override",
  start_deferred: "gate.deferred",
  verify_started: "verify.run",
  verify_failed: "verify.failed",
  verify_passed: "verify.passed",
  verify_skipped: "verify.skipped",
  verify_unavailable: "verify.unavailable",
  verify_overridden: "verify.override",
  completed: "task.completed",
  blocked: "task.blocked",
  gave_up: "task.stopped",
  stopped: "task.stopped",
  failed: "task.failed",
  protocol_violation: "task.violation",
  spawn_failed: "task.spawn-failed",
  worktree_merge_conflict: "worktree.conflict",
}

/** The span kinds that open a run: a run's token bill and its
 * attempt number land on the event that started it. */
const RUN_OPENING = new Set(["claimed", "spawned", "started", "remote_dispatched"])

/** Payload keys worth surfacing as the span's one-line result,
 * in priority order. */
const DETAIL_KEYS = [
  "executor",
  "profile",
  "node_id",
  "assignee",
  "command",
  "error",
  "reason",
  "outcome",
  "status",
  "source",
  "model",
]

const MAX_DETAIL = 48

function labelOf(kind: string): string {
  return LABELS[kind] ?? kind.replace(/_/g, ".")
}

/** The payload's first interesting fields, as `key=value` pairs. */
function detailOf(payload: string): string {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(payload) as Record<string, unknown>
  } catch {
    return ""
  }
  const parts: string[] = []
  for (const key of DETAIL_KEYS) {
    const v = obj[key]
    if (typeof v !== "string" && typeof v !== "number") continue
    const s = String(v).trim()
    if (!s) continue
    parts.push(`${key}=${s}`)
    if (parts.length === 2) break
  }
  const joined = parts.join(" ")
  return joined.length > MAX_DETAIL ? `${joined.slice(0, MAX_DETAIL - 1)}…` : joined
}

/** A run's window; `ended_at` of 0 means the run never closed. */
function inRunWindow(run: TaskRun, at: number): boolean {
  return run.started_at <= at && (run.ended_at === 0 || run.ended_at >= at)
}

function sortEventsChronologically(events: TaskEvent[]): TaskEvent[] {
  return [...events].sort((a, b) => a.created_at - b.created_at || a.id - b.id)
}

/**
 * Coalesce consecutive streaming `worker_output` chunks so a 150-chunk output
 * stream does not drown out the lifecycle trace or collapse every row onto the
 * final second. If a `worker_output` chunk carries a `HERMES_EVENT:` phase or
 * turn/step marker, we surface that milestone; otherwise consecutive chunks
 * merge into a single `worker.output` span covering their time window.
 */
function coalesceWorkerOutputEvents(sorted: TaskEvent[]): TaskEvent[] {
  const workerCount = sorted.filter((e) => e.kind === "worker_output").length
  if (workerCount <= 3) return sorted

  const out: TaskEvent[] = []
  let i = 0
  while (i < sorted.length) {
    const ev = sorted[i]
    if (ev.kind !== "worker_output") {
      out.push(ev)
      i++
      continue
    }
    let j = i
    let chunkCount = 0
    const milestones: TaskEvent[] = []
    const seenPhases = new Set<string>()
    while (j < sorted.length && sorted[j].kind === "worker_output") {
      const cur = sorted[j]
      chunkCount++
      try {
        const parsed = JSON.parse(cur.payload) as { text?: string }
        const text = typeof parsed.text === "string" ? parsed.text : ""
        for (const line of text.split("\n")) {
          const t = line.trim()
          if (t.startsWith("HERMES_EVENT:")) {
            const rawJson = t.slice("HERMES_EVENT:".length).trim()
            const hev = JSON.parse(rawJson) as { phase?: string; label?: string; executor?: string }
            const phase = hev.phase || "event"
            if (!seenPhases.has(phase)) {
              seenPhases.add(phase)
              milestones.push({
                ...cur,
                id: cur.id * 1000 + milestones.length,
                kind: `worker_${phase}`,
                payload: JSON.stringify({
                  status: hev.label || phase,
                  ...(hev.executor ? { executor: hev.executor } : {}),
                }),
              })
            }
          }
        }
      } catch {
        // ignore unparseable chunk
      }
      j++
    }
    if (milestones.length > 0) {
      out.push(...milestones)
    } else {
      const first = sorted[i]
      out.push({
        ...first,
        payload: JSON.stringify({ status: `${chunkCount} output chunks` }),
      })
    }
    i = j
  }
  return out
}

/** The wall-clock origin of a history trace: when its
 * first event happened, in epoch ms. */
export function traceOrigin(events: TaskEvent[]): number | undefined {
  if (events.length === 0) return undefined
  const sorted = sortEventsChronologically(events)
  const first = sorted.find((e) => e.created_at > 0) ?? sorted[0]
  return first && first.created_at > 0 ? first.created_at * 1000 : undefined
}

export function traceSpansFromHistory(events: TaskEvent[], runs: TaskRun[]): TraceSpan[] {
  if (events.length === 0) return []
  const sorted = coalesceWorkerOutputEvents(sortEventsChronologically(events))
  if (sorted.length === 0) return []
  const t0 = sorted[0].created_at
  const spans: TraceSpan[] = []
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const next = sorted[i + 1]
    const startMs = Math.max(0, (e.created_at - t0) * 1000)
    // A span lasts until the next event; the final one closes a
    // beat after its own timestamp so it is still visible.
    // Events carry second precision, so several can share a
    // timestamp: a one-second floor keeps those spans visible
    // as bars instead of 1ms slivers. It is a rendering
    // convention, not data — the events really did happen in
    // that second, and same-second spans simply overlap.
    const rawEndMs = next ? Math.max(startMs, (next.created_at - t0) * 1000) : startMs + 500
    const span: TraceSpan = {
      id: `ev-${e.id}`,
      label: labelOf(e.kind),
      start: startMs,
      end: Math.max(rawEndMs, startMs + 1000),
      kind: SPAN_KIND[e.kind] ?? (e.kind.startsWith("worker_") ? "agent" : "io"),
      status: ERROR_KINDS.has(e.kind) ? "error" : "ok",
      detail: detailOf(e.payload),
    }
    const run = RUN_OPENING.has(e.kind) ? runs.find((r) => inRunWindow(r, e.created_at)) : undefined
    if (run) {
      if (run.usage.totalTokens > 0) span.tokens = run.usage.totalTokens
      // A re-run of the same card is the retry the chip describes.
      if (run.index > 1) span.attempt = run.index
    }
    spans.push(span)
  }
  return spans
}
