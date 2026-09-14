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
import { Settings } from "lucide-react"
import { SidebarFooter } from "@/components/ui/sidebar"
import { useSidebarPreferences, type Page } from "@/lib/sidebar-preferences"

export type { Page } from "@/lib/sidebar-preferences"

export function AppSidebar({
  page,
  onSelectPage,
}: {
  page: Page
  onSelectPage: (p: Page) => void
}) {
  const { visibleItems } = useSidebarPreferences()

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Switchyard" data-cuelume-hover="tick" data-cuelume-press data-cuelume-release onClick={() => onSelectPage("board")}>
              <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-slate-900 p-1">
                <img src="/brand/mascot-switchyard.png" alt="" aria-hidden="true" className="size-full object-contain" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Switchyard</span>
                <span className="truncate text-xs text-muted-foreground">Agent Control Plane</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map(({ id, label, tooltip, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton isActive={page === id} onClick={() => onSelectPage(id)} tooltip={tooltip} data-cuelume-hover="tick" data-cuelume-press data-cuelume-release>
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
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={page === "settings"} onClick={() => onSelectPage("settings")} tooltip="Settings" data-cuelume-hover="tick" data-cuelume-press data-cuelume-release>
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
