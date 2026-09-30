import type { ComponentType, ReactNode, SVGProps } from "react"
import {
  Activity, Boxes, Brain, Clock, FolderGit2, KanbanSquare, MessageSquare,
  Plus, Puzzle, Route, ScrollText, ServerCog, UserCog,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Icon = ComponentType<SVGProps<SVGSVGElement>>
export interface NavItem { id: string; label: string; href: string; icon: Icon }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Work", items: [
    { id: "board", label: "Board", href: "/kanban", icon: KanbanSquare },
    { id: "chat", label: "Chat", href: "/chat", icon: MessageSquare },
    { id: "flow", label: "Flow map", href: "/flow", icon: Route },
  ] },
  { label: "Agents", items: [
    { id: "profiles", label: "Profiles", href: "/profiles", icon: UserCog },
    { id: "skills", label: "Skills", href: "/skills", icon: Puzzle },
    { id: "providers", label: "Providers", href: "/providers", icon: ServerCog },
    { id: "memory", label: "Memory", href: "/memory", icon: Brain },
  ] },
  { label: "Infrastructure", items: [
    { id: "workspaces", label: "Workspaces", href: "/workspaces", icon: FolderGit2 },
    { id: "cron", label: "Cron jobs", href: "/cron", icon: Clock },
    { id: "ecosystem", label: "Ecosystem", href: "/ecosystem", icon: Boxes },
  ] },
  { label: "Observe", items: [
    { id: "overview", label: "Overview", href: "/overview", icon: Activity },
    { id: "logs", label: "Logs", href: "/logs", icon: ScrollText },
  ] },
]

/**
 * Icon rail (56px) that expands to 232px when `expanded`. Content never sits
 * under it: the shell reserves the collapsed width and the rail overlays only
 * while hover-expanded.
 */
export function AppRail({
  activeId, expanded, onNewChat, onNavigate, footer, className,
}: {
  activeId: string
  expanded: boolean
  onNewChat: () => void
  onNavigate: (href: string) => void
  footer?: ReactNode
  className?: string
}) {
  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded || undefined}
      className={cn(
        "group/rail flex h-full flex-col gap-4 border-r border-line bg-surface p-2",
        "w-14 transition-[width] duration-150 ease-out data-[expanded]:w-58 hover:w-58",
        className,
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
            {group.items.map(({ id, label, href, icon: Icon }) => {
              const active = id === activeId
              return (
                <a
                  key={id}
                  href={href}
                  title={label}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => { e.preventDefault(); onNavigate(href) }}
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
                </a>
              )
            })}
          </div>
        ))}
      </div>
      {footer}
    </nav>
  )
}

