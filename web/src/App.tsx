import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppShell } from "@/components/app/app-shell"
import { AppHeader } from "@/components/app/app-header"
import { Button } from "@/components/ui/button"
import { api, openEventStream, type Board, type Profile, type Status, type Task, type Workspace } from "./api"
import { BoardPage } from "./features/board/BoardPage"
import type { Page } from "./lib/sidebar-preferences"
import CommandPalette from "@/components/app/command-palette"
import { Toaster } from "@/components/app/toaster"
import NotificationCenter from "@/features/notifications/NotificationCenter"
import { NewBoardDialog, EditBoardDialog } from "./components/board/board-dialogs"
import { MoreHorizontal, Pencil, Plus } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { pagePath, parseRoute } from "./lib/routes"
import LoadingState from "@/components/feedback/loading-state"

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
const EcosystemPage = lazy(() => import("./features/ecosystem/EcosystemPage"))
const ChatPage = lazy(() => import("./features/chat/ChatPage"))

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
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
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
  const tasks = useQuery({ queryKey: ["tasks", slug], queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`), enabled: page === "board" })
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
    mutationFn: (id: string) => api(`/api/boards/${slug}/tasks/${id}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", slug] }),
  })

  const currentBoard = (boards.data ?? []).find((b) => b.slug === slug) ?? null

  // The breadcrumb expresses location, not title. It is only populated for a
  // page genuinely nested below its nav entry; every other page carries its own
  // h1 in its page header, so naming it twice would be noise.
  const breadcrumb = detailPage
    ? ["Board", detailPage.title]
    : undefined

  function handleSelectPage(p: Page) {
    if (p === "board") {
      setDetail(null)
      setDetailId(null)
      setPage("board")
      go(pagePath("board", slug))
      return
    }
    setDetail(null)
    setDetailId(null)
    setPage(p)
    if (p === "chat") {
      if (page === "chat") {
        setChatSidebarOpen((value) => !value)
        return
      }
      setChatSidebarOpen(true)
      setChatRouteID(undefined)
      go("/chat")
    } else {
      go(pagePath(p, slug))
    }
  }

  const boardMenuItems = (
    <>
      <DropdownMenuItem onSelect={() => setCreatingBoard(true)}>
        <Plus className="size-4" /> New Board
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!currentBoard} onSelect={() => setEditingBoard(true)}>
        <Pencil className="size-4" /> Edit Board
      </DropdownMenuItem>
    </>
  )

  const boardMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="outline" className="text-ink-2" aria-label="Board actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{boardMenuItems}</DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <AppShell
      page={page}
      onSelectPage={handleSelectPage}
      onNewChat={() => { setChatSidebarOpen(true); setChatRouteID(undefined); setPage("chat"); go("/chat") }}
      onSettings={() => handleSelectPage("settings")}
      onLogout={() => { void api("/api/auth/logout", { method: "POST" }).then(() => window.location.reload()) }}
      renderHeader={({ hidden, expand }) => (
        <AppHeader
          segments={breadcrumb}
          sidebarHidden={hidden}
          onExpandSidebar={expand}
          right={<NotificationCenter />}
          onOpenPalette={() => setPaletteOpen(true)}
        />
      )}
    >
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        board={currentBoard}
        boards={boards.data ?? []}
        tasks={tasks.data ?? []}
        page={page}
        onPage={handleSelectPage}
        onNewTask={() => setCreating(true)}
        onOpenTask={(id) => { setDetail(null); setDetailId(id); setPage("board"); go(pagePath("board", slug, id)) }}
        onOpenBoard={(nextSlug) => { setDetail(null); setDetailId(null); setSlug(nextSlug); setPage("board"); go(pagePath("board", nextSlug)) }}
      />
      <Toaster />
      <Suspense fallback={<LoadingState variant="detail" label="Loading page" />}>
        {page === "board" && !detailId && (
            <BoardPage
              slug={slug}
              boardName={currentBoard?.name}
              boards={boards.data ?? []}
              onSwitchBoard={(next) => { setSlug(next); go(pagePath("board", next)) }}
              onOpenDetail={setDetail}
              onOpenTaskPage={(id) => { setDetail(null); setDetailId(id); go(pagePath("board", slug, id)) }}
              onNewTask={() => setCreating(true)}
              boardMenu={boardMenu}
            />
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
          {page === "ecosystem" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><EcosystemPage /></div>}
          {page === "chat" && <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><ChatPage profiles={profiles.data ?? []} workspaces={workspaces.data ?? []} initialSessionID={chatSessionID} sidebarOpen={chatSidebarOpen} onSessionChange={(id) => { setChatRouteID(id); go(pagePath("chat", id)) }} /></div>}
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
          {page === "board" && detailId && !detailPage && (
            <LoadingState variant="detail" label="Loading task" />
          )}
      </Suspense>

      <Suspense fallback={<LoadingState variant="detail" label="Memuat dialog" />}>
      {creating && (
        <TaskDialog
          slug={slug}
          workspaces={workspaces.data ?? []}
          profiles={profiles.data ?? []}
          onClose={() => setCreating(false)}
          onCreate={(payload) =>
            api<Task>(`/api/boards/${slug}/tasks`, { method: "POST", body: JSON.stringify(payload) }).then(async (created) => {
              qc.invalidateQueries({ queryKey: ["tasks", slug] })
              return created
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
