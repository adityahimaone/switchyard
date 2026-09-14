import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app-shell"
import { AppHeader } from "@/components/app-header"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, boardHealth, bulkTasks, COLUMNS, openEventStream, reorderTasks, toastGlobal, type Board, type Profile, type Status, type Task, type Workspace } from "./api"
import TaskCard from "./features/board/TaskCard"
import CommandPalette from "./components/command-palette"
import { Toaster } from "./components/toaster"
const TaskDialog = lazy(() => import("./features/board/TaskDialog"))
const TaskDetail = lazy(() => import("./features/board/TaskDetail"))
const TaskDetailPage = lazy(() => import("./features/board/TaskDetailPage"))
const WorkspacesPage = lazy(() => import("./features/workspaces/WorkspacesPage"))
const ProfilesPage = lazy(() => import("./features/profiles/ProfilesPage"))
const ProvidersPage = lazy(() => import("./features/providers/ProvidersPage"))
const LogsPage = lazy(() => import("./features/logs/LogsPage"))
const SkillsPage = lazy(() => import("./features/skills/SkillsPage"))
const MemoryPage = lazy(() => import("./features/memory/MemoryPage"))
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"))
const OverviewPage = lazy(() => import("./features/overview/OverviewPage"))
const AgentMappingPage = lazy(() => import("./features/flow/AgentMappingPage"))
const KnowledgePage = lazy(() => import("./features/knowledge/KnowledgePage"))
const CronPage = lazy(() => import("./features/cron/CronPage"))
const ChatPage = lazy(() => import("./features/chat/ChatPage"))
import { Archive, CheckSquare, Inbox, Plus, Pencil, Search, X } from "lucide-react"
import { useSettings } from "./hooks/useSettings"
import LoadingState from "./components/LoadingState"
import { pagePath, parseRoute } from "./lib/routes"
import { SIDEBAR_ITEMS, type Page } from "./lib/sidebar-preferences"

const BOARD_COLUMNS: Status[] = [...COLUMNS, "archived"]

const COLUMN_TONES: Record<Status, string> = {
  triage: "kanban-column-cyan",
  todo: "kanban-column-blue",
  scheduled: "kanban-column-violet",
  ready: "kanban-column-indigo",
  running: "kanban-column-amber",
  blocked: "kanban-column-red",
  review: "kanban-column-purple",
  done: "kanban-column-emerald",
  archived: "kanban-column-slate",
}

const PROFILE_OPTIONS = [{ value: "__all", label: "Semua agent" }]
const WORKSPACE_OPTIONS = [{ value: "__all", label: "Semua workspace" }]

function labelForPage(page: Page): string {
  const item = SIDEBAR_ITEMS.find((i) => i.id === page)
  if (item) return item.label
  if (page === "settings") return "Settings"
  return page
}

export default function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.pathname), [])
  const [page, setPage] = useState<Page>(initialRoute.page)
  const [slug, setSlug] = useState(() => initialRoute.slug ?? window.localStorage.getItem("kb-last-board") ?? "default")
  const [creating, setCreating] = useState(false)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [editingBoard, setEditingBoard] = useState(false)
  const [detail, setDetail] = useState<Task | null>(null)
  const [detailId, setDetailId] = useState<string | null>(initialRoute.taskId ?? null)
  const [chatRouteID, setChatRouteID] = useState<string | undefined>(initialRoute.chatSessionID)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [q, setQ] = useState("")
  const [fStatus, setFStatus] = useState("__all")
  const [fAgent, setFAgent] = useState("__all")
  const [fWorkspace, setFWorkspace] = useState("__all")
  const [fPriority, setFPriority] = useState("__all")
  const [viewName, setViewName] = useState("")
  const viewsKey = `kb-views:${slug}`
  const savedViews = useMemo(() => { try { return JSON.parse(window.localStorage.getItem(viewsKey) || "[]") as { name: string; filters: { q: string; fStatus: string; fAgent: string; fWorkspace: string; fPriority: string } }[] } catch { return [] } }, [viewsKey])
  const { refreshMs } = useSettings()
  const qc = useQueryClient()

  useEffect(() => openEventStream((ev) => {
    if (ev.kind === "workspace_ping" || ev.kind === "workspace_updated" || ev.kind === "workspace_deleted") {
      qc.invalidateQueries({ queryKey: ["workspaces"] })
      return
    }
    if (ev.kind === "node_health") {
      qc.invalidateQueries({ queryKey: ["nodes"] })
      return
    }
    if (ev.data?.board && ev.data.board !== slug) return
    qc.invalidateQueries({ queryKey: ["tasks", slug] })
    qc.invalidateQueries({ queryKey: ["board-health", slug] })
    if (ev.data?.task_id) qc.invalidateQueries({ queryKey: ["events", slug, ev.data.task_id] })
  }), [qc, slug])

  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api<Board[]>("/api/boards") })
  const tasks = useQuery({ queryKey: ["tasks", slug], queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`), enabled: page === "board", refetchInterval: refreshMs > 0 ? refreshMs : false })
  const healthMap = useQuery({ queryKey: ["board-health", slug], queryFn: () => boardHealth(slug), enabled: page === "board", refetchInterval: 10_000 })
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api<Workspace[]>("/api/workspaces") })
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api<Profile[]>("/api/profiles") })

  const detailPage = detailId ? (tasks.data ?? []).find((task) => task.id === detailId) ?? null : null
  const chatSessionID = chatRouteID

  useEffect(() => {
    window.localStorage.setItem("kb-last-board", slug)
  }, [slug])

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", pagePath(initialRoute.page, initialRoute.slug ?? slug, initialRoute.taskId))
    }
    const onPopState = () => {
      const route = parseRoute(window.location.pathname)
      setPage(route.page)
      setSlug(route.slug ?? window.localStorage.getItem("kb-last-board") ?? "default")
      setDetailId(route.taskId ?? null)
      setDetail(null)
      setChatRouteID(route.chatSessionID ?? undefined)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function go(path: string) {
    window.history.pushState({}, "", path)
  }

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api(`/api/boards/${slug}/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  })

  const reassign = useMutation({
    mutationFn: ({ id, assignee }: { id: string; assignee: string }) =>
      api(`/api/boards/${slug}/tasks/${id}/assignee`, { method: "PATCH", body: JSON.stringify({ assignee }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  })

  const stop = useMutation({
    mutationFn: (id: string) =>
      api(`/api/boards/${slug}/tasks/${id}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  })

  const active = (boards.data ?? []).filter((b) => !b.archived)
  const archivedBoards = (boards.data ?? []).filter((b) => b.archived)
  const currentBoard = (boards.data ?? []).find((b) => b.slug === slug) ?? null

  const filtered = useMemo(() => {
    let list = tasks.data ?? []
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.body ?? "").toLowerCase().includes(needle) ||
        t.id.toLowerCase().includes(needle) ||
        (t.result ?? "").toLowerCase().includes(needle),
      )
    }
    if (fStatus !== "__all") list = list.filter((t) => t.status === fStatus)
    if (fAgent !== "__all") list = list.filter((t) => (t.assignee || "") === fAgent)
    if (fWorkspace !== "__all") list = list.filter((t) => t.workspace_path === fWorkspace)
    if (fPriority !== "__all") list = list.filter((t) => String(t.priority) === fPriority)
    return list
  }, [tasks.data, q, fStatus, fAgent, fWorkspace, fPriority])

  const filtersActive = q.trim() !== "" || fStatus !== "__all" || fAgent !== "__all" || fWorkspace !== "__all" || fPriority !== "__all"

  function clearFilters() {
    setQ(""); setFStatus("__all"); setFAgent("__all"); setFWorkspace("__all"); setFPriority("__all")
  }
  function saveView() {
    const name = viewName.trim(); if (!name) return
    const next = [...savedViews.filter((v) => v.name !== name), { name, filters: { q, fStatus, fAgent, fWorkspace, fPriority } }]
    window.localStorage.setItem(viewsKey, JSON.stringify(next)); setViewName(""); toastGlobal(`Saved view: ${name}`, "success")
  }
  function applyView(name: string) {
    const v = savedViews.find((x) => x.name === name); if (!v) return
    setQ(v.filters.q); setFStatus(v.filters.fStatus); setFAgent(v.filters.fAgent); setFWorkspace(v.filters.fWorkspace); setFPriority(v.filters.fPriority)
  }
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ status: Status; index: number } | null>(null)
  const [taskOrder, setTaskOrder] = useState<Record<string, string[]>>({})
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  function toggleTask(id: string, next: boolean) {
    setSelectedTasks((current) => {
      const updated = new Set(current)
      if (next) updated.add(id); else updated.delete(id)
      return updated
    })
  }

  async function bulkMove(status: Status) {
    await bulkTasks(slug, { ids: [...selectedTasks], action: "move", status })
    setSelectedTasks(new Set())
    await qc.invalidateQueries({ queryKey: ["tasks", slug] })
  }

  async function bulkArchive() {
    await bulkTasks(slug, { ids: [...selectedTasks], action: "archive" })
    setSelectedTasks(new Set())
    await qc.invalidateQueries({ queryKey: ["tasks", slug] })
  }

  const byCol = (s: Status) => {
    const cards = filtered.filter((t) => t.status === s)
    const order = taskOrder[s] ?? []
    return [...cards].sort((a, b) => {
      const ai = order.indexOf(a.id); const bi = order.indexOf(b.id)
      if (ai < 0 && bi < 0) return 0
      if (ai < 0) return 1
      if (bi < 0) return -1
      return ai - bi
    })
  }

  function reorderTask(id: string, status: Status, index: number) {
    const t = (tasks.data ?? []).find((x) => x.id === id)
    const sourceStatus = t?.status as Status | undefined
    setTaskOrder((current) => {
      const next: Record<string, string[]> = { ...current }
      // build id lists for every column from current orders + filtered fallback, then strip dragged id
      for (const key of BOARD_COLUMNS) {
        const fallback = filtered.filter((x) => x.status === key).map((x) => x.id)
        const base = (current[key] ?? fallback).filter((taskId) => taskId !== id)
        // keep order stable: if base came from current, fallback ids not yet in base stay at end
        if (current[key]) {
          for (const fid of fallback) if (!base.includes(fid) && fid !== id) base.push(fid)
        }
        next[key] = base
      }
      const list = next[status] ?? []
      let insertAt = Math.max(0, Math.min(index, list.length))
      if (sourceStatus === status) {
        const fallback = filtered.filter((x) => x.status === status).map((x) => x.id)
        const currentOrder = current[status] ?? fallback
        const sourceIdx = currentOrder.indexOf(id)
        if (sourceIdx >= 0 && sourceIdx < insertAt) insertAt -= 1
      }
      list.splice(insertAt, 0, id)
      next[status] = list
      if (status !== sourceStatus || next[status]) {
        void reorderTasks(slug, next[status] ?? [id]).catch(() => undefined)
      }
      return next
    })
  }

  const breadcrumb =
    detailPage
      ? { title: detailPage.title }
      : { title: page === "board" ? "Task Board" : labelForPage(page) }

  function handleSelectPage(p: Page) {
    if (p === "board") {
      if (detailId) { setDetail(null); setDetailId(null); setPage("board"); go(pagePath("board", slug)); return }
      if (page === "board") { setFiltersOpen((v) => !v); return }
      setDetail(null); setPage("board"); go(pagePath("board", slug))
      return
    }
    setDetail(null)
    setDetailId(null)
    setPage(p)
    if (p === "chat") {
      setChatRouteID(undefined)
      go("/chat")
    } else {
      go(pagePath(p, slug))
    }
  }

  const boardBody =
    tasks.isLoading ? (
      <LoadingState variant="board" label="Memuat kanban" />
    ) : tasks.isError ? (
      <p className="p-6 text-sm text-red-400">Gagal load tasks: {(tasks.error as Error).message}</p>
    ) : (
      <main className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3">
        {BOARD_COLUMNS.map((col) => {
          const cards = byCol(col)
          return (
          <section
            key={col}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              if (e.target === e.currentTarget || !cards.length) setDropTarget({ status: col, index: cards.length })
            }}
            onDrop={(e) => {
              e.preventDefault()
              const raw = draggingId || e.dataTransfer.getData("text/plain")
              if (!raw) return
              const t = (tasks.data ?? []).find((x) => x.id === raw)
              if (!t) return
              const target = dropTarget && dropTarget.status === col ? dropTarget : { status: col, index: cards.length }
              if (t.status === "running" && col !== "blocked" && col !== "done" && col !== "review") return
              reorderTask(t.id, col, target.index)
              setDraggingId(null); setDropTarget(null)
              if (t.status !== col) move.mutate({ id: t.id, status: col })
            }}
            className={`kanban-column ${COLUMN_TONES[col]} flex h-full shrink-0 flex-col overflow-hidden rounded-xl border border-line/70 bg-surface/60 backdrop-blur supports-[backdrop-filter]:bg-surface/60 ${col === "archived" ? "w-60 opacity-90" : "w-72"} ${dropTarget?.status === col ? "ring-1 ring-[var(--color-accent)]" : ""}`}
          >
            <h2 className="kanban-column-title flex shrink-0 items-center justify-between px-3 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <span className="flex items-center gap-1.5">
                {col === "archived" && <Archive className="size-3" />}
                {col}
              </span>
              <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px]">{cards.length}</span>
            </h2>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
              {cards.map((t, index) => (
                <div key={t.id} onDragOver={(e) => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setDropTarget({ status: col, index: index + (e.clientY < rect.top + rect.height / 2 ? 0 : 1) }) }}>
                  {dropTarget?.status === col && dropTarget.index === index && draggingId !== t.id && (
                    <div className="kanban-drop-placeholder mb-2 flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--column-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--column-accent)_10%,transparent)] text-[color-mix(in_srgb,var(--column-accent)_70%,var(--color-ink-3))]">
                      <span className="text-[11px] font-medium tracking-wide">Lepas di sini</span>
                      <span className="text-[10px] opacity-70">geser kartu lain ke bawah</span>
                    </div>
                  )}
                  <TaskCard
                    task={t}
                    onOpen={() => setDetail(t)}
                    onOpenPage={() => { setDetail(null); setDetailId(t.id); go(pagePath("board", slug, t.id)) }}
                    onMove={(s) => move.mutate({ id: t.id, status: s })}
                    onStop={() => { stop.mutate(t.id) }}
                    onReassign={(a) => reassign.mutate({ id: t.id, assignee: a })}
                    onDragStart={setDraggingId}
                    onDragEnd={() => { setDraggingId(null); setDropTarget(null) }}
                    profiles={profiles.data ?? []}
                    health={healthMap.data?.[t.id]}
                    workspaces={workspaces.data ?? []}
                    selected={selectedTasks.has(t.id)}
                    onToggleSelect={bulkMode ? toggleTask : undefined}
                  />
                </div>
              ))}
              {dropTarget?.status === col && dropTarget.index === cards.length && draggingId && (
                <div className="kanban-drop-placeholder flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--column-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--column-accent)_10%,transparent)] text-[color-mix(in_srgb,var(--column-accent)_70%,var(--color-ink-3))]">
                  <span className="text-[11px] font-medium tracking-wide">Lepas di sini</span>
                  <span className="text-[10px] opacity-70">posisi paling bawah</span>
                </div>
              )}
              {!cards.length && (
                draggingId ? (
                  <div className="kanban-drop-placeholder flex min-h-[104px] flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--column-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--column-accent)_8%,transparent)] text-[color-mix(in_srgb,var(--column-accent)_70%,var(--color-ink-3))]">
                    <Inbox className="size-5 opacity-70" />
                    <span className="text-[11px] font-medium tracking-wide">Lepas di sini</span>
                  </div>
                ) : (
                  <div className="flex min-h-[104px] flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-inset)_40%,transparent)] px-3 py-6 text-center">
                    <Inbox className="size-5 text-[color-mix(in_srgb,var(--column-accent)_55%,transparent)]" />
                    <span className="text-[11px] font-medium text-neutral-500">Belum ada task</span>
                    <span className="text-[10px] leading-snug text-neutral-600">Tarik kartu ke sini atau buat baru</span>
                  </div>
                )
              )}
            </div>
          </section>
          )
        })}
      </main>
    )

  const filterRail = page === "board" && !detailId && filtersOpen && (
    <aside className="glass-panel flex h-full w-72 shrink-0 flex-col rounded-none border-y-0 border-l-0">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Filters</span>
        {filtersActive && <span className="size-2 rounded-full bg-[var(--color-accent)]" />}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-300">{filtered.length} / {tasks.data?.length ?? 0} match</span>
            {filtersActive && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px] text-neutral-400" onClick={clearFilters}>
                <X className="size-3" /> reset
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul / body / id / result…"
              className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] pl-7 text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Status</label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger size="sm" className="w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                <SelectItem value="__all" className="text-xs">Semua status</SelectItem>
                {BOARD_COLUMNS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Agent</label>
            <Select value={fAgent} onValueChange={setFAgent}>
              <SelectTrigger size="sm" className="w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                {PROFILE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
                {(profiles.data ?? []).map((p) => (
                  <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>
                ))}
                <SelectItem value="" className="text-xs">unassigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-neutral-500">Workspace</label>
            <Select value={fWorkspace} onValueChange={setFWorkspace}>
              <SelectTrigger size="sm" className="w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                {WORKSPACE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
                {(workspaces.data ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.path} className="text-xs">{w.name}</SelectItem>
                ))}
                <SelectItem value="" className="text-xs">scratch (no path)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Priority</label>
          <Select value={fPriority} onValueChange={setFPriority}>
            <SelectTrigger size="sm" className="w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
              <SelectItem value="__all" className="text-xs">Semua</SelectItem>
              <SelectItem value="0" className="text-xs">P0 normal</SelectItem>
              <SelectItem value="1" className="text-xs">P1</SelectItem>
              <SelectItem value="2" className="text-xs">P2 high</SelectItem>
              <SelectItem value="3" className="text-xs">P3 urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-neutral-500">Saved views</label>
          <div className="flex gap-1.5">
            <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Nama view…" className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
            <Button variant="outline" size="sm" disabled={!viewName.trim()} onClick={saveView} className="shrink-0 border-[var(--color-line)] text-xs">Save</Button>
          </div>
          {savedViews.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {savedViews.map((v) => (
                <button key={v.name} onClick={() => applyView(v.name)} className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-neutral-400 hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]">{v.name}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  )

  const headerControls = page === "board" && !detailId ? (
    <div className="flex min-w-0 items-center gap-2">
      <Select value={slug} onValueChange={(next) => { setSlug(next); go(pagePath("board", next)) }}>
        <SelectTrigger size="sm" className="w-auto gap-1.5 border-[var(--color-line)] bg-[var(--color-bg)] text-xs">
          <SelectValue placeholder="board" />
        </SelectTrigger>
        <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
          {active.map((b) => (
            <SelectItem key={b.slug} value={b.slug} className="text-xs">
              {b.icon ? `${b.icon} ` : ""}{b.name}
            </SelectItem>
          ))}
          {active.length > 0 && archivedBoards.length > 0 && <SelectItem value="__sep" disabled className="text-[10px]">— archived —</SelectItem>}
          {archivedBoards.map((b) => (
            <SelectItem key={b.slug} value={b.slug} className="text-xs text-neutral-500">
              {b.icon ? `${b.icon} ` : ""}{b.name} (archived)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={() => setCreatingBoard(true)} className="gap-1 border-[var(--color-line)] bg-[var(--color-surface)] text-neutral-300">
        <Plus className="size-3.5" /> New Board
      </Button>
      <Button variant="outline" size="sm" onClick={() => setEditingBoard(true)} disabled={!currentBoard} className="gap-1 border-[var(--color-line)] bg-[var(--color-surface)] text-neutral-300 disabled:opacity-40">
        <Pencil className="size-3.5" /> Edit
      </Button>
      <Separator orientation="vertical" className="h-5" />
      <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-neutral-400">
        {filtersActive ? `${filtered.length}/${tasks.data?.length ?? 0}` : `${tasks.data?.length ?? 0}`} tasks
      </span>
      <Button size="sm" variant={bulkMode ? "default" : "outline"} onClick={() => { setBulkMode((v) => !v); if (bulkMode) setSelectedTasks(new Set()) }} className={`gap-1 border-[var(--color-line)] ${bulkMode ? "bg-[var(--color-accent)] text-black" : "bg-[var(--color-surface)] text-neutral-300"}`}>
        <CheckSquare className="size-3.5" /> Bulk
      </Button>
      <Button size="sm" onClick={() => setCreating(true)}
        className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
        <Plus className="size-3.5" /> New Task
      </Button>
    </div>
  ) : detailId ? (
    <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">{detailId}</span>
  ) : null

  return (
    <AppShell
      page={page}
      onSelectPage={handleSelectPage}
      header={
        <AppHeader
          breadcrumb={breadcrumb}
          right={headerControls}
          onSettings={() => handleSelectPage("settings")}
          onLogout={() => { void api("/api/auth/logout", { method: "POST" }).then(() => window.location.reload()) }}
        />
      }
    >
      <CommandPalette
        board={currentBoard}
        boards={boards.data ?? []}
        tasks={tasks.data ?? []}
        page={page}
        onPage={handleSelectPage}
        onNewTask={() => setCreating(true)}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        onOpenTask={(id) => { setDetail(null); setDetailId(id); setPage("board"); go(pagePath("board", slug, id)) }}
        onOpenBoard={(nextSlug) => { setDetail(null); setDetailId(null); setSlug(nextSlug); setPage("board"); go(pagePath("board", nextSlug)) }}
      />
      <Toaster />
      {filterRail}
      <Suspense fallback={<LoadingState variant="detail" label="Memuat halaman" />}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {page === "board" && !detailId && bulkMode && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs">
            <span className="font-medium text-neutral-200">{selectedTasks.size} selected</span>
            <Button size="sm" variant="outline" disabled={!selectedTasks.size} onClick={() => void bulkMove("ready")}>Move ready</Button>
            <Button size="sm" variant="outline" disabled={!selectedTasks.size} onClick={() => void bulkMove("blocked")}>Block</Button>
            <Button size="sm" variant="outline" disabled={!selectedTasks.size} onClick={() => void bulkArchive()} className="gap-1 text-neutral-400 hover:text-red-400"><Archive className="size-3" /> Archive</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedTasks(new Set())}>Clear</Button>
          </div>
        )}
        {page === "workspaces" && <div className="flex-1 overflow-y-auto"><WorkspacesPage /></div>}
        {page === "profiles" && <div className="flex-1 overflow-y-auto"><ProfilesPage /></div>}
        {page === "providers" && <div className="flex-1 overflow-y-auto"><ProvidersPage /></div>}
        {page === "logs" && <div className="flex min-h-0 flex-1 flex-col"><LogsPage /></div>}
        {page === "skills" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><SkillsPage /></div>}
        {page === "memory" && <div className="flex-1 overflow-y-auto"><MemoryPage /></div>}
        {page === "overview" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><OverviewPage /></div>}
        {page === "settings" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><SettingsPage /></div>}
        {page === "agent-mapping" && <div className="flex min-h-0 flex-1 overflow-hidden"><AgentMappingPage /></div>}
        {page === "knowledge" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><KnowledgePage /></div>}
        {page === "cron" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><CronPage /></div>}
        {page === "chat" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><ChatPage profiles={profiles.data ?? []} workspaces={workspaces.data ?? []} initialSessionID={chatSessionID} onSessionChange={(id) => { setChatRouteID(id); go(pagePath("chat", id)) }} /></div>}
        {page === "board" && detailId && detailPage && (
          <TaskDetailPage
            slug={slug}
            task={detailPage}
            profiles={profiles.data ?? []}
            workspaces={workspaces.data ?? []}
            onBack={() => { setDetailId(null); go(pagePath("board", slug)) }}
            onMove={(s) => move.mutateAsync({ id: detailPage.id, status: s }).then(() => undefined)}
            onStop={() => stop.mutateAsync(detailPage.id).then(() => undefined)}
            onReassign={(a) => reassign.mutateAsync({ id: detailPage.id, assignee: a }).then(() => undefined)}
          />
        )}
        {page === "board" && detailId && !detailPage && (tasks.isLoading ? <LoadingState variant="detail" label="Memuat detail task" /> : <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-400">Task `{detailId}` tidak ditemukan di board ini.</div>)}
        {page === "board" && !detailId && boardBody}
      </div>
      </Suspense>

      <Suspense fallback={<LoadingState variant="detail" label="Memuat dialog" />}>
      {creating && (
        <TaskDialog
          workspaces={workspaces.data ?? []}
          profiles={profiles.data ?? []}
          onClose={() => setCreating(false)}
          onCreate={(payload) =>
            api(`/api/boards/${slug}/tasks`, { method: "POST", body: JSON.stringify(payload) }).then(() => {
              qc.invalidateQueries({ queryKey: ["tasks", slug] })
              setCreating(false)
            })
          }
        />
      )}
      {creatingBoard && (
        <NewBoardDialog
          onClose={() => setCreatingBoard(false)}
          onCreated={(b) => {
            qc.invalidateQueries({ queryKey: ["boards"] })
            if (b?.slug) setSlug(b.slug)
            setCreatingBoard(false)
          }}
        />
      )}
      {editingBoard && currentBoard && (
        <EditBoardDialog
          board={currentBoard}
          onClose={() => setEditingBoard(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["boards"] })
            setEditingBoard(false)
          }}
        />
      )}
      {detail && !detailId && (
        <TaskDetail
          slug={slug}
          task={detail}
          profiles={profiles.data ?? []}
          workspaces={workspaces.data ?? []}
          onClose={() => setDetail(null)}
          onMove={(s) => move.mutateAsync({ id: detail.id, status: s }).then(() => setDetail({ ...detail, status: s }))}
          onStop={() => stop.mutateAsync(detail.id).then(() => setDetail({ ...detail, status: "blocked" }))}
          onReassign={(a) =>
            reassign.mutateAsync({ id: detail.id, assignee: a }).then(() => setDetail({ ...detail, assignee: a }))
          }
          onOpenPage={() => { const t = detail; setDetail(null); setDetailId(t.id); go(pagePath("board", slug, t.id)) }}
        />
      )}
      </Suspense>
    </AppShell>
  )
}

function NewBoardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Board | null) => void }) {
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🗂")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!slug.trim()) { setErr("Slug required"); return }
    setBusy(true); setErr(null)
    try {
      const b = await api<Board>("/api/boards", {
        method: "POST",
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), name: name.trim(), icon }),
      })
      onCreated(b)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel-raised w-full max-w-sm rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">New Board</h2>
        <label className="mt-3 block text-xs text-neutral-400">Slug</label>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="f8-gadjian"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
        <label className="mt-3 block text-xs text-neutral-400">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="F8 Gadjian"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
        <label className="mt-3 block text-xs text-neutral-400">Icon (emoji)</label>
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-20 border-[var(--color-line)] bg-[var(--color-bg)]" />
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EditBoardDialog({ board, onClose, onSaved }: { board: Board; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(board.name)
  const [icon, setIcon] = useState(board.icon)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setErr("Name required"); return }
    setBusy(true); setErr(null)
    try {
      await api(`/api/boards/${board.slug}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), icon }),
      })
      onSaved()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel-raised w-full max-w-sm rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Edit Board · {board.slug}</h2>
        <label className="mt-3 block text-xs text-neutral-400">Slug (read-only)</label>
        <Input value={board.slug} disabled className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)] opacity-60" />
        <label className="mt-3 block text-xs text-neutral-400">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
        <label className="mt-3 block text-xs text-neutral-400">Icon (emoji)</label>
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-20 border-[var(--color-line)] bg-[var(--color-bg)]" />
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
