"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SettingsIcon,
	KeyRoundIcon,
	LogOutIcon,
	PencilIcon,
} from "lucide-react";
import type { Page } from "@/lib/sidebar-preferences";
import {
	WORKSPACE_NAME_FALLBACK,
	useWorkspaceIdentity,
	workspaceMonogram,
} from "@/features/settings/tabs/WorkspaceTab";

export function NavUser({ onSelectPage }: { onSelectPage: (p: Page) => void }) {
	/* Switchyard has one shared workspace password rather than accounts, so there
	   is no per-user name, email or avatar. What this menu now shows is the
	   *workspace* identity — a name and avatar the owner sets once, server-side.

	   The block's demo identity (a name, an email and a GitHub avatar) was
	   fabricated, and an avatar that 404s is worse than none, so the trigger is a
	   monogram that reflects the real name.

	   The menu items are the destinations this app actually has. The block's
	   Profile / Notifications / Help center / Agent training / Subscription rows
	   had no handlers and no routes behind them. */
	const { data } = useWorkspaceIdentity();
	const label = data?.name.trim() || WORKSPACE_NAME_FALLBACK;
	const avatar = data?.avatar_url ?? "";
	const initials = workspaceMonogram(label);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className="size-8">
					{avatar ? <AvatarImage src={avatar} alt="" /> : null}
					<AvatarFallback className="bg-accent-tint text-xs font-medium text-accent-text">
						{initials}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuItem className="flex items-center justify-start gap-2">
					<DropdownMenuLabel className="flex items-center gap-3">
						<Avatar className="size-10">
							{avatar ? <AvatarImage src={avatar} alt="" /> : null}
							<AvatarFallback className="bg-accent-tint text-sm font-medium text-accent-text">
								{initials}
							</AvatarFallback>
						</Avatar>
						<div>
							<span className="font-medium text-foreground">{label}</span>{" "}
							<br />
							<div className="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap text-muted-foreground text-xs">
								Shared workspace
							</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => onSelectPage("settings")}>
						<PencilIcon
						/>
						Edit workspace identity
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => onSelectPage("settings")}>
						<SettingsIcon
						/>
						Settings
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => onSelectPage("settings")}>
						<KeyRoundIcon
						/>
						Change password
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						className="w-full cursor-pointer"
						variant="destructive"
						onSelect={() => {
							void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() =>
								window.location.reload(),
							);
						}}
					>
						<LogOutIcon
						/>
						Log out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}