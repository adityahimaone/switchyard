import type { ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@/components/ui/breadcrumb";

/** Current page segment shown in the header — pass a nav item or `{ title, icon? }`. */
export type AppBreadcrumbPage = {
	title: string;
	icon?: ReactNode;
};

export function AppBreadcrumbs({
	page,
	context,
}: {
	page?: AppBreadcrumbPage | null;
	/** Page-scoped context (e.g. board switcher) shown after the title. */
	context?: ReactNode;
}) {
	if (!page?.title) {
		return null;
	}

	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<Breadcrumb className="min-w-0">
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
							{page.icon}
							<span className="min-w-0 truncate">{page.title}</span>
						</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			{context && (
				<div className="flex min-w-0 shrink-0 items-center gap-2">{context}</div>
			)}
		</div>
	);
}
