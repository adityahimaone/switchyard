import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { buildNavGroups, buildFooterNavLinks } from "@/components/app-shared";
import { LatestChange } from "@/components/latest-change";
import { PlusIcon, SearchIcon } from "lucide-react";
import type { Page } from "@/lib/sidebar-preferences";

export function AppSidebar({
	page,
	onSelectPage,
}: {
	page: Page;
	onSelectPage: (p: Page) => void;
}) {
	const navGroups = buildNavGroups(page);
	const footerNavLinks = buildFooterNavLinks(page);

	return (
		<Sidebar
			collapsible="icon"
			variant="inset"
			className="overflow-hidden [&>[data-sidebar=sidebar]]:bg-sidebar [&>[data-sidebar=sidebar]]:border-sidebar-border"
		>
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild>
					<button onClick={() => onSelectPage("overview")}>
						<img src="/brand/mascot-switchyard.png" alt="" aria-hidden="true" className="size-8 object-contain" />
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-semibold">Switchyard</span>
							<span className="truncate text-xs text-muted-foreground">Agent Control Plane</span>
						</div>
					</button>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenuItem className="flex items-center gap-2">
						<SidebarMenuButton
							className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
							tooltip="Quick Create"
							onClick={() => onSelectPage("board")}
						>
							<PlusIcon />
							<span>New Task</span>
						</SidebarMenuButton>
						<Button
							aria-label="Search"
							className="size-8 group-data-[collapsible=icon]:opacity-0"
							size="icon"
							variant="outline"
						>
							<SearchIcon />
							<span className="sr-only">Search</span>
						</Button>
					</SidebarMenuItem>
				</SidebarGroup>
				{navGroups.map((group, index) => (
					<NavGroup
						key={`sidebar-group-${index}`}
						{...group}
						onNavigate={onSelectPage}
					/>
				))}
			</SidebarContent>
			<SidebarFooter>
				<LatestChange />
				<SidebarMenu className="mt-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								isActive={item.isActive}
								size="sm"
							>
								<button onClick={() => item.page && onSelectPage(item.page)}>
									{item.icon}
									<span>{item.title}</span>
								</button>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
