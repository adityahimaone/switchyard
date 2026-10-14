import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

/**
 * Every consequential action goes through this. The confirm button repeats the
 * verb from the title, so the user reads the same word twice rather than having
 * to map "OK" onto an action.
 *
 * `variant` defaults to `destructive` because most confirmations guard a
 * deletion. A confirm that only interrupts (a reboot) passes
 * `variant="signal"` so the button does not read as a delete.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  variant = "destructive",
  icon,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  variant?: "destructive" | "signal"
  /** Sits before the title, so the dialog says what kind of action it is. */
  icon?: ReactNode
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
