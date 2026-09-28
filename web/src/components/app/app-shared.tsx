import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { SIDEBAR_ITEMS, type Page } from "@/lib/sidebar-preferences";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	page?: Page;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export function buildNavGroups(currentPage: Page): SidebarNavGroup[] {
	return [
		{
			label: "Menu",
			items: SIDEBAR_ITEMS.map((item) => ({
				title: item.label,
				icon: <item.icon />,
				page: item.id as Page,
				isActive: currentPage === item.id,
			})),
		},
	];
}

export function buildFooterNavLinks(currentPage: Page): SidebarNavItem[] {
	return [
		{
			title: "Settings",
			icon: <Settings />,
			page: "settings" as Page,
			isActive: currentPage === "settings",
		},
	];
}

// compat for components that import static arrays (Efferd demo shape)
export const navGroups: SidebarNavGroup[] = buildNavGroups("overview");
export const footerNavLinks: SidebarNavItem[] = buildFooterNavLinks("overview");
export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((g) => g.items),
	...footerNavLinks,
];
