import { Command, PanelRightOpen } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

/**
 * Ported from the reference's header: a sidebar toggle on the left, a
 * breadcrumb, and icon actions on the right. The toggle only appears when the
 * sidebar is hidden, which is how the reference reopens it.
 *
 * The breadcrumb is *location*, not a title. Top-level pages already carry an
 * h1 in their own page header, so showing the name twice is noise; segments
 * are only passed when a page is genuinely nested one level below its nav
 * entry (task detail). The bar itself stays, so the toggle has a home when the
 * sidebar is collapsed.
 */
export function AppHeader({
  segments,
  sidebarHidden,
  onExpandSidebar,
  right,
  onOpenPalette,
}: {
  /** Breadcrumb segments, e.g. ["Board", "Fix flaky test"]. Omit on top-level pages. */
  segments?: string[]
  sidebarHidden: boolean
  onExpandSidebar: () => void
  right?: ReactNode
  onOpenPalette?: () => void
}) {
  const showBreadcrumb = (segments?.length ?? 0) > 0
  return (
    <header
      className={cn(
        "flex w-full items-center gap-2 px-3 py-3.5",
        showBreadcrumb || sidebarHidden ? "h-[52px] shrink-0" : "hidden",
      )}
    >
      {sidebarHidden && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onExpandSidebar}
              aria-label="Open sidebar"
              className="-my-1 -ml-1 rounded-md p-1 text-ink-3 outline-none transition-colors hover:bg-raised hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
            >
              <PanelRightOpen className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Open sidebar</TooltipContent>
        </Tooltip>
      )}

      {showBreadcrumb && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-4">
          {segments!.map((segment, i) => {
            const last = i === segments!.length - 1
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
      )}

      <div className="ml-auto flex items-center gap-3">
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
