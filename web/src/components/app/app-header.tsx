import { Command } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReactNode } from "react"

export function AppHeader({
  title,
  context,
  right,
  onOpenPalette,
}: {
  /** Current page title, shown as plain text. Pages own their own h1. */
  title: string
  /** Page-scoped context rendered next to the title (e.g. the board switcher). */
  context?: ReactNode
  right?: ReactNode
  onOpenPalette?: () => void
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate text-sm text-ink-2">{title}</span>
        {context && <div className="flex min-w-0 shrink-0 items-center gap-2">{context}</div>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onOpenPalette && (
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onOpenPalette}
                aria-label="Open command palette"
                className="text-ink-3"
              >
                <Command className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1.5 px-2 py-1">
              Command palette
              <Kbd className="h-4">⌘K</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
        {right}
      </div>
    </header>
  )
}
