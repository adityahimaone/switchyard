import { useRef, type ReactNode } from "react"
import { PromptInput, type PromptAction } from "@/components/agents/prompt-input"
import { StatusLamp } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

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
    /* Absolutely positioned rather than in flow, so it floats over the transcript
       instead of sitting below it. That is what earns it the glass: there is a
       scrolling, varying backdrop behind it, which is the one condition
       `backdrop-filter` is for. In flow it was a box at the end of a column with
       the solid surface behind it, which is precisely where a translucent panel
       has nothing to diffuse.

       The 16px inset and the `pb-40` on the transcript viewport are two halves of
       one decision — the fade under this box is sized to clear it, and the
       padding keeps the last message out from underneath. */
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-4"
    >
      <div className="pointer-events-auto relative mx-auto w-full max-w-[46rem]">
        {running && (
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-3" role="status">
            <StatusLamp status="running" label={phase ?? "Working"} size="sm" />
            {elapsed && <span className="tabular">{elapsed}</span>}
          </div>
        )}

        {attachments && <div className="mb-2 flex flex-wrap gap-1.5">{attachments}</div>}

        <div className="relative">
          {autocomplete && (
            <div
              className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full overflow-y-auto rounded-card border border-line bg-raised p-1 shadow-float"
              role="listbox"
            >
              {autocomplete}
            </div>
          )}

          {/* The frost is on this sibling layer, never on the form itself.
              `app-header.tsx` documents why: a `backdrop-filter` ancestor becomes
              the containing block for any `position: fixed` descendant, and this
              component hosts the Plus popover and the slash menu. Keeping the
              filter on an empty, childless layer removes the failure mode
              outright rather than relying on those overlays all being `absolute`.

              `rounded-panel` matches the form below exactly — a tint on a
              different curve shows as a square behind a rounded box. `z-10`, not
              `-z-10`: a negative z-index would drop this layer behind the
              transcript's own background and it would be invisible. It is
              `pointer-events-none` so it cannot intercept clicks meant for the
              textarea underneath. */}
          <div
            aria-hidden
            className="glass pointer-events-none absolute inset-0 z-10 rounded-panel"
          />

          {/* The form carries the box's own border and radius; the layer above is
              only the material. One focus treatment, not two: this used to
              combine a border change with `outline-2 outline-offset-2`, drawing a
              hard outline *around* a border that had already moved, which read as
              a double edge. */}
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
            className="relative rounded-panel border border-line-strong bg-transparent focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(from_var(--c-accent)_r_g_b_/_0.18)]"
          />
        </div>

        {/* Fades out once there is a message to send. As a permanent line below
            the box it was 28px of dead space carrying a keyboard hint nobody
            reads after their first message; it only earns its space while the
            field is still empty. The character count is unaffected — that one is
            load-bearing and stays legible. */}
        <p
          className={cn(
            "mt-1.5 px-1 text-2xs text-ink-3 transition-opacity duration-150",
            value.length > 0 ? "opacity-0" : "opacity-100",
          )}
        >
          <span>Enter to send, Shift+Enter for a new line</span>
          {value.length > 500 && <span className="tabular">{value.length} characters</span>}
        </p>
      </div>
    </div>
  )
}