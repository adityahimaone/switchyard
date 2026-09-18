import { useState } from "react"
import { AlertCircle, Check, ChevronDown, CircleDot, Cpu, Hammer, HelpCircle, Lightbulb, ShieldCheck, Wrench, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { ChatRunEvent } from "@/api"

type EventCardProps = { event: ChatRunEvent }

type EventPayload = Record<string, unknown>

function parsePayload(payload: string): EventPayload {
  try {
    const value: unknown = JSON.parse(payload)
    return value && typeof value === "object" ? value as EventPayload : { value }
  } catch {
    return { value: payload }
  }
}

function text(payload: EventPayload, ...keys: string[]) {
  for (const key of keys) if (typeof payload[key] === "string" && payload[key]) return payload[key] as string
  return ""
}

const eventMeta: Record<string, { label: string; icon: typeof CircleDot; tone: string }> = {
  tool: { label: "Tool", icon: Wrench, tone: "text-sky-300" },
  reasoning: { label: "Reasoning", icon: Lightbulb, tone: "text-amber-300" },
  approval: { label: "Approval", icon: ShieldCheck, tone: "text-violet-300" },
  clarify: { label: "Clarification", icon: HelpCircle, tone: "text-cyan-300" },
  subagent: { label: "Subagent", icon: Cpu, tone: "text-fuchsia-300" },
  spawned: { label: "Started", icon: CircleDot, tone: "text-blue-300" },
  completed: { label: "Completed", icon: Check, tone: "text-emerald-300" },
  error: { label: "Error", icon: AlertCircle, tone: "text-red-300" },
  cancelled: { label: "Cancelled", icon: X, tone: "text-red-300" },
}

function EventBody({ kind, payload }: { kind: string; payload: EventPayload }) {
  const value = text(payload, kind === "reasoning" ? "text" : "preview", "description", "question", "output", "value")
  if (kind === "tool") return <div className="space-y-1.5"><div className="font-mono text-xs text-[var(--color-ink-2)]">{text(payload, "name") || "Tool call"}</div>{value && <p className="whitespace-pre-wrap break-words text-xs text-[var(--color-ink-3)]">{value}</p>}</div>
  if (kind === "approval") return <div className="space-y-1.5"><p className="text-xs text-[var(--color-ink-2)]">{text(payload, "description") || "Agent requests approval."}</p>{text(payload, "command") && <pre className="overflow-x-auto rounded-md bg-black/20 p-2 font-mono text-[11px] text-[var(--color-ink-3)]">{text(payload, "command")}</pre>}</div>
  if (kind === "subagent") return <p className="text-xs text-[var(--color-ink-2)]">{text(payload, "name") || "Subagent"}{text(payload, "status") && <span className="text-[var(--color-ink-3)]"> · {text(payload, "status")}</span>}</p>
  return <p className="whitespace-pre-wrap break-words text-xs text-[var(--color-ink-2)]">{value || JSON.stringify(payload)}</p>
}

export function EventCard({ event }: EventCardProps) {
  const [open, setOpen] = useState(event.kind !== "reasoning")
  const meta = eventMeta[event.kind] ?? { label: event.kind || "Event", icon: Hammer, tone: "text-[var(--color-ink-2)]" }
  const Icon = meta.icon
  const payload = parsePayload(event.payload)
  const expandable = event.kind === "reasoning" || event.kind === "tool" || event.kind === "approval" || event.kind === "clarify" || event.kind === "subagent"
  return <div className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/60 ${event.kind === "reasoning" ? "border-amber-300/20" : ""}`}>
    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => expandable && setOpen((value) => !value)} aria-expanded={expandable ? open : undefined}>
      <Icon className={`size-3.5 shrink-0 ${meta.tone}`} />
      <Badge variant="outline" className="h-5 border-[var(--color-line)] px-1.5 text-[10px]">{meta.label}</Badge>
      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-ink-3)]">{text(payload, "name", "question", "description")}</span>
      <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-4)]">{new Date(event.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      {expandable && <ChevronDown className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
    </button>
    {open && <div className="border-t border-[var(--color-line)] px-3 py-2"><EventBody kind={event.kind} payload={payload} /></div>}
  </div>
}

export function EventCards({ events }: { events: ChatRunEvent[] }) {
  if (!events.length) return null
  return <div className="mt-3 space-y-1.5">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
}
