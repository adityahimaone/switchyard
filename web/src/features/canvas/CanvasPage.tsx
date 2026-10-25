import { useEffect, useMemo, useState, useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Palette,
  Play,
  Square,
  GitFork,
  Trash2,
  ArrowUpRight,
  Send,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ChevronDown,
  FileCode,
  Radio,
} from "lucide-react"
import { api, toastGlobal, type Workspace } from "../../api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useExecutorModels } from "../board/modelCatalog"
import { CANVAS_PREFILL_KEY, type CanvasPrefill } from "./canvasPrefill"
import { CanvasSandbox } from "./CanvasSandbox"
import { DialKitInspector, type DialKitProps, DEFAULT_DIALKIT_PROPS } from "./DialKitInspector"

export interface CanvasSession {
  id: string
  title: string
  workspace_id: string
  workspace_path: string
  host: string
  worktree_path: string
  branch: string
  port: number
  framework?: string
  status: "ready" | "working" | "error" | "discarded"
  server: "stopped" | "running"
  executor: string
  model: string
  dialkit: boolean
  turns: number
  last_error?: string
  parent_id?: string
  last_active_at: number
  view_url?: string
}

export interface CanvasMessage {
  id: number
  role: "user" | "assistant" | "system"
  content: string
  created_at: number
}

const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

export default function CanvasPage({ workspaces, boardSlug }: { workspaces: Workspace[]; boardSlug: string }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<CanvasPrefill | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const raw = sessionStorage.getItem(CANVAS_PREFILL_KEY)
    if (!raw) return
    sessionStorage.removeItem(CANVAS_PREFILL_KEY)
    try {
      setPrefill(JSON.parse(raw) as CanvasPrefill)
      setCreating(true)
    } catch {
      /* ignore a corrupt handoff */
    }
  }, [])

  const sessions = useQuery({
    queryKey: ["canvas-sessions"],
    queryFn: () => api<CanvasSession[]>("/api/canvas/sessions"),
    refetchInterval: 5000,
  })

  // Keyboard shortcut Cmd+[ to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault()
        setSidebarOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 relative overflow-hidden bg-background">
      {/* Left Sidebar */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-[var(--c-line)] bg-background/50 transition-all duration-150 ease-out z-10",
          sidebarOpen ? "w-72" : "w-0 border-r-0 overflow-hidden opacity-0 pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--c-line)]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="size-4 text-accent" /> Canvas Studio
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs active:scale-[0.97] transition-transform"
              onClick={() => {
                setCreating(true)
                setSelected(null)
              }}
            >
              <Plus className="size-3.5 mr-1" /> New
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-ink-3 hover:text-ink-1"
              onClick={() => setSidebarOpen(false)}
              title="Collapse Sidebar (Cmd+[)"
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {(sessions.data ?? []).length === 0 && !sessions.isLoading && (
            <p className="px-2 text-xs text-ink-3 leading-relaxed">
              No canvases yet. A canvas is a live, source-backed brainstorm workspace built with /create-canvas in an
              isolated git worktree.
            </p>
          )}
          {(sessions.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelected(s.id)
                setCreating(false)
              }}
              className={cn(
                "w-full rounded-control px-2.5 py-2 text-left text-sm transition-colors duration-100 hover:bg-accent-tint group relative",
                selected === s.id && "bg-accent-tint font-medium",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.title}</span>
                <StatusDot s={s} />
              </div>
              <div className="truncate text-[11px] text-ink-3 mt-0.5">{s.branch}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Studio Viewport */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col relative">
        {creating ? (
          <NewCanvas
            workspaces={workspaces}
            prefill={prefill}
            onCreated={(s) => {
              qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
              setSelected(s.id)
              setCreating(false)
              setPrefill(null)
            }}
          />
        ) : selected ? (
          <StudioSessionView
            key={selected}
            id={selected}
            boardSlug={boardSlug}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onGone={() => {
              setSelected(null)
              qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
            }}
            onOpen={(id) => {
              setSelected(id)
              qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-3">
            {!sidebarOpen && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 active:scale-[0.97]"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen className="size-3.5" /> Show Canvases
              </Button>
            )}
            <div className="flex flex-col items-center text-center max-w-sm px-4">
              <Palette className="size-10 text-ink-3/40 mb-3" />
              <p className="text-sm font-medium text-ink-1">Select a canvas or create a new one</p>
              <p className="text-xs text-ink-3 mt-1">
                Brainstorm, tune live React components with DialKit, and promote variations to tasks.
              </p>
              <Button
                size="sm"
                className="mt-4 gap-1.5 active:scale-[0.97]"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-3.5" /> Create Canvas
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function StatusDot({ s }: { s: CanvasSession }) {
  if (s.status === "working") return <Loader2 className="size-3.5 animate-spin text-accent" />
  const color = s.status === "error" ? "bg-red-500" : s.server === "running" ? "bg-emerald-500" : "bg-ink-3/50"
  return <span className={cn("size-2 rounded-full", color)} title={`${s.status} · server ${s.server}`} />
}

function NewCanvas({
  workspaces,
  prefill,
  onCreated,
}: {
  workspaces: Workspace[]
  prefill: CanvasPrefill | null
  onCreated: (s: CanvasSession) => void
}) {
  const usable = useMemo(
    () => workspaces.filter((w) => (w.os ?? "").toLowerCase() !== "windows" && !/^[A-Za-z]:|\\/.test(w.path)),
    [workspaces],
  )
  const options: SearchSelectOption[] = usable.map((w) => ({
    value: w.id,
    label: w.name,
    sublabel: w.path,
    keywords: [w.path, ...(w.labels ?? [])],
  }))
  const [workspaceId, setWorkspaceId] = useState("")
  const [title, setTitle] = useState(prefill?.title ?? "")
  const [brief, setBrief] = useState(prefill?.brief ?? "")
  const [executor, setExecutor] = useState("dsh")
  const [model, setModel] = useState("")
  const [dialkit, setDialkit] = useState(true) // Auto-enabled by default for instant tuning
  const { models } = useExecutorModels(executor)

  useEffect(() => {
    if (workspaceId || !prefill?.workspacePath) return
    const hit = usable.find((w) => w.path === prefill.workspacePath)
    if (hit) setWorkspaceId(hit.id)
  }, [prefill, usable, workspaceId])

  const create = useMutation({
    mutationFn: () => post<CanvasSession>("/api/canvas/sessions", { workspace_id: workspaceId, title, brief, executor, model, dialkit }),
    onSuccess: onCreated,
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto p-6">
      <div>
        <h2 className="text-base font-semibold">New canvas</h2>
        <p className="text-xs text-ink-3">
          Creates an isolated git worktree with Built-in Canvas Studio & DialKit. The agent only changes canvas files.
        </p>
      </div>
      <div>
        <Label className="text-xs text-ink-3">Workspace</Label>
        <SearchSelect options={options} value={workspaceId} onValueChange={setWorkspaceId} placeholder="Search workspaces..." />
      </div>
      <div>
        <Label className="text-xs text-ink-3" htmlFor="canvas-title">Title</Label>
        <Input id="canvas-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pricing page explorations" />
      </div>
      <div>
        <Label className="text-xs text-ink-3" htmlFor="canvas-brief">First request (optional)</Label>
        <Textarea id="canvas-brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Compare 3 hero layouts for the landing page…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-ink-3">Harness</Label>
          <Select value={executor} onValueChange={(v) => { setExecutor(v); setModel("") }}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dsh">dsh (DeepSeek Harness)</SelectItem>
              <SelectItem value="commandcode">Command Code</SelectItem>
              <SelectItem value="claude">Claude Code</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-3">Model</Label>
          <div className="mt-1">
            <SearchSelect options={models} value={model} onValueChange={setModel} placeholder="Default model" />
          </div>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-ink-3">
        <input type="checkbox" className="mt-0.5" checked={dialkit} onChange={(e) => setDialkit(e.target.checked)} />
        <span>
          DialKit live component editing (Recommended) — provides instant 0ms visual knobs and bi-directional code sync.
        </span>
      </label>
      <Button disabled={!workspaceId || !title.trim() || create.isPending} onClick={() => create.mutate()} className="active:scale-[0.97] transition-transform">
        {create.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />} Create canvas
      </Button>
    </div>
  )
}

function StudioSessionView({
  id,
  boardSlug,
  sidebarOpen,
  onToggleSidebar,
  onGone,
  onOpen,
}: {
  id: string
  boardSlug: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onGone: () => void
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<"sandbox" | "server">("sandbox")
  const [frame, setFrame] = useState<"freeform" | "desktop" | "tablet" | "mobile">("desktop")
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [activeFile, setActiveFile] = useState<string | undefined>()
  const [dialkitProps, setDialkitProps] = useState<DialKitProps>(DEFAULT_DIALKIT_PROPS)
  const [initialDialkitProps, setInitialDialkitProps] = useState<DialKitProps>(DEFAULT_DIALKIT_PROPS)
  const [text, setText] = useState("")

  const detail = useQuery({
    queryKey: ["canvas-session", id],
    queryFn: () => api<{ session: CanvasSession; messages: CanvasMessage[] }>(`/api/canvas/sessions/${id}`),
    refetchInterval: (q) => (q.state.data?.session.status === "working" ? 2500 : 8000),
  })

  // Fetch canvas source files for in-browser instant sandbox
  const filesQuery = useQuery({
    queryKey: ["canvas-files", id],
    queryFn: () => api<Record<string, string>>(`/api/canvas/sessions/${id}/files`),
    refetchInterval: () => (detail.data?.session.status === "working" ? 3000 : false),
  })

  const s = detail.data?.session
  const rawFiles = useMemo(() => filesQuery.data ?? {}, [filesQuery.data])

  // Filter out macOS AppleDouble files and OS metadata
  const files = useMemo(() => {
    const res: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawFiles)) {
      const base = k.split("/").pop() || ""
      if (base.startsWith("._") || base === ".DS_Store" || k.includes("__MACOSX")) {
        continue
      }
      res[k] = v
    }
    return res
  }, [rawFiles])

  // Pick first relevant file when files arrive
  useEffect(() => {
    if (activeFile && files[activeFile]) return
    const keys = Object.keys(files)
    if (keys.length === 0) return
    const candidate = keys.find((k) => k.endsWith(".tsx") && !k.endsWith("page.tsx")) || keys[0]
    setActiveFile(candidate)
  }, [files, activeFile])

  // Sync DialKit mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Create or update canvas/dialkit.json in the worktree
      const updatedFiles: Record<string, string> = {
        ...files,
        "canvas/dialkit.json": JSON.stringify(dialkitProps, null, 2),
      }
      return api(`/api/canvas/sessions/${id}/files`, {
        method: "PUT",
        body: JSON.stringify({ files: updatedFiles }),
      })
    },
    onSuccess: () => {
      setInitialDialkitProps(dialkitProps)
      qc.invalidateQueries({ queryKey: ["canvas-files", id] })
      toastGlobal("DialKit tweaks synced & committed to branch", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  const isDirty = useMemo(() => {
    return JSON.stringify(dialkitProps) !== JSON.stringify(initialDialkitProps)
  }, [dialkitProps, initialDialkitProps])

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["canvas-session", id] })
    qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
    qc.invalidateQueries({ queryKey: ["canvas-files", id] })
  }, [qc, id])

  const run = useCallback(
    <T,>(fn: () => Promise<T>, ok?: string, then?: (r: T) => void) =>
      fn()
        .then((r) => {
          if (ok) toastGlobal(ok, "success")
          then?.(r)
          refresh()
        })
        .catch((e: Error) => toastGlobal(e.message, "error")),
    [refresh],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "]") {
        e.preventDefault()
        setInspectorOpen((v) => !v)
      } else if (e.key === "0") {
        e.preventDefault()
        setZoom(1)
        setPan({ x: 0, y: 0 })
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))
      } else if (e.key === "-") {
        e.preventDefault()
        setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!s) return <div className="flex flex-1 items-center justify-center text-sm text-ink-3">Loading canvas…</div>
  const busy = s.status === "working"
  const fileList = Object.keys(files)

  return (
    <div className="flex min-h-0 flex-1 flex-col h-full select-none">
      {/* Top Floating Pro Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c-line)] bg-background/80 backdrop-blur-md px-3 py-2 z-20">
        {/* Left: Toggles & Title */}
        <div className="flex items-center gap-2 min-w-0">
          {!sidebarOpen && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-ink-3 hover:text-ink-1 active:scale-[0.97]"
              onClick={onToggleSidebar}
              title="Show Sidebar (Cmd+[)"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-semibold">{s.title}</span>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider h-5 font-normal">
                {s.status}
              </Badge>
              {s.dialkit && (
                <Badge variant="outline" className="text-[10px] text-accent border-accent/40 h-5 font-normal">
                  DialKit
                </Badge>
              )}
            </div>
            <div className="truncate text-[10px] text-ink-3">
              {s.branch} · {s.executor} · turn {s.turns}
            </div>
          </div>
        </div>

        {/* Center: Device Frame & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* View Mode Toggle: Built-In Sandbox vs Dev Server */}
          <div className="flex items-center rounded-lg border border-[var(--c-line)] bg-[var(--c-canvas)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("sandbox")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all duration-100",
                viewMode === "sandbox" ? "bg-background text-ink-1 shadow-sm font-medium" : "text-ink-3 hover:text-ink-1",
              )}
            >
              <Sparkles className="size-3 text-accent" /> Sandbox (0ms)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("server")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all duration-100",
                viewMode === "server" ? "bg-background text-ink-1 shadow-sm font-medium" : "text-ink-3 hover:text-ink-1",
              )}
            >
              <Radio className="size-3" /> Dev Server
            </button>
          </div>

          {/* Frames */}
          {viewMode === "sandbox" && (
            <div className="flex items-center rounded-lg border border-[var(--c-line)] bg-[var(--c-canvas)] p-0.5">
              <button
                type="button"
                onClick={() => setFrame("freeform")}
                className={cn(
                  "p-1 rounded-md text-ink-3 hover:text-ink-1 transition-colors",
                  frame === "freeform" && "bg-background text-accent shadow-sm",
                )}
                title="Responsive Stage"
              >
                <Maximize2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFrame("desktop")}
                className={cn(
                  "p-1 rounded-md text-ink-3 hover:text-ink-1 transition-colors",
                  frame === "desktop" && "bg-background text-accent shadow-sm",
                )}
                title="Desktop 1200 × 800"
              >
                <Monitor className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFrame("tablet")}
                className={cn(
                  "p-1 rounded-md text-ink-3 hover:text-ink-1 transition-colors",
                  frame === "tablet" && "bg-background text-accent shadow-sm",
                )}
                title="Tablet 768 × 1024"
              >
                <Tablet className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setFrame("mobile")}
                className={cn(
                  "p-1 rounded-md text-ink-3 hover:text-ink-1 transition-colors",
                  frame === "mobile" && "bg-background text-accent shadow-sm",
                )}
                title="Mobile 375 × 812"
              >
                <Smartphone className="size-3.5" />
              </button>
            </div>
          )}

          {/* Zoom */}
          {viewMode === "sandbox" && (
            <div className="flex items-center gap-1 text-xs text-ink-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
                className="p-1 hover:text-ink-1 transition-colors"
                title="Zoom Out (Cmd+-)"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                }}
                className="px-1.5 py-0.5 rounded text-[11px] font-mono hover:bg-accent-tint hover:text-ink-1 transition-colors"
                title="Reset Zoom (Cmd+0)"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
                className="p-1 hover:text-ink-1 transition-colors"
                title="Zoom In (Cmd++)"
              >
                <ZoomIn className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                }}
                className="p-1 hover:text-ink-1 transition-colors"
                title="Reset Position"
              >
                <RotateCcw className="size-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {viewMode === "server" && (
            <>
              {s.server === "running" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs active:scale-[0.97]"
                  onClick={() => run(() => post(`/api/canvas/sessions/${id}/stop`))}
                >
                  <Square className="size-3 mr-1" /> Stop server
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs active:scale-[0.97]"
                  disabled={busy}
                  onClick={() => run(() => post(`/api/canvas/sessions/${id}/start`), "Dev server started")}
                >
                  <Play className="size-3 mr-1" /> Start server
                </Button>
              )}
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs active:scale-[0.97]"
            disabled={busy}
            onClick={() =>
              run(() => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}), "Variation created", (n) =>
                onOpen(n.id),
              )
            }
          >
            <GitFork className="size-3 mr-1" /> Fork
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs active:scale-[0.97]"
            disabled={busy}
            onClick={() =>
              run(
                () => post<{ task_id: string }>(`/api/canvas/sessions/${id}/promote`, { board: boardSlug }),
                `Promoted to triage card on ${boardSlug}`,
              )
            }
          >
            <ArrowUpRight className="size-3 mr-1" /> Promote
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-ink-3 hover:text-red-500 active:scale-[0.97]"
            onClick={() => {
              if (window.confirm("Discard this canvas? The worktree and branch will be deleted.")) {
                run(() => post(`/api/canvas/sessions/${id}/discard`), "Canvas discarded", onGone)
              }
            }}
            title="Discard Canvas"
          >
            <Trash2 className="size-3.5" />
          </Button>

          {/* Toggle Inspector */}
          <Button
            size="icon"
            variant={inspectorOpen ? "secondary" : "ghost"}
            className="size-7 active:scale-[0.97] transition-transform ml-1"
            onClick={() => setInspectorOpen((v) => !v)}
            title="Toggle DialKit Inspector (Cmd+])"
          >
            {inspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Central Canvas Viewport */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col relative bg-[var(--c-canvas)] overflow-hidden">
          {viewMode === "sandbox" ? (
            fileList.length === 0 && !filesQuery.isLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-3 p-6 text-center">
                <Palette className="size-8 text-ink-3/50" />
                <p className="text-sm font-medium text-ink-1">No canvas components found</p>
                <p className="text-xs text-ink-3 max-w-sm">
                  Ask the agent below to scaffold a component or variation for your brainstorm.
                </p>
                <Button
                  size="sm"
                  className="mt-2 gap-1.5 active:scale-[0.97]"
                  onClick={() => setChatOpen(true)}
                >
                  <Sparkles className="size-3.5" /> Ask Agent to Create Component
                </Button>
              </div>
            ) : (
              <CanvasSandbox
                sessionId={id}
                files={files}
                entryFile={activeFile}
                dialkitProps={dialkitProps}
                frame={frame}
                zoom={zoom}
                pan={pan}
                onPanChange={setPan}
                onZoomChange={setZoom}
              />
            )
          ) : (
            // Next.js dev server live iframe mode
            <div className="h-full w-full">
              {s.server === "running" && s.view_url ? (
                <iframe
                  title={`Canvas ${s.title}`}
                  src={s.view_url}
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                  className="h-full w-full bg-white border-0"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink-3 p-6 text-center">
                  <Play className="size-8 text-ink-3/50" />
                  <p className="text-ink-1 font-medium">Dev server is stopped</p>
                  <p className="text-xs text-ink-3 max-w-sm">
                    Start the Next.js dev server to test full routing and server-side features, or switch to the 0ms instant Sandbox.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 gap-1.5 active:scale-[0.97]"
                    disabled={busy}
                    onClick={() => run(() => post(`/api/canvas/sessions/${id}/start`), "Dev server started")}
                  >
                    <Play className="size-3.5" /> Start Dev Server
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Active File Switcher Pill (if multiple files exist) */}
          {fileList.length > 1 && viewMode === "sandbox" && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full border border-[var(--c-line)] bg-background/90 backdrop-blur-md px-2 py-1 shadow-sm">
              <FileCode className="size-3 text-accent mr-1" />
              {fileList.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFile(f)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-mono transition-colors active:scale-95",
                    activeFile === f
                      ? "bg-accent text-white"
                      : "text-ink-3 hover:text-ink-1 hover:bg-accent-tint",
                  )}
                >
                  {f.split("/").pop()}
                </button>
              ))}
            </div>
          )}

          {/* Floating Agent Chat Drawer (Bottom Right) */}
          <div className="absolute bottom-4 right-4 z-30">
            {chatOpen ? (
              <div className="w-96 max-w-[calc(100vw-2rem)] h-[440px] rounded-xl border border-[var(--c-line)] bg-background/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Chat Header */}
                <div className="flex items-center justify-between border-b border-[var(--c-line)] px-3 py-2 bg-[var(--c-canvas)]/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Sparkles className="size-3.5 text-accent" />
                    <span>Agent Brainstorm</span>
                    <Badge variant="outline" className="text-[10px] font-normal h-4 px-1">
                      turn {s.turns}
                    </Badge>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 text-ink-3 hover:text-ink-1 active:scale-90"
                    onClick={() => setChatOpen(false)}
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </div>

                {/* Message Log */}
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-xs">
                  {(detail.data?.messages ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 whitespace-pre-wrap leading-relaxed",
                        m.role === "user"
                          ? "bg-accent-tint ml-4 text-ink-1"
                          : m.role === "system"
                          ? "border border-amber-500/30 text-amber-600 bg-amber-500/5"
                          : "bg-[var(--c-canvas)] mr-4 border border-[var(--c-line)]",
                      )}
                    >
                      <div className="mb-0.5 text-[9px] uppercase tracking-wider text-ink-3 font-semibold">
                        {m.role}
                      </div>
                      {m.content}
                    </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 text-xs text-ink-3 py-1">
                      <Loader2 className="size-3.5 animate-spin text-accent" />
                      Agent is working…
                    </div>
                  )}
                  {s.last_error && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-500">
                      {s.last_error}
                    </div>
                  )}
                </div>

                {/* Prompt Box */}
                <form
                  className="flex gap-2 border-t border-[var(--c-line)] p-2.5 bg-background"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!text.trim() || busy) return
                    const msg = text
                    setText("")
                    run(() => post(`/api/canvas/sessions/${id}/messages`, { message: msg }))
                  }}
                >
                  <Textarea
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ask for variations, alternate styling, component tweaks…"
                    className="text-xs resize-none min-h-[44px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-9 shrink-0 active:scale-[0.97]"
                    disabled={busy || !text.trim()}
                    aria-label="Send message"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </form>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 rounded-full border border-[var(--c-line)] bg-background/95 backdrop-blur-md px-3.5 py-2 shadow-lg text-xs font-medium text-ink-1 hover:border-accent hover:shadow-xl transition-all duration-150 active:scale-[0.97]"
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin text-accent" />
                ) : (
                  <Sparkles className="size-3.5 text-accent" />
                )}
                <span>✦ Ask Agent</span>
                <span className="text-[10px] text-ink-3">· turn {s.turns}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Inspector Drawer (DialKit) */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-l border-[var(--c-line)] bg-background transition-all duration-150 ease-out z-10",
            inspectorOpen ? "w-72" : "w-0 border-l-0 overflow-hidden opacity-0 pointer-events-none",
          )}
        >
          <DialKitInspector
            props={dialkitProps}
            onChange={setDialkitProps}
            onSyncCode={async () => {
              await syncMutation.mutateAsync()
            }}
            isSyncing={syncMutation.isPending}
            isDirty={isDirty}
          />
        </aside>
      </div>
    </div>
  )
}
