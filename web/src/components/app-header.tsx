"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Kbd } from "@/components/ui/kbd";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { activeNavItem } from "@/components/app-shared";
import { NavUser } from "@/components/nav-user";
import NotificationCenter from "@/features/notifications/NotificationCenter";
import { ThemeSwitch } from "@/components/app/theme-switch";
import { SearchIcon, SendIcon } from "lucide-react";
import type { Page } from "@/lib/sidebar-preferences";

export function AppHeader({
	page,
	onNewChat,
	onOpenPalette,
	onSelectPage,
}: {
	page: Page;
	onNewChat: () => void;
	onOpenPalette: () => void;
	onSelectPage: (p: Page) => void;
}) {
	/* Resolved against the live page rather than a static array: the block could
	   only ever mark one hardcoded row, so the breadcrumb never tracked
	   navigation. */
	const activeItem = activeNavItem(page);

	/* `glass-flat` rather than a bare `backdrop-blur-sm`: it gives the same tint
	   and elevation without `backdrop-filter`. That matters because this header
	   contains overlay triggers — the notification bell, the theme switch, the
	   account menu — and a `backdrop-filter` ancestor becomes the containing
	   block for any `position: fixed` descendant. Radix portals those overlays to
	   `document.body` today so they escape it, but the guarantee should not rest
	   on every future overlay remembering to portal: one that forgets would be
	   positioned *and* clipped to the header. Dropping the filter removes the
	   failure mode entirely, and this bar sits on the opaque `bg-surface` inset,
	   so there was never a meaningful backdrop to diffuse anyway. */
	return (
		<header
			className={cn(
				"glass-flat sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6"
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} />
			</div>
			<div className="flex shrink-0 items-center gap-3">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Search tasks"
							size="icon-sm"
							variant="outline"
							onClick={onOpenPalette}
						>
							<SearchIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="flex items-center gap-1.5">
						Search
						<Kbd className="h-4">⌘K</Kbd>
					</TooltipContent>
				</Tooltip>
				<Button aria-label="New chat" size="icon-sm" variant="outline" onClick={onNewChat}>
					<SendIcon
					/>
				</Button>
				{/* The block had a plain Bell here with no behaviour. The existing
				    NotificationCenter is the real one: it polls, badges unread
				    counts and marks them read. */}
				<NotificationCenter />
				{/* Theme then account. The theme switch is a segmented control rather than a
				    single button, so it reads as belonging with the other grouped
				    controls; the avatar closes the bar as the one identity
				    affordance. The separator now divides the app-wide controls from
				    the account, instead of cutting between two of them. */}
				<ThemeSwitch />
				<NavUser onSelectPage={onSelectPage} />
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
			</div>
		</header>
	);
}
