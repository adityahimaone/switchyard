import { useRef, type ReactNode } from "react"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusLamp } from "@/components/ui/status-lamp"

/**
 * One surface, 1px line-strong, radius-panel. No border beam and no glow: the
 * composer is a control, not a feature. Send is the page's only accent
 * element, and it becomes a destructive Stop while a run is active.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  phase,
  elapsed,
  placeholder,
  controls,
  attachments,
  autocomplete,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  phase?: string
  elapsed?: string
  placeholder: string
  /** Attach button plus the profile, workspace and model dropdowns. */
  controls: ReactNode
  attachments?: ReactNode
  /** Slash-command and skill suggestions, rendered above the box. */
  autocomplete?: ReactNode
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !disabled && !running

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      {running && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-3" role="status">
          <StatusLamp status="running" label={phase ?? "Working"} size="sm" />
          {elapsed && <span className="tabular">{elapsed}</span>}
        </div>
      )}

      <div className="relative">
        {autocomplete && (
          <div
            className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full overflow-y-auto rounded-card border border-line bg-raised p-1 shadow-float"
            role="listbox"
          >
            {autocomplete}
          </div>
        )}

        <div className="rounded-panel border border-line-strong bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          {attachments && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{attachments}</div>}

          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (canSend) onSend()
              }
            }}
            className="max-h-52 min-h-11 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:outline-0"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">{controls}</div>
            {running ? (
              <Button variant="destructive" size="sm" onClick={onStop}>
                <Square className="size-3 fill-current" /> Stop
              </Button>
            ) : (
              <Button variant="signal" size="sm" onClick={onSend} disabled={!canSend}>
                Send <ArrowUp className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-1.5 flex items-center justify-between px-1 text-xs text-ink-3">
        <span>Enter to send, Shift+Enter for a new line</span>
        {value.length > 500 && <span className="tabular">{value.length} characters</span>}
      </p>
    </div>
  )
}
