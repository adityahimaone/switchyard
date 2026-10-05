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
	trail,
	onNewChat,
	onOpenPalette,
	onSelectPage,
}: {
	page: Page;
	/** Extra crumbs appended after the nav item. Chat uses this to publish its
	    session title now that it no longer has a title bar of its own. */
	trail?: string;
	onNewChat: () => void;
	onOpenPalette: () => void;
	onSelectPage: (p: Page) => void;
}) {
	/* Resolved against the live page rather than a static array: the block could
	   only ever mark one hardcoded row, so the breadcrumb never tracked
	   navigation. */
	const activeItem = activeNavItem(page);

	/* `glass-flat` rather than `glass`, and that is not a downgrade.
	   `glass` would put a `backdrop-filter` on this element, and a
	   `backdrop-filter` ancestor becomes the containing block for any
	   `position: fixed` descendant. This header is nothing *but* overlay
	   triggers — the notification bell, the theme switch, the account menu — so
	   one of them rendering un-portalled would be positioned *and* clipped to
	   the bar. Radix portals those overlays today, so the guarantee currently
	   rests on every future overlay remembering to do the same.

	   The bar also sits on the opaque `bg-background` inset, so there is no
	   meaningful backdrop to diffuse anyway. If this bar ever does need real
	   frost, the filter goes on a sibling `-z-10` layer behind it, never on
	   `<header>` itself. */
	return (
		<header
			className={cn(
				// No `border-b`. The hairline separated this bar from page content
				// that never scrolls underneath it — the shell is `h-svh` with
				// `overflow-hidden`, and scrolling happens inside per-page
				// containers, so there is no scroll edge for a border to
				// materialise at. It drew a permanent line under a bar that is
				// always at rest. Pages own their own top separation: the board
				// and chat start flush, everything else has a `PageHeader` with
				// its own rule.
				"glass-flat sticky top-0 z-50 flex h-13 shrink-0 items-center justify-between gap-2 px-4 md:px-6"
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} trail={trail} />
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{/* Two renderings of one control, swapped by width rather than by
				    state. A 220px field is a clear affordance for "there is a
				    command palette", where an icon button is a guess — but on a
				    narrow window the field would starve the rest of the cluster, so
				    below 1100px it collapses back to the icon. Both exist in the
				    DOM and only one is displayed, which keeps the shortcut and the
				    tooltip available at every size. */}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							aria-label="Search tasks"
							className="hidden h-7 w-[220px] items-center gap-2 rounded-control border border-line bg-well px-2.5 text-left text-xs text-ink-3 transition-colors duration-150 outline-none hover:border-line-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_rgb(from_var(--c-focus)_r_g_b_/_0.18)] min-[1100px]:flex"
							onClick={onOpenPalette}
						>
							<SearchIcon className="size-3.5 shrink-0" />
							<span className="truncate">Search tasks</span>
							<Kbd className="ml-auto h-4 shrink-0">⌘K</Kbd>
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="hidden min-[1100px]:flex">
						Open the command palette
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Search tasks"
							size="icon-sm"
							variant="outline"
							className="min-[1100px]:hidden"
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
				<Tooltip>
					<TooltipTrigger asChild>
						<Button aria-label="New chat" size="icon-sm" variant="outline" onClick={onNewChat}>
							<SendIcon />
						</Button>
					</TooltipTrigger>
					{/* The paper plane reads as "send" next to a chat composer, where
					    this button is one of two unrelated actions. Naming it removes
					    the ambiguity rather than leaving it for a tooltip to fix. */}
					<TooltipContent side="bottom">New chat</TooltipContent>
				</Tooltip>
				{/* The block had a plain Bell here with no behaviour. The existing
				    NotificationCenter is the real one: it polls, badges unread
				    counts and marks them read. */}
				<NotificationCenter />
				{/* Theme then account, then a rule between the app-wide controls and
				    the identity affordance. The rule used to sit *after* the avatar,
				    where it divided nothing; its own comment said it belonged here.
				    The theme switch stays a segmented pair: it reports the resolved
				    theme rather than the preference, so a user on "system" sees
				    which side they actually landed on. */}
				<ThemeSwitch />
				<Separator
					className="mx-0.5 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser onSelectPage={onSelectPage} />
			</div>
		</header>
	);
}
