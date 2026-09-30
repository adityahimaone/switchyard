import * as React from "react"
import {
  Activity, Boxes, Brain, ChevronUp, Clock, FolderGit2, KanbanSquare, LogOut, PanelRight,
  MessageSquare, Network, Plus, Route, ScrollText, Search, ServerCog, Settings, UserCog,
} from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LogoIcon, Logo } from "@/components/app/logo"
import { cn } from "@/lib/utils"

export interface NavLeaf {
  /** Matches `Page` in lib/routes.ts, so navigation and routing share one source. */
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Optional second level. Rendered with a tree connector, as the reference does. */
  children?: { id: string; label: string }[]
}

export interface NavGroup { label: string; items: NavLeaf[] }

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

/** Section label. The reference styles these 12px uppercase in muted foreground. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-[1.6] whitespace-nowrap text-ink-3 uppercase">{children}</p>
}

/** Active pill: white card, 0.8px hairline, the reference's soft lift. */
const activePill =
  "rounded-lg border-[0.8px] border-line bg-surface text-ink shadow-active"
const idleItem =
  "border-[0.8px] border-transparent hover:bg-raised hover:text-ink"

/**
 * 250px sidebar, ported from the reference's source. Rows are 32px with a 2px
 * gap (not hairlines), text is 13px, focus is a 3px ring, and sub-items expand
 * with a grid-rows transition behind a tree connector.
 */
export function AppSidebar({
  activeId,
  onCollapse,
  onNewChat,
  onNavigate,
  onSettings,
  onLogout,
}: {
  activeId: string
  onCollapse: () => void
  onNewChat: () => void
  onNavigate: (id: string) => void
  onSettings: () => void
  onLogout?: () => void
}) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const searchRef = React.useRef<HTMLInputElement>(null)

  // The reference focuses sidebar search on Cmd/Ctrl+K.
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
    <aside className="flex h-full w-[250px] shrink-0 flex-col" aria-label="Primary">
      {/* Brand */}
      <div className="flex w-[250px] items-center justify-between overflow-clip px-3 py-3.5">
        <div className="flex w-[200px] items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40">
          <span className="relative size-6 shrink-0 transition-transform duration-300 ease-[var(--ease-out-expo)] hover:rotate-[-8deg] hover:scale-105">
            <LogoIcon className="size-6 text-ink" />
          </span>
          <Logo className="flex-1 text-lg leading-none font-semibold text-ink" aria-label="Switchyard" />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              className="-m-1 rounded-md p-1 text-ink-3 outline-none transition-colors hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40"
            >
              <PanelRight className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Collapse sidebar</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-h-0 w-[250px] flex-1 flex-col gap-4 px-3 pb-4">
        <div aria-hidden className="h-px w-full shrink-0 bg-line" />

        {/* Search */}
        <InputGroup className="w-full shrink-0">
          <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
          <InputGroupInput
            ref={searchRef}
            type="search"
            placeholder="Search anything"
            aria-label="Search pages"
          />
          <InputGroupAddon aria-hidden className="transition-opacity group-focus-within/input:opacity-0">
            <span className="flex size-4 items-center justify-center rounded p-0.5 text-xs leading-none font-medium text-ink-2">
              K
            </span>
          </InputGroupAddon>
        </InputGroup>

        {/* Navigation: groups scroll, the account card pins to the bottom. */}
        <nav className="flex min-h-0 w-[226px] flex-1 flex-col items-center justify-between gap-5 overflow-y-auto overflow-x-hidden [scrollbar-width:none]">
          <div className="flex w-full flex-col gap-5">
            {NAV.map((group) => (
              <div key={group.label} className="flex w-full flex-col gap-3">
                <SectionLabel>{group.label}</SectionLabel>
                <div className="flex w-full flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={item.id === activeId}
                      onSelect={onNavigate}
                      open={!!open[item.id]}
                      onToggle={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer: the reference pins an account card here. Switchyard has a single
            shared password and no user record, so the actions take its place
            rather than inventing an identity. */}
        <div className="flex w-[226px] shrink-0 flex-col gap-0.5">
          <SidebarAction icon={Plus} label="New chat" onClick={onNewChat} />
          <SidebarAction icon={Settings} label="Settings" onClick={onSettings} />
          {onLogout && <SidebarAction icon={LogOut} label="Sign out" onClick={onLogout} />}
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  item,
  active,
  onSelect,
  open,
  onToggle,
}: {
  item: NavLeaf
  active: boolean
  onSelect: (id: string) => void
  open: boolean
  onToggle: () => void
}) {
  const hasChildren = !!item.children?.length
  const Icon = item.icon
  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        onClick={() => (hasChildren ? onToggle() : onSelect(item.id))}
        aria-expanded={hasChildren ? open : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/nav flex w-full items-center justify-between rounded-lg text-left text-[13px] leading-none outline-none",
          "transition-[background-color,box-shadow,border-color,color] duration-150 ease-out",
          "focus-visible:ring-[3px] focus-visible:ring-focus/40",
          "h-8 px-2.5",
          active ? activePill : cn(idleItem, "text-ink-2"),
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex transition-transform duration-200 ease-out group-hover/nav:scale-110">
            <Icon className={cn("size-4", active ? "text-accent" : "text-ink-3")} />
          </span>
          <span className="whitespace-nowrap">{item.label}</span>
        </span>
        {hasChildren && (
          <span
            className={cn(
              "flex transition-transform duration-300 ease-[var(--ease-out-expo)]",
              !open && "rotate-180",
            )}
          >
            <ChevronUp className="size-3" />
          </span>
        )}
      </button>

      {hasChildren && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[var(--ease-out-expo)]",
            open ? "mt-0.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-0.5">
              {item.children!.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onSelect(`${item.id}/${c.id}`)}
                  className="group/sub relative flex h-7 w-full items-center justify-end pl-2.5 outline-none"
                >
                  <span className="flex h-full w-[188px] items-center rounded-md px-0 text-xs leading-none text-ink-3 transition-[color,background-color,padding] duration-200 group-hover/sub:bg-raised group-hover/sub:pl-1.5 group-hover/sub:text-ink focus-visible:ring-[3px]">
                    {c.label}
                  </span>
                  {/* tree connector, drawn as the reference does */}
                  <span aria-hidden className="pointer-events-none absolute top-[-5px] left-[18px] h-5 w-2 border-l hairline border-line" />
                  <span aria-hidden className="pointer-events-none absolute top-[13px] left-[23px] size-1 rounded-full bg-line-strong" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SidebarAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/nav flex w-full items-center gap-2.5 rounded-lg border-[0.8px] border-transparent px-2.5 text-left",
        "text-[13px] leading-none text-ink-2 outline-none",
        "transition-[background-color,color] duration-150 ease-out",
        "hover:bg-raised hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40",
        "h-8",
      )}
    >
      <span className="flex transition-transform duration-200 ease-out group-hover/nav:scale-110">
        <Icon className="size-4 text-ink-3" />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
