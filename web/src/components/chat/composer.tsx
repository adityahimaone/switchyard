import { useRef, type ReactNode } from "react"
import { PromptInput, type PromptAction } from "@/components/agents/prompt-input"
import { StatusLamp } from "@/components/ui/status-lamp"

/**
 * The composer, rebuilt on the registry's `PromptInput`.
 *
 * The auto-growing textarea, the send/stop state swap and Enter-to-submit all
 * come from the component. What stays app-specific is everything around it: the
 * slash-command and skill autocomplete (which needs to sit *above* the box and
 * intercept clicks without stealing focus), the running-state status lamp, the
 * attachment tray, and the existing profile/workspace/model toolbar.
 *
 * `PromptInput` takes its own model list and its own action popover. This app
 * already has working equivalents for both — a searchable model dropdown and an
 * "Add to message" menu wired to the attachment and skill flows — so they are
 * passed in as `models` and `actions` rather than rebuilt, which keeps one
 * source of truth for what is selected.
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
  /** The existing Plus menu, rendered by PromptInput's action popover. */
  actions,
  onAction,
  /** Profile, workspace and model selects, rendered in the toolbar row. */
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
  /** Entries for the component's built-in action popover. */
  actions?: PromptAction[]
  onAction?: (action: string) => void
  /** Toolbar controls for the leading action slot. */
  controls?: ReactNode
  attachments?: ReactNode
  /** Slash-command and skill suggestions, rendered above the box. */
  autocomplete?: ReactNode
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div ref={ref} className="mx-auto w-full max-w-3xl px-4 pb-4">
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

        {attachments && <div className="mb-2 flex flex-wrap gap-1.5">{attachments}</div>}

        {/* The form carries the box's own border and radius, so the shell below
            is only there to host the app's focus treatment and the toolbar's
            overflow. */}
        <PromptInput
          value={value}
          onValueChange={onChange}
          onSubmit={() => onSend()}
          onStop={onStop}
          loading={running}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          actions={actions}
          onAction={onAction}
          leadingAction={controls}
          minRows={2}
          maxRows={8}
          /* The strongest tier, because the composer sits at the bottom of a
             scrolling transcript and is the one surface whose content behind it
             is guaranteed to be moving text. A weaker fill let the last line of
             a reply show through the field you were typing the reply to.

             No blur budget is spent on the field itself — the tier's blur is on
             the container. `focus-within` puts the accent ring on the whole box
             rather than the textarea inside it, which is what makes the field
             read as one object. */
          className="glass-strong rounded-panel focus-within:shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.12),var(--glow-ring)]"
        />
      </div>

      <p className="mt-1.5 flex items-center justify-between px-1 text-xs text-ink-3">
        <span>Enter to send, Shift+Enter for a new line</span>
        {value.length > 500 && <span className="tabular">{value.length} characters</span>}
      </p>
    </div>
  )
}