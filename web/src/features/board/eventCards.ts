import {
  Ban, CalendarClock, CheckCircle2, CircleDot, FileEdit, Lock, PauseOctagon,
  PlayCircle, RefreshCw, Sparkles, TriangleAlert, UserRound, Zap,
  type LucideIcon,
} from "lucide-react"
import type { TaskEvent } from "@/api"

/**
 * Human-readable event model: raw JSON payload -> labeled key/value cards.
 * Grouped by lifecycle phase so the detail drawer reads like a story:
 * Creation -> Assignment -> Lifecycle -> Execution -> Outcome -> Problem.
 */

export type EventTone = "accent" | "success" | "warning" | "danger" | "info" | "neutral"

export interface EventField {
  label: string
  value: string
  tone?: EventTone
  mono?: boolean
}

export interface EventCard {
  kind: string
  label: string
  icon: LucideIcon
  tone: EventTone
  at: number
  fields: EventField[]
  note?: string
}

export type EventGroup = {
  title: string
  tone: EventTone
  cards: EventCard[]
}

/* Maximum characters before a field value is truncated + collapsible */
export const FIELD_TRUNCATE_LEN = 120

const KIND_META: Record<string, { label: string; icon: LucideIcon; tone: EventTone; group: string }> = {
  created:     { label: "Task created",     icon: Sparkles,     tone: "accent",  group: "Creation" },
  updated:     { label: "Task updated",     icon: FileEdit,     tone: "neutral", group: "Creation" },
  assigned:    { label: "Agent assigned",   icon: UserRound,    tone: "accent",  group: "Assignment" },
  unassigned:  { label: "Agent unassigned", icon: UserRound,    tone: "neutral", group: "Assignment" },
  promoted:    { label: "Moved to ready",   icon: PlayCircle,   tone: "accent",  group: "Lifecycle" },
  demoted:     { label: "Back to todo",     icon: CircleDot,    tone: "neutral", group: "Lifecycle" },
  scheduled:   { label: "Scheduled",        icon: CalendarClock, tone: "info",    group: "Lifecycle" },
  claimed:     { label: "Claimed by worker", icon: Lock,         tone: "neutral", group: "Execution" },
  spawned:     { label: "Worker started",   icon: PlayCircle,   tone: "accent",  group: "Execution" },
  heartbeat:   { label: "Heartbeat",        icon: CircleDot,    tone: "neutral", group: "Execution" },
  reclaimed:   { label: "Reclaimed manually", icon: RefreshCw,  tone: "warning", group: "Execution" },
  completed:   { label: "Completed",        icon: CheckCircle2, tone: "success", group: "Outcome" },
  blocked:     { label: "Blocked by worker", icon: Ban,          tone: "warning", group: "Problem" },
  gave_up:     { label: "Stopped",          icon: PauseOctagon, tone: "danger",  group: "Problem" },
  failed:      { label: "Failed",           icon: TriangleAlert, tone: "danger", group: "Problem" },
  protocol_violation: { label: "Protocol violation", icon: TriangleAlert, tone: "danger", group: "Problem" },
  spawn_failed: { label: "Spawn failed",    icon: Zap,          tone: "danger",  group: "Problem" },
}

const GROUP_ORDER = ["Creation", "Assignment", "Lifecycle", "Execution", "Outcome", "Problem"] as const
const GROUP_TONE: Record<string, EventTone> = {
  Creation: "accent", Assignment: "accent", Lifecycle: "neutral",
  Execution: "neutral", Outcome: "success", Problem: "danger",
}

const FALLBACK: { label: string; icon: LucideIcon; tone: EventTone } = {
  label: undefined as unknown as string, icon: CircleDot, tone: "neutral",
}

function fmtBool(v: unknown): string {
  return v ? "yes" : "no"
}

/** camelCase / snake_case key -> "Friendly Label" */
function humanKey(k: string): string {
  const KNOWN: Record<string, string> = {
    pid: "PID", run_id: "Run ID", lock: "Lock", expires: "Lock expiry",
    exit_code: "Exit code", result_len: "Panjang result", retry_status: "Status retry",
    prev_lock: "Lock lama", prev_pid: "PID lama", trigger_outcome: "Trigger",
    protocol_violations: "Pelanggaran protokol", protocol_violation_limit: "Limit pelanggaran",
    effective_limit: "Limit efektif", limit_source: "Sumber limit",
    assignee: "Profile agent", source: "Sumber", manual: "Manual",
    host_local: "Host lokal", termination_attempted: "Coba terminasi",
    terminated: "Terminasi sukses", sigkill: "SIGKILL", claimer: "Klaimer",
    failures: "Total gagal", error: "Error", reason: "Alasan", summary: "Ringkasan",
    status: "Status", priority: "Prioritas", workspace_path: "Workspace",
    workspace_kind: "Tipe workspace", body: "Deskripsi", model: "Model",
    old_status: "Dari status", new_status: "Ke status", title: "Judul",
  }
  if (KNOWN[k]) return KNOWN[k]
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
}

function fmtValue(v: unknown, key: string): { value: string; mono?: boolean } | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "boolean") return { value: fmtBool(v) }
  if (typeof v === "number") {
    // epoch seconds -> local time for expiry-ish keys
    if (/expires|_at$|^at$/.test(key) && v > 1_000_000_000) {
      return { value: new Date(v * 1000).toLocaleString() }
    }
    return { value: String(v), mono: true }
  }
  const s = String(v).trim()
  if (!s) return null
  // long error/reason text -> keep whole but flag mono wrap
  if (key === "error" || key === "reason") return { value: s, mono: true }
  if (/^[a-z0-9_/-]+$/i.test(s) && s.length < 64) return { value: s, mono: true }
  return { value: s }
}

function toneFor(key: string, v: unknown): EventTone | undefined {
  if (key === "error") return "danger"
  if (key === "reason" && typeof v === "string" && /invalid|fail|crash|broken/i.test(v)) return "danger"
  if (key === "retry_status" && v === "ready") return "warning"
  return undefined
}

export function parseEventCards(events: TaskEvent[]): EventGroup[] {
  const groups = new Map<string, EventCard[]>()
  for (const e of events) {
    const meta = KIND_META[e.kind] ?? { ...FALLBACK, label: e.kind, group: "Execution" }
    const group = meta.group
    const card: EventCard = {
      kind: e.kind,
      label: meta.label,
      icon: meta.icon,
      tone: meta.tone,
      at: e.created_at,
      fields: [],
    }

    // payload -> fields
    let payload: Record<string, unknown> = {}
    if (e.payload) {
      try {
        const parsed = JSON.parse(e.payload)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>
        } else {
          card.note = String(parsed)
        }
      } catch {
        card.note = e.payload
      }
    }

    for (const [k, v] of Object.entries(payload)) {
      if (k === "protocol_violation" && v === true) continue // redundant with kind
      const f = fmtValue(v, k)
      if (!f) continue
      card.fields.push({ label: humanKey(k), value: f.value, tone: toneFor(k, v), mono: f.mono })
    }

    if (!card.fields.length && !card.note && e.kind === "heartbeat") {
      card.fields.push({ label: "Status", value: "worker masih hidup" })
    }

    const arr = groups.get(group) ?? []
    arr.push(card)
    groups.set(group, arr)
  }

  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
    title: g,
    tone: GROUP_TONE[g],
    cards: groups.get(g)!,
  }))
}

export const TONE_DOT: Record<EventTone, string> = {
  accent: "bg-[var(--color-accent)]",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-4",
  info: "bg-info",
}

export const TONE_TEXT: Record<EventTone, string> = {
  accent: "text-[var(--color-accent)]",
  success: "text-emerald-300",
  warning: "text-warning",
  danger: "text-danger-text",
  neutral: "text-ink-2",
  info: "text-[var(--color-info)]",
}

export const TONE_BORDER: Record<EventTone, string> = {
  accent: "border-[var(--color-line-strong)] bg-[var(--color-accent-tint)]",
  success: "border-emerald-500/40 bg-emerald-500/5",
  warning: "border-warning/40 bg-warning/5",
  danger: "border-danger/40 bg-danger/5",
  neutral: "border-[var(--color-line)] bg-transparent",
  info: "border-info/40 bg-info/5",
}
