import { useCallback, useEffect, useState, type ReactNode } from "react"
import { AppSidebar } from "@/components/app/app-sidebar"
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
  header,
  children,
}: {
  page: Page
  onSelectPage: (p: Page) => void
  onNewChat: () => void
  onSettings: () => void
  onLogout?: () => void
  header: ReactNode
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      try { localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0") } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === COLLAPSED_KEY) setCollapsed(readCollapsed()) }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <AppSidebar
        activeId={page}
        collapsed={collapsed}
        onToggleCollapse={toggle}
        onNewChat={onNewChat}
        onNavigate={(id) => onSelectPage(id as Page)}
        onSettings={onSettings}
        onLogout={onLogout}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
