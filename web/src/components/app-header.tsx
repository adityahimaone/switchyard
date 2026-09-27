import { Command } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReactNode } from "react";

export function AppHeader({
	breadcrumb,
	context,
	right,
	onSettings,
	onLogout,
	onOpenPalette,
}: {
	breadcrumb: { title: string };
	/** Page-scoped context rendered next to the title (e.g. the board switcher). */
	context?: ReactNode;
	right?: ReactNode;
	onSettings?: () => void;
	onLogout?: () => void;
	onOpenPalette?: () => void;
}) {
	return (
		<header className="glass-toolbar sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-4 md:px-6">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<CustomSidebarTrigger />
				<Separator className="mr-1 h-4 shrink-0" orientation="vertical" />
				<AppBreadcrumbs page={breadcrumb} context={context} />
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{onOpenPalette && (
					<Tooltip delayDuration={400}>
						<TooltipTrigger asChild>
							<Button
								size="icon-sm"
								variant="ghost"
								onClick={onOpenPalette}
								aria-label="Open command palette"
								className="text-ink-3"
							>
								<Command className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="flex items-center gap-1.5 px-2 py-1">
							Command palette
							<Kbd className="h-4 text-[10px]">⌘K</Kbd>
						</TooltipContent>
					</Tooltip>
				)}
				{right}
				<Separator className="hidden h-4 shrink-0 sm:block" orientation="vertical" />
				<NavUser onSettings={onSettings} onLogout={onLogout} />
			</div>
		</header>
	);
}
