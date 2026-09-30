import type { ReactNode } from "react"
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"

/**
 * The only surface for viewing or editing one entry. Replaces system-modal and
 * the hand-built overlays in Cron and Workspaces, so the app has one dialog
 * system: Dialog for confirmations, Sheet for entries.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-line p-4">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
