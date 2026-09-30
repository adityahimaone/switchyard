import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Archive, Check, FileImage, MoreHorizontal, Pencil, Plus, Puzzle, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusLamp } from "@/components/ui/status-lamp"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MessageScroller } from "@/components/agents/message-scroller"
import { StreamingText } from "@/components/agents/streaming-text"
import { AgentProgress } from "@/components/agents/loading-states"
import { TaskList, type TaskListTask } from "@/TodoList"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import { SessionMenu } from "@/components/chat/SessionMenu"
import { Composer } from "@/components/chat/composer"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { analyzeAttachment, api, archiveChatSession, createChatSession, deleteChatSession, duplicateChatSession, forkChatSession, getChatActiveRun, getChatRun, listChatMessages, listChatRunEvents, listChatSessions, listActiveChatRuns, listProviders, listSkills, openEventStream, sendChatMessage, stopChatRun, toastGlobal, unarchiveChatSession, updateChatSession, uploadAttachment, type Attachment, type ChatAgent, type ChatMessage, type ChatRun, type ChatRunEvent, type ChatSession, type ChatState, type Profile, type Workspace } from "@/api"

type Props = { profiles: Profile[]; workspaces: Workspace[]; initialSessionID?: string; onSessionChange?: (sessionID: string) => void; sidebarOpen?: boolean }
type SessionAction = "rename" | "archive" | "delete" | "restore"

/** Sentence case, and a name that matches what the user would say. */
function stateLabel(state?: ChatState): string {
  switch (state) {
    case "running": return "Running"
    case "loading": return "Loading"
    case "done": return "Done"
    case "error": return "Failed"
    case "cancelled": return "Cancelled"
    default: return "Ready"
  }
}

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
  return <span tabIndex={0} aria-label={`Message details${run?.profile ? `, profile ${run.profile}` : ""}`} className="chat-message-footer inline-flex items-center gap-1.5 text-2xs leading-none text-[var(--c-ink-3)]">
    {clockTime && <span className="font-mono tabular-nums">{clockTime}</span>}
    {run?.profile && <span className="chat-message-profile">{run.profile}</span>}
    <span className="chat-message-hover-meta items-center gap-1.5">
      <span className="max-w-[110px] truncate font-mono text-2xs text-ink-3" title={modelLabel}>{modelLabel}</span>
      {run && elapsed && <><span className="text-ink-3">·</span><span className="font-mono tabular-nums" title="elapsed">{elapsed}</span></>}
      {sessionID && <><span className="text-ink-3">·</span><span className="font-mono text-2xs" title="Switchyard room session ID">{sessionID}</span></>}
      {isError && run && (
        <>
          <span className="text-ink-3">·</span>
          {/* Text on the surface, not a tint, so danger-text is the right token. */}
          <span className={run.state === "done" ? "text-success-text" : "text-danger-text"}>
            {stateLabel(run.state)}
          </span>
        </>
      )}
    </span>
  </span>
}

const PHASE_LABELS: Record<string, string> = {
	job_started: "Starting remote agent",
	preparing_session: "Preparing chat session",
	executor_resolved: "Resolved executor",
	codegraph_preflight: "Checking workspace structure",
	process_spawned: "Starting agent process",
	process_exited: "Agent process finished",
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

function activityLabel(event: ChatRunEvent) {
  const payload = eventPayload(event)
  if (event.kind === "phase") {
    const label = payload.label ?? PHASE_LABELS[payload.phase] ?? "Working"
    const detail = payload.detail ?? payload.name
    const duration = payload.duration
    return [label, detail, duration].filter(Boolean).join(" · ")
  }
  if (event.kind === "routing") return `JEV route: ${payload.intent ?? "unknown"}${payload.context_scope ? ` · ${payload.context_scope}` : ""}`
  if (event.kind === "confirmation_required") return "Confirmation required before execution"
  if (event.kind === "spawned") return "Started agent"
  if (event.kind === "error") return payload.message ?? "Agent reported an error"
  if (event.kind === "cancelled") return "Run cancelled"
  if (event.kind === "tool") return payload.name ? `Tool: ${payload.name}` : "Tool call"
  return payload.label ?? payload.description ?? event.kind.replaceAll("_", " ")
}

function isActivityEvent(event: ChatRunEvent) {
  // Raw logs and answer deltas have dedicated live surfaces. Only semantic
  // events belong in Context activity.
  return event.kind !== "raw_output" && event.kind !== "tool_output" && event.kind !== "text_delta"
}

function LiveWorkerLog({ text, active }: { text: string; active: boolean }) {
  const lines = text.split("\n").filter(Boolean)
  if (!lines.length) return null
  const visible = lines.slice(-12)
  return <details open={active} className="mt-3 overflow-hidden rounded-card border border-[var(--c-line)] bg-[var(--c-well)]">
    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-2xs text-[var(--c-ink-3)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]">
      <Activity className="size-3.5 shrink-0 text-[var(--c-accent)]" aria-hidden />
      <span className="font-medium text-[var(--c-ink-2)]">Live worker log</span>
      <span className="ml-auto font-mono text-2xs tabular-nums">{lines.length} lines</span>
    </summary>
    <pre className="max-h-48 overflow-auto border-t border-[var(--c-line)] px-3 py-2 font-mono text-2xs leading-5 text-[var(--c-ink-3)]">{visible.join("\n")}</pre>
  </details>
}

function mergeActivityEvents(events: ChatRunEvent[], liveEvents: ChatRunEvent[]) {
  const seen = new Set(events.map((event) => `${event.kind}:${event.payload}`))
  return [...events, ...liveEvents.filter((event) => !seen.has(`${event.kind}:${event.payload}`))]
}

function ActivityContext({ run, events }: { run?: ChatRun; events: ChatRunEvent[] }) {
  const active = run?.state === "loading" || run?.state === "running"
  const [open, setOpen] = useState(active)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setOpen(!!active)
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active, run?.id])
  if (!run) return null
  const phase = events.filter((event) => event.kind === "phase").map(eventPayload).at(-1)
  const stateEvent: ChatRunEvent = { id: -1, run_id: run.id, kind: run.state, payload: JSON.stringify({ state: run.state }), created_at: run.ended_at ?? run.started_at }
  const rows = [stateEvent, ...events.filter(isActivityEvent)]
  const tasks: TaskListTask[] = rows.map((event, index) => {
    const payload = eventPayload(event)
    const state = (payload.state ?? event.kind) as ChatState
    const isState = ["loading", "running", "done", "error", "cancelled"].includes(event.kind)
    return {
      id: isState ? "current-status" : `${event.kind}-${event.id}-${index}`,
      label: isState ? `${stateLabel(state)} · ${progressLabelForEvents(events, state)}` : activityLabel(event),
      detail: event.created_at ? new Date(event.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined,
      status: event.kind === "error" || event.kind === "cancelled" || payload.status === "error" ? "error" : payload.status === "started" && active ? "active" : isState && active ? "active" : "done",
      tone: isState ? "session" : "model",
    }
  })
  return <div className="mt-3">
    {active && <div className="mb-2"><AgentProgress label={phase?.label ?? progressLabelForEvents(events, run.state)} elapsedSeconds={Math.max(0, (now - run.started_at * 1000) / 1000)} /></div>}
    <TaskList title="Context activity" tasks={tasks} defaultOpen={open} />
  </div>
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
  return <div className="mb-3 flex max-w-full items-start gap-2 rounded-lg border border-[var(--c-line)] bg-[var(--c-well)] px-3 py-2 text-2xs text-[var(--c-ink-3)]">
    <span aria-hidden className="mt-0.5 text-[var(--c-accent)]">↻</span>
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
  const [answerBuffer, setAnswerBuffer] = useState<Record<string, string>>({})
  const [liveEvents, setLiveEvents] = useState<ChatRunEvent[]>([])
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
  const activeRunQuery = useQuery({
    queryKey: ["chat-active-run", sessionID],
    queryFn: () => getChatActiveRun(sessionID!),
    enabled: !!sessionID,
    retry: false,
    // SSE chat_run_state keeps selectedRun current; this query only hydrates initial state.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const activeRuns = useQuery({
    queryKey: ["chat-active-runs"],
    queryFn: listActiveChatRuns,
    // SSE lifecycle events invalidate this cache; avoid background polling.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const activeRunBySession = useMemo(() => new Map((activeRuns.data ?? []).map((item) => [item.session_id, item])), [activeRuns.data])
  const persistedActive = activeRunQuery.data ?? undefined
  // Backend active-run is source of truth; selectedRun only bridges mutation/SSE before poll lands.
  const run = persistedActive ?? (selectedRun && selectedRun.session_id === sessionID ? selectedRun : undefined)
  useEffect(() => { setAnswerBuffer({}) }, [run?.id])
  useEffect(() => { setLiveEvents([]) }, [run?.id])
  const events = useQuery({
    queryKey: ["chat-run-events", run?.id],
    queryFn: () => listChatRunEvents(run!.id),
    enabled: !!run?.id,
    retry: false,
    // SSE chat_run_event invalidates this query per event; no polling needed.
    refetchInterval: false,
    refetchOnWindowFocus: false,
  })

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
    // Accumulate raw worker output into the response buffer. The activity list
    // receives only semantic phase events.
    if (event.kind === "chat_run_event" && event.data?.run_id && event.data.run_id === runId) {
      try {
        const payload = typeof event.data.payload === "string" ? JSON.parse(event.data.payload) : event.data.payload
        if ((event.data.kind === "raw_output" || event.data.kind === "tool_output") && typeof payload?.text === "string") {
          const rid = event.data.run_id
          setStreamBuffer((prev) => ({ ...prev, [rid]: (prev[rid] ?? "") + payload.text + "\n" }))
          return // raw logs are local-streamed; do not refetch on every line
        }
        if (event.data.kind === "text_delta" && typeof payload?.text === "string") {
          const rid = event.data.run_id
          setAnswerBuffer((prev) => ({ ...prev, [rid]: (prev[rid] ?? "") + payload.text }))
          return // answer deltas are rendered locally without query refetches
        }
        if (event.data.kind === "phase" || event.data.kind === "activity") {
          const live: ChatRunEvent = {
            id: -Date.now(),
            run_id: event.data.run_id,
            kind: event.data.kind,
            payload: typeof payload === "string" ? payload : JSON.stringify(payload ?? {}),
            created_at: Math.floor(Date.now() / 1000),
          }
          setLiveEvents((prev) => [...prev, live].slice(-80))
        }
      } catch { /* parse error, fall through to standard handling */ }
    }
    if ((event.kind === "chat_run" || event.kind === "chat_run_state" || event.kind === "chat_run_event") && event.data?.run_id && runId && event.data.run_id === runId) {
      void getChatRun(runId).then((fresh) => {
        setSelectedRun(fresh)
        // on terminal state, clear stream buffer (final output replaces it)
        if (fresh.state === "done" || fresh.state === "error" || fresh.state === "cancelled") {
          setStreamBuffer((prev) => { const n = { ...prev }; delete n[fresh.id]; return n })
          setAnswerBuffer((prev) => { const n = { ...prev }; delete n[fresh.id]; return n })
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

  return <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--c-canvas)]">
    {sidebarOpen && <aside className="flex w-[min(280px,85vw)] shrink-0 flex-col border-r border-[var(--c-line)] bg-[var(--c-surface)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--c-line)] px-2">
        <span className="px-1 text-sm font-semibold tracking-tight">{showArchived ? "Archived chats" : "Chats"}</span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className={`size-7 ${showArchived ? "text-[var(--c-accent)]" : ""}`} onClick={() => setShowArchived((value) => !value)} title={showArchived ? "Show active chats" : "Show archived chats"}><Archive className="size-3.5" /></Button>
          {!showArchived && <Button size="icon" variant="ghost" className="size-7" onClick={() => void newChat()} title="New chat"><Plus className="size-4" /></Button>}
        </div>
      </div>
      <div className="border-b border-[var(--c-line)] p-2">
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--c-ink-3)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="h-8 pl-7 text-xs" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filteredSessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--c-line)] p-4 text-center text-xs text-ink-3">No chat for this filter</div>
        ) : (
          GROUP_ORDER.map((key) => {
            const items = grouped[key]
            if (items.length === 0) return null
            return (
              <div key={key} className="mb-3">
                <div className="px-2 py-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{GROUP_LABEL[key]} <span className="font-normal tracking-normal text-ink-3 normal-case">· {items.length}</span></div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.id} className={`group flex w-full items-stretch rounded-lg border transition-colors ${item.id === sessionID ? "border-[var(--c-accent)]/30 bg-[var(--c-accent)]/10" : "border-transparent bg-transparent hover:bg-raised"}`}>
                      <button type="button" onClick={() => void selectSession(item)} title={item.title} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                        <div className="max-w-full truncate text-xs font-medium leading-none">{item.title}</div>
                        <div className="mt-1 flex max-w-full items-center gap-1 truncate text-2xs text-ink-3">
                          <span className="truncate">{item.workspace || "local"}</span>
                          {item.model && <><span className="text-ink-3">·</span><span className="truncate font-mono text-2xs">{item.model.split("/").pop()}</span></>}
                          {/* A lamp, not a spinner: the row already says the
                              session is busy, and the lamp matches the rest
                              of the app's running state. */}
                          {activeRunBySession.has(item.id) && (
                            <StatusLamp status="running" label="Running" size="sm" className="ml-auto shrink-0" />
                          )}
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={`Actions for ${item.title}`} className="mr-1 self-center rounded-md p-1.5 text-[var(--c-ink-3)] opacity-0 transition-opacity hover:bg-[var(--c-well)] hover:text-[var(--c-ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--c-accent)] group-hover:opacity-100"><MoreHorizontal className="size-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-[var(--c-line)] bg-[var(--c-raised)]">
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
      <div className="border-t border-[var(--c-line)] px-2 py-2 text-2xs text-[var(--c-ink-3)]">{filteredSessions.length} {showArchived ? "archived" : "active"} chats</div>
    </aside>}
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--c-line)] bg-[var(--c-surface)] px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{current.data?.title ?? "New chat"}</h1>
        </div>
        {current.data && <SessionMenu session={current.data} onDuplicate={() => duplicateSession(current.data!)} onDelete={() => openSessionAction("delete", current.data!)} />}
      </header>
      <MessageScroller busy={isRunning} showJump={showJumpToLatest} onFollowChange={(following) => { shouldFollowChatRef.current = following; setShowJumpToLatest(!following) }} onJump={() => { shouldFollowChatRef.current = true; setShowJumpToLatest(false); bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }}>
        <div className="mx-auto max-w-3xl space-y-6">
        {activeMessages.length === 0 && !run ? (
          <div className="rounded-card border border-dashed border-[var(--c-line)] bg-[var(--c-surface)] p-6">
            <div className="text-sm font-medium">Start a conversation</div>
            <div className="mt-1 text-sm leading-6 text-[var(--c-ink-3)]">Pick a prompt or type your own. Agent runs show live context activity.</div>
            <div className="mt-4 flex flex-wrap gap-1.5">{EXAMPLE_PROMPTS.map((example) => <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-[var(--c-line)] bg-[var(--c-canvas)] px-3 py-1.5 text-xs hover:border-[var(--c-line-strong)]">{example}</button>)}</div>
          </div>
        ) : activeMessages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {message.role === "user" ? (
              <div className="max-w-[80%] rounded-card bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                <div>{message.content}</div>
                {message.attachments?.length ? <div className="mt-2 flex flex-wrap gap-2">{message.attachments.map((att) => <AttachmentChip key={att.id} att={att} />)}</div> : null}
              </div>
            ) : (
              <div className="relative w-full min-w-0">
                {(() => {
                  const isLiveRunMessage = !!run && (message.id === run.message_id || message.run_id === run.id || (isRunning && message.id === activeMessages[activeMessages.length - 1]?.id))
                  const messageStreaming = isRunning && isLiveRunMessage
                  const msgRun = isLiveRunMessage ? run : (message.run_id ? runMap[message.run_id] : undefined)
                  const msgEvents = isLiveRunMessage ? mergeActivityEvents(events.data ?? [], liveEvents) : (message.run_id ? (runEventsMap[message.run_id] ?? []) : [])
                  const response = splitResponseText(messageStreaming ? (run?.id ? (answerBuffer[run.id] ?? "") : "") : (message.content || msgRun?.output || ""))
                  return <><SessionNotice text={response.notice} /><StreamingText status={messageStreaming ? "streaming" : "complete"} copyText={response.text} footer={<MessageFooter run={msgRun} sessionID={sessionID} isStreaming={messageStreaming} messageCreatedAt={message.created_at} />}><Markdown text={response.text} />{msgRun && messageStreaming && <LiveWorkerLog text={run?.id ? (streamBuffer[run.id] ?? "") : ""} active={isRunning} />}{msgRun && (!messageStreaming || !isRunning) && <ActivityContext run={msgRun} events={msgEvents} />}</StreamingText></>
                })()}
                {current.data && <div className="absolute right-0 top-0 z-10 opacity-70 hover:opacity-100"><SessionMenu session={current.data} forkMessageId={message.id} onDuplicate={() => duplicateSession(current.data!)} onFork={(session) => forkSession(session, message.id)} onDelete={() => openSessionAction("delete", current.data!)} /></div>}
              </div>
            )}
          </div>
        ))}
        {run && isRunning && <ActivityContext run={run} events={mergeActivityEvents(events.data ?? [], liveEvents)} />}
        <div ref={bottomRef} aria-hidden="true" />
        </div>
      </MessageScroller>
      <Composer
        value={prompt}
        onChange={setPrompt}
        onSend={() => send.mutate()}
        onStop={() => void stopChatRun(run!.id).then(() => getChatRun(run!.id).then(setSelectedRun))}
        running={isRunning}
        phase={run?.state === "error" ? "Failed" : run?.state === "done" ? "Finished" : "Working"}
        placeholder={profile ? `Message ${profile}` : "Message the agent"}
        disabled={!sessionID || send.isPending || uploading}
        autocomplete={
          autocompleteOpen && (commandMatches.length > 0 || skillMatches.length > 0) ? (
            <>
              {commandMatches.map((item) => (
                <button
                  key={item.command}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-control px-2.5 py-2 text-left outline-none hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setPrompt((value) => value.replace(/(?:^|\s)\/[^\s]*$/, `${item.command} `));
                    if (item.command === "/clear" || item.command === "/stop" || item.command === "/new") {
                      executeCommand(item.command);
                    }
                  }}
                >
                  <span className="w-14 shrink-0 font-mono text-2xs text-accent-text">{item.command}</span>
                  <span className="text-xs">
                    <span className="block">{item.label}</span>
                    <span className="block text-2xs text-ink-3">{item.description}</span>
                  </span>
                </button>
              ))}
              {skillMatches.slice(0, 12).map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-control px-2.5 py-2 text-left outline-none hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSkill(item.name)}
                >
                  <Puzzle className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
                  <span className="min-w-0 text-xs">
                    <span className="block font-mono">${item.name}</span>
                    <span className="block truncate text-2xs text-ink-3">{item.description}</span>
                  </span>
                </button>
              ))}
            </>
          ) : undefined
        }
        controls={
          <>
            <DropdownMenu open={composerMenuOpen} onOpenChange={setComposerMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon-sm" variant="outline" aria-label="Add to message">
                  <Plus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <FileImage className="size-4" /> Attach image
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPrompt((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}$`)}>
                  <Puzzle className="size-4" /> Use skill
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Select value={profile || "default"} onValueChange={setProfile}>
              <SelectTrigger size="sm" className="h-7 max-w-40 truncate" aria-label="Agent profile">
                <SelectValue placeholder="Profile" />
              </SelectTrigger>
              <SelectContent className="max-w-80">
                {profiles.map((item) => (
                  <SelectItem key={item.name} value={item.name} disabled={!item.valid}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar className="size-4 shrink-0">
                        {item.avatar_url && <AvatarImage src={item.avatar_url} alt="" />}
                        <AvatarFallback className="bg-well text-[7px] text-ink-2">
                          {item.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 truncate">
                        {item.name}
                        {item.model ? ` \u2014 ${item.model}` : ""}
                        {item.active ? " (active)" : ""}
                        {!item.valid ? " (broken config)" : ""}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={workspace || "__local"} onValueChange={(v) => setWorkspace(v === "__local" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 max-w-40 truncate" aria-label="Workspace">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-80">
                <SelectItem value="__local">local</SelectItem>
                {workspaces.map((v) => {
                  const live = isLive(v);
                  const os = (v.os || "").toLowerCase();
                  const osLabel = os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : "";
                  return (
                    <SelectItem key={v.id} value={v.path} title={v.path}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {live && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />}
                        <span className="min-w-0 flex-1 truncate">{v.name}</span>
                        {osLabel && <span className="shrink-0 text-2xs text-ink-3">{osLabel}</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={model || "__default"} onValueChange={(v) => setModel(v === "__default" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 max-w-40 truncate" aria-label="Model">
                <SelectValue placeholder="Default model" />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="h-80 w-72">
                <div className="sticky top-0 z-10 bg-raised p-1" onKeyDown={(event) => event.stopPropagation()}>
                  <Input
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder="Search models"
                    aria-label="Search models"
                  />
                </div>
                <SelectItem value="__default">Default model</SelectItem>
                {filteredModelOptions.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-ink-3">No model found</p>
                )}
                {filteredModelOptions.map((v) => (
                  <SelectItem key={v} value={v} className="max-w-72 truncate" title={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              multiple
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files ?? [])}
            />
            {uploading && <span className="text-2xs text-ink-3">Uploading…</span>}
            {pendingAtts.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!model && !profiles.find((p) => p.name === profile)?.model || analyzeBusy !== null}
                onClick={() => { const first = pendingAtts[0]; if (first) void analyzePending(first.id) }}
              >
                {analyzeBusy ? "Analyzing…" : "Analyze"}
              </Button>
            )}
            {uploadErr && <span className="text-2xs text-danger-text">{uploadErr}</span>}
            {analyzeResult && (
              <span className="inline-flex items-center gap-1 text-2xs text-success-text" title={analyzeResult}>
                <Check className="size-3" aria-hidden /> {analyzeResult}
              </span>
            )}
          </>
        }
        attachments={
          pendingAtts.length > 0 ? (
            pendingAtts.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-control border border-line bg-well px-2 py-0.5 text-2xs"
              >
                <span aria-hidden>{a.mime.startsWith("image/") ? "🖼" : "📄"}</span>
                {a.filename}
                <button
                  type="button"
                  aria-label={`Remove ${a.filename}`}
                  className="ml-0.5 text-ink-3 outline-none hover:text-danger-text focus-visible:ring-[3px] focus-visible:ring-focus/40"
                  onClick={() => setPendingAtts((prev) => prev.filter((x) => x.id !== a.id))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          ) : undefined
        }
      />
      {send.isError && (
        <p role="alert" className="mx-auto w-full max-w-3xl px-4 pb-3 text-xs text-danger-text">
          {(send.error as Error).message}
        </p>
      )}
    </div>
      <ConfirmDialog
        open={!!sessionAction}
        onOpenChange={(o) => { if (!o && !actionBusy) setSessionAction(null) }}
        title={sessionAction?.kind === "rename" ? "Rename chat" : sessionAction?.kind === "archive" ? "Archive chat" : sessionAction?.kind === "restore" ? "Restore chat" : "Delete chat"}
        description={sessionAction?.kind === "rename" ? "Choose a title for this room. Renaming does not change its position in the chat list." : sessionAction?.kind === "archive" ? "This room will leave the active chat list. You can find it again from Archived chats." : sessionAction?.kind === "restore" ? "This room will return to the active chat list." : `Delete ${sessionAction?.session.title ?? "this chat"} and its message history permanently?`}
        confirmLabel={sessionAction?.kind === "rename" ? "Save title" : sessionAction?.kind === "archive" ? "Archive" : sessionAction?.kind === "restore" ? "Restore" : "Delete"}
        busy={actionBusy}
        onConfirm={() => void confirmSessionAction()}
      />
      {sessionAction?.kind === "rename" && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o && !actionBusy) setSessionAction(null) }}
          title="Rename chat"
          description="Choose a title for this room."
        >
          <Input
            autoFocus
            value={renameDraft}
            onChange={(event) => { setRenameDraft(event.target.value); setActionError("") }}
            onKeyDown={(event) => { if (event.key === "Enter" && renameDraft.trim()) void confirmSessionAction() }}
            maxLength={120}
            aria-label="Chat title"
          />
          {actionError && <p className="mt-2 text-sm text-danger-text" role="alert">{actionError}</p>}
        </DetailSheet>
      )}
  </div>
}
