import { useState, type ReactNode } from "react"
import { AppRail } from "@/components/app/app-rail"
import type { Page } from "@/lib/sidebar-preferences"

export function AppShell({
  page,
  onSelectPage,
  onNewChat,
  onSettings,
  onLogout,
  header,
  children,
}: {
  page: Page;
  onSelectPage: (p: Page) => void;
  onNewChat: () => void;
  onSettings: () => void;
  onLogout?: () => void;
  header: ReactNode;
  children: ReactNode;
}) {
  const [pinned, setPinned] = useState(false)
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      <AppRail
        activeId={page}
        expanded={pinned}
        onNewChat={onNewChat}
        onNavigate={(id) => onSelectPage(id as Page)}
        onSettings={onSettings}
        onLogout={onLogout}
      />
      {/* The pin toggle lives in the gutter so content never sits under the rail. */}
      <button
        type="button"
        aria-label={pinned ? "Collapse navigation" : "Expand navigation"}
        aria-pressed={pinned}
        onClick={() => setPinned((v) => !v)}
        className="w-2 shrink-0 cursor-pointer border-r border-line bg-surface transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus"
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
