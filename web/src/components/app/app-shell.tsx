import { useCallback, useEffect, useState, type ReactNode } from "react"
import { AppSidebar } from "@/components/app/app-sidebar"
import { cn } from "@/lib/utils"
import type { Page } from "@/lib/sidebar-preferences"

const COLLAPSED_KEY = "kb-sidebar-collapsed"

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === "1" } catch { return false }
}

export function AppShell({
  page,
  onSelectPage,
  onNewChat,
  onSettings,
  onLogout,
  renderHeader,
  children,
}: {
  page: Page
  onSelectPage: (p: Page) => void
  onNewChat: () => void
  onSettings: () => void
  onLogout?: () => void
  /** The header needs the sidebar state, and must be able to reopen it. */
  renderHeader: (state: { hidden: boolean; expand: () => void }) => ReactNode
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const collapse = useCallback(() => {
    setCollapsed(true)
    try { localStorage.setItem(COLLAPSED_KEY, "1") } catch {}
  }, [])

  const expand = useCallback(() => {
    setCollapsed(false)
    try { localStorage.setItem(COLLAPSED_KEY, "0") } catch {}
  }, [])

  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === COLLAPSED_KEY) setCollapsed(readCollapsed()) }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  const sidebarHidden = collapsed

  return (
    <div className="flex min-h-dvh w-full bg-canvas">
      {/* Desktop sidebar. Collapses to zero width, as the reference does: the
          content does not shift, it takes the space back. */}
      <div
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-hidden transition-[width] duration-300 ease-[var(--ease-out-expo)] lg:block",
          collapsed ? "w-0" : "w-[250px]",
        )}
        inert={collapsed || undefined}
      >
        <AppSidebar
          activeId={page}
          onCollapse={collapse}
          onNewChat={onNewChat}
          onNavigate={(id) => onSelectPage(id as Page)}
          onSettings={onSettings}
          onLogout={onLogout}
        />
      </div>

      {/* Content sits on its own white surface with an inset hairline, which is
          what separates it from the canvas in the reference. */}
      <main className="flex min-w-0 flex-1 flex-col bg-surface shadow-[inset_0_0_0_0.8px_var(--c-line)] lg:min-h-dvh">
        {renderHeader({ hidden: sidebarHidden, expand })}
        {children}
      </main>
    </div>
  )
}
