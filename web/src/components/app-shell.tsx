import { useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderTrailProvider } from "@/components/header-trail-context";
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
	/* The header owns the trail string; pages publish into it through the context
	   below. Holding it here rather than in `App` keeps a page's own query state
	   from re-rendering the shell — see `header-trail-context.tsx`. */
	const [trail, setTrail] = useState<string | undefined>(undefined);

	return (
		<div className="overflow-hidden">
			{/* `glow-ground` lives here, behind everything, because it is the one
			    layer every other material is measured against: the sidebar is glass
			    and stands directly on it, and its tint only reads as frosted because
			    there is a lit field behind it to diffuse. Without this the bloom
			    diffuses nothing and the sidebar renders as a flat grey rectangle —
			    which is exactly the failure the dark-mode glow comment describes,
			    and exactly what was happening before this pass, since nothing was
			    applying the utility.

			    It goes on the outer wrapper rather than `SidebarProvider` because the
			    sidebar is `position: fixed` and the provider's own box is only as
			    tall as the collapsed gutter; the glow has to cover the whole window
			    for the sidebar's blur to have anything to sample. The content inset
			    on top is opaque `--c-canvas`, so the bloom stays visible exactly
			    where the glass is — in the gutter and behind the panel. */}
			<SidebarProvider className="glow-ground relative h-svh">
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
					<HeaderTrailProvider value={setTrail}>
						<AppHeader
							page={page}
							trail={trail}
							onNewChat={onNewChat}
							onOpenPalette={onOpenPalette}
							onSelectPage={onSelectPage}
						/>
						{/* No padding here: every page in this app owns its own gutters, and
						    the full-bleed pages (board, chat, flow map) must reach the edge. */}
						<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
							{children}
						</div>
					</HeaderTrailProvider>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
