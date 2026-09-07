import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Kanban, Settings } from "lucide-react"
import { SidebarFooter } from "@/components/ui/sidebar"
import { useSidebarPreferences, type Page } from "@/lib/sidebar-preferences"

export type { Page } from "@/lib/sidebar-preferences"

const WORKSPACE = new Set<Page>(["overview", "board", "flow", "agent-mapping"])
const OPERATIONS = new Set<Page>(["logs", "workspaces", "profiles", "providers", "skills", "memory"])

export function AppSidebar({
  page,
  onSelectPage,
}: {
  page: Page
  onSelectPage: (p: Page) => void
}) {
  const { visibleItems } = useSidebarPreferences()
  const workspaceItems = visibleItems.filter((item) => WORKSPACE.has(item.id))
  const operationsItems = visibleItems.filter((item) => OPERATIONS.has(item.id))

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Kanban"
              aria-label="Go to Kanban Board"
              data-cuelume-hover="tick"
              data-cuelume-press
              data-cuelume-release
              onClick={() => onSelectPage("board")}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-[#10e0dd] text-black shadow-[0_0_20px_rgba(16,224,221,0.18)]">
                <Kanban className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Kanban</span>
                <span className="truncate text-xs text-muted-foreground">Board</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map(({ id, label, tooltip, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={page === id}
                    onClick={() => onSelectPage(id)}
                    tooltip={tooltip}
                    aria-label={tooltip}
                    data-cuelume-hover="tick"
                    data-cuelume-press
                    data-cuelume-release
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationsItems.map(({ id, label, tooltip, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={page === id}
                    onClick={() => onSelectPage(id)}
                    tooltip={tooltip}
                    aria-label={tooltip}
                    data-cuelume-hover="tick"
                    data-cuelume-press
                    data-cuelume-release
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === "settings"}
                  onClick={() => onSelectPage("settings")}
                  tooltip="Settings"
                  aria-label="Settings"
                  data-cuelume-hover="tick"
                  data-cuelume-press
                  data-cuelume-release
                >
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
