import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  GitFork,
  Trash2,
  ArrowUpRight,
  Send,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  ChevronDown,
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
  const studioFileInputRef = useRef<HTMLInputElement>(null)

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

  const handleImportIntoCurrentSession = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = parsePenDocument(text)
        if (!parsed || !parsed.children) {
          toastGlobal("Invalid .pen file format", "error")
          return
        }
        setPenDoc(parsed)
        if (parsed.children[0]) {
          setSelectedPenNodeId(parsed.children[0].id)
        }
        triggerPenAutoSave(parsed)
        toastGlobal(`Imported "${file.name}" into canvas!`, "success")
      } catch (err: any) {
        toastGlobal(err.message || "Failed to import .pen file", "error")
      }
    },
    [triggerPenAutoSave]
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
            width: 390,
            height: 844,
            cornerRadius: 16,
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
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur-md z-20">
        {/* Left: Back to Hub + File Breadcrumb + Save Badge */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToHub}
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground active:scale-95"
            title="Return to Canvas Hub"
          >
            <ArrowLeft className="size-3.5" />
            <span className="font-medium">Canvas Hub</span>
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Active File Breadcrumb */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground font-mono shadow-xs">
            <Folder className="size-3.5 text-muted-foreground" />
            <span className="truncate max-w-56 font-sans">
              design / {s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pen
            </span>
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          </div>

          <span className="font-mono text-[10px] text-muted-foreground">
            {penSaveStatus === "saved" ? "Saved ✨" : penSaveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Import .pen file */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border hover:bg-muted active:scale-[0.97]"
            onClick={() => studioFileInputRef.current?.click()}
            title="Import .pen into this canvas"
          >
            <Upload className="size-3 mr-1.5 text-muted-foreground" />
            <span>Import .pen</span>
          </Button>

          {/* Export .pen file */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border hover:bg-muted active:scale-[0.97]"
            onClick={handleExportPen}
            title="Export design as .pen file"
          >
            <Download className="size-3 mr-1.5 text-muted-foreground" />
            <span>Export .pen</span>
          </Button>

          {/* Convert to React */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border hover:bg-muted active:scale-[0.97]"
            onClick={() => setReactModalOpen(true)}
          >
            <Code2 className="size-3.5 mr-1.5 text-accent-text" />
            <span>Convert to React (0 Token)</span>
          </Button>

          {/* Promote to Task Card */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-border hover:bg-muted active:scale-[0.97]"
            disabled={busy}
            onClick={() => setPromoteModalOpen(true)}
          >
            <ArrowUpRight className="size-3.5 mr-1.5 text-accent-text" />
            <span>Promote to Task</span>
          </Button>

          {/* Duplicate / Fork */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-border hover:bg-muted active:scale-[0.97]"
            disabled={busy}
            onClick={() =>
              run(() => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}), "Variation created", (n) =>
                onOpen(n.id)
              )
            }
            title="Duplicate / Fork"
          >
            <GitFork className="size-3.5 text-muted-foreground" />
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

          <div className="h-4 w-px bg-border mx-0.5" />

          {/* Toggle Floating Inspector */}
          <Button
            size="icon"
            variant={inspectorOpen ? "secondary" : "ghost"}
            className="size-7 text-foreground active:scale-[0.97]"
            onClick={() => setInspectorOpen((v) => !v)}
            title="Toggle Property Inspector (Cmd+])"
          >
            {inspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Main Spatial Body: Full-width spatial canvas with floating inspector */}
      <div className="flex min-h-0 flex-1 relative overflow-hidden bg-background">
        {/* Full-bleed Canvas Viewport */}
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
          onImportPenFile={handleImportIntoCurrentSession}
          onOpenChat={() => setChatOpen(true)}
          activeModel={s.model || "DeepSeek V4.1 Flash"}
          turnCount={s.turns}
          inspectorOpen={inspectorOpen}
        />

        {/* Floating Agent Chat Drawer (Bottom Right) */}
        <div className="absolute bottom-4 right-4 z-30">
          {chatOpen && (
            <div className="w-96 max-w-[calc(100vw-2rem)] h-[440px] rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-border px-3 py-2 bg-muted/40">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="size-3.5 text-accent-text" />
                  <span>Agent Brainstorm</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
                    turn {s.turns}
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-muted-foreground hover:text-foreground active:scale-90"
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
                        ? "bg-accent-text/15 text-foreground ml-4 border border-accent-text/20"
                        : m.role === "system"
                        ? "border border-amber-500/30 text-amber-500 bg-amber-500/10"
                        : "bg-muted mr-4 border border-border text-foreground",
                    )}
                  >
                    <div className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold font-mono">
                      {m.role}
                    </div>
                    {m.content}
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 font-mono">
                    <Loader2 className="size-3.5 animate-spin text-accent-text" />
                    Agent is generating design variations…
                  </div>
                )}
                {s.last_error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    {s.last_error}
                  </div>
                )}
              </div>

              {/* Prompt Box */}
              <form
                className="flex gap-2 border-t border-border p-2.5 bg-card"
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
                  className="text-xs resize-none min-h-[44px] bg-muted text-foreground border-border"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-9 shrink-0 active:scale-[0.97] bg-primary text-primary-foreground hover:opacity-90"
                  disabled={busy || !text.trim()}
                  aria-label="Send message"
                >
                  <Send className="size-3.5" />
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Floating Property Inspector matching Attached Reference Image */}
        {inspectorOpen && (
          <PenPropertyInspector
            selectedNode={selectedPenNode}
            onUpdateNode={handleUpdatePenNode}
            onDeleteNode={handleDeletePenNode}
            onCloseInspector={() => setInspectorOpen(false)}
            saveStatus={penSaveStatus}
            onConvertToReact={() => setReactModalOpen(true)}
            onPromoteToTask={() => setPromoteModalOpen(true)}
          />
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
