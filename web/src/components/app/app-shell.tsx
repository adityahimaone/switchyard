import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import type { Page } from "@/lib/sidebar-preferences";

export function AppShell({
	page,
	onSelectPage,
	header,
	children,
}: {
	page: Page;
	onSelectPage: (p: Page) => void;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="overflow-hidden bg-bg text-ink">
			<SidebarProvider className="relative h-svh">
				<AppSidebar page={page} onSelectPage={onSelectPage} />
				<SidebarInset className="md:peer-data-[variant=inset]:ml-0 flex h-dvh flex-col overflow-hidden">
					{header}
					<div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
