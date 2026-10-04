import type { ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Current page segment shown in the header — pass a nav item or `{ title, icon? }`. */
export type AppBreadcrumbPage = {
	title: string;
	icon?: ReactNode;
};

export function AppBreadcrumbs({
	page,
	trail,
}: {
	page?: AppBreadcrumbPage | null;
	/** Sub-page context appended after the page name, e.g. a chat's session title. */
	trail?: string;
}) {
	if (!page?.title) {
		return null;
	}

	return (
		<Breadcrumb>
			{/* `min-w-0` on the list and truncation on the trail are what keep a long
			    session title from starving the right-hand control cluster. Without
			    them the cluster wins the flex contest and the crumb collapses to
			    zero width — which reads as the breadcrumb having vanished rather
			    than as a long name having been clipped. */}
			<BreadcrumbList className="min-w-0">
				<BreadcrumbItem>
					<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
						{page.icon}
						{page.title}
					</BreadcrumbPage>
				</BreadcrumbItem>
				{trail ? (
					<>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage
								className="max-w-[40ch] truncate text-ink-2"
								title={trail}
							>
								{trail}
							</BreadcrumbPage>
						</BreadcrumbItem>
					</>
				) : null}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
