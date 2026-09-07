import {
  Bell,
  Kanban,
  Search,
  Settings,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useSidebarPreferences, type Page } from "@/lib/sidebar-preferences"
import ThemeToggle from "@/components/ThemeToggle"

export type { Page } from "@/lib/sidebar-preferences"

const WORKSPACE = new Set<Page>(["overview", "board", "flow", "agent-mapping"])
const OPERATIONS = new Set<Page>(["logs", "workspaces", "profiles", "providers", "skills", "memory"])

function NavItems({ page, onSelectPage, items }: { page: Page; onSelectPage: (page: Page) => void; items: ReturnType<typeof useSidebarPreferences>["visibleItems"] }) {
  return (
    <SidebarMenu>
      {items.map(({ id, label, tooltip, icon: Icon }) => (
        <SidebarMenuItem key={id}>
          <SidebarMenuButton
            isActive={page === id}
            onClick={() => onSelectPage(id)}
            tooltip={tooltip}
            aria-label={tooltip}
            className="h-9 rounded-xl text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary data-[active=true]:bg-accent-500 data-[active=true]:font-medium data-[active=true]:text-accent-foreground"
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export function AppSidebar({ page, onSelectPage }: { page: Page; onSelectPage: (p: Page) => void }) {
  const { visibleItems } = useSidebarPreferences()
  const { state } = useSidebar()
  const workspaceItems = visibleItems.filter((item) => WORKSPACE.has(item.id))
  const operationsItems = visibleItems.filter((item) => OPERATIONS.has(item.id))
  const collapsed = state === "collapsed"

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-border-default bg-sidebar">
      <SidebarHeader className="border-b border-border-default p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Kanban Board" aria-label="Go to Kanban Board" onClick={() => onSelectPage("board")} className="h-12 rounded-2xl px-2 hover:bg-background-primary-hover">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-accent-foreground shadow-card"><Kanban className="size-4" /></div>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-body-medium text-text-primary">Kanban Board</span>
                <span className="truncate text-caption-1-regular text-text-tertiary">Agent operations</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="mt-3 flex gap-2">
            <button type="button" aria-label="Search navigation" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border-default bg-background-full px-2.5 text-caption-1-regular text-text-tertiary hover:border-border-strong hover:text-text-secondary">
              <Search className="size-3.5" /> <span>Quick search</span><kbd className="ml-auto rounded bg-background-tertiary px-1.5 py-0.5 font-mono text-[9px]">⌘K</kbd>
            </button>
            <button type="button" aria-label="Notifications" className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border-default bg-background-full text-text-tertiary hover:bg-background-primary-hover hover:text-text-primary"><Bell className="size-3.5" /></button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 p-2">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="px-2 text-caption-2-semibold uppercase tracking-wider text-text-tertiary">Workspace</SidebarGroupLabel>
          <SidebarGroupContent><NavItems page={page} onSelectPage={onSelectPage} items={workspaceItems} /></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="px-2 text-caption-2-semibold uppercase tracking-wider text-text-tertiary">Operations</SidebarGroupLabel>
          <SidebarGroupContent><NavItems page={page} onSelectPage={onSelectPage} items={operationsItems} /></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-border-default p-2">
        {!collapsed && <div className="flex items-center justify-between rounded-xl bg-background-primary px-2.5 py-2"><div className="flex min-w-0 items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background-tertiary text-caption-1-semibold text-text-secondary">A</span><div className="min-w-0"><p className="truncate text-caption-1-semibold text-text-primary">Adit</p><p className="truncate text-caption-2-regular text-text-tertiary">Workspace owner</p></div></div><ThemeToggle /></div>}
        {collapsed && <ThemeToggle collapsed />}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={page === "settings"} onClick={() => onSelectPage("settings")} tooltip="Settings" aria-label="Settings" className="h-9 rounded-xl text-text-secondary hover:bg-background-primary-hover hover:text-text-primary data-[active=true]:bg-accent-500 data-[active=true]:text-accent-foreground"><Settings className="size-4" /><span>Settings</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
