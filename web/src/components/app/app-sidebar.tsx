import { useState, type ComponentType, type SVGProps } from "react"
import {
  Activity, Boxes, Brain, ChevronsLeft, Clock, FolderGit2, KanbanSquare, LogOut,
  MessageSquare, Network, Plus, Route, ScrollText, Search, ServerCog, Settings, UserCog,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { LogoIcon, Logo } from "@/components/app/logo"
import { cn } from "@/lib/utils"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export interface NavItem {
  /** Matches `Page` in lib/routes.ts, so navigation and routing share one source. */
  id: string
  label: string
  icon: Icon
}

export interface NavGroup { label: string; items: NavItem[] }

/**
 * The single nav manifest. Hrefs are omitted on purpose: the app has no router,
 * so navigation goes through onNavigate(id) and `pagePath()` owns URLs. Path
 * strings here would be a second source of truth that can drift.
 */
export const NAV: NavGroup[] = [
  { label: "Work", items: [
    { id: "board", label: "Board", icon: KanbanSquare },
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "agent-mapping", label: "Flow map", icon: Route },
  ] },
  { label: "Agents", items: [
    { id: "profiles", label: "Profiles", icon: UserCog },
    { id: "skills", label: "Skills", icon: Network },
    { id: "providers", label: "Providers", icon: ServerCog },
    { id: "memory", label: "Memory", icon: Brain },
  ] },
  { label: "Infrastructure", items: [
    { id: "workspaces", label: "Workspaces", icon: FolderGit2 },
    { id: "cron", label: "Cron jobs", icon: Clock },
    { id: "ecosystem", label: "Ecosystem", icon: Boxes },
  ] },
  { label: "Observe", items: [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "logs", label: "Logs", icon: ScrollText },
  ] },
]

/**
 * 250px sidebar, collapsing to 56px. Geometry follows the reference exactly:
 * 52px header, 32px items separated by 1px hairlines rather than gaps, a 12px
 * inset, and a white active row with a 1px border instead of a tint.
 */
export function AppSidebar({
  activeId,
  collapsed,
  onToggleCollapse,
  onNewChat,
  onNavigate,
  onSettings,
  onLogout,
}: {
  activeId: string
  collapsed: boolean
  onToggleCollapse: () => void
  onNewChat: () => void
  onNavigate: (id: string) => void
  onSettings: () => void
  onLogout?: () => void
}) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => needle === "" || i.label.toLowerCase().includes(needle)),
  })).filter((g) => g.items.length > 0)

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col border-r border-line bg-canvas",
        "w-62 transition-[width] duration-150 ease-[var(--ease-out-expo)]",
        "data-[collapsed]:w-14",
      )}
    >
      {/* Header: logo lockup plus a 24px collapse toggle, 52px tall with a hairline. */}
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-line px-3">
        {collapsed ? (
          <LogoIcon className="size-6 shrink-0 text-ink" aria-label="Switchyard" />
        ) : (
          <Logo className="h-[18px] w-auto min-w-0 flex-1 text-ink" aria-label="Switchyard" />
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleCollapse}
          className="ml-auto shrink-0 text-ink-3 hover:text-ink"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
        >
          <ChevronsLeft className={cn("transition-transform duration-150", collapsed && "rotate-180")} />
        </Button>
      </div>

      {/* Search: a white 32px field with a 1px border, matching the nav rows. */}
      <div className="px-3 pt-4 pb-2 group-data-[collapsed]/sidebar:px-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search pages"
            className="h-8 rounded-card border-line bg-raised pr-9 pl-8 group-data-[collapsed]/sidebar:hidden"
          />
          <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-[4px] border border-line bg-surface text-2xs text-ink-2 group-data-[collapsed]/sidebar:hidden">
            K
          </Kbd>
        </div>
      </div>

      {/* Groups: uppercase 12px labels, then a hairline-separated list of rows. */}
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 group-data-[collapsed]/sidebar:px-2">
        {groups.length === 0 && (
          <p className="py-3 text-xs text-ink-3 group-data-[collapsed]/sidebar:hidden">
            No pages match &ldquo;{query}&rdquo;
          </p>
        )}
        {groups.map((group, gi) => (
          <section key={group.label} className={cn(gi > 0 && "mt-5")}>
            <h2 className="px-2.5 pb-2 text-xs text-ink-3 uppercase group-data-[collapsed]/sidebar:sr-only">
              {group.label}
            </h2>
            <ul className="flex flex-col">
              {group.items.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <NavButton
                    icon={Icon}
                    label={label}
                    active={id === activeId}
                    onClick={() => onNavigate(id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      {/* Footer: a hairline-separated New chat, Settings and Sign out. */}
      <div className="shrink-0 border-t border-line p-3 pt-2 group-data-[collapsed]/sidebar:px-2">
        <NavButton icon={Plus} label="New chat" onClick={onNewChat} />
        <NavButton icon={Settings} label="Settings" active={activeId === "settings"} onClick={onSettings} />
        {onLogout && <NavButton icon={LogOut} label="Sign out" onClick={onLogout} />}
      </div>
    </aside>
  )
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: Icon
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        // 32px rows divided by 1px hairlines, not gaps. Active is a white row
        // with a 1px border, so it lifts off the canvas instead of tinting.
        "flex h-8 w-full items-center gap-2.5 border-b border-line px-2.5 text-sm outline-none",
        "transition-[background-color,color,box-shadow] duration-100",
        "hover:bg-raised focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
        "group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0",
        active
          ? "rounded-card border border-line bg-raised text-ink shadow-xs"
          : "text-ink-2 hover:text-ink",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />
      <span className="truncate group-data-[collapsed]/sidebar:hidden">{label}</span>
    </button>
  )
}
