import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  GitFork,
  Trash2,
  ArrowUpRight,
  PanelRightOpen,
  Check,
  Copy,
  X,
  Code2,
  Folder,
  ArrowLeft,
  Upload,
  Download,
} from "lucide-react"
import { api, toastGlobal, type Workspace } from "../../api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExecutorModels } from "../board/modelCatalog"
import { CANVAS_PREFILL_KEY, type CanvasPrefill } from "./canvasPrefill"
import {
  type PenDocument,
  parsePenDocument,
  createDefaultPenDocument,
  findNodeById,
} from "./penTypes"
import { compilePenDocumentToReact } from "./penCompiler"
import { PenCanvas } from "./PenCanvas"
import { PenPropertyInspector } from "./PenPropertyInspector"
import { CanvasLeftSidebar, type LeftSidebarTab } from "./CanvasLeftSidebar"
import { usePenHistory } from "./usePenHistory"
import { CanvasHub } from "./CanvasHub"

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
  created_at: number
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

  const createMutation = useMutation({
    mutationFn: (params: { workspace_id: string; title: string; brief: string; executor?: string; model?: string }) =>
      post<CanvasSession>("/api/canvas/sessions", params),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
      setSelected(s.id)
      setCreating(false)
      setPrefill(null)
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  const forkMutation = useMutation({
    mutationFn: (id: string) => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
      setSelected(s.id)
      toastGlobal("Variation created", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  const discardMutation = useMutation({
    mutationFn: (id: string) => post(`/api/canvas/sessions/${id}/discard`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
      setSelected(null)
      toastGlobal("Canvas discarded", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })

  const { models: defaultModels } = useExecutorModels("dsh")

  const handleImportPenFileGlobal = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parsePenDocument(text)
      if (!parsed || !parsed.children) {
        toastGlobal("Invalid .pen file format", "error")
        return
      }
      const title = file.name.replace(/\.(pen|json)$/i, "") || "Imported Design"
      
      const newSession = await post<CanvasSession>("/api/canvas/sessions", {
        workspace_id: "scratchpad",
        title,
        brief: "Imported from .pen file",
        executor: "dsh",
        model: "DeepSeek V4.1 Flash",
      })

      await api(`/api/canvas/sessions/${newSession.id}/files`, {
        method: "PUT",
        body: JSON.stringify({
          files: {
            "design/component.pen": JSON.stringify(parsed, null, 2),
          },
        }),
      })

      qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
      setSelected(newSession.id)
      toastGlobal(`Imported "${title}.pen" successfully!`, "success")
    } catch (err: any) {
      toastGlobal(err.message || "Failed to import .pen file", "error")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 relative overflow-hidden bg-background">
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
          onCancel={() => setCreating(false)}
        />
      ) : selected ? (
        <StudioSessionView
          key={selected}
          id={selected}
          boardSlug={boardSlug}
          workspaces={workspaces}
          onBackToHub={() => setSelected(null)}
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
        <CanvasHub
          sessions={sessions.data ?? []}
          onSelectSession={setSelected}
          onCreateSession={(params) =>
            createMutation.mutate({
              workspace_id: "scratchpad",
              title: params.title,
              brief: params.brief,
              executor: "dsh",
              model: params.model,
            })
          }
          onImportPenFile={handleImportPenFileGlobal}
          onForkSession={(id) => forkMutation.mutate(id)}
          onDiscardSession={(id) => discardMutation.mutate(id)}
          onPromoteSession={(session) => {
            setSelected(session.id)
          }}
          models={defaultModels}
        />
      )}
    </div>
  )
}

function NewCanvas({
  workspaces,
  prefill,
  onCreated,
  onCancel,
}: {
  workspaces: Workspace[]
  prefill: CanvasPrefill | null
  onCreated: (s: CanvasSession) => void
  onCancel?: () => void
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
    <div className="mx-auto w-full max-w-xl space-y-4 overflow-y-auto p-6 text-neutral-200">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-3">
        <div>
          <h2 className="text-base font-semibold text-white">New canvas</h2>
          <p className="text-xs text-neutral-400">
            Creates an isolated git worktree with 0-Token Native pen.dev Canvas Studio.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel} className="size-8 text-neutral-400 hover:text-white">
            <X className="size-4" />
          </Button>
        )}
      </div>
      <div>
        <Label className="text-xs text-neutral-400">Workspace</Label>
        <SearchSelect options={options} value={workspaceId} onValueChange={setWorkspaceId} placeholder="Search workspaces or select Global Scratchpad..." />
      </div>
      <div>
        <Label className="text-xs text-neutral-400" htmlFor="canvas-title">Title</Label>
        <Input id="canvas-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pricing card explorations" className="bg-[#14151c] text-white border-[rgba(255,255,255,0.1)]" />
      </div>
      <div>
        <Label className="text-xs text-neutral-400" htmlFor="canvas-brief">First request (optional)</Label>
        <Textarea id="canvas-brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Compare 3 hero layouts for the landing page…" className="bg-[#14151c] text-white border-[rgba(255,255,255,0.1)] resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-neutral-400">Harness</Label>
          <Select value={executor} onValueChange={(v) => { setExecutor(v); setModel("") }}>
            <SelectTrigger className="mt-1 bg-[#14151c] text-white border-[rgba(255,255,255,0.1)]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#14151c] text-white border-[rgba(255,255,255,0.1)]">
              <SelectItem value="dsh">dsh (DeepSeek Harness)</SelectItem>
              <SelectItem value="commandcode">Command Code</SelectItem>
              <SelectItem value="claude">Claude Code</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-neutral-400">Model</Label>
          <div className="mt-1">
            <SearchSelect options={models} value={model} onValueChange={setModel} placeholder="Default model" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-neutral-400 hover:text-white">
            Cancel
          </Button>
        )}
        <Button disabled={!workspaceId || !title.trim() || create.isPending} onClick={() => create.mutate()} className="active:scale-[0.97] transition-transform bg-white text-black font-semibold hover:bg-neutral-200">
          {create.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />} Create canvas
        </Button>
      </div>
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
            <Code2 className="size-4 text-accent-text" />
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
  onBackToHub,
  onGone,
  onOpen,
}: {
  id: string
  boardSlug: string
  workspaces: Workspace[]
  onBackToHub: () => void
  onGone: () => void
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)
  const [leftSidebarTab, setLeftSidebarTab] = useState<LeftSidebarTab>("layers")
  const [activeTool, setActiveTool] = useState<"pointer" | "frame" | "rectangle" | "ellipse" | "text" | "hand">("pointer")
  const [autoRulerEnabled, setAutoRulerEnabled] = useState(true)
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

  const [selectedPenNodeId, setSelectedPenNodeId] = useState<string | null>(null)
  const [penSaveStatus, setPenSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const studioFileInputRef = useRef<HTMLInputElement>(null)

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

  // Complete undo/redo history manager for .pen declarative document
  const {
    doc: penDoc,
    resetDoc: resetPenDoc,
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
    updateNode: handleUpdatePenNode,
    deleteNode: handleDeletePenNode,
    duplicateNode: handleDuplicatePenNode,
    reorderNode: handleReorderPenNode,
    addNode: handleAddPenNode,
  } = usePenHistory(
    createDefaultPenDocument(s?.title || "Canvas Component"),
    triggerPenAutoSave
  )

  // Sync penDoc from files when files load
  useEffect(() => {
    if (files[penFileKey]) {
      const parsed = parsePenDocument(files[penFileKey])
      resetPenDoc(parsed)
      if (parsed.children && parsed.children[0]) {
        setSelectedPenNodeId(parsed.children[0].id)
      }
    } else if (s?.title) {
      resetPenDoc(createDefaultPenDocument(s.title))
    }
  }, [files, penFileKey, s?.title, resetPenDoc])

  const handleImportIntoCurrentSession = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = parsePenDocument(text)
        if (!parsed || !parsed.children) {
          toastGlobal("Invalid .pen file format", "error")
          return
        }
        resetPenDoc(parsed)
        if (parsed.children[0]) {
          setSelectedPenNodeId(parsed.children[0].id)
        }
        triggerPenAutoSave(parsed)
        toastGlobal(`Imported "${file.name}" into canvas!`, "success")
      } catch (err: any) {
        toastGlobal(err.message || "Failed to import .pen file", "error")
      }
    },
    [resetPenDoc, triggerPenAutoSave]
  )

  const handleExportPen = useCallback(() => {
    const jsonStr = JSON.stringify(penDoc, null, 2)
    const blob = new Blob([jsonStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${s?.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "design"}.pen`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toastGlobal("Exported .pen file successfully", "success")
  }, [penDoc, s?.title])

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

  if (!s) return <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">Loading canvas…</div>
  const busy = s.status === "working"

  return (
    <div className="flex min-h-0 flex-1 flex-col h-full select-none bg-background font-sans text-foreground">
      {/* Hidden file input for importing .pen into this session */}
      <input
        ref={studioFileInputRef}
        type="file"
        accept=".pen,.json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleImportIntoCurrentSession(e.target.files[0])
            e.target.value = ""
          }
        }}
      />

      {/* Top Application Header matching Design System */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-md z-20 gap-3">
        {/* Left: Back to Hub + File Breadcrumb + Status Badge */}
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToHub}
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground active:scale-95 shrink-0"
            title="Return to Canvas Hub"
          >
            <ArrowLeft className="size-3.5" />
            <span className="font-medium">Canvas Hub</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          {/* Active File Breadcrumb with embedded save status */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground font-mono shadow-xs min-w-0">
            <Folder className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-40 md:max-w-64 font-sans">
              design / {s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pen
            </span>
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5 shrink-0" />
            <span className="text-[10px] text-muted-foreground border-l border-border/80 pl-2 font-sans shrink-0 hidden sm:inline">
              {penSaveStatus === "saved" ? "Saved ✨" : penSaveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Import .pen file */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-border hover:bg-muted active:scale-[0.97]"
            onClick={() => studioFileInputRef.current?.click()}
            title="Import .pen into this canvas"
          >
            <Upload className="size-3 mr-1 text-muted-foreground" />
            <span>Import</span>
          </Button>

          {/* Export .pen file */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-border hover:bg-muted active:scale-[0.97]"
            onClick={handleExportPen}
            title="Export design as .pen file"
          >
            <Download className="size-3 mr-1 text-muted-foreground" />
            <span>Export</span>
          </Button>

          {/* Convert to React */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border bg-accent-text/10 text-accent-text hover:bg-accent-text/20 font-medium active:scale-[0.97]"
            onClick={() => setReactModalOpen(true)}
          >
            <Code2 className="size-3.5 mr-1 text-accent-text" />
            <span>React (0 Token)</span>
          </Button>

          {/* Promote to Task Card */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border hover:bg-muted active:scale-[0.97]"
            disabled={busy}
            onClick={() => setPromoteModalOpen(true)}
          >
            <ArrowUpRight className="size-3.5 mr-1 text-accent-text" />
            <span>Promote</span>
          </Button>

          {/* Duplicate / Fork */}
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97]"
            disabled={busy}
            onClick={() =>
              run(() => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}), "Variation created", (n) =>
                onOpen(n.id)
              )
            }
            title="Duplicate / Fork Canvas Session"
          >
            <GitFork className="size-3.5" />
          </Button>

          {/* Discard Canvas */}
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-destructive active:scale-[0.97]"
            onClick={() => {
              if (window.confirm("Discard this canvas? The worktree and branch will be deleted.")) {
                run(() => post(`/api/canvas/sessions/${id}/discard`), "Canvas discarded", onGone)
              }
            }}
            title="Discard Canvas"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Main Spatial Body: Left Sidebar (Agent, Layers, Assets + Tool Rail) + Canvas + Right Inspector */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden bg-background">
        {/* Docked Left Sidebar matching Image 1 & Image 2 */}
        <CanvasLeftSidebar
          isOpen={leftSidebarOpen}
          onToggleOpen={() => setLeftSidebarOpen((v) => !v)}
          activeTab={leftSidebarTab}
          onSelectTab={setLeftSidebarTab}
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          document={penDoc}
          selectedNodeId={selectedPenNodeId}
          onSelectNode={setSelectedPenNodeId}
          onUpdateNode={handleUpdatePenNode}
          onDeleteNode={handleDeletePenNode}
          onDuplicateNode={handleDuplicatePenNode}
          onReorderNode={handleReorderPenNode}
          onAddNode={handleAddPenNode}
          messages={detail.data?.messages ?? []}
          busy={busy}
          turnCount={s.turns}
          lastError={s.last_error}
          onSendMessage={(msg) => run(() => post(`/api/canvas/sessions/${id}/messages`, { message: msg }))}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          activeModel={s.model}
          autoRulerEnabled={autoRulerEnabled}
          onToggleAutoRuler={() => setAutoRulerEnabled((v) => !v)}
          onConvertToReact={() => setReactModalOpen(true)}
          onNewSession={() =>
            run(() => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}), "Variation created", (n) =>
              onOpen(n.id)
            )
          }
        />

        {/* Spatial Canvas Viewport */}
        <PenCanvas
          document={penDoc}
          selectedNodeId={selectedPenNodeId}
          onSelectNode={setSelectedPenNodeId}
          onUpdateNode={handleUpdatePenNode}
          onDeleteNode={handleDeletePenNode}
          onDuplicateNode={handleDuplicatePenNode}
          onAddNode={handleAddPenNode}
          onResetDocument={(doc) => {
            resetPenDoc(doc)
            triggerPenAutoSave(doc)
          }}
          onImportPenFile={handleImportIntoCurrentSession}
          onOpenChat={() => {
            setLeftSidebarTab("agent")
            setLeftSidebarOpen(true)
          }}
          activeModel={s.model || "DeepSeek V4.1 Flash"}
          turnCount={s.turns}
          inspectorOpen={inspectorOpen}
          leftSidebarOpen={leftSidebarOpen}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onReorderNode={handleReorderPenNode}
          autoRulerEnabled={autoRulerEnabled}
          onToggleAutoRuler={() => setAutoRulerEnabled((v) => !v)}
        />

        {/* Floating Property Inspector matching Image 1 (Reduced width ~264px, dedicated self-collapse) */}
        {inspectorOpen ? (
          <PenPropertyInspector
            selectedNode={selectedPenNode}
            onUpdateNode={handleUpdatePenNode}
            onDeleteNode={handleDeletePenNode}
            onCloseInspector={() => setInspectorOpen(false)}
            saveStatus={penSaveStatus}
            onConvertToReact={() => setReactModalOpen(true)}
            onPromoteToTask={() => setPromoteModalOpen(true)}
          />
        ) : (
          /* Subtle reopen pill on right edge when collapsed */
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-xl border border-border/80 bg-card/90 text-neutral-400 hover:text-white hover:bg-muted shadow-lg backdrop-blur-md transition-all active:scale-95"
            title="Open Property Inspector (Cmd+])"
          >
            <PanelRightOpen className="size-4" />
          </button>
        )}
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
