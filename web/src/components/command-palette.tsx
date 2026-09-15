import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Command, FilePlus, LayoutGrid, Search, Settings, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import type { Board, Task } from "@/api"
import type { Page } from "@/lib/sidebar-preferences"
import { cn } from "@/lib/utils"

type CommandItem = {
  id: string
  label: string
  group: string
  icon?: ComponentType<{ className?: string }>
  hint?: string
  keywords?: string
  run: () => void
}

function fuzzyScore(needle: string, hay: string): number {
  if (!needle) return 1
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  if (h.includes(n)) return 2 + n.length / h.length
  let j = 0
  let score = 0
  for (let i = 0; i < n.length; i++) {
    const idx = h.indexOf(n[i], j)
    if (idx === -1) return 0
    score += 1 / (1 + idx - j)
    j = idx + 1
  }
  return score * 0.6
}

export default function CommandPalette({
  board,
  boards,
  tasks,
  page,
  onPage,
  onNewTask,
  onToggleFilters,
  onOpenTask,
  onOpenBoard,
  open: controlledOpen,
  onOpenChange,
  shortcut = "k",
  placeholder = "Type a command or search…",
  emptyMessage = "No results found.",
}: {
  board: Board | null
  boards?: Board[]
  tasks: Task[]
  page: Page
  onPage: (page: Page) => void
  onNewTask: () => void
  onToggleFilters: () => void
  onOpenTask?: (taskId: string) => void
  onOpenBoard?: (slug: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  shortcut?: string
  placeholder?: string
  emptyMessage?: string
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen! : internalOpen
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setInternalOpen(v)
    if (!v) setQ("")
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = shortcut.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key) {
        e.preventDefault()
        setOpen(true)
        setQ("")
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [shortcut])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
      setActive(0)
    }
  }, [open])

  const items = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      { id: "new-task", label: `New task${board ? ` in ${board.name}` : ""}`, group: "Actions", icon: FilePlus, hint: "N", keywords: "create task new", run: onNewTask },
      { id: "toggle-board", label: page === "board" ? "Open overview" : "Open board", group: "Navigation", icon: LayoutGrid, hint: "G B", keywords: "board overview", run: () => onPage(page === "board" ? "overview" : "board") },
      { id: "settings", label: "Open settings", group: "Navigation", icon: Settings, hint: "G S", keywords: "settings", run: () => onPage("settings") },
      { id: "toggle-filters", label: "Toggle filters", group: "Actions", icon: Command, keywords: "filter toggle", run: onToggleFilters },
    ]
    return base
  }, [board, page, onPage, onNewTask, onToggleFilters])

  const needle = q.trim()

  const filtered = useMemo(() => {
    if (!needle) return { commands: items, boards: boards?.slice(0, 6) ?? [], tasks: [] }
    const scoredCmds = items
      .map((c) => ({ c, s: Math.max(fuzzyScore(needle, c.label), fuzzyScore(needle, c.keywords ?? ""), fuzzyScore(needle, c.group)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)

    const b = (boards ?? [])
      .map((x) => ({ x, s: Math.max(fuzzyScore(needle, x.name), fuzzyScore(needle, x.slug)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.x)

    const t = tasks
      .map((x) => ({ x, s: Math.max(fuzzyScore(needle, x.title), fuzzyScore(needle, x.id)) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.x)

    return { commands: scoredCmds, boards: b, tasks: t }
  }, [needle, items, boards, tasks])

  const flat = useMemo(() => {
    const rows: { key: string; run: () => void }[] = []
    for (const c of filtered.commands) rows.push({ key: `cmd:${c.id}`, run: c.run })
    for (const b of filtered.boards) rows.push({ key: `board:${b.slug}`, run: () => onOpenBoard?.(b.slug) })
    for (const t of filtered.tasks) rows.push({ key: `task:${t.id}`, run: () => { if (onOpenTask) onOpenTask(t.id); else onPage("board") } })
    return rows
  }, [filtered, onOpenBoard, onOpenTask, onPage])

  useEffect(() => {
    setActive((prev) => Math.min(prev, Math.max(0, flat.length - 1)))
  }, [flat.length])

  function runActive() {
    const r = flat[active]
    if (!r) return
    r.run()
    setOpen(false)
  }

  const empty = filtered.commands.length === 0 && filtered.boards.length === 0 && filtered.tasks.length === 0

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 p-4 pt-[12vh] backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="glass-panel-raised w-full max-w-[640px] overflow-hidden rounded-2xl border border-[var(--color-line)] shadow-[0_24px_64px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.06)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div className="relative flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-1">
            <Search className="pointer-events-none size-4 shrink-0 text-[var(--color-ink-3)]" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((v) => Math.min(v + 1, flat.length - 1)) }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((v) => Math.max(v - 1, 0)) }
                else if (e.key === "Enter") { e.preventDefault(); runActive() }
              }}
              placeholder={placeholder}
              className="my-1 h-7 flex-1 border-0 bg-transparent px-0 py-0 text-sm leading-none shadow-none focus-visible:ring-0 focus-visible:border-0"
            />
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd className="h-6 border-[var(--color-line)] bg-[var(--color-inset)] px-1.5 text-[10px]">ESC</Kbd>
            </span>
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="glass-icon-button hidden size-7 items-center justify-center rounded-md sm:inline-flex"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {empty ? (
              <p className="px-3 py-10 text-center text-sm text-[var(--color-ink-3)]">{emptyMessage}</p>
            ) : (
              <div className="space-y-4">
                {filtered.commands.length > 0 && (
                  <Section label="Commands">
                    {filtered.commands.map((c, idx) => {
                      const globalIdx = idx
                      const isActive = globalIdx === active
                      const Icon = c.icon
                      return (
                        <Row
                          key={c.id}
                          active={isActive}
                          onHover={() => setActive(globalIdx)}
                          onClick={() => { c.run(); setOpen(false) }}
                          icon={Icon ? <Icon className="size-3.5" /> : undefined}
                          label={c.label}
                          hint={c.hint}
                        />
                      )
                    })}
                  </Section>
                )}

                {filtered.boards.length > 0 && (
                  <Section label={`Boards · ${filtered.boards.length}`}>
                    {filtered.boards.map((b, i) => {
                      const globalIdx = filtered.commands.length + i
                      const isActive = globalIdx === active
                      return (
                        <Row
                          key={b.slug}
                          active={isActive}
                          onHover={() => setActive(globalIdx)}
                          onClick={() => { onOpenBoard?.(b.slug); setOpen(false) }}
                          icon={<span className="text-sm leading-none">{b.icon || "📋"}</span>}
                          label={b.name}
                          meta={b.slug}
                        />
                      )
                    })}
                  </Section>
                )}

                {filtered.tasks.length > 0 && (
                  <Section label={`Tasks · ${filtered.tasks.length}`}>
                    {filtered.tasks.map((t, i) => {
                      const globalIdx = filtered.commands.length + filtered.boards.length + i
                      const isActive = globalIdx === active
                      return (
                        <Row
                          key={t.id}
                          active={isActive}
                          onHover={() => setActive(globalIdx)}
                          onClick={() => { if (onOpenTask) onOpenTask(t.id); else onPage("board"); setOpen(false) }}
                          label={t.title}
                          meta={t.id.slice(0, 8)}
                          right={t.status}
                        />
                      )
                    })}
                  </Section>
                )}

                {!needle && (
                  <p className="px-2 pb-1 pt-1 text-center text-[11px] text-[var(--color-ink-4)]">
                    Type to filter · <span className="text-[var(--color-ink-3)]">↑↓</span> navigate · <span className="text-[var(--color-ink-3)]">↵</span> select
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-inset)_45%,transparent)] px-3 py-2 text-[11px] text-[var(--color-ink-4)]">
            <span className="inline-flex items-center gap-1.5">
              <Command className="size-3" /> {flat.length} results
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Kbd className="h-5 px-1 text-[10px]">⌘</Kbd>
              <Kbd className="h-5 px-1 text-[10px]">{shortcut.toUpperCase()}</Kbd>
              <span className="ml-1">to open</span>
            </span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Row({
  active,
  onHover,
  onClick,
  icon,
  label,
  meta,
  hint,
  right,
}: {
  active: boolean
  onHover: () => void
  onClick: () => void
  icon?: ReactNode
  label: string
  meta?: string
  hint?: string
  right?: string
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
        active ? "text-[var(--color-ink)]" : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {active && (
        <motion.div
          layoutId="cmd-active"
          className="absolute inset-0 rounded-xl border border-[var(--color-line-strong)] bg-[color-mix(in_srgb,var(--color-accent-tint)_78%,var(--color-surface-raised))] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        />
      )}
      <span className="relative flex min-w-0 flex-1 items-center gap-2.5">
        {icon && <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border bg-[var(--color-inset)] text-[var(--color-ink-3)]", active && "border-[var(--color-line-strong)] text-[var(--color-ink)]")}>{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none">{label}</span>
        {meta && <span className="hidden shrink-0 font-mono text-[11px] text-[var(--color-ink-4)] sm:inline">{meta}</span>}
        {right && <span className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-inset)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-3)]">{right}</span>}
      </span>
      {hint && (
        <span className="relative hidden shrink-0 sm:inline-flex">
          <Kbd className={cn("h-6 border-[var(--color-line)] px-1.5 text-[10px]", active && "border-[var(--color-line-strong)] bg-[var(--color-surface-raised)]")}>{hint}</Kbd>
        </span>
      )}
    </button>
  )
}
