import { Command, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function AppHeader({
  /** Breadcrumb segments, e.g. ["Board", "Local"]. Joined with a slash. */
  segments,
  right,
  onOpenPalette,
}: {
  segments: string[]
  right?: ReactNode
  onOpenPalette?: () => void
}) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line bg-canvas px-4 md:px-6">
      <LayoutGrid className="size-4 shrink-0 text-ink-3" aria-hidden />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {segments.map((segment, i) => {
          const last = i === segments.length - 1
          return (
            <span key={segment} className={cn("flex min-w-0 items-center gap-2", !last && "text-ink-3")}>
              {i > 0 && <span aria-hidden className="text-ink-4">/</span>}
              <span className={cn("truncate", last ? "font-medium text-ink" : "text-ink-3")}>
                {segment}
              </span>
            </span>
          )
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
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
