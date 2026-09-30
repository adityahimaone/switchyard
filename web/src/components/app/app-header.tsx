import { Command, PanelRightOpen } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReactNode } from "react"

/**
 * Ported from the reference's header: a sidebar toggle on the left, a
 * breadcrumb, and icon actions on the right. The toggle only appears when the
 * sidebar is hidden, which is how the reference reopens it.
 */
export function AppHeader({
  segments,
  sidebarHidden,
  onExpandSidebar,
  right,
  onOpenPalette,
}: {
  /** Breadcrumb segments, e.g. ["Board", "Local"]. Joined with a slash. */
  segments: string[]
  sidebarHidden: boolean
  onExpandSidebar: () => void
  right?: ReactNode
  onOpenPalette?: () => void
}) {
  return (
    <header className="flex h-[52px] w-full items-center justify-between px-3 py-3.5">
      <div className="flex items-center gap-4">
        {sidebarHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExpandSidebar}
                aria-label="Open sidebar"
                className="-my-1 -ml-1 rounded-md p-1 text-ink-3 outline-none transition-colors hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40"
              >
                <PanelRightOpen className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
        )}

        <nav aria-label="Breadcrumb" className="flex items-center gap-4">
          {segments.map((segment, i) => {
            const last = i === segments.length - 1
            return (
              <React.Fragment key={segment}>
                {i > 0 && <span aria-hidden className="text-ink-4">/</span>}
                {last ? (
                  <span aria-current="page" className="text-sm leading-none font-medium whitespace-nowrap text-ink">
                    {segment}
                  </span>
                ) : (
                  <span className="text-sm leading-none whitespace-nowrap text-ink-3">{segment}</span>
                )}
              </React.Fragment>
            )
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {onOpenPalette && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onOpenPalette}
                aria-label="Command palette"
                className="text-ink-3"
              >
                <Command className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1.5">
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
