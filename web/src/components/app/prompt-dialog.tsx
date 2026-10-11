import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

/**
 * A dialog that collects one line of text.
 *
 * `ConfirmDialog` is for destructive actions — it hardcodes a `destructive`
 * confirm button and takes no input — so naming a project or a room needed its
 * own surface rather than a borrowed one.
 *
 * It is a centred popup, not a sheet. Renaming is a decision about the thing
 * you are already looking at: it is not somewhere you navigate, and a sheet
 * implies a place with its own state to come back from. The popup also keeps
 * the field and the Save button in one eyeline, which a right-hand sheet at
 * 480px does not.
 *
 * Enter submits because the field is inside a real `<form>` — no key handler,
 * so it also gets the browser's own validation and autofill semantics.
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  value,
  onChange,
  onConfirm,
  confirmLabel,
  busy,
  error,
  maxLength,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Accessible name for the field — it has no visible label. */
  label: string
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  confirmLabel: string
  busy?: boolean
  error?: string
  maxLength?: number
}) {
  // Whitespace is not a name. Disabling rather than erroring keeps the failure
  // visible before the user commits to it.
  const canSave = value.trim().length > 0 && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSave) onConfirm()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={maxLength}
              aria-label={label}
              aria-invalid={error ? true : undefined}
            />
            {error && (
              <p className="mt-2 text-sm text-danger-text" role="alert">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="signal" loading={busy} disabled={!canSave}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
