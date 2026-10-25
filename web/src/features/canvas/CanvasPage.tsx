import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  Palette,
  GitFork,
  Trash2,
  ArrowUpRight,
  Send,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  ChevronDown,
  Check,
  Copy,
  X,
  Code2,
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
import {
  type PenDocument,
  type PenNode,
  parsePenDocument,
  createDefaultPenDocument,
  findNodeById,
  updateNodeInTree,
  deleteNodeFromTree,
} from "./penTypes"
import { compilePenDocumentToReact } from "./penCompiler"
import { PenCanvas } from "./PenCanvas"
import { PenPropertyInspector } from "./PenPropertyInspector"

export interface CanvasSession {
  id: string
  title: string
  workspace_id: string
  workspace_path: string
  host: string
  worktree_path: string
  branch: string
  port?: number
  framework?: string
  status: "ready" | "working" | "error" | "discarded"
  server?: "stopped" | "running"
  executor: string
  model: string
  dialkit?: boolean
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
              No canvases yet. Brainstorm visual prototypes with 0-Token Native pen.dev Canvas in an isolated worktree.
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
              <div className="flex items-center gap-1.5 truncate text-[11px] text-ink-3 mt-0.5">
                {s.workspace_id === "scratchpad" && (
                  <span className="rounded bg-accent/15 px-1 py-0.2 text-[9px] font-medium text-accent">
                    Scratchpad
                  </span>
                )}
                <span className="truncate">{s.branch}</span>
              </div>
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
            workspaces={workspaces}
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
                Brainstorm visually with pen.dev Canvas, compile to React in 0 tokens, and promote to tasks.
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
  const color = s.status === "error" ? "bg-red-500" : "bg-emerald-500"
  return <span className={cn("size-2 rounded-full", color)} title={s.status} />
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
  const options: SearchSelectOption[] = useMemo(
    () => [
      {
        value: "scratchpad",
        label: "Global Scratchpad (No workspace required)",
        sublabel: "Brainstorm visual design in pen.dev without a project workspace",
        keywords: ["scratchpad", "global", "pen", "brainstorm", "design"],
      },
      ...usable.map((w) => ({
        value: w.id,
        label: w.name,
        sublabel: w.path,
        keywords: [w.path, ...(w.labels ?? [])],
      })),
    ],
    [usable]
  )
  const [workspaceId, setWorkspaceId] = useState("scratchpad")
  const [title, setTitle] = useState(prefill?.title ?? "")
  const [brief, setBrief] = useState(prefill?.brief ?? "")
  const [executor, setExecutor] = useState("dsh")
  const [model, setModel] = useState("")
  const { models } = useExecutorModels(executor)

  useEffect(() => {
    if (!prefill?.workspacePath) return
    if (prefill.workspacePath === "scratchpad") {
      setWorkspaceId("scratchpad")
      return
    }
    const hit = usable.find((w) => w.path === prefill.workspacePath)
    if (hit) setWorkspaceId(hit.id)
    else setWorkspaceId("scratchpad")
  }, [prefill, usable])

  const create = useMutation({
    mutationFn: () => post<CanvasSession>("/api/canvas/sessions", { workspace_id: workspaceId, title, brief, executor, model }),
    onSuccess: onCreated,
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto p-6">
      <div>
        <h2 className="text-base font-semibold">New canvas</h2>
        <p className="text-xs text-ink-3">
          Creates an isolated git worktree with 0-Token Native pen.dev Canvas Studio.
        </p>
      </div>
      <div>
        <Label className="text-xs text-ink-3">Workspace</Label>
        <SearchSelect options={options} value={workspaceId} onValueChange={setWorkspaceId} placeholder="Search workspaces or select Global Scratchpad..." />
      </div>
      <div>
        <Label className="text-xs text-ink-3" htmlFor="canvas-title">Title</Label>
        <Input id="canvas-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pricing card explorations" />
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
      <Button disabled={!workspaceId || !title.trim() || create.isPending} onClick={() => create.mutate()} className="active:scale-[0.97] transition-transform">
        {create.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />} Create canvas
      </Button>
    </div>
  )
}

function ConvertToReactModal({
  open,
  onClose,
  doc,
}: {
  open: boolean
  onClose: () => void
  doc: PenDocument
}) {
  const [copied, setCopied] = useState(false)
  const code = useMemo(() => compilePenDocumentToReact(doc, "CanvasComponent"), [doc])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#121316] shadow-2xl overflow-hidden">
        <header className="flex h-12 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-accent" />
            <h3 className="text-xs font-semibold text-neutral-200">React + Tailwind JSX</h3>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-400">
              0 Tokens Consumed
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 overflow-auto bg-[#0a0b0e] p-4 font-mono text-xs leading-relaxed text-neutral-300">
          <pre className="select-text whitespace-pre overflow-x-auto">{code}</pre>
        </div>

        <footer className="flex items-center justify-between border-t border-[rgba(255,255,255,0.08)] bg-[#14151b] px-4 py-3">
          <p className="text-[11px] text-neutral-400">
            Copy and paste this component directly into your project.
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent/90 active:scale-[0.98] transition-all"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <span>{copied ? "Copied!" : "Copy Component"}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}

function PromoteTaskModal({
  open,
  onClose,
  session,
  workspaces,
  boardSlug,
  onPromoted,
}: {
  open: boolean
  onClose: () => void
  session: CanvasSession
  workspaces: Workspace[]
  boardSlug: string
  onPromoted: (taskId: string) => void
}) {
  const [targetWorkspace, setTargetWorkspace] = useState(
    session.workspace_id !== "scratchpad" ? session.workspace_path : workspaces[0]?.path || ""
  )
  const [board, setBoard] = useState(boardSlug)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!open) return null

  const handlePromote = async () => {
    setIsSubmitting(true)
    try {
      const res = await post<{ task_id: string }>(`/api/canvas/sessions/${session.id}/promote`, {
        board,
        workspace_path: targetWorkspace,
      })
      toastGlobal(`Promoted to card #${res.task_id} on ${board}`, "success")
      onPromoted(res.task_id)
      onClose()
    } catch (err: any) {
      toastGlobal(err.message || "Failed to promote canvas", "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="flex w-full max-w-md flex-col rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#121316] shadow-2xl overflow-hidden">
        <header className="flex h-12 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="size-4 text-accent" />
            <h3 className="text-xs font-semibold text-neutral-200">Promote Canvas to Kanban Task</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 p-4 text-xs">
          <div>
            <Label className="text-xs text-neutral-400">Target Kanban Board</Label>
            <Input
              value={board}
              onChange={(e) => setBoard(e.target.value)}
              className="mt-1 bg-[#18191f] text-neutral-200 border-[rgba(255,255,255,0.1)]"
            />
          </div>

          <div>
            <Label className="text-xs text-neutral-400">Target Project Workspace</Label>
            <Select value={targetWorkspace} onValueChange={setTargetWorkspace}>
              <SelectTrigger className="mt-1 bg-[#18191f] text-neutral-200 border-[rgba(255,255,255,0.1)]">
                <SelectValue placeholder="Select workspace to bind..." />
              </SelectTrigger>
              <SelectContent className="bg-[#18191f] text-neutral-200 border-[rgba(255,255,255,0.1)]">
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.path}>
                    {w.name} ({w.path})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {session.workspace_id === "scratchpad" && (
              <p className="mt-1 text-[11px] text-accent">
                ✦ Brainstormed in Global Scratchpad. Selecting a target workspace binds this task to the project repository.
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[rgba(255,255,255,0.08)] bg-[#14151b] px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-neutral-400 hover:text-white">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePromote}
            disabled={isSubmitting || !board.trim()}
            className="h-8 bg-accent text-black font-medium hover:bg-accent/90"
          >
            {isSubmitting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
            Create Task Card
          </Button>
        </footer>
      </div>
    </div>
  )
}

function StudioSessionView({
  id,
  boardSlug,
  workspaces,
  sidebarOpen,
  onToggleSidebar,
  onGone,
  onOpen,
}: {
  id: string
  boardSlug: string
  workspaces: Workspace[]
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onGone: () => void
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [text, setText] = useState("")
  const [reactModalOpen, setReactModalOpen] = useState(false)
  const [promoteModalOpen, setPromoteModalOpen] = useState(false)

  const detail = useQuery({
    queryKey: ["canvas-session", id],
    queryFn: () => api<{ session: CanvasSession; messages: CanvasMessage[] }>(`/api/canvas/sessions/${id}`),
    refetchInterval: (q) => (q.state.data?.session.status === "working" ? 2500 : 8000),
  })

  // Fetch canvas source files for .pen document
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

  // Identify if any .pen file exists
  const penFileKey = useMemo(() => {
    const keys = Object.keys(files)
    return keys.find((k) => k.endsWith(".pen")) || "design/component.pen"
  }, [files])

  // In-memory PenDocument state
  const [penDoc, setPenDoc] = useState<PenDocument>(() => createDefaultPenDocument(s?.title || "Canvas Component"))
  const [selectedPenNodeId, setSelectedPenNodeId] = useState<string | null>(null)
  const [penSaveStatus, setPenSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync penDoc from files when files load
  useEffect(() => {
    if (files[penFileKey]) {
      const parsed = parsePenDocument(files[penFileKey])
      setPenDoc(parsed)
      if (parsed.children && parsed.children[0]) {
        setSelectedPenNodeId(parsed.children[0].id)
      }
    } else if (s?.title) {
      setPenDoc(createDefaultPenDocument(s.title))
    }
  }, [files, penFileKey, s?.title])

  // Debounced auto-save function (300ms)
  const triggerPenAutoSave = useCallback(
    (docToSave: PenDocument) => {
      setPenSaveStatus("unsaved")
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      autoSaveTimerRef.current = setTimeout(async () => {
        setPenSaveStatus("saving")
        try {
          const rawJson = JSON.stringify(docToSave, null, 2)
          await api(`/api/canvas/sessions/${id}/files`, {
            method: "PUT",
            body: JSON.stringify({
              files: {
                [penFileKey]: rawJson,
              },
            }),
          })
          setPenSaveStatus("saved")
        } catch {
          setPenSaveStatus("unsaved")
        }
      }, 300)
    },
    [id, penFileKey]
  )

  // Handlers for PenNode mutations
  const handleUpdatePenNode = useCallback(
    (updated: PenNode) => {
      setPenDoc((prev) => {
        const nextChildren = updateNodeInTree(prev.children, updated.id, updated)
        const nextDoc = { ...prev, children: nextChildren }
        triggerPenAutoSave(nextDoc)
        return nextDoc
      })
    },
    [triggerPenAutoSave]
  )

  const handleDeletePenNode = useCallback(
    (nodeId: string) => {
      setPenDoc((prev) => {
        const nextChildren = deleteNodeFromTree(prev.children, nodeId)
        const nextDoc = { ...prev, children: nextChildren }
        triggerPenAutoSave(nextDoc)
        return nextDoc
      })
      setSelectedPenNodeId(null)
    },
    [triggerPenAutoSave]
  )

  const handleAddPenNode = useCallback(
    (parentOrRoot: "root" | string, type: "frame" | "rectangle" | "text") => {
      setPenDoc((prev) => {
        const newNodeId = `node_${Date.now()}`
        let newNode: PenNode
        if (type === "text") {
          newNode = {
            type: "text",
            id: newNodeId,
            name: "Text Layer",
            text: "Double click to edit",
            fontSize: 14,
            fontWeight: "400",
            fill: "#ffffff",
          }
        } else {
          newNode = {
            type: "frame",
            id: newNodeId,
            name: "New Frame",
            x: 80,
            y: 80,
            width: 360,
            height: 200,
            cornerRadius: 12,
            fill: "#18191f",
            stroke: "rgba(255,255,255,0.1)",
            strokeWidth: 1,
            layout: "vertical",
            padding: 16,
            gap: 12,
          }
        }

        let nextChildren: PenNode[]
        if (parentOrRoot === "root" || !parentOrRoot) {
          nextChildren = [...prev.children, newNode]
        } else {
          const target = findNodeById(prev.children, parentOrRoot)
          if (target && target.type === "frame") {
            const updatedTarget = {
              ...target,
              children: [...(target.children || []), newNode],
            }
            nextChildren = updateNodeInTree(prev.children, parentOrRoot, updatedTarget)
          } else {
            nextChildren = [...prev.children, newNode]
          }
        }

        const nextDoc = { ...prev, children: nextChildren }
        triggerPenAutoSave(nextDoc)
        setSelectedPenNodeId(newNodeId)
        return nextDoc
      })
    },
    [triggerPenAutoSave]
  )

  const selectedPenNode = useMemo(() => {
    if (!selectedPenNodeId) return null
    return findNodeById(penDoc.children, selectedPenNodeId)
  }, [penDoc, selectedPenNodeId])

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

  // Keyboard shortcut Cmd+] to toggle inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "]") {
        e.preventDefault()
        setInspectorOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!s) return <div className="flex flex-1 items-center justify-center text-sm text-ink-3">Loading canvas…</div>
  const busy = s.status === "working"

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
              <Badge variant="outline" className="text-[10px] text-accent border-accent/40 h-5 font-normal">
                pen.dev
              </Badge>
            </div>
            <div className="truncate text-[10px] text-ink-3">
              {s.branch} · {s.executor} · turn {s.turns}
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs active:scale-[0.97]"
            onClick={() => setReactModalOpen(true)}
          >
            <Code2 className="size-3 mr-1 text-accent" /> Convert to React (0 Token)
          </Button>

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
            onClick={() => setPromoteModalOpen(true)}
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
            title="Toggle pen.dev Inspector (Cmd+])"
          >
            {inspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Central Canvas Viewport */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col relative bg-[var(--c-canvas)] overflow-hidden">
          <PenCanvas
            document={penDoc}
            selectedNodeId={selectedPenNodeId}
            onSelectNode={setSelectedPenNodeId}
            onUpdateNode={handleUpdatePenNode}
            onAddNode={handleAddPenNode}
            onResetDocument={(doc) => {
              setPenDoc(doc)
              triggerPenAutoSave(doc)
            }}
          />

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

        {/* Right Inspector Drawer (pen.dev Inspector) */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-l border-[var(--c-line)] bg-background transition-all duration-150 ease-out z-10",
            inspectorOpen ? "w-80" : "w-0 border-l-0 overflow-hidden opacity-0 pointer-events-none",
          )}
        >
          <PenPropertyInspector
            selectedNode={selectedPenNode}
            onUpdateNode={handleUpdatePenNode}
            onDeleteNode={handleDeletePenNode}
            saveStatus={penSaveStatus}
            onConvertToReact={() => setReactModalOpen(true)}
            onPromoteToTask={() => setPromoteModalOpen(true)}
          />
        </aside>
      </div>

      {/* 0-Token React Transpiler & Promote Modals */}
      <ConvertToReactModal
        open={reactModalOpen}
        onClose={() => setReactModalOpen(false)}
        doc={penDoc}
      />
      <PromoteTaskModal
        open={promoteModalOpen}
        onClose={() => setPromoteModalOpen(false)}
        session={s}
        workspaces={workspaces}
        boardSlug={boardSlug}
        onPromoted={() => qc.invalidateQueries({ queryKey: ["tasks"] })}
      />
    </div>
  )
}
