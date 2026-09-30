import { Command, PanelRightOpen } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ThemeSwitch } from "@/components/app/theme-switch"
import type { ReactNode } from "react"

/**
 * Two-row header.
 *
 * Row 1 is the instrument bar: global search on the left, and the controls you
 * might want at any moment on the right — theme, notifications, command palette.
 * These are per-app concerns, not per-page, which is exactly why they do not
 * belong in the sidebar any more.
 *
 * Row 2 is the page's own identity: title, description and whatever filters the
 * page carries. `PageHeader` renders it, and collapses title + description onto
 * one line when the viewport cannot afford two.
 *
 * The bar stays mounted at row 1 even with no breadcrumb, because the search
 * field and the sidebar toggle both live there now and it must not jump.
 *
 * Search is deliberately un-animated. It is focused by Cmd/Ctrl+K dozens of times
 * a day, and per the motion rules a keyboard-initiated action gets no entrance.
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
  const searchRef = React.useRef<HTMLInputElement>(null)
  const showBreadcrumb = (segments?.length ?? 0) > 0

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header className="shrink-0 border-b border-line">
      {/* ── row 1: global controls ── */}
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

        <InputGroup className="w-full max-w-[420px] shrink">
          <InputGroupInput
            ref={searchRef}
            type="search"
            placeholder="Search anything"
            aria-label="Search pages"
            className="h-8 text-xs"
          />
          <InputGroupAddon
            aria-hidden
            className="transition-opacity group-focus-within/input:opacity-0"
          >
            <span className="flex size-4 items-center justify-center rounded p-0.5 text-xs leading-none font-medium text-ink-2">
              K
            </span>
          </InputGroupAddon>
        </InputGroup>

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

      {/* ── breadcrumb, only where a page is genuinely nested ── */}
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