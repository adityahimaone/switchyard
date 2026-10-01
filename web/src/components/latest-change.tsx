"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

const latestChange = {
	badge: "NEW",
	title: "Flow map is live",
	description: "Agent topology, drawn.",
	readMore: { href: "/agent-mapping", label: "Open flow map" },
} as const;

/**
 * Off by default: it is a promotional card, and it was taking a 108px slot at
 * the foot of the rail on every page whether or not the note mattered there.
 * Settings → General → "Latest change card" brings it back.
 */
export const LATEST_CHANGE_KEY = "kb-latest-change";

function readVisible(): boolean {
	try {
		return localStorage.getItem(LATEST_CHANGE_KEY) === "1";
	} catch {
		return false;
	}
}

export function LatestChange() {
	// Read once on mount: the setting lives in localStorage, so there is nothing
	// to watch after that.
	const [isOpen] = useState(readVisible);

	// The X only dismisses for this session. Persisting it would fight the
	// setting: the card would stay gone after the user turned it back on, with
	// no indication why, because the two write to the same intent.
	const [dismissed, setDismissed] = useState(false);

	if (!isOpen || dismissed) {
		return null;
	}

	return (
		<div
			className={cn(
				"rounded-lg group/latest-change size-full min-h-27 justify-center border bg-background",
				"relative flex size-full flex-col gap-1 overflow-hidden px-4 pt-3 pb-1 *:text-nowrap",
				"transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
			)}
		>
			<span className="font-light font-mono text-[10px] text-muted-foreground">
				{latestChange.badge}
			</span>
			<p className="font-medium text-xs">{latestChange.title}</p>
			<span className="text-[10px] text-muted-foreground">
				{latestChange.description}
			</span>
			<Button
				asChild
				className="w-max px-0 font-light text-xs"
				size="sm"
				variant="link"
			>
				<a href={latestChange.readMore.href}>{latestChange.readMore.label}</a>
			</Button>
			<Button
				aria-label="Dismiss"
				className="absolute top-2 right-2 z-10 size-6 rounded-full opacity-0 transition-opacity group-hover/latest-change:opacity-100"
				onClick={() => setDismissed(true)}
				size="icon-sm"
				variant="ghost"
			>
				<XIcon className="size-3.5 text-muted-foreground" />{" "}
			</Button>
		</div>
	);
}
