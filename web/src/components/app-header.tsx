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

	/* Frosted, and rounded — the block's `floating` sidebar changed the header's
	   job. Under the `inset` variant the header was a full-bleed band pinned to
	   the top edge, so it had to run square to the viewport to avoid a seam.
	   With a floating rail it is now a panel floating over the glow field like
	   every other surface, and it gets the radius and the shadow that says so.

	   That is the block's structure carried over: header as a sibling of the
	   content, not a border drawn on it. Its own header used `pxx-4 mb-6`, a typo
	   for `px-4`; corrected here, and the `mb-6` is dropped because Switchyard's
	   pages own their own gutters and a margin here would gap every page.

	   The portalling hazard: every overlay trigger here (⌘K tooltip, notification
	   bell, theme switch, account menu) is a Radix primitive whose content
	   portals to document.body, so a portalled descendant is not a descendant and
	   cannot be captured by this filter. `CommandPalette` — the one non-portalled
	   fixed overlay — is a sibling, not a child. The rule that keeps it working:
	   neither this element nor `sidebar-inset` may ever carry a filter. */
	return (
		<header
			className={cn(
				"glass sticky top-0 z-panel mx-2 mt-2 flex h-14 shrink-0 items-center justify-between gap-2 rounded-lg px-4 md:mx-3 md:mt-3"
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
