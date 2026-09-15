import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import type { SidebarNavItem } from "@/components/app-shared";
import { NavUser } from "@/components/nav-user";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import type { ReactNode } from "react";

export function AppHeader({
  breadcrumb,
  right,
  onSettings,
  onLogout,
  onOpenPalette,
}: {
  breadcrumb: { title: string };
  right?: ReactNode;
  onSettings?: () => void;
  onLogout?: () => void;
  onOpenPalette?: () => void;
}) {
  const crumb: SidebarNavItem = { title: breadcrumb.title };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 md:px-6",
        "glass-toolbar"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CustomSidebarTrigger />
        <Separator
          className="mr-2 h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <AppBreadcrumbs page={crumb} />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {onOpenPalette && (
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="Open command palette (⌘K)"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]/60 px-1.5 backdrop-blur hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-raised)]/60"
          >
            <KbdGroup className="gap-1">
              <Kbd className="h-5 min-w-5 rounded-md border-[var(--color-line)] bg-[var(--color-inset)] px-1 text-[10px] font-medium leading-none">⌘</Kbd>
              <Kbd className="h-5 min-w-5 rounded-md border-[var(--color-line)] bg-[var(--color-inset)] px-1 text-[10px] font-medium leading-none">K</Kbd>
            </KbdGroup>
          </button>
        )}
        {right}
        <Separator
          className="h-4 data-[orientation=vertical]:self-center"
          orientation="vertical"
        />
        <NavUser onSettings={onSettings} onLogout={onLogout} />
      </div>
    </header>
  );
}
