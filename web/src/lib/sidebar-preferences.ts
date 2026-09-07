import type { LucideIcon } from "lucide-react"
import { Bot, Brain, FolderGit2, Gauge, GitBranch, LayoutDashboard, Network, Puzzle, ScrollText, Server } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

export type Page = "overview" | "board" | "command-center" | "workspaces" | "profiles" | "providers" | "logs" | "skills" | "memory" | "flow" | "agent-mapping" | "settings"

export type SidebarItem = {
  id: Exclude<Page, "settings">
  label: string
  tooltip: string
  icon: LucideIcon
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "overview", label: "Overview", tooltip: "Overview", icon: Gauge },
  { id: "board", label: "Kanban Board", tooltip: "Kanban Board", icon: LayoutDashboard },
  { id: "workspaces", label: "Workspaces", tooltip: "Workspaces", icon: FolderGit2 },
  { id: "profiles", label: "Agent Profiles", tooltip: "Agent Profiles", icon: Bot },
  { id: "providers", label: "Providers", tooltip: "Providers", icon: Server },
  { id: "logs", label: "Logs", tooltip: "Hermes Logs", icon: ScrollText },
  { id: "skills", label: "Skills", tooltip: "Skills", icon: Puzzle },
  { id: "memory", label: "Memory", tooltip: "Memory", icon: Brain },
  { id: "flow", label: "Agent Flow", tooltip: "Agent Flow", icon: GitBranch },
  { id: "agent-mapping", label: "Flow Map", tooltip: "Flow Map", icon: Network },
]

export const DEFAULT_SIDEBAR_ORDER = SIDEBAR_ITEMS.map((item) => item.id)
export const SIDEBAR_ORDER_KEY = "kb-sidebar-order"
export const SIDEBAR_VISIBILITY_KEY = "kb-sidebar-visibility"
const CHANGE_EVENT = "kb-sidebar-preferences-change"

type SidebarId = SidebarItem["id"]
type Visibility = Record<SidebarId, boolean>

const defaultVisibility = (): Visibility => Object.fromEntries(DEFAULT_SIDEBAR_ORDER.map((id) => [id, true])) as Visibility

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeOrder(value: unknown): SidebarId[] {
  const known = new Set(DEFAULT_SIDEBAR_ORDER)
  const input = Array.isArray(value) ? value.filter((id): id is SidebarId => typeof id === "string" && known.has(id as SidebarId)) : []
  return [...new Set(input), ...DEFAULT_SIDEBAR_ORDER.filter((id) => !input.includes(id))]
}

function normalizeVisibility(value: unknown): Visibility {
  const fallback = defaultVisibility()
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
  for (const id of DEFAULT_SIDEBAR_ORDER) {
    if (typeof (value as Record<string, unknown>)[id] === "boolean") fallback[id] = (value as Record<SidebarId, boolean>)[id]
  }
  fallback.board = true
  return fallback
}

function persist(order: SidebarId[], visibility: Visibility) {
  try {
    localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(order))
    localStorage.setItem(SIDEBAR_VISIBILITY_KEY, JSON.stringify(visibility))
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useSidebarPreferences() {
  const [order, setOrder] = useState<SidebarId[]>(() => normalizeOrder(read(SIDEBAR_ORDER_KEY, DEFAULT_SIDEBAR_ORDER)))
  const [visibility, setVisibility] = useState<Visibility>(() => normalizeVisibility(read(SIDEBAR_VISIBILITY_KEY, defaultVisibility())))

  useEffect(() => {
    const sync = () => {
      setOrder(normalizeOrder(read(SIDEBAR_ORDER_KEY, DEFAULT_SIDEBAR_ORDER)))
      setVisibility(normalizeVisibility(read(SIDEBAR_VISIBILITY_KEY, defaultVisibility())))
    }
    window.addEventListener("storage", sync)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener("storage", sync)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  function move(id: SidebarId, direction: -1 | 1) {
    const index = order.indexOf(id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return
    const next = [...order]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setOrder(next)
    persist(next, visibility)
  }

  function toggle(id: SidebarId, visible: boolean) {
    if (id === "board") return
    const next = { ...visibility, [id]: visible }
    setVisibility(next)
    persist(order, next)
  }

  function reset() {
    const next = defaultVisibility()
    setOrder(DEFAULT_SIDEBAR_ORDER)
    setVisibility(next)
    persist(DEFAULT_SIDEBAR_ORDER, next)
  }

  const items = useMemo(() => order.map((id) => SIDEBAR_ITEMS.find((item) => item.id === id)!).filter(Boolean), [order])
  const visibleItems = items.filter((item) => visibility[item.id])

  return { items, visibleItems, order, visibility, isVisible: (id: SidebarId) => visibility[id], move, toggle, reset }
}
