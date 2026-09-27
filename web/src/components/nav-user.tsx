import { LogOut, Settings, UserRound } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Auth is a single shared password with no user record, so there is no
 * identity to display. We render a neutral account affordance rather than
 * inventing a name. Pass `name`/`role` once a user table exists.
 */
export function NavUser({
	name,
	role,
	onSettings,
	onLogout,
}: {
	name?: string;
	role?: string;
	onSettings?: () => void;
	onLogout?: () => void;
}) {
	const initial = name?.trim().charAt(0).toUpperCase();
	const hasIdentity = Boolean(name?.trim() || role?.trim());

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Account menu"
					className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-inset)] text-ink-2 outline-none transition-colors hover:bg-[var(--color-surface-raised)] hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
				>
					{initial ? <span className="text-xs font-medium">{initial}</span> : <UserRound className="size-4" aria-hidden="true" />}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					{hasIdentity ? (
						<div className="flex flex-col gap-1">
							<span className="text-sm font-medium">{name}</span>
							{role?.trim() && <span className="text-xs text-muted-foreground">{role}</span>}
						</div>
					) : (
						<span className="text-xs text-muted-foreground">Signed in</span>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={onSettings}>
						<Settings className="mr-2 size-4" />
						Settings
					</DropdownMenuItem>
					{onLogout && (
						<DropdownMenuItem onSelect={onLogout} className="text-red-400 focus:text-red-300">
							<LogOut className="mr-2 size-4" />
							Logout
						</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
