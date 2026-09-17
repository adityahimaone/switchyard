import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArrowUp, FileImage, MoreHorizontal, Pencil, Plus, Puzzle, Search, Square, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { BorderBeam } from "@/components/ui/border-beam"
import { MessageScroller } from "@/components/agents/message-scroller"
import { StreamingText } from "@/components/agents/streaming-text"
import { AgentProgress } from "@/components/agents/loading-states"
import { TaskList, type TaskListTask } from "@/TodoList"
import { ThinkingOrb } from "thinking-orbs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SystemModal } from "@/components/ui/system-modal"
import { AttachmentChip } from "@/components/AttachmentChip"
import { EventCards } from "@/components/chat/EventCard"
import { SessionMenu } from "@/components/chat/SessionMenu"
import { analyzeAttachment, api, archiveChatSession, createChatSession, deleteChatSession, duplicateChatSession, forkChatSession, getChatActiveRun, getChatRun, listChatMessages, listChatRunEvents, listChatSessions, listActiveChatRuns, listProviders, listSkills, openEventStream, sendChatMessage, stopChatRun, toastGlobal, unarchiveChatSession, updateChatSession, uploadAttachment, type Attachment, type ChatAgent, type ChatMessage, type ChatRun, type ChatRunEvent, type ChatSession, type ChatState, type Profile, type Workspace } from "@/api"

type Props = { profiles: Profile[]; workspaces: Workspace[]; initialSessionID?: string; onSessionChange?: (sessionID: string) => void; sidebarOpen?: boolean }
type SessionAction = "rename" | "archive" | "delete" | "restore"

function stateLabel(state?: ChatState) { return state ? state.toUpperCase() : "READY" }
function stateTone(state?: ChatState) { return state === "done" ? "text-emerald-400" : state === "error" || state === "cancelled" ? "text-red-400" : state === "running" || state === "loading" ? "text-amber-300" : "text-neutral-500" }

function elapsedLabel(startedAt?: number, endedAt?: number | null, now = Date.now()) {
  if (!startedAt) return "0.0s"
  const seconds = Math.max(0, ((endedAt ? endedAt * 1000 : now) - startedAt * 1000) / 1000)
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function MessageFooter({ run, sessionID, messageCreatedAt, isStreaming }: { run?: ChatRun; sessionID?: string; messageCreatedAt?: number; isStreaming?: boolean }) {
  const active = !!isStreaming && (run?.state === "loading" || run?.state === "running")
  const isError = run?.state === "error" || run?.state === "cancelled"
  const modelLabel = run?.model || "default"
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !run) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active, run])
  const elapsed = run ? elapsedLabel(run.started_at, run.ended_at, now) : ""
  const clockTime = messageCreatedAt ? new Date(messageCreatedAt * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""
  return <span tabIndex={0} aria-label={`Message details${run?.profile ? `, profile ${run.profile}` : ""}`} className="chat-message-footer inline-flex items-center gap-1.5 text-[11px] leading-none text-[var(--color-ink-3)]">
    {clockTime && <span className="font-mono tabular-nums">{clockTime}</span>}
    {run?.profile && <span className="chat-message-profile">{run.profile}</span>}
    <span className="chat-message-hover-meta items-center gap-1.5">
      <span className="max-w-[110px] truncate font-mono text-[11px] text-[var(--color-ink-3)]" title={modelLabel}>{modelLabel}</span>
      {run && elapsed && <><span className="text-[var(--color-ink-4)]">·</span><span className="font-mono tabular-nums" title="elapsed">{elapsed}</span></>}
      {sessionID && <><span className="text-[var(--color-ink-4)]">·</span><span className="font-mono text-[10px]" title={sessionID}>{sessionID}</span></>}
      {isError && run && <><span className="text-[var(--color-ink-4)]">·</span><span className={stateTone(run.state)}>{stateLabel(run.state)}</span></>}
    </span>
  </span>
}

const PHASE_LABELS: Record<string, string> = {
  profile_context: "Loading profile context",
  loading_context: "Loading workspace context",
  resuming_session: "Resuming conversation",
  new_session: "Starting a new conversation",
  codegraph_check: "Checking workspace structure",
  model_call_started: "Running Hermes",
  reading_skill: "Reading agent skill",
  reading_instructions: "Reading project instructions",
  shell_command: "Using shell command",
  file_operation: "Working with workspace files",
  session_created: "Session context updated",
}

function eventPayload(event: ChatRunEvent): Record<string, string> {
  try {
    const value = JSON.parse(event.payload) as Record<string, unknown>
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === "string")) as Record<string, string>
  } catch {
    return {}
  }
}

function AgentTaskPlan({ events, title = "Context activity", defaultOpen = true, complete = false }: { events: ChatRunEvent[]; title?: string; defaultOpen?: boolean; complete?: boolean }) {
  const tasks: TaskListTask[] = events.filter((event) => event.kind === "phase" || event.kind === "spawned" || event.kind === "error" || event.kind === "cancelled").map((event, index, all) => {
    const payload = eventPayload(event)
    const failed = event.kind === "error" || event.kind === "cancelled"
    const status = failed ? "error" : complete || index < all.length - 1 ? "done" : "active"
    const label = event.kind === "spawned" ? "Started Agent Hermes" : event.kind === "phase" ? payload.label ?? PHASE_LABELS[payload.phase] ?? "Working" : failed ? (event.kind === "error" ? "Agent reported an error" : "Run cancelled") : "Working"
    return { id: String(event.id), status, label, detail: new Date(event.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
  })
  return <TaskList tasks={tasks} title={title} defaultOpen={defaultOpen} complete={complete} />
}

function progressLabelForEvents(events: ChatRunEvent[], runState?: ChatState) {
  const phase = events.filter((event) => event.kind === "phase").map(eventPayload).at(-1)
  if (phase?.label) return phase.label
  if (runState === "loading") return "Preparing agent"
  if (runState === "running") return "Working through request"
  return "Working"
}
const EXAMPLE_PROMPTS = ["Summarize this workspace", "Inspect current task status", "Help me plan next step"]
const CHAT_COMMANDS = [
  { command: "/clear", label: "Clear draft", description: "Remove the text in the composer." },
  { command: "/stop", label: "Stop run", description: "Stop the active agent run." },
  { command: "/new", label: "New chat", description: "Start a separate chat room." },
]

type GroupKey = "today" | "yesterday" | "prev7" | "prev30" | "older"
const GROUP_LABEL: Record<GroupKey, string> = { today: "Today", yesterday: "Yesterday", prev7: "Previous 7 days", prev30: "Previous 30 days", older: "Older" }
const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "prev7", "prev30", "older"]

function groupKeyFor(ts: number): GroupKey {
  const d = new Date(ts * 1000)
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const dMs = d.getTime()
  const day = 86400000
  if (dMs >= startMs) return "today"
  if (dMs >= startMs - day) return "yesterday"
  if (dMs >= startMs - 7 * day) return "prev7"
  if (dMs >= startMs - 30 * day) return "prev30"
  return "older"
}

function isSshWorkspace(w: Workspace): boolean { return !!w.host && w.host !== "localhost" && w.host !== "127.0.0.1" }
function isLive(w: Workspace): boolean { return w.status === "connected" || w.status === "local" }

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return <div className="space-y-2 whitespace-pre-wrap break-words">{blocks.map((part, index) => {
    if (part.startsWith("```")) return <pre key={index} className="overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs">{part.replace(/^```[a-z]*\n?/, "").replace(/```$/, "")}</pre>
    const inline = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((chunk, j) => {
      if (chunk.startsWith("`") && chunk.endsWith("`")) return <code key={j} className="rounded bg-white/10 px-1 py-0.5 text-xs">{chunk.slice(1, -1)}</code>
      if (chunk.startsWith("**") && chunk.endsWith("**")) return <strong key={j}>{chunk.slice(2, -2)}</strong>
      return <span key={j}>{chunk}</span>
    })
    return <div key={index}>{inline}</div>
  })}</div>
}

function splitResponseText(text: string) {
  const notices: string[] = []
  const body: string[] = []
  for (const line of text.split("\n")) {
    const value = line.trim()
    const normalized = value.toLowerCase()
    if (/^(?:↻\s*)?(resumed|resuming|starting|new) session\b/.test(normalized) || normalized.startsWith("starting a new conversation")) {
      notices.push(value)
    } else if (!normalized.startsWith("session context updated")) {
      body.push(line)
    }
  }
  return { notice: notices.join("\n"), text: body.join("\n").trim() }
}

function SessionNotice({ text }: { text: string }) {
  if (!text) return null
  return <div className="mb-3 flex max-w-full items-start gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)] px-3 py-2 text-[11px] text-[var(--color-ink-3)]">
    <span aria-hidden className="mt-0.5 text-[var(--color-accent)]">↻</span>
    <span className="min-w-0 whitespace-pre-wrap break-words font-mono leading-5">{text.replace(/^↻\s*/, "")}</span>
  </div>
}

export default function ChatPage({ profiles, workspaces, initialSessionID, onSessionChange, sidebarOpen = true }: Props) {
  const qc = useQueryClient()
  const [sessionID, setSessionID] = useState<string | undefined>(() => initialSessionID)
  const [query, setQuery] = useState("")
  const [profile, setProfile] = useState("default")
  const [workspace, setWorkspace] = useState("")
  const [model, setModel] = useState("")
  const [modelSearch, setModelSearch] = useState("")
  const [prompt, setPrompt] = useState("")
  const [selectedRun, setSelectedRun] = useState<ChatRun>()
  const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({})
  const shouldFollowChatRef = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [sessionAction, setSessionAction] = useState<{ kind: SessionAction; session: ChatSession } | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const streamBufferRef = useRef<Record<string, string>>({})
  // sync ref for use in event handlers without re-binding effect
  useEffect(() => { streamBufferRef.current = streamBuffer }, [streamBuffer])

  const agent: ChatAgent = "hermes"
  const initialCreate = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState("")
  const [analyzeBusy, setAnalyzeBusy] = useState<string | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const skills = useQuery({ queryKey: ["chat-skills"], queryFn: () => listSkills() })
  const commandQuery = prompt.match(/(?:^|\s)(\/[^\s]*)$/)?.[1] ?? ""
  const skillQuery = prompt.match(/(?:^|\s)(\$[^\s]*)$/)?.[1].slice(1) ?? ""
  const commandMatches = CHAT_COMMANDS.filter((item) => item.command.startsWith(commandQuery))
  const skillMatches = (skills.data ?? []).filter((item) => item.name.toLowerCase().startsWith(skillQuery.toLowerCase()))
  const autocompleteOpen = commandQuery.length > 0 || skillQuery.length > 0
  function insertSkill(name: string) {
    setPrompt((value) => value.replace(/(?:^|\s)\$[^\s]*$/, (match) => `${match.startsWith(" ") ? " " : ""}$${name} `))
  }
  function executeCommand(command: string) {
    if (command === "/clear") setPrompt("")
    if (command === "/stop" && run && isRunning) void stopChatRun(run.id).then(() => getChatRun(run.id).then(setSelectedRun))
    if (command === "/new") void newChat()
  }
  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files as FileList)
    if (!list.length) return
    setUploadErr("")
    setUploading(true)
    for (const f of list) {
      try {
        const att = await uploadAttachment(f)
        setPendingAtts((prev) => [...prev, att])
      } catch (e) { setUploadErr((e as Error).message) }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }
  async function analyzePending(id: string) {
    const targetModel = model || profiles.find((p) => p.name === profile)?.model || ""
    if (!targetModel) { setUploadErr("Pick a model first (vision-capable: gpt-4o / claude-3 / gemini)"); return }
    setAnalyzeBusy(id); setAnalyzeResult(null); setUploadErr("")
    try {
      const res = await analyzeAttachment(id, targetModel, prompt.trim() || "Analyze this attachment")
      setAnalyzeResult(res.result)
    } catch (e) { setUploadErr((e as Error).message) }
    finally { setAnalyzeBusy(null) }
  }
  const sessions = useQuery({ queryKey: ["chat-sessions", false], queryFn: () => listChatSessions(false) })
  const archivedSessions = useQuery({ queryKey: ["chat-sessions", true], queryFn: () => listChatSessions(true), enabled: showArchived })
  const current = useQuery({ queryKey: ["chat-session", sessionID], queryFn: () => api<ChatSession>(`/api/chat/sessions/${sessionID}`), enabled: !!sessionID })
  const messages = useQuery({ queryKey: ["chat-messages", sessionID], queryFn: () => listChatMessages(sessionID!), enabled: !!sessionID })
  const providers = useQuery({ queryKey: ["providers"], queryFn: listProviders })
  const activeRunQuery = useQuery({ queryKey: ["chat-active-run", sessionID], queryFn: () => getChatActiveRun(sessionID!), enabled: !!sessionID })
  const activeRuns = useQuery({ queryKey: ["chat-active-runs"], queryFn: listActiveChatRuns })
  const activeRunBySession = useMemo(() => new Map((activeRuns.data ?? []).map((item) => [item.session_id, item])), [activeRuns.data])
  const persistedActive = activeRunQuery.data ?? undefined
  const run = selectedRun && selectedRun.session_id === sessionID ? selectedRun : persistedActive
  const events = useQuery({ queryKey: ["chat-run-events", run?.id], queryFn: () => listChatRunEvents(run!.id), enabled: !!run?.id })

  const modelOptions = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((p) => { if (p.model) set.add(p.model) })
    providers.data?.forEach((p) => p.models.forEach((m) => set.add(m)))
    return Array.from(set).sort()
  }, [profiles, providers.data])
  const filteredModelOptions = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase()
    if (!needle) return modelOptions
    return modelOptions.filter((option) => option.toLowerCase().includes(needle))
  }, [modelOptions, modelSearch])

  function setActive(id: string) {
    setSessionID(id)
    setSelectedRun(undefined)
    shouldFollowChatRef.current = true
    setShowJumpToLatest(false)
    if (onSessionChange) onSessionChange(id)
  }


  useEffect(() => {
    if (initialSessionID && initialSessionID !== sessionID) setSessionID(initialSessionID)
  }, [initialSessionID])

  useEffect(() => {
    if (!current.data || current.data.id !== sessionID) return
    setProfile(current.data.profile)
    setWorkspace(current.data.workspace)
    setModel(current.data.model)
  }, [current.data?.id, sessionID]) // ponytail: prop drives initial active session; internal setActive updates caller via onSessionChange

  useEffect(() => {
    if (sessions.isSuccess && sessions.data?.length === 0 && !initialCreate.current) {
      initialCreate.current = true
      void createChatSession({ title: "New chat", agent: "hermes", profile: "default", workspace: "", model: "" }).then((created) => {
        setActive(created.id)
        void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }).catch(() => { initialCreate.current = false })
      return
    }
    if (!sessionID && sessions.data?.[0]) setActive(sessions.data[0].id)
  }, [qc, sessionID, sessions.data, sessions.isSuccess])

  useEffect(() => openEventStream((event) => {
    const runId = run?.id
    // accumulate tool_output lines into stream buffer for progressive rendering
    if (event.kind === "chat_run_event" && event.data?.run_id && event.data.run_id === runId) {
      try {
        const payload = typeof event.data.payload === "string" ? JSON.parse(event.data.payload) : event.data.payload
        if (payload?.kind === "tool_output" && typeof payload.text === "string") {
          const rid = event.data.run_id
          setStreamBuffer((prev) => ({ ...prev, [rid]: (prev[rid] ?? "") + payload.text + "\n" }))
          return // don't double-invalidate queries for every line
        }
      } catch { /* parse error, fall through to standard handling */ }
    }
    if ((event.kind === "chat_run" || event.kind === "chat_run_event") && event.data?.run_id && runId && event.data.run_id === runId) {
      void getChatRun(runId).then((fresh) => {
        setSelectedRun(fresh)
        // on terminal state, clear stream buffer (final output replaces it)
        if (fresh.state === "done" || fresh.state === "error" || fresh.state === "cancelled") {
          setStreamBuffer((prev) => { const n = { ...prev }; delete n[fresh.id]; return n })
          void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] })
          void qc.invalidateQueries({ queryKey: ["chat-active-run", sessionID] })
        }
      }).catch(() => undefined)
      void qc.invalidateQueries({ queryKey: ["chat-run-events", runId] })
    }
    if (event.kind.startsWith("chat_")) { void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); void qc.invalidateQueries({ queryKey: ["chat-active-runs"] }); if (event.data?.session_id) void qc.invalidateQueries({ queryKey: ["chat-active-run", event.data.session_id] }); if (event.data?.session_id === sessionID) void qc.invalidateQueries({ queryKey: ["chat-session", sessionID] }) }
  }), [qc, run?.id, sessionID])


  const visibleSessions = showArchived ? (archivedSessions.data ?? []) : (sessions.data ?? [])
  const filteredSessions = useMemo(() => visibleSessions.filter((item) => {
    const text = `${item.title} ${item.agent} ${item.profile} ${item.workspace} ${item.model}`.toLowerCase()
    return !query || text.includes(query.toLowerCase())
  }), [query, visibleSessions])

  const grouped = useMemo(() => {
    const map: Record<GroupKey, ChatSession[]> = { today: [], yesterday: [], prev7: [], prev30: [], older: [] }
    for (const s of filteredSessions) map[groupKeyFor(s.updated_at)].push(s)
    return map
  }, [filteredSessions])

  const send = useMutation({
    onMutate: () => {
      shouldFollowChatRef.current = true
      setShowJumpToLatest(false)
      window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }))
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80)
    },
    mutationFn: () => {
      if (uploading) throw new Error("Wait for attachment upload to finish")
      if (model && modelOptions.length > 0 && !modelOptions.includes(model)) throw new Error(`model ${model} not in provider roster`)
      const ids = pendingAtts.map((a) => a.id)
      if (!ids.length) return sendChatMessage(sessionID!, { content: prompt, agent, profile, workspace, model })
      return sendChatMessage(sessionID!, { content: prompt, agent, profile, workspace, model, attachment_ids: ids })
    },
    onSuccess: (data) => { setPrompt(""); setPendingAtts([]); setUploadErr(""); setAnalyzeResult(null); setSelectedRun(data.run); void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-session", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-active-run", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 120) },
  })

  async function newChat() { const created = await createChatSession({ title: "New chat", agent, profile, workspace, model }); setActive(created.id); await qc.invalidateQueries({ queryKey: ["chat-sessions"] }) }
  async function selectSession(item: ChatSession) { setActive(item.id); setProfile(item.profile); setWorkspace(item.workspace); setModel(item.model); void getChatActiveRun(item.id).then((next) => setSelectedRun(next ?? undefined)).catch(() => undefined) }
  function openSessionAction(kind: SessionAction, item: ChatSession) {
    setSessionAction({ kind, session: item })
    setRenameDraft(item.title)
    setActionError("")
  }
  async function confirmSessionAction() {
    if (!sessionAction) return
    const { kind, session: item } = sessionAction
    if (kind === "rename" && !renameDraft.trim()) return setActionError("A chat title is required.")
    setActionBusy(true)
    setActionError("")
    try {
      if (kind === "rename") await updateChatSession(item.id, { title: renameDraft.trim() })
      if (kind === "archive") await archiveChatSession(item.id)
      if (kind === "restore") await unarchiveChatSession(item.id)
      if (kind === "delete") await deleteChatSession(item.id)
      await qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      if (kind === "rename" && item.id === sessionID) await qc.invalidateQueries({ queryKey: ["chat-session", sessionID] })
      if ((kind === "archive" || kind === "delete") && item.id === sessionID) {
        const next = sessions.data?.find((candidate) => candidate.id !== item.id)
        if (next) setActive(next.id)
        else setSessionID(undefined)
      }
      setSessionAction(null)
    } catch (error) {
      setActionError((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }
  async function duplicateSession(item: ChatSession) { const dup = await duplicateChatSession(item.id); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); setActive(dup.id); toastGlobal("Chat duplicated") }
  async function forkSession(item: ChatSession, messageId: string) { const fork = await forkChatSession(item.id, messageId); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); setActive(fork.id); toastGlobal("Fork created") }
  const activeMessages: ChatMessage[] = messages.data ?? []
  const isRunning = run?.state === "loading" || run?.state === "running"
  useEffect(() => {
    if (!activeMessages.length && !isRunning) return
    if (!shouldFollowChatRef.current) return
    const frame = window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }))
    return () => window.cancelAnimationFrame(frame)
  }, [activeMessages.length, events.data?.length, isRunning, run?.id, run?.state, run?.output, run?.id ? streamBuffer[run.id] : ""])

  // ponytail: fetch historical runs per-message so footer shows original model/time, not current selector state. add batch endpoint when >50 messages.
  const messageRunIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of activeMessages) { if (m.role === "assistant" && m.run_id) ids.add(m.run_id) }
    if (run?.id) ids.add(run.id)
    return Array.from(ids)
  }, [activeMessages, run?.id])
  const messageRuns = useQuery({
    queryKey: ["chat-runs-batch", messageRunIds],
    queryFn: async () => {
      const map: Record<string, ChatRun> = {}
      await Promise.all(messageRunIds.map(async (rid) => {
        try { map[rid] = await getChatRun(rid) } catch {}
      }))
      return map
    },
    enabled: messageRunIds.length > 0,
  })
  const runMap = messageRuns.data ?? {}
  const messageRunEvents = useQuery({
    queryKey: ["chat-run-events-batch", messageRunIds],
    queryFn: async () => {
      const map: Record<string, ChatRunEvent[]> = {}
      await Promise.all(messageRunIds.map(async (rid) => {
        try { map[rid] = await listChatRunEvents(rid) } catch {}
      }))
      return map
    },
    enabled: messageRunIds.length > 0,
  })
  const runEventsMap = messageRunEvents.data ?? {}

  return <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--color-bg)]">
    {sidebarOpen && <aside className="flex w-[min(280px,85vw)] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-2">
        <span className="px-1 text-sm font-semibold tracking-tight">{showArchived ? "Archived chats" : "Chats"}</span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className={`size-7 ${showArchived ? "text-[var(--color-accent)]" : ""}`} onClick={() => setShowArchived((value) => !value)} title={showArchived ? "Show active chats" : "Show archived chats"}><Archive className="size-3.5" /></Button>
          {!showArchived && <Button size="icon" variant="ghost" className="size-7" onClick={() => void newChat()} title="New chat"><Plus className="size-4" /></Button>}
        </div>
      </div>
      <div className="border-b border-[var(--color-line)] p-2">
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-3)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="h-8 pl-7 text-xs" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filteredSessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-line)] p-4 text-center text-xs text-muted-foreground">No chat for this filter</div>
        ) : (
          GROUP_ORDER.map((key) => {
            const items = grouped[key]
            if (items.length === 0) return null
            return (
              <div key={key} className="mb-3">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-ink-3)]">{GROUP_LABEL[key]} <span className="font-normal normal-case tracking-normal text-[var(--color-ink-4)]">· {items.length}</span></div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.id} className={`group flex w-full items-stretch rounded-lg border transition-colors ${item.id === sessionID ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10" : "border-transparent bg-transparent hover:bg-white/[0.04]"}`}>
                      <button type="button" onClick={() => void selectSession(item)} title={item.title} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                        <div className="max-w-full truncate text-xs font-medium leading-none">{item.title}</div>
                        <div className="mt-1 flex max-w-full items-center gap-1 truncate text-[11px] text-[var(--color-ink-3)]">
                          <span className="truncate">{item.workspace || "local"}</span>
                          {item.model && <><span className="text-[var(--color-ink-4)]">·</span><span className="truncate font-mono text-[10px]">{item.model.split("/").pop()}</span></>}
                          {activeRunBySession.has(item.id) && <ThinkingOrb state="working" size={20} aria-label="Agent running" className="ml-auto size-4 shrink-0" />}
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={`Actions for ${item.title}`} className="mr-1 self-center rounded-md p-1.5 text-[var(--color-ink-3)] opacity-0 transition-opacity hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] group-hover:opacity-100"><MoreHorizontal className="size-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-[var(--color-line)] bg-[var(--color-surface-raised)]">
                          <DropdownMenuItem onSelect={() => openSessionAction("rename", item)}><Pencil className="size-3.5" /> Rename</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openSessionAction(showArchived ? "restore" : "archive", item)}><Archive className="size-3.5" /> {showArchived ? "Restore" : "Archive"}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => openSessionAction("delete", item)}><Trash2 className="size-3.5" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="border-t border-[var(--color-line)] px-2 py-2 text-[11px] text-[var(--color-ink-3)]">{filteredSessions.length} {showArchived ? "archived" : "active"} chats</div>
    </aside>}
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)]/60 px-4 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{current.data?.title ?? "New chat"}</div>
        </div>
        {current.data && <SessionMenu session={current.data} onDuplicate={() => duplicateSession(current.data!)} onDelete={() => openSessionAction("delete", current.data!)} />}
      </header>
      <MessageScroller busy={isRunning} showJump={showJumpToLatest} onFollowChange={(following) => { shouldFollowChatRef.current = following; setShowJumpToLatest(!following) }} onJump={() => { shouldFollowChatRef.current = true; setShowJumpToLatest(false); bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }}>
        <div className="mx-auto max-w-3xl space-y-6">
        {activeMessages.length === 0 && !run ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6">
            <div className="text-sm font-medium">Start a conversation</div>
            <div className="mt-1 text-sm leading-6 text-[var(--color-ink-3)]">Pick a prompt or type your own. Agent runs show live context activity.</div>
            <div className="mt-4 flex flex-wrap gap-1.5">{EXAMPLE_PROMPTS.map((example) => <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs hover:border-[var(--color-line-strong)]">{example}</button>)}</div>
          </div>
        ) : activeMessages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {message.role === "user" ? (
              <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                <div>{message.content}</div>
                {message.attachments?.length ? <div className="mt-2 flex flex-wrap gap-2">{message.attachments.map((att) => <AttachmentChip key={att.id} att={att} />)}</div> : null}
              </div>
            ) : (
              <div className="relative w-full min-w-0">
                {(() => {
                  const messageStreaming = isRunning && message.id === activeMessages[activeMessages.length - 1]?.id
                  const response = splitResponseText(messageStreaming && run?.id && streamBuffer[run.id] ? streamBuffer[run.id] : message.content)
                  const msgRun = messageStreaming ? run : (message.run_id ? runMap[message.run_id] : undefined)
                  const msgEvents = messageStreaming ? (events.data ?? []) : (message.run_id ? (runEventsMap[message.run_id] ?? []) : [])
                  const cardEvents = msgEvents.filter((event) => event.kind !== "phase" && event.kind !== "spawned" && event.kind !== "error" && event.kind !== "cancelled")
                  return <><SessionNotice text={response.notice} /><StreamingText status={messageStreaming ? "streaming" : "complete"} copyText={response.text} footer={<MessageFooter run={msgRun} sessionID={current.data?.hermes_session_id} isStreaming={messageStreaming} messageCreatedAt={message.created_at} />}><Markdown text={response.text} />{!messageStreaming && msgEvents.length > 0 && <AgentTaskPlan events={msgEvents} title="Context activity" defaultOpen={false} complete={msgRun?.state === "done"} />}<EventCards events={cardEvents} /></StreamingText></>
                })()}
                {current.data && <div className="absolute right-0 top-0 z-10 opacity-70 hover:opacity-100"><SessionMenu session={current.data} forkMessageId={message.id} onDuplicate={() => duplicateSession(current.data!)} onFork={(session) => forkSession(session, message.id)} onDelete={() => openSessionAction("delete", current.data!)} /></div>}
              </div>
            )}
          </div>
        ))}
        {run && isRunning && <div className="chat-agent-progress">
          <AgentProgress label={progressLabelForEvents(events.data ?? [], run.state)} initialSeconds={Math.max(0, (Date.now() - run.started_at * 1000) / 1000)} />
          <AgentTaskPlan events={events.data ?? []} title="Context activity" defaultOpen />
          <EventCards events={(events.data ?? []).filter((event) => event.kind !== "phase" && event.kind !== "spawned" && event.kind !== "error" && event.kind !== "cancelled")} />
        </div>}
        <div ref={bottomRef} aria-hidden="true" />
        </div>
      </MessageScroller>
      <div className="border-t border-[var(--color-line)] bg-[var(--color-surface)]/40 p-3 backdrop-blur">
        <BorderBeam size="md" colorVariant="colorful" strength={0.7} className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-[var(--color-surface)] p-2">
          <div className="relative overflow-visible">
            {autocompleteOpen && (commandMatches.length > 0 || skillMatches.length > 0) && <div className="absolute bottom-full left-0 z-20 mb-2 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-1 shadow-lg">
              {commandMatches.map((item) => <button key={item.command} type="button" className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]" onMouseDown={(event) => event.preventDefault()} onClick={() => { setPrompt((value) => value.replace(/(?:^|\s)\/[^\s]*$/, `${item.command} `)); if (item.command === "/clear" || item.command === "/stop" || item.command === "/new") executeCommand(item.command) }}><span className="w-14 shrink-0 font-mono text-[11px] text-[var(--color-accent)]">{item.command}</span><span className="text-xs"><span className="block">{item.label}</span><span className="text-[10px] text-[var(--color-ink-3)]">{item.description}</span></span></button>)}
              {skillMatches.slice(0, 12).map((item) => <button key={item.name} type="button" className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSkill(item.name)}><Puzzle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-accent)]" /><span className="min-w-0 text-xs"><span className="block font-mono">${item.name}</span><span className="block truncate text-[10px] text-[var(--color-ink-3)]">{item.description}</span></span></button>)}
            </div>}
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && autocompleteOpen) { event.preventDefault(); setPrompt((value) => value.replace(/(?:^|\s)[/$][^\s]*$/, "")); return }
                if (event.key === "Enter" && !event.shiftKey) {
                  if (commandMatches.length > 0 && commandQuery) { event.preventDefault(); const item = commandMatches[0]; setPrompt((value) => value.replace(/(?:^|\s)\/[^\s]*$/, `${item.command} `)); executeCommand(item.command); return }
                  if (skillMatches.length > 0 && skillQuery) { event.preventDefault(); insertSkill(skillMatches[0].name); return }
                  event.preventDefault(); if (prompt.trim() && sessionID && !send.isPending && !isRunning && !uploading) send.mutate()
                }
              }}
              placeholder="Message agent..."
              rows={1}
              className="field-sizing-content max-h-40 min-h-[44px] resize-none border-0 bg-transparent py-2.5 pr-12 shadow-none focus-visible:ring-0"
            />

          </div>
          <div className="relative mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <DropdownMenu open={composerMenuOpen} onOpenChange={setComposerMenuOpen}>
              <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="outline" className="size-8 rounded-full" aria-label="Add to message"><Plus className="size-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 border-[var(--color-line)] bg-[var(--color-surface-raised)]">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}><FileImage className="size-4" /> Attach image</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPrompt((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}$`)}><Puzzle className="size-4" /> Use skill</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Select value={profile || "default"} onValueChange={setProfile}>
              <SelectTrigger size="sm" className="h-7 w-36 truncate rounded-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue placeholder="profile" /></SelectTrigger>
              <SelectContent className="max-w-80 border-[var(--color-line)] bg-[var(--color-surface)]">{profiles.map((item) => <SelectItem key={item.name} value={item.name} disabled={!item.valid} className="text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar className="size-4 shrink-0">
                    {item.avatar_url && <AvatarImage src={item.avatar_url} alt={item.name} />}
                    <AvatarFallback className="bg-[var(--color-inset)] text-[7px] text-[var(--color-accent)]">{item.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">{item.name}{item.model ? ` — ${item.model}` : ""}{item.active ? " (active)" : ""}{!item.valid ? " (broken config)" : ""}</span>
                </span>
              </SelectItem>)}</SelectContent>
            </Select>
            <Select value={workspace || "__local"} onValueChange={(v) => setWorkspace(v === "__local" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 max-w-36 truncate rounded-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-w-80 border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="__local">local</SelectItem>{workspaces.map((v) => { const live = isLive(v); const ssh = isSshWorkspace(v); const os = (v.os || "").toLowerCase(); const osLabel = os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""; return <SelectItem key={v.id} value={v.path} className="min-w-0 text-sm" title={v.path}><span className="flex min-w-0 items-center gap-1.5">{live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" /> }<span className="min-w-0 flex-1 truncate">{v.name}</span>{ssh && <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 px-1 py-0 text-[9px] leading-none text-violet-300">ssh</Badge>}{osLabel && <Badge variant="outline" className="shrink-0 border-[var(--color-line)] bg-[var(--color-bg)] px-1 py-0 text-[9px] leading-none text-neutral-400">{osLabel}</Badge>}{live && <span className="size-1.5 shrink-0 rounded-full bg-emerald-400/60" />}</span></SelectItem> })}</SelectContent>
            </Select>
            <Select value={model || "__default"} onValueChange={(v) => setModel(v === "__default" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 w-32 truncate rounded-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue placeholder="model default" /></SelectTrigger>
              <SelectContent position="popper" align="start" className="h-[300px] max-h-[300px] w-72 min-w-72 max-w-72 border-[var(--color-line)] bg-[var(--color-surface)]">
                <div className="sticky top-0 z-10 bg-[var(--color-surface)] p-1" onKeyDown={(event) => event.stopPropagation()}>
                  <Input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Search model…" aria-label="Search models" className="h-7 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
                </div>
                <SelectItem value="__default">model default</SelectItem>
                {filteredModelOptions.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-500">No model found</p>}
                {filteredModelOptions.map((v) => <SelectItem key={v} value={v} className="max-w-72 truncate text-sm" title={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files ?? [])} />
            {uploading && <span className="text-[11px] text-[var(--color-ink-3)]">Uploading…</span>}
            {pendingAtts.length > 0 && <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={!model && !profiles.find((p) => p.name === profile)?.model || analyzeBusy !== null} onClick={() => { const first = pendingAtts[0]; if (first) void analyzePending(first.id) }}>{analyzeBusy ? "Analyzing…" : "Analyze"}</Button>}
            {uploadErr && <span className="text-[11px] text-red-400">{uploadErr}</span>}
            {analyzeResult && <p className="ml-2 max-w-md truncate text-[11px] text-emerald-400" title={analyzeResult}>✓ {analyzeResult}</p>}
            {pendingAtts.length > 0 && <div className="mt-2 flex w-full flex-wrap items-center gap-1.5">{pendingAtts.map((a) => <span key={a.id} className="flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px]">{a.mime.startsWith("image/") ? "🖼" : "📄"} {a.filename}<button type="button" className="ml-0.5 text-neutral-400 hover:text-red-400" onClick={() => setPendingAtts((prev) => prev.filter((x) => x.id !== a.id))}>×</button></span>)}</div>}
            <div className="ml-auto shrink-0 rounded-full bg-[var(--color-surface)] p-0.5">
              {isRunning && run ? <Button type="button" size="icon" aria-label="Stop agent" title="Stop agent" className="relative z-10 size-9 rounded-full border border-[var(--color-line)] bg-[var(--color-danger)] text-white shadow-md hover:bg-[var(--color-danger)]/85" onClick={() => void stopChatRun(run.id).then(() => getChatRun(run.id).then(setSelectedRun))}><Square className="size-3.5 fill-current" /></Button> : <Button type="button" size="icon" aria-label="Send message" className="relative z-10 size-9 rounded-full border border-[var(--color-line)] bg-primary text-primary-foreground shadow-md hover:bg-primary/90" disabled={!prompt.trim() || !sessionID || send.isPending || uploading} onClick={() => send.mutate()}>{send.isPending ? <X className="size-4" /> : <ArrowUp className="size-4" />}</Button>}
            </div>
          </div>
          {send.isError && <div className="pt-2 text-xs text-red-400">{(send.error as Error).message}</div>}
          </div>
        </BorderBeam>
        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between px-1 text-[11px] text-[var(--color-ink-3)]"><span>Enter send · Shift+Enter newline</span><span>{prompt.length} chars</span></div>
      </div>
    </main>
    <SystemModal
      open={!!sessionAction}
      onClose={() => { if (!actionBusy) setSessionAction(null) }}
      title={sessionAction?.kind === "rename" ? "Rename chat" : sessionAction?.kind === "archive" ? "Archive chat" : sessionAction?.kind === "restore" ? "Restore chat" : "Delete chat"}
      description={sessionAction?.kind === "rename" ? "Choose a title for this room. Renaming does not change its position in the chat list." : sessionAction?.kind === "archive" ? "This room will leave the active chat list. You can find it again from Archived chats." : sessionAction?.kind === "restore" ? "This room will return to the active chat list." : `Delete ${sessionAction?.session.title ?? "this chat"} and its message history permanently?`}
      footer={<>
        <Button type="button" variant="ghost" size="sm" disabled={actionBusy} onClick={() => setSessionAction(null)}>Cancel</Button>
        <Button type="button" size="sm" variant={sessionAction?.kind === "delete" ? "destructive" : "default"} disabled={actionBusy || (sessionAction?.kind === "rename" && !renameDraft.trim())} onClick={() => void confirmSessionAction()}>{actionBusy ? "Saving..." : sessionAction?.kind === "rename" ? "Save title" : sessionAction?.kind === "archive" ? "Archive" : sessionAction?.kind === "restore" ? "Restore" : "Delete"}</Button>
      </>}
    >
      {sessionAction?.kind === "rename" && <>
        <Input autoFocus value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setActionError("") }} onKeyDown={(event) => { if (event.key === "Enter" && renameDraft.trim()) void confirmSessionAction() }} maxLength={120} className="bg-[var(--color-inset)]" />
        {actionError && <p className="mt-2 text-xs text-[var(--color-danger)]">{actionError}</p>}
      </>}
    </SystemModal>
  </div>
}
