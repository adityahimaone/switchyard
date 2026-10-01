import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"
import ExecutorSettingsPanel from "./ExecutorSettings"
import AccountTab from "./tabs/AccountTab"
import AdvancedTab from "./tabs/AdvancedTab"
import AppearanceTab from "./tabs/AppearanceTab"
import BoardsTab from "./tabs/BoardsTab"
import GeneralTab from "./tabs/GeneralTab"
import NotificationsTab from "./tabs/NotificationsTab"
import VisionTab from "./tabs/VisionTab"

const TABS = [
  { id: "general", label: "General", keywords: "polling refresh sound volume sidebar latest change card release note" },
  { id: "appearance", label: "Appearance", keywords: "theme dark light density compact motion" },
  { id: "notifications", label: "Notifications", keywords: "alert browser review failure" },
  { id: "vision", label: "Vision and attachments", keywords: "ai jev image pdf model routing" },
  { id: "executors", label: "Executors", keywords: "agent run order mode" },
  { id: "boards", label: "Boards and dispatch", keywords: "archive board queue" },
  { id: "account", label: "Account", keywords: "password security login" },
  { id: "advanced", label: "Advanced", keywords: "export data history danger" },
] as const

type TabId = (typeof TABS)[number]["id"]

/**
 * Split layout: a plain-text nav on the left, content on the right. Search
 * filters which sections are offered rather than hiding rows inside them, so a
 * search can never leave a page looking half-empty.
 */
export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general")
  const [q, setQ] = useState("")

  const needle = q.trim().toLowerCase()
  const visibleTabs = useMemo(
    () =>
      needle === ""
        ? TABS
        : TABS.filter(
            (t) => t.label.toLowerCase().includes(needle) || t.keywords.includes(needle),
          ),
    [needle],
  )

  // If the search hides the open section, fall back to the first visible one.
  const active: TabId | undefined = visibleTabs.some((t) => t.id === tab)
    ? tab
    : visibleTabs[0]?.id

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Settings"
        description="Interaction, appearance and runtime preferences for this device."
      >
        <div className="relative w-full max-w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="pl-8"
          />
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Nav above 1024px; a Select takes over below.

            `w-50` was the source of the dead space on the right: a fixed 200px
            column forced every label into the same narrow track, so "Vision and
            attachments" truncated and the whole right edge of the rail was empty
            regardless of label length. Sizing to content instead (`w-max` with a
            `min-w-44` floor) means the rail is exactly as wide as the longest
            label needs, and the border sits against the text rather than a
            fixed gutter. The labels keep `truncate`, which now only engages if a
            label is genuinely longer than the floor. */}
        <nav
          aria-label="Settings"
          className="hidden w-max min-w-44 shrink-0 flex-col gap-0.5 border-r border-line px-2 py-3 lg:flex"
        >
          {visibleTabs.map((t) => {
            const current = t.id === active
            return (
              <button
                key={t.id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative h-8 rounded-control px-2.5 text-left text-sm outline-none",
                  "transition-colors duration-100",
                  "hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40",
                  // accent-text, not accent: on a tinted fill the solid accent
                  // lands at 4.49:1, which rounds under the 4.5 floor.
                  current
                    ? "bg-accent-tint font-medium text-accent-text"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {current && (
                  <span
                    aria-hidden
                    className="absolute top-2 bottom-2 -left-2 w-0.5 rounded-full bg-accent"
                  />
                )}
                <span className="truncate">{t.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
          <div className="lg:hidden">
            <Select value={active} onValueChange={(v) => setTab(v as TabId)}>
              <SelectTrigger className="w-full" aria-label="Settings section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleTabs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-6 lg:mt-0">
            {visibleTabs.length === 0 ? (
              <p className="text-sm text-ink-3">
                No settings match &ldquo;{q.trim()}&rdquo;.
              </p>
            ) : (
              <>
                {active === "general" && <GeneralTab />}
                {active === "appearance" && <AppearanceTab />}
                {active === "notifications" && <NotificationsTab />}
                {active === "vision" && <VisionTab />}
                {active === "executors" && <ExecutorSettingsPanel />}
                {active === "boards" && <BoardsTab />}
                {active === "account" && <AccountTab />}
                {active === "advanced" && <AdvancedTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
