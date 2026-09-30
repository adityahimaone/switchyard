import { useState, type ReactNode } from "react"
import {
  AlertCircle, Check, ChevronRight, CircleDot, Cpu, HelpCircle, Lightbulb,
  ShieldCheck, Wrench, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EventTone = "default" | "ask" | "error"

/**
 * One row shape for every run event. Kind decides the icon and whether the row
 * needs attention; only two kinds ask for it, so the eye is not pulled around the
 * transcript by ordinary tool calls.
 */
const META: Record<string, { label: string; icon: typeof CircleDot; tone: EventTone }> = {
  tool: { label: "Tool", icon: Wrench, tone: "default" },
  reasoning: { label: "Reasoning", icon: Lightbulb, tone: "default" },
  subagent: { label: "Subagent", icon: Cpu, tone: "default" },
  spawned: { label: "Started", icon: CircleDot, tone: "default" },
  completed: { label: "Completed", icon: Check, tone: "default" },
  clarify: { label: "Question", icon: HelpCircle, tone: "ask" },
  approval: { label: "Approval needed", icon: ShieldCheck, tone: "ask" },
  error: { label: "Error", icon: AlertCircle, tone: "error" },
  cancelled: { label: "Cancelled", icon: X, tone: "error" },
}

function parse(payload: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(payload)
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }
  } catch {
    return { value: payload }
  }
}

const str = (p: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => p[k]).find((v): v is string => typeof v === "string" && v.length > 0) ?? ""

export interface RunEvent {
  id?: string
  kind: string
  payload: string
  created_at?: number
}

export function EventRow({
  event,
  onApprove,
  onDeny,
  onReply,
}: {
  event: RunEvent
  onApprove?: () => void
  onDeny?: () => void
  onReply?: (text: string) => void
}) {
  const meta = META[event.kind] ?? { label: event.kind, icon: CircleDot, tone: "default" as EventTone }
  const Icon = meta.icon
  const p = parse(event.payload)
  const detail = str(p, "preview", "output", "text", "description", "question", "value")
  const command = str(p, "command")
  const collapsible = event.kind === "reasoning" || event.kind === "tool"
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState("")

  return (
    <div
      className={cn(
        "rounded-control border-l-2 py-1.5 pr-2 pl-3 text-sm",
        meta.tone === "ask" && "border-l-accent bg-accent-tint",
        meta.tone === "error" && "border-l-danger bg-danger-tint",
        meta.tone === "default" && "border-l-line",
      )}
    >
      <button
        type="button"
        disabled={!collapsible}
        aria-expanded={collapsible ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 text-left outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-focus/40",
          !collapsible && "cursor-default",
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            meta.tone === "error" ? "text-danger-text" : "text-ink-3",
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            meta.tone === "error" ? "text-danger-text" : "text-ink-2",
          )}
        >
          {meta.label}
        </span>
        {event.kind === "tool" && (
          <span className="min-w-0 truncate font-mono text-2xs text-ink-3">
            {str(p, "name")}
          </span>
        )}
        {collapsible && (
          <ChevronRight
            aria-hidden
            className={cn(
              "ml-auto size-3.5 shrink-0 text-ink-3 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        )}
      </button>

      {(open || !collapsible) && detail && (
        <p
          className={cn(
            "mt-1.5 max-w-[72ch] break-words whitespace-pre-wrap text-sm text-ink-2",
            event.kind === "tool" &&
              "max-h-48 overflow-auto font-mono text-2xs text-ink-3",
          )}
        >
          {detail}
        </p>
      )}

      {command && (
        <pre className="mt-1.5 overflow-x-auto rounded-control bg-well px-2 py-1.5 font-mono text-2xs text-ink-2">
          {command}
        </pre>
      )}

      {event.kind === "approval" && (onApprove || onDeny) && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="signal" onClick={onApprove}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={onDeny}>Deny</Button>
        </div>
      )}

      {event.kind === "clarify" && onReply && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (reply.trim()) { onReply(reply.trim()); setReply("") }
          }}
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply…"
            aria-label="Reply to the agent"
            className="h-7 min-w-0 flex-1 rounded-control border border-line-strong bg-well px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!reply.trim()}>
            Send
          </Button>
        </form>
      )}
    </div>
  )
}

/** Collapses consecutive events into one row: "3 tool calls · 12.4s". */
export function ActivityGroup({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="max-w-[72ch]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-control text-xs text-ink-3 outline-none hover:text-ink-2 focus-visible:ring-[3px] focus-visible:ring-focus/40"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")}
        />
        {summary}
      </button>
      {open && <div className="mt-2 flex flex-col gap-1.5">{children}</div>}
    </div>
  )
}
