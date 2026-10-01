"use client";

import {
	Avatar,
	AvatarFallback,
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
import { SettingsIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";
import type { Page } from "@/lib/sidebar-preferences";

export function NavUser({ onSelectPage }: { onSelectPage: (p: Page) => void }) {
	/* Switchyard has one shared workspace password rather than accounts, so there
	   is no name, email or avatar to show. The block's demo identity (a name, an
	   email and a GitHub avatar) was fabricated, and an avatar that 404s is worse
	   than none — so the trigger is a monogram.

	   The menu items are the destinations this app actually has. The block's
	   Profile / Notifications / Help center / Agent training / Subscription rows
	   had no handlers and no routes behind them. */
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Avatar className="size-8">
					<AvatarFallback className="bg-accent-tint text-xs font-medium text-accent-text">
						SW
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuItem className="flex items-center justify-start gap-2">
					<DropdownMenuLabel className="flex items-center gap-3">
						<Avatar className="size-10">
							<AvatarFallback className="bg-accent-tint text-sm font-medium text-accent-text">
								SW
							</AvatarFallback>
						</Avatar>
						<div>
							<span className="font-medium text-foreground">Switchyard</span>{" "}
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
