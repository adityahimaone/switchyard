import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { GlowField } from "@/components/app/glow-field";
import type { Page } from "@/lib/sidebar-preferences";

/**
 * The app shell, rebuilt on the `@efferd/app-shell-4` block's structure and
 * then re-materialed in the frosted-glass theme.
 *
 * What was taken from the block, verbatim in structure:
 *
 *   - the composition order: provider, sidebar, inset, header, content
 *   - the floating sidebar variant (the block moved off `inset` to `floating`,
 *     which is what lets the rail sit *over* the glow field instead of being
 *     walled off from it by an opaque gutter)
 *   - a header that is a sibling of the content rather than a border on it
 *
 * What was deliberately not taken:
 *
 *   - **The Efferd logo and wordmark.** `logo.tsx` in the block is Efferd's own
 *     brand; the Switchyard mark stays. This is the same call as the palette —
 *     the block's structure is the deliverable, its identity is not.
 *   - **Its `--sidebar-*` hsl tokens**, which it injected into the `.dark`
 *     block and which would have quietly overridden Signal Blue.
 *   - **Its demo destinations** — "Add product", "Search store", `#link`.
 *     Those are replaced by the app's real pages.
 *   - **`pxx-4`** in the block's header, which is a typo for `px-4`.
 *
 * On the glass: the whole shell is frosted now, including the rail. That
 * reverses the Revision-5 boundary where the rail stayed opaque, and it works
 * because the block's `floating` variant gives the rail a gap to sit in — so
 * there is a visible margin of glow on every side of it rather than glass
 * running to the viewport edge.
 */
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
			{/* The glow field goes first and sits behind everything. With the
			    floating sidebar it is doing more work than before: the rail, the
			    header and the content all diffuse it now, so it is the light
			    source for the entire app rather than decoration behind a gutter. */}
			<GlowField />
			<SidebarProvider className="relative h-svh z-panel">
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

				    No opaque background here: this is the content ground, and a fill
				    would cover the glow field that every glass surface below it
				    depends on. The rail above and the header are glass; this is
				    simply the light coming through. */}
				<SidebarInset className="min-w-0 overflow-transparent md:peer-data-[variant=floating]:m-0 md:peer-data-[variant=floating]:ml-0 md:peer-data-[variant=floating]:rounded-none md:peer-data-[variant=floating]:shadow-none">
					<AppHeader
						page={page}
						onNewChat={onNewChat}
						onOpenPalette={onOpenPalette}
						onSelectPage={onSelectPage}
					/>
					{/* No padding here: every page in this app owns its own gutters, and
					    the full-bleed pages (board, chat, flow map) must reach the edge.
					    The block wrapped its content in `gap-4`; Switchyard's pages are
					    full-bleed and that wrapper is removed. */}
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
