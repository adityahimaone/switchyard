import { LogoMark, LogoWordmark } from "@/components/app/brand";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { buildFooterLinks, buildNavGroups } from "@/components/app-shared";
import { LatestChange } from "@/components/latest-change";
import type { Page } from "@/lib/sidebar-preferences";

export function AppSidebar({
	page,
	onSelectPage,
}: {
	page: Page;
	onSelectPage: (p: Page) => void;
}) {
	return (
		<Sidebar collapsible="icon" variant="inset">
			{/* `h-13` to match the shell header exactly. The two are aligned by
			    construction rather than by eye — they sit side by side across the
			    gutter — so when the header moved to 52px this had to follow, or the
			    logo row would sit 4px low against it. */}
			<SidebarHeader className="h-13 justify-center">
				{/* The real Switchyard mark and wordmark, rather than the block's
				    Efferd logo.

				    The padding override has to sit on the *button*, not the span
				    inside it. `SidebarMenuButton` collapses to `size-8! p-2!`, which
				    leaves a 16px content box — narrower than the 24px mark, so the
				    button's `overflow-hidden` was clipping the logo and it rendered
				    flat rather than at its actual size. Padding the inner span could
				    not fix that: it was adding inset inside an already-clipped box.

				    `p-1!` gives the mark the 4px it needs on each side, so it renders
				    at its full 24px inside the 32px button and lines up with the nav
				    icons below, which are inset by their group's own padding. */}
				<SidebarMenuButton
					asChild
					tooltip="Switchyard"
					className="group-data-[collapsible=icon]:p-1!"
				>
					<span className="flex items-center gap-2.5">
						<LogoMark className="size-6 shrink-0 rounded-md" />
						<span className="group-data-[collapsible=icon]:hidden">
							<LogoWordmark />
						</span>
					</span>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{buildNavGroups(page).map((group, index) => (
					<NavGroup
						key={`sidebar-group-${index}`}
						{...group}
						onSelectPage={onSelectPage}
					/>
				))}
			</SidebarContent>
			<SidebarFooter>
				<LatestChange />
				<SidebarMenu className="mt-2">
					{buildFooterLinks(page).map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								className="text-muted-foreground"
								isActive={item.isActive}
								size="sm"
								tooltip={item.title}
								onClick={() => onSelectPage(item.page)}
							>
								{item.icon}
								<span>{item.title}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
