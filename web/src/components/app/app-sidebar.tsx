import { useState, type ComponentType, type SVGProps } from "react"
import {
  Activity, Boxes, Brain, ChevronLeft, Clock, FolderGit2, KanbanSquare, LogOut,
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
 * 250px sidebar that collapses to 56px. The collapse state is owned by the shell
 * so it can persist across navigation. Content shifts with the sidebar, so it is
 * never underneath it.
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

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      query.trim() === "" || i.label.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  })).filter((g) => g.items.length > 0)

  return (
    <nav
      aria-label="Primary"
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col border-r border-line bg-surface",
        "w-62 transition-[width] duration-150 ease-[var(--ease-out-expo)]",
        "data-[collapsed]:w-14",
      )}
    >
      {/* Logo header. `Logo` is the full lockup (mark + wordmark, viewBox 0 0 114 24)
          and `LogoIcon` is the mark alone. Both are currentColor, so they follow
          the theme. Collapsed shows only the mark, so they must be alternatives
          rather than siblings. */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        {/* `hidden` is an unconditional utility and cannot be overridden by a
            variant, so the two logos swap on the prop rather than on a variant. */}
        {collapsed ? (
          <LogoIcon className="size-6 shrink-0 text-ink" aria-label="Switchyard" />
        ) : (
          <Logo className="h-4 w-auto min-w-0 flex-1 text-ink" aria-label="Switchyard" />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapse}
          className="ml-auto shrink-0"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
        >
          <ChevronLeft className={cn("transition-transform duration-150", collapsed && "rotate-180")} />
        </Button>
      </div>

      <div className="px-3 pb-2">
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
            className="pr-9 pl-8 group-data-[collapsed]/sidebar:hidden"
          />
          <Kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-2xs text-ink-3 group-data-[collapsed]/sidebar:hidden">
            K
          </Kbd>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1">
        {groups.length === 0 && (
          <p className="px-2 py-4 text-xs text-ink-3 group-data-[collapsed]/sidebar:hidden">
            No pages match &ldquo;{query}&rdquo;
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-2 text-[10px] leading-4 font-medium tracking-wide text-ink-3 uppercase group-data-[collapsed]/sidebar:hidden">
              {group.label}
            </p>
            {group.items.map(({ id, label, icon: Icon }) => (
              <NavButton
                key={id}
                icon={Icon}
                label={label}
                active={id === activeId}
                onClick={() => onNavigate(id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-line p-2">
        <NavButton icon={Plus} label="New chat" onClick={onNewChat} />
        <NavButton icon={Settings} label="Settings" active={activeId === "settings"} onClick={onSettings} />
        {onLogout && <NavButton icon={LogOut} label="Sign out" onClick={onLogout} />}
      </div>
    </nav>
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
        "flex h-[30px] items-center gap-2.5 rounded-control px-2 text-sm outline-none",
        "transition-colors duration-100",
        "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        "group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0",
        active ? "bg-accent-tint text-accent" : "text-ink-2 hover:text-ink",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3")} aria-hidden />
      <span className="truncate group-data-[collapsed]/sidebar:hidden">{label}</span>
    </button>
  )
}
