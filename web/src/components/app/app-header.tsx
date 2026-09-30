import { Command, PanelRightOpen } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ThemeSwitch } from "@/components/app/theme-switch"
import type { ReactNode } from "react"

/**
 * Header row 1: the controls you might want at any moment, on any page — theme,
 * notifications, command palette. These are per-app concerns, not per-page,
 * which is why they do not belong in the sidebar.
 *
 * There was a global search field here, and in the sidebar before that. It is
 * gone and nothing was lost: it never filtered anything, it only took focus on
 * Cmd/Ctrl+K and showed a placeholder. The command palette beside it is the
 * thing that actually finds things, and that one works.
 *
 * Nothing animates on ⌘K, deliberately. It is a keyboard-initiated action used
 * dozens of times a day, and per the motion rules that gets no entrance.
 *
 * Row 2 is the page's own identity, rendered by `PageHeader`.
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
    <header className="shrink-0 border-b border-line">
      <div className="flex h-[52px] items-center gap-3 px-4 md:px-6">
        {sidebarHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExpandSidebar}
                aria-label="Open sidebar"
                className="-ml-1 shrink-0 rounded-control p-1 text-ink-3 outline-none transition-colors hover:bg-raised hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
              >
                <PanelRightOpen className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Open sidebar</TooltipContent>
          </Tooltip>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ThemeSwitch />
          {right}
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
        </div>
      </div>

      {/* Breadcrumb, only where a page is genuinely nested below its nav entry. */}
      {showBreadcrumb && (
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 border-t border-line px-4 py-1.5 md:px-6"
        >
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
    </header>
  )
}