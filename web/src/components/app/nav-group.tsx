import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup } from "@/components/app/app-shared";
import type { Page } from "@/lib/sidebar-preferences";

export function NavGroup({
	label,
	items,
	onNavigate,
}: SidebarNavGroup & { onNavigate?: (p: Page) => void }) {
	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							isActive={item.isActive}
							onClick={() => item.page && onNavigate?.(item.page)}
						>
							{item.icon}
							<span>{item.title}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
