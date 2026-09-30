import type { ComponentType, SVGProps } from "react"
import {
  Activity, Boxes, Brain, Clock, FolderGit2, KanbanSquare, LogOut, MessageSquare,
  Network, Plus, Route, ScrollText, ServerCog, Settings, UserCog,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
 * Hrefs are omitted on purpose: the app has no router. Navigation goes through
 * `onNavigate(id)`, which App maps to its own state plus `history.pushState`.
 * Path strings here would be a second source of truth that can drift from
 * `pagePath()` in lib/routes.ts.
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
 * Icon rail (56px) that expands to 232px when `expanded`. Content never sits
 * under it: the shell reserves the collapsed width and the rail only overlays
 * while hover-expanded.
 */
export function AppRail({
  activeId,
  expanded,
  onNewChat,
  onNavigate,
  onSettings,
  onLogout,
}: {
  activeId: string
  expanded: boolean
  onNewChat: () => void
  onNavigate: (id: string) => void
  onSettings: () => void
  onLogout?: () => void
}) {
  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded || undefined}
      className={cn(
        "group/rail flex h-full shrink-0 flex-col gap-4 border-r border-line bg-surface p-2",
        "w-14 transition-[width] duration-150 ease-[var(--ease-out-quint)]",
        "data-[expanded]:w-58 hover:w-58",
      )}
    >
      <Button variant="secondary" size="sm" onClick={onNewChat} className="justify-start" aria-label="New chat">
        <Plus />
        <span className="hidden group-hover/rail:inline group-data-[expanded]/rail:inline">New chat</span>
      </Button>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="hidden px-2 pb-1 text-xs text-ink-3 group-hover/rail:block group-data-[expanded]/rail:block">
              {group.label}
            </p>
            {group.items.map(({ id, label, icon: Icon }) => {
              const active = id === activeId
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(id)}
                  className={cn(
                    "relative flex h-8 items-center gap-2.5 rounded-control px-2 text-sm outline-none",
                    "transition-colors duration-100",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                    active ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
                  )}
                >
                  {active && <span aria-hidden className="absolute top-2 bottom-2 -left-2 w-0.5 rounded-full bg-lantern" />}
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="hidden truncate group-hover/rail:inline group-data-[expanded]/rail:inline">{label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-line pt-2">
        <RailButton
          icon={Settings}
          label="Settings"
          active={activeId === "settings"}
          onClick={onSettings}
        />
        {onLogout && <RailButton icon={LogOut} label="Sign out" onClick={onLogout} />}
      </div>
    </nav>
  )
}

function RailButton({
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
        "relative flex h-8 items-center gap-2.5 rounded-control px-2 text-sm outline-none",
        "transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        active ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
      )}
    >
      {active && <span aria-hidden className="absolute top-2 bottom-2 -left-2 w-0.5 rounded-full bg-lantern" />}
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="hidden truncate group-hover/rail:inline group-data-[expanded]/rail:inline">{label}</span>
    </button>
  )
}
