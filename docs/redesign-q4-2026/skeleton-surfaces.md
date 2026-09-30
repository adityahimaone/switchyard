# Skeleton code, Part 2: App surfaces

Companion to `design-surfaces.md`. Each block starts with a `// file:` comment giving its destination under `web/src/`. Blocks depend on the Part 1 skeleton (`tokens.css`, `Button`, `StatusLamp`, `PageHeader`) and on existing shadcn files (`sheet`, `dialog`, `switch`, `input`, `avatar`, `dropdown-menu`).

Install nothing new beyond Part 1's fonts. The app has no router dependency, so tiles and links render plain `<a href>`; swap in your own navigation helper if you have one.

## 1. Entry card and detail sheet (Profiles, Providers, Skills, Workspaces, Ecosystem)

```tsx
// file: components/app/entry-card.tsx
import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const entryCard = cva(
  [
    "relative flex min-w-0 flex-col rounded-card border bg-surface text-left",
    "transition-[border-color] duration-100 hover:border-line-strong",
    "focus-within:border-line-strong",
  ],
  {
    variants: {
      density: {
        identity: "gap-3 p-4",
        infrastructure: "gap-3 p-4",
        registry: "gap-1.5 p-3",
      },
      selected: {
        true: "border-lantern",
        false: "border-line",
      },
    },
    defaultVariants: { density: "identity", selected: false },
  },
)

type Props = VariantProps<typeof entryCard> & {
  /** Leading icon, avatar or lamp. */
  lead?: ReactNode
  /** Name. Truncates safely. */
  title: string
  /** One state on the right: a StatusLamp or a short text. */
  state?: ReactNode
  /** One secondary line. Pass `mono` for identifiers and URLs. */
  subtitle?: string
  mono?: boolean
  /** Labelled metrics row, e.g. "261 skills". */
  metrics?: ReactNode
  /** Footer: one primary action on the left, overflow menu on the right. */
  primary?: ReactNode
  overflow?: ReactNode
  /** Extra rows, e.g. an expanded model roster. */
  children?: ReactNode
  className?: string
}

export function EntryCard({
  density, selected, lead, title, state, subtitle, mono, metrics, primary, overflow, children, className,
}: Props) {
  return (
    <article data-selected={selected || undefined} className={cn(entryCard({ density, selected }), className)}>
      <header className="flex min-w-0 items-center gap-2.5">
        {lead && <div className="shrink-0">{lead}</div>}
        <h3 className="min-w-0 flex-1 truncate font-sans text-sm font-medium tracking-normal text-ink" title={title}>
          {title}
        </h3>
        {state && <div className="shrink-0">{state}</div>}
      </header>

      {subtitle && (
        <p
          title={subtitle}
          className={cn("truncate text-xs text-ink-3", mono && "font-mono text-2xs")}
        >
          {subtitle}
        </p>
      )}

      {metrics && <div className="flex min-w-0 items-center gap-3 text-xs text-ink-2 tabular">{metrics}</div>}

      {children}

      {(primary || overflow) && (
        <footer className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">{primary}</div>
          <div className="flex items-center">{overflow}</div>
        </footer>
      )}
    </article>
  )
}

/** Small labelled metric: <Metric value={261} label="skills" /> */
export function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-display text-base font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-3">{label}</span>
    </span>
  )
}
```

```tsx
// file: components/app/detail-sheet.tsx
import type { ReactNode } from "react"
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"

/**
 * The only surface for viewing or editing one entry. Replaces system-modal and the
 * hand-built overlays in Cron and Workspaces.
 */
export function DetailSheet({
  open, onOpenChange, title, description, footer, children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-line bg-surface p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle className="text-lg font-semibold text-ink">{title}</SheetTitle>
          {description && <SheetDescription className="text-sm text-ink-3">{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <SheetFooter className="flex-row justify-end gap-2 border-t border-line p-4">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
```

```tsx
// file: components/app/confirm-dialog.tsx
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

/** Every destructive action goes through this. Button label repeats the verb. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, busy, onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-line bg-raised">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-sm text-ink-3">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

```tsx
// file: components/app/empty-state.tsx
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Says what is true and what to do. Pass an action only when one exists. */
export function EmptyState({
  title, hint, action, className,
}: { title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-1 px-2 py-8", className)}>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="max-w-[44ch] text-xs text-ink-3">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
```

### Example: profile card

```tsx
// file: features/profiles/ProfileCard.tsx
import { MoreHorizontal } from "lucide-react"
import type { Profile } from "@/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntryCard, Metric } from "@/components/app/entry-card"

export function ProfileCard({
  profile, skillCount, selected, onEdit, onActivate, onDelete,
}: {
  profile: Profile
  skillCount: number
  selected?: boolean
  onEdit: () => void
  onActivate: () => void
  onDelete: () => void
}) {
  return (
    <EntryCard
      density="identity"
      selected={selected}
      lead={
        <Avatar className="size-7">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
          <AvatarFallback className="bg-well text-2xs text-ink-2">
            {profile.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      }
      title={profile.name}
      state={profile.active ? <span className="text-xs font-medium text-ink">Active</span> : undefined}
      subtitle={`${profile.model} · ${profile.provider}`}
      mono
      metrics={
        <>
          <Metric value={skillCount} label="skills" />
          <span className={profile.valid ? "text-ink-3" : "text-danger-text"}>
            {profile.valid ? "Valid" : "Broken config"}
          </span>
        </>
      }
      primary={<Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>}
      overflow={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${profile.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!profile.active && <DropdownMenuItem onSelect={onActivate}>Set as active</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={profile.active}
              onSelect={onDelete}
              className="text-danger-text focus:text-danger-text"
            >
              Delete profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}
```

## 2. Filter bar (all Collection pages, board)

```tsx
// file: components/app/filter-bar.tsx
import type { ReactNode } from "react"
import { ChevronDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

export interface FilterOption { value: string; label: string }

/** Shows the chosen value ("Platform: Mac"), not an empty label. */
export function FilterChip({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  const current = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="text-ink-3">{label}:</span>
          <span className="max-w-32 truncate">{current?.label ?? value}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterBar({
  query, onQueryChange, placeholder = "Search", shown, total, children, trailing,
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
  shown: number
  total: number
  children?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-64">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 rounded-control border-line-strong bg-well pl-8 text-sm"
        />
      </div>
      {children}
      <span className="tabular text-xs text-ink-3" aria-live="polite">
        {shown === total ? `${total}` : `${shown} of ${total}`}
      </span>
      {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
    </div>
  )
}
```

## 3. Settings

```tsx
// file: features/settings/settings-parts.tsx
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface SettingsNavItem { id: string; label: string }

export function SettingsNav({
  items, active, onSelect,
}: { items: readonly SettingsNavItem[]; active: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Settings" className="flex w-50 shrink-0 flex-col gap-0.5 border-r border-line p-3 max-lg:hidden">
      {items.map((item) => {
        const current = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? "page" : undefined}
            onClick={() => onSelect(item.id)}
            className={cn(
              "relative h-8 rounded-control px-2.5 text-left text-sm outline-none transition-colors duration-100",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              current ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
            )}
          >
            {current && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-lantern" />}
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

/** One topic: heading, one-line description, then rows. Add `footer` for a Save button. */
export function SettingsSection({
  title, description, danger, footer, children,
}: { title: string; description?: string; danger?: boolean; footer?: ReactNode; children: ReactNode }) {
  return (
    <section
      className={cn("flex max-w-[640px] flex-col gap-1", danger && "border-l-2 border-danger pl-4")}
      aria-labelledby={`s-${title}`}
    >
      <h2 id={`s-${title}`} className="text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="max-w-[56ch] text-sm text-ink-3">{description}</p>}
      <div className="mt-3 divide-y divide-line border-y border-line">{children}</div>
      {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
    </section>
  )
}

/** Label and help at left, control at right. No card per row. */
export function SettingRow({
  label, help, htmlFor, children,
}: { label: string; help?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
        {help && <p className="mt-0.5 max-w-[56ch] text-xs text-ink-3">{help}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Small segmented control for Theme, Density, Reduce motion. */
export function Segmented<T extends string>({
  value, onChange, options, label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-line-strong bg-well p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 rounded-[4px] px-2.5 text-xs font-medium outline-none transition-colors duration-100",
            "focus-visible:outline-2 focus-visible:outline-focus",
            o.value === value ? "bg-raised text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

```tsx
// file: features/settings/tabs/AppearanceTab.tsx
import * as React from "react"
import { SettingRow, SettingsSection, Segmented } from "../settings-parts"

type Theme = "system" | "light" | "dark"
type Density = "comfortable" | "compact"
type Motion = "system" | "reduce"

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("light", !dark)
}

export function AppearanceTab() {
  // Persist in your existing settings store; localStorage shown as a placeholder.
  const [theme, setTheme] = React.useState<Theme>(() => (localStorage.getItem("sy.theme") as Theme) ?? "system")
  const [density, setDensity] = React.useState<Density>(() => (localStorage.getItem("sy.density") as Density) ?? "comfortable")
  const [motion, setMotion] = React.useState<Motion>(() => (localStorage.getItem("sy.motion") as Motion) ?? "system")

  React.useEffect(() => { localStorage.setItem("sy.theme", theme); applyTheme(theme) }, [theme])
  React.useEffect(() => {
    localStorage.setItem("sy.density", density)
    document.documentElement.dataset.density = density
  }, [density])
  React.useEffect(() => {
    localStorage.setItem("sy.motion", motion)
    document.documentElement.dataset.motion = motion
  }, [motion])

  return (
    <SettingsSection title="Appearance" description="How Switchyard looks on this device.">
      <SettingRow label="Theme" help="Choose light, dark, or match your system.">
        <Segmented
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
        />
      </SettingRow>
      <SettingRow label="Density" help="Compact fits more cards on screen.">
        <Segmented
          label="Density"
          value={density}
          onChange={setDensity}
          options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
        />
      </SettingRow>
      <SettingRow label="Reduce motion" help="Turns off the board intro, status pulse and card animations.">
        <Segmented
          label="Reduce motion"
          value={motion}
          onChange={setMotion}
          options={[{ value: "system", label: "System" }, { value: "reduce", label: "On" }]}
        />
      </SettingRow>
    </SettingsSection>
  )
}
```

Add this rule to `tokens.css` so the manual "Reduce motion" setting works alongside the OS setting:

```css
:root[data-motion="reduce"] .board-enter .track-line,
:root[data-motion="reduce"] .animate-lamp { animation: none !important; }
```

## 4. Chat

```tsx
// file: components/chat/event-row.tsx
import { useState } from "react"
import { AlertCircle, Check, ChevronRight, CircleDot, Cpu, HelpCircle, Lightbulb, ShieldCheck, Wrench, X } from "lucide-react"
import type { ChatRunEvent } from "@/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const META: Record<string, { label: string; icon: typeof CircleDot; attention?: "ask" | "error" }> = {
  tool: { label: "Tool", icon: Wrench },
  reasoning: { label: "Reasoning", icon: Lightbulb },
  subagent: { label: "Subagent", icon: Cpu },
  spawned: { label: "Started", icon: CircleDot },
  completed: { label: "Completed", icon: Check },
  clarify: { label: "Question", icon: HelpCircle, attention: "ask" },
  approval: { label: "Approval needed", icon: ShieldCheck, attention: "ask" },
  error: { label: "Error", icon: AlertCircle, attention: "error" },
  cancelled: { label: "Cancelled", icon: X, attention: "error" },
}

function parse(payload: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(payload)
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }
  } catch {
    return { value: payload }
  }
}
const str = (p: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => p[k]).find((v): v is string => typeof v === "string" && v.length > 0) ?? ""

export function EventRow({
  event, onApprove, onDeny,
}: { event: ChatRunEvent; onApprove?: () => void; onDeny?: () => void }) {
  const meta = META[event.kind] ?? { label: event.kind, icon: CircleDot }
  const Icon = meta.icon
  const p = parse(event.payload)
  const detail = str(p, "preview", "output", "text", "description", "question", "value")
  const command = str(p, "command")
  const collapsible = event.kind === "reasoning" || event.kind === "tool"
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        "rounded-control border-l-2 py-1.5 pr-2 pl-3 text-sm",
        meta.attention === "ask" && "border-lantern bg-lantern-tint",
        meta.attention === "error" && "border-danger bg-danger-tint",
        !meta.attention && "border-line",
      )}
    >
      <button
        type="button"
        disabled={!collapsible}
        aria-expanded={collapsible ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default"
      >
        <Icon aria-hidden className={cn("size-3.5 shrink-0", meta.attention === "error" ? "text-danger-text" : "text-ink-3")} />
        <span className={cn("text-xs font-medium", meta.attention === "error" ? "text-danger-text" : "text-ink-2")}>
          {meta.label}
        </span>
        {event.kind === "tool" && (
          <span className="min-w-0 truncate font-mono text-2xs text-ink-3">{str(p, "name")}</span>
        )}
        {collapsible && (
          <ChevronRight aria-hidden className={cn("ml-auto size-3.5 text-ink-4 transition-transform duration-100", open && "rotate-90")} />
        )}
      </button>

      {(open || !collapsible) && detail && (
        <p
          className={cn(
            "mt-1.5 max-w-[72ch] break-words whitespace-pre-wrap text-sm text-ink-2",
            event.kind === "tool" && "max-h-48 overflow-auto font-mono text-2xs text-ink-3",
          )}
        >
          {detail}
        </p>
      )}
      {command && (
        <pre className="mt-1.5 overflow-x-auto rounded-control bg-well px-2 py-1.5 font-mono text-2xs text-ink-2">{command}</pre>
      )}
      {event.kind === "approval" && (onApprove || onDeny) && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="signal" onClick={onApprove}>Approve</Button>
          <Button size="sm" variant="secondary" onClick={onDeny}>Deny</Button>
        </div>
      )}
    </div>
  )
}
```

```tsx
// file: components/chat/chat-turn.tsx
import { useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StatusLamp } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

export function UserTurn({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70ch] rounded-card bg-raised px-3.5 py-2.5 text-base whitespace-pre-wrap text-ink">
        {children}
      </div>
    </div>
  )
}

export function AssistantTurn({
  profileName, avatarUrl, running, footer, activity, children,
}: {
  profileName: string
  avatarUrl?: string
  running?: boolean
  /** <TurnFooter …/> */
  footer?: ReactNode
  /** <ActivityGroup …/> */
  activity?: ReactNode
  children: ReactNode
}) {
  return (
    <article className="group/turn flex flex-col gap-2" aria-busy={running || undefined}>
      <header className="flex items-center gap-2">
        <Avatar className="size-5">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
          <AvatarFallback className="bg-well text-[9px] text-ink-2">{profileName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium text-ink">{profileName}</span>
        {running && <StatusLamp status="running" label="Working" />}
      </header>
      <div className="max-w-[72ch] text-base text-ink">{children}</div>
      {activity}
      {footer}
    </article>
  )
}

/** Time, model, elapsed. Visible on hover and focus, always for the latest turn. */
export function TurnFooter({
  time, model, elapsed, sessionId, latest, error,
}: { time?: string; model?: string; elapsed?: string; sessionId?: string; latest?: boolean; error?: "Error" | "Cancelled" }) {
  return (
    <footer
      tabIndex={0}
      className={cn(
        "flex items-center gap-3 text-xs text-ink-3 outline-none focus-visible:opacity-100",
        !latest && "opacity-0 transition-opacity duration-100 group-hover/turn:opacity-100 group-focus-within/turn:opacity-100",
      )}
    >
      {time && <span className="tabular">{time}</span>}
      {model && <span className="max-w-40 truncate font-mono text-2xs" title={model}>{model}</span>}
      {elapsed && <span className="tabular" title="Elapsed">{elapsed}</span>}
      {sessionId && <span className="font-mono text-2xs" title="Session ID">{sessionId}</span>}
      {error && <span className="font-medium text-danger-text">{error}</span>}
    </footer>
  )
}

/** Collapses consecutive events into "3 tool calls · 12.4s". */
export function ActivityGroup({
  summary, defaultOpen = false, children,
}: { summary: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="max-w-[72ch]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-control text-xs text-ink-3 outline-none hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronRight aria-hidden className={cn("size-3.5 transition-transform duration-100", open && "rotate-90")} />
        {summary}
      </button>
      {open && <div className="mt-2 flex flex-col gap-1.5">{children}</div>}
    </div>
  )
}
```

```tsx
// file: components/chat/composer.tsx
import { useRef, type ReactNode } from "react"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusLamp } from "@/components/ui/status-lamp"

/**
 * One surface, no BorderBeam. `controls` holds the attach button and the three
 * FilterChip-style dropdowns (profile, workspace, model). Send is the page's only
 * lantern element; while running it becomes Stop.
 */
export function Composer({
  value, onChange, onSend, onStop, running, phase, elapsed, placeholder, controls, attachments, autocomplete, disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  phase?: string
  elapsed?: string
  placeholder: string
  controls: ReactNode
  attachments?: ReactNode
  /** Popover content rendered above the box for slash commands and skills. */
  autocomplete?: ReactNode
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !disabled

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      {running && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-3" role="status">
          <StatusLamp status="running" label={phase ?? "Working"} />
          {elapsed && <span className="tabular">{elapsed}</span>}
        </div>
      )}
      <div className="relative">
        {autocomplete && (
          <div className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full overflow-y-auto rounded-card bg-raised p-1 shadow-float">
            {autocomplete}
          </div>
        )}
        <div className="rounded-panel border border-line-strong bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
          {attachments && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{attachments}</div>}
          <Textarea
            ref={ref}
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (canSend && !running) onSend()
              }
            }}
            className="field-sizing-content max-h-52 min-h-11 resize-none border-0 bg-transparent px-3.5 py-3 text-base shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">{controls}</div>
            {running ? (
              <Button variant="destructive" size="sm" onClick={onStop}>
                <Square className="fill-current" /> Stop
              </Button>
            ) : (
              <Button variant="signal" size="sm" onClick={onSend} disabled={!canSend}>
                Send <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-1.5 flex justify-between px-1 text-xs text-ink-3">
        <span>Enter to send, Shift+Enter for a new line</span>
        {value.length > 500 && <span className="tabular">{value.length} characters</span>}
      </p>
    </div>
  )
}
```

```tsx
// file: components/chat/session-list.tsx
import { StatusLamp } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

export interface SessionRow {
  id: string
  title: string
  profile: string
  when: string          // "2h ago"
  group: string         // "Today" | "Yesterday" | "Earlier this week" | "Older"
  running?: boolean
}

export function SessionList({
  sessions, activeId, onSelect, renderMenu,
}: {
  sessions: SessionRow[]
  activeId?: string
  onSelect: (id: string) => void
  /** Overflow menu (SessionMenu) shown on hover and focus. */
  renderMenu: (s: SessionRow) => React.ReactNode
}) {
  const groups = sessions.reduce<Record<string, SessionRow[]>>((acc, s) => {
    ;(acc[s.group] ??= []).push(s)
    return acc
  }, {})

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
      {Object.entries(groups).map(([group, rows]) => (
        <section key={group} aria-label={group} className="flex flex-col gap-0.5">
          <h2 className="px-2 pb-1 font-sans text-xs font-medium tracking-normal text-ink-3">{group}</h2>
          {rows.map((s) => {
            const active = s.id === activeId
            return (
              <div
                key={s.id}
                className={cn(
                  "group/row relative flex items-center rounded-control",
                  active ? "bg-raised" : "hover:bg-raised/60",
                )}
              >
                {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-lantern" />}
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(s.id)}
                  title={s.title}
                  className="min-w-0 flex-1 rounded-control px-2.5 py-1.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="block truncate text-sm text-ink">{s.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                    <span className="truncate">{s.profile}</span>
                    {s.running ? <StatusLamp status="running" label="Running" size="sm" /> : <span>{s.when}</span>}
                  </span>
                </button>
                <div className="pr-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                  {renderMenu(s)}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
```

## 5. Overview

```tsx
// file: features/overview/overview-parts.tsx
import type { ReactNode } from "react"
import type { Status } from "@/api"
import { StatusLamp } from "@/components/ui/status-lamp"
import { cn } from "@/lib/utils"

/** Number in display type, label in sm. A tile is a link, so it gets hover and focus states. */
export function StatTile({
  label, value, hint, status, href,
}: { label: string; value: ReactNode; hint?: string; status?: Status; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-ink-2">
        {status ? <StatusLamp status={status} showLabel={false} /> : null}
        {label}
      </span>
      <span className="tabular font-display text-2xl font-semibold text-ink">{value}</span>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </>
  )
  const cls = cn(
    "flex flex-col gap-1 rounded-panel border border-line bg-surface p-4 outline-none",
    "transition-[border-color] duration-100",
    href && "hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  )
  return href ? <a href={href} className={cls}>{body}</a> : <div className={cls}>{body}</div>
}

export function Panel({
  title, description, actions, className, children,
}: { title: string; description?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-panel border border-line bg-surface p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** Approval pipeline: one segmented bar, colored by status lamp. The only place color fills area. */
export function PipelineBar({ stages }: { stages: { status: Status; label: string; count: number }[] }) {
  const total = stages.reduce((n, s) => n + s.count, 0) || 1
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img"
        aria-label={stages.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {stages.filter((s) => s.count > 0).map((s) => (
          <span key={s.status} style={{ width: `${(s.count / total) * 100}%`, background: `var(--c-st-${s.status})` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {stages.map((s) => (
          <li key={s.status} className="flex items-center gap-1.5 text-xs text-ink-2">
            <StatusLamp status={s.status} showLabel={false} size="sm" />
            {s.label} <span className="tabular text-ink-3">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## 6. Review gate bar (task detail)

```tsx
// file: features/board/ReviewGateBar.tsx
import { Button } from "@/components/ui/button"

export function ReviewGateBar({
  files, added, removed, selectedCount, busy, onReject, onRequestChanges, onApprove,
}: {
  files: number
  added: number
  removed: number
  selectedCount: number
  busy?: boolean
  onReject: () => void
  onRequestChanges: () => void
  onApprove: () => void
}) {
  const partial = selectedCount > 0 && selectedCount < files
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
      <p className="text-sm text-ink-2 tabular">
        {files} {files === 1 ? "file" : "files"}
        <span className="ml-2 text-success">+{added}</span>
        <span className="ml-1 text-danger-text">−{removed}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="destructive" onClick={onReject} disabled={busy}>Reject</Button>
        <Button variant="secondary" onClick={onRequestChanges} disabled={busy}>Request changes</Button>
        <Button variant="signal" loading={busy} onClick={onApprove}>
          {partial ? `Approve ${selectedCount} of ${files} files` : "Approve and commit"}
        </Button>
      </div>
    </div>
  )
}
```

## 7. Sign-in

```tsx
// file: components/auth/auth-page.tsx (layout only; keep your existing submit logic)
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const LAMPS = ["triage", "todo", "ready", "running", "blocked", "review", "done"] as const

export function AuthPage({ onSubmit, error }: { onSubmit: (password: string) => Promise<void>; error?: string }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <main className="board-enter flex min-h-dvh items-center justify-center bg-canvas p-4">
      <form
        className="flex w-full max-w-[360px] flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { await onSubmit(password) } finally { setBusy(false) }
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="font-display text-lg font-semibold text-ink">Switchyard</span>
          {/* Seven track lines, one per status. Draws in once; static under reduced motion. */}
          <div className="flex gap-1" aria-hidden>
            {LAMPS.map((s, i) => (
              <span
                key={s}
                className="track-line w-8"
                style={{ ["--lamp" as string]: `var(--c-st-${s})`, ["--i" as string]: i }}
              />
            ))}
          </div>
        </div>

        <h1 className="text-xl font-semibold text-ink">Sign in to Switchyard</h1>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "password-error" : undefined}
            className="h-9 rounded-control border-line-strong bg-well"
          />
          {error && <p id="password-error" className="text-sm text-danger-text">{error}</p>}
        </div>

        <Button type="submit" size="lg" loading={busy} disabled={!password}>Sign in</Button>
      </form>
    </main>
  )
}
```

## 8. Page recipe: putting a Collection page together

```tsx
// file: features/workspaces/WorkspacesPage.tsx (structure only)
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { FilterBar, FilterChip } from "@/components/app/filter-bar"
import { EmptyState } from "@/components/app/empty-state"

export function WorkspacesPageShell({
  query, onQuery, platform, onPlatform, shown, total, groups, onNew, onPingAll, pinging, renderCard,
}: {
  query: string
  onQuery: (q: string) => void
  platform: string
  onPlatform: (p: string) => void
  shown: number
  total: number
  groups: { label: string; items: unknown[] }[]
  onNew: () => void
  onPingAll: () => void
  pinging: boolean
  renderCard: (item: unknown) => React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title="Workspaces"
        description="Where agents run. Loaded from ~/.hermes/workspaces.yaml."
        actions={
          <>
            <Button variant="secondary" loading={pinging} onClick={onPingAll}><RefreshCw /> Ping all</Button>
            <Button variant="signal" onClick={onNew}><Plus /> New workspace</Button>
          </>
        }
      >
        <FilterBar query={query} onQueryChange={onQuery} placeholder="Search workspaces" shown={shown} total={total}>
          <FilterChip
            label="Platform"
            value={platform}
            onChange={onPlatform}
            options={[
              { value: "all", label: "All" },
              { value: "mac", label: "Mac" },
              { value: "windows", label: "Windows" },
              { value: "linux", label: "Linux" },
            ]}
          />
        </FilterBar>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-6 md:px-6">
        {groups.length === 0 ? (
          <EmptyState
            title={total ? `No workspaces match "${query}"` : "No workspaces yet"}
            hint={total ? undefined : "Add a host that owns your source code so agents can run there."}
            action={total ? undefined : <Button variant="signal" onClick={onNew}>New workspace</Button>}
          />
        ) : (
          groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-3">
              <SectionHeader title={g.label} description={`${g.items.length} ${g.items.length === 1 ? "host" : "hosts"}`} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{g.items.map(renderCard)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
```

## 9. Files to delete once each phase lands

```
components/ui/border-beam.tsx        (chat composer)
components/ui/system-modal.tsx       (replaced by DetailSheet and ConfirmDialog)
components/feedback/glass.tsx
components/feedback/floating-paths.tsx
components/feedback/decor-icon.tsx
components/feedback/ht-loader.tsx
```

Remove `thinking-orbs` and the `.ekg-monitor*`, `.ht-*`, `.border-beam*`, `.chat-running-dot` rules from `index.css` at the same time, then run `pnpm remove thinking-orbs` if nothing else imports it.
