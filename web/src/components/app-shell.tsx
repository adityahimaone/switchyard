import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import type { Page } from "@/lib/sidebar-preferences";

export function AppShell({
	page,
	onSelectPage,
	onNewChat,
	onOpenPalette,
	children,
}: {
	page: Page;
	onSelectPage: (p: Page) => void;
	onNewChat: () => void;
	onOpenPalette: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="overflow-hidden">
			<SidebarProvider className="relative h-svh">
				<AppSidebar
					page={page}
					onSelectPage={onSelectPage}
				/>
				{/* `min-w-0` is what stops the collapse/expand cycle from overflowing.
				    SidebarInset carries `w-full` (the shadcn default), so as a flex
				    item its base width is the full wrapper — wider than the space the
				    sidebar gap leaves it. Expanding and collapsing never changed that
				    arithmetic, it only made it visible, and any wide child (a board
				    column, a chat transcript) then pushed past the viewport.
				    `overflow-hidden` additionally clips that content to the inset's
				    rounded corners, which is what makes the header's top corners round
				    like the bottom ones instead of painting square over them. */}
				<SidebarInset className="min-w-0 overflow-hidden md:peer-data-[variant=inset]:ml-0">
					<AppHeader
						page={page}
						onNewChat={onNewChat}
						onOpenPalette={onOpenPalette}
						onSelectPage={onSelectPage}
					/>
					{/* No padding here: every page in this app owns its own gutters, and
					    the full-bleed pages (board, chat, flow map) must reach the edge. */}
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
