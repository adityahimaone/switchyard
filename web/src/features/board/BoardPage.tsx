import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Archive, CheckSquare, Plus, Search, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api, boardHealth, boardLeases, bulkTasks, COLUMNS, reorderTasks, toastGlobal,
  type Profile, type Status, type Task, type Workspace,
} from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/app/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  applyFilters, FilterBar, fieldsFor, firstValuePerField, toFilters, type Filter,
} from "./boardFilters"
import { PageHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"
import TaskCard from "./TaskCard"
import { BoardColumn, useBoardEntrance } from "./BoardColumn"
import LoadingState from "@/components/feedback/loading-state"
import { useSettings } from "@/hooks/useSettings"

const BOARD_COLUMNS: Status[] = [...COLUMNS, "archived"]

/**
 * Horizontal scroll for the column grid, with edges that make it obvious more
 * columns exist. Nine 296px columns do not fit a 1440px viewport, and the board
 * genuinely should scroll; the problem was that a clipped card at the edge gave
 * no hint you could scroll. The shadows appear only when there is actually
 * something in that direction, and they are pointer-events-none so they never
 * swallow a drag.
 */
function BoardScroller({ children, enter }: { children: ReactNode; enter: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <div
        ref={ref}
        onScroll={measure}
        className={cn(
          "flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden p-3",
          "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-8",
          enter && "board-enter",
        )}
      >
        {children}
      </div>
      {edges.left && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-canvas to-transparent" />
      )}
      {edges.right && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent" />
      )}
    </div>
  )
}

interface SavedView {
  name: string
  /**
   * The full token list, when the view was saved with the token bar. This is
   * what preserves operators and multi-value filters, which the four strings
   * below cannot express.
   *
   * Optional on purpose: views saved before the token bar have no `tokens`, and
   * must keep loading rather than silently becoming "no filter".
   */
  tokens?: Filter[]
  filters: { q: string; fStatus: string; fAgent: string; fWorkspace: string; fPriority: string }
}

/**
 * The board: filter toolbar, column grid, drag-and-drop ordering and bulk
 * actions. App owns routing, the shared queries and the task mutations; this
 * owns the board-local state (filters, selection, drag position, saved views).
 */
export function BoardPage({
  slug,
  boardName,
  boards,
  onSwitchBoard,
  onOpenDetail,
  onOpenTaskPage,
  onNewTask,
  boardMenu,
}: {
  slug: string
  /** Current board's display name, for the breadcrumb. */
  boardName?: string
  /** All boards, for the switcher. */
  boards: { slug: string; name: string; icon?: string; archived?: boolean }[]
  onSwitchBoard: (slug: string) => void
  onOpenDetail: (task: Task) => void
  onOpenTaskPage: (taskId: string) => void
  onNewTask: () => void
  boardMenu?: ReactNode
}) {
  const qc = useQueryClient()
  const { refreshMs: pollMs } = useSettings()
  const enterBoard = useBoardEntrance()

  const [q, setQ] = useState("")
  /*
   * The token list is the real filter state.
   *
   * This began as four strings that saved views serialise, with the token bar
   * projected onto them. That could not express an operator or a second token on
   * the same field, and it made the add button disappear, because any token the
   * four strings could not represent disabled the bar that owned it. The four
   * strings now exist only as a fallback when reading a view saved before the
   * token bar existed.
   */
  const [tokens, setTokens] = useState<Filter[]>([])
  const [viewName, setViewName] = useState("")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ status: Status; index: number } | null>(null)

  // The token list is the single source of truth for the field filters; see the
  // note where it is declared.
  const [taskOrder, setTaskOrder] = useState<Record<string, string[]>>({})
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  const viewsKey = `kb-views:${slug}`
  const savedViews = useMemo<SavedView[]>(() => {
    try { return JSON.parse(window.localStorage.getItem(viewsKey) || "[]") as SavedView[] } catch { return [] }
  }, [viewsKey])

  const tasks = useQuery({
    queryKey: ["tasks", slug],
    queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`),
    refetchInterval: pollMs > 0 ? pollMs : false,
  })
  const healthMap = useQuery({
    queryKey: ["board-health", slug],
    queryFn: () => boardHealth(slug),
    refetchInterval: 10_000,
  })
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api<Workspace[]>("/api/workspaces") })
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api<Profile[]>("/api/profiles") })

  // Built from the live workspace and profile lists, so an option that no longer
  // exists cannot be offered as a filter.
  const filterFields = useMemo(
    () => fieldsFor({ profiles: profiles.data ?? [], workspaces: workspaces.data ?? [] }),
    [profiles.data, workspaces.data],
  )

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
    mutationFn: (id: string) => api(`/api/boards/${slug}/tasks/${id}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  })

  // Search is applied here; the field filters come from the token bar, which is
  // their single source of truth. Filtering in two places is how the bar and the
  // old dropdowns drifted apart before.
  const searchMatched = useMemo(() => {
    let list = tasks.data ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter((t) =>
      t.title.toLowerCase().includes(needle) ||
      (t.body ?? "").toLowerCase().includes(needle) ||
      t.id.toLowerCase().includes(needle) ||
      (t.result ?? "").toLowerCase().includes(needle),
    )
  }, [tasks.data, q])

  const filtered = useMemo(() => applyFilters(searchMatched, tokens), [searchMatched, tokens])

  const filtersActive = q.trim() !== "" || tokens.length > 0

  const clearFilters = () => {
    setQ("")
    setTokens([])
  }

  function saveView() {
    const name = viewName.trim()
    if (!name) return
    const next = [
      ...savedViews.filter((v) => v.name !== name),
      // `tokens` carries the operators; the four strings are kept in step so a
      // view saved by an older build, or read by one, still resolves.
      { name, tokens, filters: { q, ...firstValuePerField(tokens) } },
    ]
    window.localStorage.setItem(viewsKey, JSON.stringify(next))
    setViewName("")
    toastGlobal(`Saved view: ${name}`, "success")
  }

  function applyView(name: string) {
    const v = savedViews.find((x) => x.name === name)
    if (!v) return
    setQ(v.filters.q)
    // A view saved before the token bar has no tokens: rebuild them from the
    // four strings so it opens as plain equality filters rather than silently
    // showing everything.
    setTokens(v.tokens ?? toFilters(v.filters))
  }

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
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
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
      for (const key of BOARD_COLUMNS) {
        const fallback = filtered.filter((x) => x.status === key).map((x) => x.id)
        const base = (current[key] ?? fallback).filter((taskId) => taskId !== id)
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

  const total = tasks.data?.length ?? 0

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* The shared PageHeader, so the board's title is a real h1 rather than an
          h2 behind a screen-reader-only h1 that said just "Board" and lost the
          board name. The filter row is its toolbar slot. */}
      <PageHeader
        title={boardName ? `${boardName} board` : "Board"}
        description="Queue, dispatch and review for this board."
        actions={
          <>
            <Select value={slug} onValueChange={onSwitchBoard}>
              <SelectTrigger size="sm" className="w-auto gap-1.5" aria-label="Switch board">
                <SelectValue placeholder="Board" />
              </SelectTrigger>
              <SelectContent>
                {boards.filter((b) => !b.archived).map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.icon ? `${b.icon} ` : ""}{b.name}
                  </SelectItem>
                ))}
                {boards.some((b) => b.archived) && (
                  <>
                    <SelectItem value="__archived" disabled className="text-2xs">
                      Archived
                    </SelectItem>
                    {boards.filter((b) => b.archived).map((b) => (
                      <SelectItem key={b.slug} value={b.slug}>
                        {b.name} (archived)
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {boardMenu}
            <LeaseChips slug={slug} />
            <Button size="sm" variant="signal" onClick={onNewTask}>
              <Plus className="size-3.5" /> New task
            </Button>
          </>
        }
      >
        <div
          role="search"
          aria-label="Filter tasks"
          className="flex flex-wrap items-center gap-2"
        >
        <div className="relative w-full max-w-56">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="pl-8"
          />
        </div>

        <FilterBar
          fields={filterFields}
          value={tokens}
          onChange={setTokens}
          addLabel="Filter"
          emptyLabel="Add filter"
          aria-label="Filter tasks"
        />

        {/* Matches FilterBar's count badge: the board hand-rolled the same bare
            number, so it had the same stray-data look. `h-7` here rather than
            FilterBar's `h-8`, because the board's toolbar is built from
            `size="sm"` controls (h-7) and an h-8 badge would stand taller than
            every other thing in its row. */}
        <Badge
          variant="outline"
          aria-live="polite"
          className="tabular h-7 w-auto flex-none gap-0 self-center border-line bg-well px-2 text-xs font-normal text-ink-3"
        >
          {filtered.length === total ? total : `${filtered.length} of ${total}`}
        </Badge>

        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-ink-3">
            <X className="size-3" /> Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="View name"
            aria-label="Saved view name"
            className="h-8 w-32"
          />
          <Button variant="outline" size="sm" disabled={!viewName.trim()} onClick={saveView}>
            Save view
          </Button>
          {savedViews.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Views</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {savedViews.map((v) => (
                  <DropdownMenuItem key={v.name} onSelect={() => applyView(v.name)}>{v.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            variant={bulkMode ? "secondary" : "outline"}
            onClick={() => { setBulkMode((v) => !v); if (bulkMode) setSelectedTasks(new Set()) }}
            aria-pressed={bulkMode}
          >
            <CheckSquare className="size-3.5" /> Bulk
          </Button>
        </div>
        </div>
      </PageHeader>

      {bulkMode && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-2 text-xs md:px-6">
          <span className="font-medium text-ink tabular">{selectedTasks.size} selected</span>
          <Button size="sm" variant="outline" disabled={!selectedTasks.size} onClick={() => void bulkMove("ready")}>
            Move to Ready
          </Button>
          <Button size="sm" variant="outline" disabled={!selectedTasks.size} onClick={() => void bulkMove("blocked")}>
            Block
          </Button>
          <Button size="sm" variant="ghost" disabled={!selectedTasks.size} onClick={() => void bulkArchive()} className="gap-1 text-danger-text">
            <Archive className="size-3" /> Archive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTasks(new Set())}>Clear</Button>
        </div>
      )}

      {tasks.isLoading ? (
        <LoadingState variant="board" label="Loading board" />
      ) : tasks.isError ? (
        <EmptyState
          title="Couldn't load tasks"
          hint={(tasks.error as Error).message}
          action={<Button variant="secondary" onClick={() => void tasks.refetch()}>Retry</Button>}
        />
      ) : (
        <BoardScroller enter={enterBoard}>
          {BOARD_COLUMNS.map((col, colIndex) => {
            const cards = byCol(col)
            return (
              <BoardColumn
                key={col}
                status={col}
                index={colIndex}
                count={cards.length}
                isOver={dropTarget?.status === col}
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
              >
                {cards.map((t, index) => (
                  <li
                    key={t.id}
                    onDragOver={(e) => {
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDropTarget({ status: col, index: index + (e.clientY < rect.top + rect.height / 2 ? 0 : 1) })
                    }}
                  >
                    {dropTarget?.status === col && dropTarget.index === index && draggingId !== t.id && (
                      <div className="mb-2 flex min-h-[104px] items-center justify-center rounded-card border border-dashed border-line-strong text-xs text-ink-3">
                        Drop here
                      </div>
                    )}
                    <TaskCard
                      task={t}
                      onOpen={() => onOpenDetail(t)}
                      onOpenPage={() => onOpenTaskPage(t.id)}
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
                  </li>
                ))}
                {dropTarget?.status === col && dropTarget.index === cards.length && draggingId && (
                  <li className="flex min-h-[104px] items-center justify-center rounded-card border border-dashed border-line-strong text-xs text-ink-3">
                    Drop at the end
                  </li>
                )}
              </BoardColumn>
            )
          })}
        </BoardScroller>
      )}
    </div>
  )
}

/**
 * LeaseChips shows which declared scopes are currently held, and by whom.
 *
 * A lease means a task is editing those paths right now — or has uncommitted
 * work in review. Seeing that in the header is what makes the board's queue
 * legible: a card in todo that never starts usually means it is waiting on a
 * lease rather than being broken.
 *
 * Only the first few are shown, because a busy board can hold many and the
 * header is not the place for a list.
 */
function LeaseChips({ slug }: { slug: string }) {
  const { data: leases } = useQuery({
    queryKey: ["board-leases", slug],
    queryFn: () => boardLeases(slug),
    // Leases change when a task is claimed or approved, which the SSE stream
    // already signals; polling as well keeps the header honest after a reload
    // or a missed event.
    refetchInterval: 30_000,
    // A board with no leases is the common case, so a failure is not worth
    // surfacing — the chips simply do not appear.
    retry: false,
  })

  const active = leases ?? []
  if (active.length === 0) return null

  const MAX = 3
  return (
    <div className="flex items-center gap-1" aria-label="Held path scopes">
      {active.slice(0, MAX).map((l) => (
        <Badge
          key={`${l.task_id}:${l.glob}`}
          variant="outline"
          className="shrink-0 border-line bg-well px-1.5 py-0 text-2xs leading-none text-ink-3"
          title={`${l.title || l.task_id} (${l.status}) holds ${l.glob}`}
        >
          <span className="font-mono">{l.glob}</span>
        </Badge>
      ))}
      {active.length > MAX && (
        <span
          className="shrink-0 text-2xs text-ink-3"
          title={active.slice(MAX).map((l) => `${l.title || l.task_id}: ${l.glob}`).join("\n")}
        >
          +{active.length - MAX} more
        </span>
      )}
    </div>
  )
}
