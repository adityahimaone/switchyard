import type { ReactNode } from "react";
import {
	ActivityIcon,
	KanbanSquareIcon,
	MessageSquareIcon,
	RouteIcon,
	NetworkIcon,
	UserCogIcon,
	ServerCogIcon,
	BrainIcon,
	FolderGitIcon,
	ClockIcon,
	BoxesIcon,
	SettingsIcon,
	ScrollTextIcon,
} from "lucide-react";
import type { Page } from "@/lib/sidebar-preferences";

export type SidebarNavItem = {
	title: string;
	/** The `Page` this row navigates to. */
	page: Page;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

/**
 * The nav manifest, in place of the block's demo data.
 *
 * Rows carry a `page` id rather than an href because the app has no router:
 * `pagePath()` and `Page` own URLs, so a second set of path strings here would
 * be a second source of truth that can drift. `onSelectPage` takes the id and the
 * shell decides what to do with it.
 *
 * The group structure, the muted 12px labels and the collapsible groups are the
 * block's, unchanged.
 */
export const navGroups: SidebarNavGroup[] = [
	{
		label: "Work",
		items: [
			{ title: "Board", page: "board", icon: <KanbanSquareIcon /> },
			{ title: "Chat", page: "chat", icon: <MessageSquareIcon /> },
			{ title: "Flow map", page: "agent-mapping", icon: <RouteIcon /> },
			{ title: "Knowledge", page: "knowledge", icon: <NetworkIcon /> },
		],
	},
	{
		label: "Agents",
		items: [
			{ title: "Profiles", page: "profiles", icon: <UserCogIcon /> },
			{ title: "Skills", page: "skills", icon: <NetworkIcon /> },
			{ title: "Providers", page: "providers", icon: <ServerCogIcon /> },
			{ title: "Memory", page: "memory", icon: <BrainIcon /> },
		],
	},
	{
		label: "Infrastructure",
		items: [
			{ title: "Workspaces", page: "workspaces", icon: <FolderGitIcon /> },
			{ title: "Cron jobs", page: "cron", icon: <ClockIcon /> },
			{ title: "Ecosystem", page: "ecosystem", icon: <BoxesIcon /> },
		],
	},
	{
		label: "Observe",
		items: [
			{ title: "Overview", page: "overview", icon: <ActivityIcon /> },
			{ title: "Logs", page: "logs", icon: <ScrollTextIcon /> },
		],
	},
];

/** Footer rows. Settings is the only destination that lives outside the groups. */
export const footerNavLinks: SidebarNavItem[] = [
	{ title: "Settings", page: "settings", icon: <SettingsIcon /> },
];

/**
 * Flat view of every row. The block derived this by reading `isActive` off a
 * static array, which could only ever mark one hardcoded row; resolving against
 * the live page instead is what keeps the breadcrumb truthful.
 */
export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item],
		),
	),
	...footerNavLinks,
];

export function buildNavGroups(active: Page): SidebarNavGroup[] {
	return navGroups.map((group) => ({
		...group,
		items: group.items.map((item) => ({ ...item, isActive: item.page === active })),
	}));
}

export function buildFooterLinks(active: Page): SidebarNavItem[] {
	return footerNavLinks.map((item) => ({ ...item, isActive: item.page === active }));
}

/** The active row's title and icon, for the header breadcrumb. */
export function activeNavItem(active: Page): SidebarNavItem | undefined {
	return navLinks.find((item) => item.page === active);
}
