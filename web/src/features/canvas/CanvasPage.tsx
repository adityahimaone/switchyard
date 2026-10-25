import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Palette, Play, Square, GitFork, Trash2, ArrowUpRight, Send, Plus } from "lucide-react"
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

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--c-line)]">
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Palette className="size-4" /> Canvas Studio
          </div>
          <Button size="sm" variant="outline" onClick={() => { setCreating(true); setSelected(null) }}>
            <Plus className="size-3.5" /> New
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {(sessions.data ?? []).length === 0 && !sessions.isLoading && (
            <p className="px-2 text-xs text-ink-3">
              No canvases yet. A canvas is a live, source-backed brainstorm workspace built with /create-canvas in an
              isolated git worktree.
            </p>
          )}
          {(sessions.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSelected(s.id); setCreating(false) }}
              className={cn(
                "w-full rounded-control px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent-tint",
                selected === s.id && "bg-accent-tint",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.title}</span>
                <StatusDot s={s} />
              </div>
              <div className="truncate text-[11px] text-ink-3">{s.branch}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          <SessionView
            key={selected}
            id={selected}
            boardSlug={boardSlug}
            onGone={() => { setSelected(null); qc.invalidateQueries({ queryKey: ["canvas-sessions"] }) }}
            onOpen={(id) => { setSelected(id); qc.invalidateQueries({ queryKey: ["canvas-sessions"] }) }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-3">
            Select a canvas or create a new one.
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
  // Windows workers are refused by the server (POSIX shell scripts); hide them
  // here so the picker never offers a workspace that is guaranteed to fail.
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
  const [dialkit, setDialkit] = useState(false)
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
          Creates an isolated git worktree. The agent may only change canvas files; anything else is reverted.
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
          DialKit live editing — adds <code>dialkit</code> to this worktree only (React projects). Tweaks are applied back
          to source through the agent, never directly.
        </span>
      </label>
      <Button disabled={!workspaceId || !title.trim() || create.isPending} onClick={() => create.mutate()}>
        {create.isPending && <Loader2 className="size-4 animate-spin" />} Create canvas
      </Button>
    </div>
  )
}

function SessionView({
  id,
  boardSlug,
  onGone,
  onOpen,
}: {
  id: string
  boardSlug: string
  onGone: () => void
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const detail = useQuery({
    queryKey: ["canvas-session", id],
    queryFn: () => api<{ session: CanvasSession; messages: CanvasMessage[] }>(`/api/canvas/sessions/${id}`),
    refetchInterval: (q) => (q.state.data?.session.status === "working" ? 2500 : 8000),
  })
  const s = detail.data?.session
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["canvas-session", id] })
    qc.invalidateQueries({ queryKey: ["canvas-sessions"] })
  }
  const run = <T,>(fn: () => Promise<T>, ok?: string, then?: (r: T) => void) =>
    fn().then((r) => { if (ok) toastGlobal(ok, "success"); then?.(r); refresh() }).catch((e: Error) => toastGlobal(e.message, "error"))

  const [frameKey, setFrameKey] = useState(0)
  useEffect(() => {
    // Remount the iframe when the dev server (re)starts so it picks up the new view URL.
    setFrameKey((k) => k + 1)
  }, [s?.server, s?.view_url])

  if (!s) return <div className="flex flex-1 items-center justify-center text-sm text-ink-3">Loading…</div>
  const busy = s.status === "working"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--c-line)] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{s.title}</h2>
            <Badge variant="outline">{s.status}</Badge>
            {s.dialkit && <Badge variant="outline">DialKit</Badge>}
          </div>
          <div className="truncate text-[11px] text-ink-3">{s.branch} · {s.executor} · turn {s.turns}</div>
        </div>
        {s.server === "running" ? (
          <Button size="sm" variant="outline" onClick={() => run(() => post(`/api/canvas/sessions/${id}/stop`))}>
            <Square className="size-3.5" /> Stop server
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => post(`/api/canvas/sessions/${id}/start`), "Dev server started")}>
            <Play className="size-3.5" /> Start server
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={() =>
          run(() => post<CanvasSession>(`/api/canvas/sessions/${id}/fork`, {}), "Variation created", (n) => onOpen(n.id))}>
          <GitFork className="size-3.5" /> Fork
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() =>
          run(() => post<{ task_id: string }>(`/api/canvas/sessions/${id}/promote`, { board: boardSlug }),
            `Promoted to a triage card on ${boardSlug}`)}>
          <ArrowUpRight className="size-3.5" /> Promote
        </Button>
        <Button size="sm" variant="outline" onClick={() => {
          if (window.confirm("Discard this canvas? The worktree and branch are deleted.")) {
            run(() => post(`/api/canvas/sessions/${id}/discard`), "Canvas discarded", onGone)
          }
        }}>
          <Trash2 className="size-3.5" /> Discard
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-h-0 border-r border-[var(--c-line)]">
          {s.server === "running" && s.view_url ? (
            <iframe
              key={frameKey}
              title={`Canvas ${s.title}`}
              src={s.view_url}
              // Sandboxed execution with same-origin so Next.js hydration, storage
              // and subresource loading work. The auth cookie is HttpOnly and stripped by the proxy.
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-3">
              <Palette className="size-6" />
              <p>The dev server is stopped. Ask the agent to build the canvas, then start the server.</p>
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {(detail.data?.messages ?? []).map((m) => (
              <div key={m.id} className={cn("rounded-control px-3 py-2 text-xs whitespace-pre-wrap",
                m.role === "user" ? "bg-accent-tint" : m.role === "system" ? "border border-amber-500/40 text-amber-600" : "bg-[var(--c-canvas)]")}>
                <div className="mb-0.5 text-[10px] uppercase tracking-wide text-ink-3">{m.role}</div>
                {m.content}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-ink-3"><Loader2 className="size-3.5 animate-spin" /> Agent is working…</div>}
            {s.last_error && <div className="rounded-control border border-red-500/40 p-2 text-xs text-red-500">{s.last_error}</div>}
          </div>
          <form
            className="flex gap-2 border-t border-[var(--c-line)] p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim() || busy) return
              const msg = text
              setText("")
              run(() => post(`/api/canvas/sessions/${id}/messages`, { message: msg }))
            }}
          >
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask for a variation, compare layouts, tune a component…" className="text-xs"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit() }} />
            <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </section>
      </div>
    </div>
  )
}
