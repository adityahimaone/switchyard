import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Archive, Check, ChevronRight, FileImage, FolderKanban, MoreHorizontal, PanelLeft, Pencil, Plus, Puzzle, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
import { useHeaderTrail } from "@/components/header-trail-context"
import { AgentMarkdown } from "@/features/board/AgentMarkdown"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { analyzeAttachment, api, archiveChatSession, createChatSession, deleteChatSession, duplicateChatSession, forkChatSession, getChatActiveRun, getChatRun, listChatMessages, listChatProjects, listChatRunEvents, listChatSessions, listActiveChatRuns, listProviders, listSkills, openEventStream, sendChatMessage, stopChatRun, toastGlobal, unarchiveChatSession, updateChatSession, uploadAttachment, type Attachment, type ChatAgent, type ChatMessage, type ChatProject, type ChatRun, type ChatRunEvent, type ChatSession, type ChatState, type Profile, type Workspace } from "@/api"
import { EXECUTORS, executorDef, optionValue, withOption } from "@/features/projects/executors"
import { ProjectDialog } from "@/features/projects/ProjectDialog"
import { GROUP_ORDER, GROUP_LABEL, buildRailTree } from "./railTree"

type Props = { profiles: Profile[]; workspaces: Workspace[]; initialSessionID?: string; onSessionChange?: (sessionID: string) => void; sidebarOpen?: boolean; onToggleSidebar?: () => void; projectID?: string; projectName?: string; projectWorkspace?: string; projectExecutor?: ChatAgent; projectOptions?: string; onOpenProject?: (project: ChatProject) => void }
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
  /* `kind` is typed as required, but it arrives over SSE and from the run-events
     endpoint, so a malformed or partially-hydrated event reaches here with it
     undefined. The old `event.kind.replaceAll` then threw, and because this runs
     inside the transcript's render it took the whole page down to the error
     boundary rather than skipping one row. An unlabelled activity row is a
     cosmetic problem; a blank chat is a total loss. */
  const kind = typeof event.kind === "string" ? event.kind : ""
  return payload.label ?? payload.description ?? (kind.replaceAll("_", " ") || "Activity")
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
  /* Drop non-objects. These two arrays are combined from an SSE payload and a
     REST response, and one malformed entry otherwise poisons the dedupe key
     (`undefined:undefined`) and every label derived from it downstream. */
  const ok = (list: ChatRunEvent[]) => list.filter((e) => e && typeof e === "object");
  const seen = new Set(ok(events).map((event) => `${event.kind}:${event.payload}`))
  return [...ok(events), ...ok(liveEvents).filter((event) => !seen.has(`${event.kind}:${event.payload}`))]
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

/* Agent / workspace / model triggers in the composer, reduced to text.
 *
 * `SelectTrigger` ships a `glass-flat` fill and a `shadow-xs`. In a page toolbar
 * that is right — it matches `Input` sitting beside it — but inside the composer
 * it would stack three more bounded surfaces inside a glass box, in a row only
 * 36px tall. Removed, they read as a single line of metadata.
 *
 * The overrides are `!`-prefixed because both the fill and the shadow come from
 * the utility class on the trigger's own base string, and `cn` does not resolve
 * that conflict on its own — without the important flag the tint wins and the
 * chips keep their boxes.
 *
 * `shadow-xs` is neutralised rather than removed so the open/close state still
 * has something to transition from; `max-w-40` is kept from before so a long
 * workspace path truncates rather than pushing the send button off the row. */
const PROMPT_CHIP =
  "max-w-40 !bg-transparent !shadow-xs hover:!bg-accent-tint focus-visible:!bg-accent-tint data-[state=open]:!bg-accent-tint text-ink-2 hover:text-ink"

const CHAT_COMMANDS = [
  { command: "/clear", label: "Clear draft", description: "Remove the text in the composer." },
  { command: "/stop", label: "Stop run", description: "Stop the active agent run." },
  { command: "/new", label: "New chat", description: "Start a separate chat room." },
]

function isLive(w: Workspace): boolean { return w.status === "connected" || w.status === "local" }
// Empty path is the local sentinel in the composer's workspace select; local
// has no node-agent, so dsh/commandcode execution cannot run against it.
function isLocalWorkspace(path: string): boolean { return path === "" }

/* Markdown rendering is `AgentMarkdown`, imported from the board feature.

   This page used to carry its own ~10-line regex renderer: split on fenced
   blocks, then on inline backticks and double-asterisks, and render the rest as
   `<span>`. That handled bold, inline code and fenced code and nothing else —
   no lists, headings, links, tables or blockquotes, which is most of what an
   assistant actually replies with. Worse, the pieces it did handle were styled
   with literal `border-white/10` and `bg-black/30`, so code blocks rendered as
   near-black boxes in light mode.

   `AgentMarkdown` is a full react-markdown renderer already in this codebase,
   already used by the board, with the same XSS stance this page needs
   (`skipHtml`, no `rehype-raw`, an explicit `disallowedElements` list). It adds
   a language label, copy and wrap controls on code blocks, which is the thing
   most wanted from a transcript full of them.

   Two notes on reuse. It lives under `features/board/` and this is a chat page,
   so the honest fix is promoting it to a shared location; it is imported across
   for now because moving it means touching the board's task renderer too, and
   that is a larger diff than this pass should carry. And `AgentMarkdown` is
   memoized on `text`, which is the common case here — every streaming tick
   changes only the in-flight message's text. */

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

export default function ChatPage({ profiles, workspaces, initialSessionID, onSessionChange, sidebarOpen = true, onToggleSidebar, projectID, projectName, projectWorkspace, projectExecutor, projectOptions, onOpenProject }: Props) {
  const qc = useQueryClient()
  const [sessionID, setSessionID] = useState<string | undefined>(() => initialSessionID)
  const [query, setQuery] = useState("")
  const [profile, setProfile] = useState(() => profiles.find((p) => p.active)?.name ?? "default")
  const [workspace, setWorkspace] = useState(projectWorkspace ?? "")
  const [model, setModel] = useState("")
  const [agent, setAgent] = useState<ChatAgent>(projectExecutor ?? "hermes")
  const [executorOptions, setExecutorOptions] = useState<string>(projectOptions ?? "{}")
  const [modelSearch, setModelSearch] = useState("")
  const [prompt, setPrompt] = useState("")
  const [selectedRun, setSelectedRun] = useState<ChatRun>()
  const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({})
  const [answerBuffer, setAnswerBuffer] = useState<Record<string, string>>({})
  const [liveEvents, setLiveEvents] = useState<ChatRunEvent[]>([])
  const shouldFollowChatRef = useRef(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // Rail section open/closed, keyed by section id ("pinned", "projects",
  // "recents", or `proj:<id>`). Open by default so the tree reads fully the
  // first time; the record only stores what the user collapsed.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [newProject, setNewProject] = useState(false)
  const [sessionAction, setSessionAction] = useState<{ kind: SessionAction; session: ChatSession } | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const streamBufferRef = useRef<Record<string, string>>({})
  // sync ref for use in event handlers without re-binding effect
  useEffect(() => { streamBufferRef.current = streamBuffer }, [streamBuffer])
  const initialCreate = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState("")
  const [analyzeBusy, setAnalyzeBusy] = useState<string | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null)
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
  // The rail's tree reads projects from the same cache the Projects page writes,
  // so a project created in either place shows up in both without a refetch dance.
  const projects = useQuery({ queryKey: ["chat-projects"], queryFn: listChatProjects })
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

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }


  useEffect(() => {
    if (initialSessionID && initialSessionID !== sessionID) setSessionID(initialSessionID)
  }, [initialSessionID])

  /* Publishes the session title to the shell header's breadcrumb, which is
     where it lives now that this page has no title bar of its own. Only when
     there is a session: an empty chat's header should read "Chat", not
     "Chat / New chat" for something that has no name yet. */
  useHeaderTrail(current.data?.title)

  useEffect(() => {
    if (!current.data || current.data.id !== sessionID) return
    setProfile(current.data.profile)
    setWorkspace(projectID ? (projectWorkspace ?? current.data.workspace) : current.data.workspace)
    setModel(current.data.model)
    if (current.data.agent) setAgent(current.data.agent)
    setExecutorOptions(current.data.executor_options || "{}")
  }, [current.data?.id, sessionID]) // ponytail: prop drives initial active session; internal setActive updates caller via onSessionChange

  /* A project owns the workspace and a default executor; the composer may still
     switch executor for the turn, but the workspace is pinned to the project so
     chat-to-code never runs against a different tree than the project declares. */
  useEffect(() => {
    if (!projectID) return
    if (projectWorkspace) setWorkspace(projectWorkspace)
    if (projectExecutor) setAgent(projectExecutor)
    if (projectOptions) setExecutorOptions(projectOptions)
    // Opening a project starts on a clean slate: the composer is ready and the
    // first send creates a session bound to this project. An explicit deep link
    // (initialSessionID) still wins.
    if (!initialSessionID) setSessionID(undefined)
    setSelectedRun(undefined)
  }, [projectID, projectWorkspace, projectExecutor, projectOptions, initialSessionID])

  useEffect(() => {
    // Inside a project there is no "the" session to auto-open: the composer sits
    // ready and the first send creates the session (see the send mutation). The
    // auto-create/auto-select below is only for the global chat list.
    if (projectID) return
    if (sessions.isSuccess && sessions.data?.length === 0 && !initialCreate.current) {
      initialCreate.current = true
      void createChatSession({ title: "New chat", agent, profile, workspace, model: "", executor_options: executorOptions }).then((created) => {
        setActive(created.id)
        void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }).catch(() => { initialCreate.current = false })
      return
    }
    if (!sessionID && sessions.data?.[0]) setActive(sessions.data[0].id)
  }, [qc, sessionID, sessions.data, sessions.isSuccess, profile, projectID])

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
  // Inside a project the transcript belongs to that project, so the list is its
  // sessions only. The rail still draws the full tree; this just scopes what
  // "no session yet → create on send" and the empty state reason about.
  const scopedSessions = useMemo(
    () => (projectID ? visibleSessions.filter((item) => item.project_id === projectID) : visibleSessions),
    [visibleSessions, projectID],
  )
  const filteredSessions = useMemo(() => visibleSessions.filter((item) => {
    const text = `${item.title} ${item.agent} ${item.profile} ${item.workspace} ${item.model}`.toLowerCase()
    return !query || text.includes(query.toLowerCase())
  }), [query, visibleSessions])

  /* The rail is a tree, not a flat time list. Pinned sessions float to the top,
     each project is a collapsible node holding its own sessions, and everything
     else falls into the time-grouped "Recents" bucket. A session is shown in
     exactly one place: pinned wins, then its project, then recents — otherwise a
     pinned session inside a project would render twice. */
  const railTree = useMemo(() => buildRailTree(filteredSessions), [filteredSessions])

  const send = useMutation({
    /* No manual scroll here any more. MessageScroller follows the live edge on
       its own — via a ResizeObserver on the content and the scroll distance —
       so the old `bottomRef.scrollIntoView` calls were fighting it: they
       yanked the reader back to the bottom even after they had scrolled up to
       read something, which is exactly what the follow-threshold exists to
       prevent. Sending only has to re-arm following. */
    onMutate: () => {
      shouldFollowChatRef.current = true
      setShowJumpToLatest(false)
    },
    mutationFn: async () => {
      if (uploading) throw new Error("Wait for attachment upload to finish")
      // The model roster only applies to hermes; dsh/commandcode fix their own model.
      if (agent === "hermes" && model && modelOptions.length > 0 && !modelOptions.includes(model)) throw new Error(`model ${model} not in provider roster`)
      const ids = pendingAtts.map((a) => a.id)
      const opts = agent === "hermes" ? undefined : executorOptions
      // Enter-then-send with no session yet: create it now, bound to the project
      // when one is open, so the user never has to click "new chat" first. The
      // title is the prompt's opening line so the rail row is identifiable.
      let sid = sessionID
      if (!sid) {
        const title = prompt.trim().slice(0, 60) || "New chat"
        const created = await createChatSession(
          projectID
            ? { title, agent, profile, workspace, model: "", executor_options: executorOptions, project_id: projectID }
            : { title, agent, profile, workspace, model, executor_options: executorOptions },
        )
        sid = created.id
        setActive(sid)
        void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }
      if (!ids.length) return sendChatMessage(sid, { content: prompt, agent, profile, workspace, model: agent === "hermes" ? model : "", executor_options: opts })
      return sendChatMessage(sid, { content: prompt, agent, profile, workspace, model: agent === "hermes" ? model : "", executor_options: opts, attachment_ids: ids })
    },
    onSuccess: (data) => { const sid = data.run?.session_id ?? sessionID; setPrompt(""); setPendingAtts([]); setUploadErr(""); setAnalyzeResult(null); setSelectedRun(data.run); void qc.invalidateQueries({ queryKey: ["chat-messages", sid] }); void qc.invalidateQueries({ queryKey: ["chat-session", sid] }); void qc.invalidateQueries({ queryKey: ["chat-active-run", sid] }); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }) },
  })

  async function newChat(project?: ChatProject) {
    // A session opened inside a project inherits the project's binding so the
    // first turn runs against the right workspace/executor without the user
    // re-picking anything.
    const payload = project
      ? { title: "New chat", agent: project.executor, profile, workspace: project.workspace, model: "", executor_options: project.options, project_id: project.id }
      : { title: "New chat", agent, profile, workspace, model, executor_options: executorOptions }
    const created = await createChatSession(payload)
    if (project) { setWorkspace(project.workspace); setAgent(project.executor); setExecutorOptions(project.options) }
    setActive(created.id)
    await qc.invalidateQueries({ queryKey: ["chat-sessions"] })
  }
  async function selectSession(item: ChatSession) { setActive(item.id); setProfile(item.profile); setWorkspace(item.workspace); setModel(item.model); if (item.agent) setAgent(item.agent); setExecutorOptions(item.executor_options || "{}"); void getChatActiveRun(item.id).then((next) => setSelectedRun(next ?? undefined)).catch(() => undefined) }
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
  /* The effect that used to live here — scroll-to-bottom on every message,
     event and stream delta, gated on shouldFollowChatRef — is gone. It is
     MessageScroller's job now: its ResizeObserver already re-pins the viewport
     whenever the content grows, and it already stops the moment the reader
     leaves the live edge. Keeping a second scroller here meant the two could
     disagree, and the page's version won because it fired on every delta. */

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

  /* The sidebar reads as one material with the top bar rather than two
     surfaces stacked on the canvas: `bg-surface` on both, with a single hairline
     between. The old `bg-canvas` body put a 4%-darker wash behind the list,
     which made the panel read as inset and put a second, unrelated edge
     against the transcript. */
  return <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface">
    {/* Below `lg` this rail is an overlay rather than a column. Measured at
        768px, the app rail (240) plus this rail (280) left the transcript 224px
        and the composer 192px — a 15-character measure, with the composer selects
        rendering at 29-47px each. So under `lg` it floats above the transcript
        with a scrim, matching how the app sidebar behaves on mobile, instead of
        taking permanent space the viewport cannot spare. */}
    {sidebarOpen && (
      <>
        {/* Scrim: only below `lg`, where the rail actually overlays. */}
        <button
          type="button"
          aria-label="Close chat list"
          onClick={() => onToggleSidebar?.()}
          className="absolute inset-0 z-20 bg-canvas/60 backdrop-blur-[2px] lg:hidden"
        />
        <aside className="absolute inset-y-0 left-0 z-30 flex w-[min(280px,85vw)] shrink-0 flex-col border-r border-line bg-surface shadow-float lg:static lg:z-auto lg:w-[min(280px,85vw)] lg:shadow-none">
      {/* No `border-b`. The rail is one solid surface with a single rule on its
          right edge, and a line under its header meant two rules framing the
          same column. `h-13` matches the shell header, so the two rows stay
          aligned across the gutter.

          The session menu moved here from the title bar that used to sit beside
          this one. It acts on the *current* session — rename, duplicate, delete,
          archive — and this rail is the list those sessions live in, so the
          control now sits on the thing it operates rather than in a bar about to
          be deleted. */}
      <div className="flex h-13 shrink-0 items-center justify-between gap-2 px-3">
        <h1 className="truncate text-sm font-semibold text-ink">{showArchived ? "Archived" : projectName || "Chats"}</h1>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn("text-ink-3", showArchived && "text-accent-text")}
                onClick={() => setShowArchived((value) => !value)}
                aria-label={showArchived ? "Show active chats" : "Show archived chats"}
                aria-pressed={showArchived}
              >
                <Archive className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{showArchived ? "Show active chats" : "Show archived chats"}</TooltipContent>
          </Tooltip>
          {!showArchived && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" className="text-ink-3" onClick={() => setNewProject(true)} aria-label="New project">
                    <FolderKanban className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New project</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" className="text-ink-3" onClick={() => void newChat()} aria-label="New chat">
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New chat</TooltipContent>
              </Tooltip>
            </>
          )}
          {current.data && !showArchived && (
            <SessionMenu
              session={current.data}
              onDuplicate={() => duplicateSession(current.data!)}
              onDelete={() => openSessionAction("delete", current.data!)}
            />
          )}
        </div>
      </div>

      {/* Search sits on the panel with its own padding rather than in a bordered
          strip, which put two hairlines 32px apart around one control. */}
      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filteredSessions.length === 0 && (projects.data ?? []).length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-4 text-center text-xs text-ink-3">No chat for this filter</div>
        ) : (
          <>
            {railTree.pinned.length > 0 && (
              <RailSection id="pinned" label="Pinned" count={railTree.pinned.length} collapsed={collapsed} onToggle={toggleSection}>
                {railTree.pinned.map((item) => (
                  <RailRow key={item.id} item={item} active={item.id === sessionID} running={activeRunBySession.has(item.id)} archived={showArchived} onSelect={selectSession} onAction={openSessionAction} />
                ))}
              </RailSection>
            )}

            {(projects.data ?? []).length > 0 && (
              <RailSection id="projects" label="Projects" count={(projects.data ?? []).length} collapsed={collapsed} onToggle={toggleSection}>
                {(projects.data ?? []).map((project) => {
                  const list = railTree.byProject.get(project.id) ?? []
                  return (
                    <div key={project.id} className="mb-0.5">
                      <div className="group/proj flex items-center gap-1 rounded-lg pr-1 hover:bg-well">
                        <button
                          type="button"
                          onClick={() => { if (onOpenProject) onOpenProject(project); setCollapsed((prev) => ({ ...prev, [`proj:${project.id}`]: false })) }}
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
                          aria-expanded={!collapsed[`proj:${project.id}`]}
                        >
                          <ChevronRight className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", !collapsed[`proj:${project.id}`] && "rotate-90")} />
                          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color || "var(--c-accent)" }} />
                          <span className={cn("min-w-0 flex-1 truncate text-[13px]", project.id === projectID ? "font-medium text-accent-text" : "text-ink-2")}>{project.name}</span>
                          <span className="shrink-0 tabular text-2xs text-ink-3">{list.length}</span>
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`New chat in ${project.name}`}
                              onClick={() => void newChat(project)}
                              className="shrink-0 rounded-control p-1 text-ink-3 opacity-0 transition-opacity outline-none hover:bg-well hover:text-ink focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-focus/40 group-hover/proj:opacity-100"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">New chat in project</TooltipContent>
                        </Tooltip>
                      </div>
                      {!collapsed[`proj:${project.id}`] && (
                        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-line pl-1.5">
                          {list.length === 0 ? (
                            <p className="px-2 py-1 text-2xs text-ink-3">No chats yet</p>
                          ) : list.map((item) => (
                            <RailRow key={item.id} item={item} active={item.id === sessionID} running={activeRunBySession.has(item.id)} archived={showArchived} onSelect={selectSession} onAction={openSessionAction} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </RailSection>
            )}

            <RailSection id="recents" label="Recents" collapsed={collapsed} onToggle={toggleSection}>
              {GROUP_ORDER.map((key) => {
                const items = railTree.recentsGrouped[key]
                if (items.length === 0) return null
                return (
                  <div key={key} className="mb-3 last:mb-0">
                    {/* Section label: the app's group-label treatment — 12px muted,
                        uppercase, with the count as a quiet suffix. */}
                    <div className="flex items-center gap-1.5 px-2 py-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                      {GROUP_LABEL[key]}
                      <span className="tabular font-normal tracking-normal normal-case">{items.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item) => (
                        <RailRow key={item.id} item={item} active={item.id === sessionID} running={activeRunBySession.has(item.id)} archived={showArchived} onSelect={selectSession} onAction={openSessionAction} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </RailSection>
          </>
        )}
      </div>

      {/* No footer count. Each group label above already carries its own tally
          ("PREVIOUS 30 DAYS · 12"), so this badge was restating the same total a
          third time in a bordered pill at the opposite end of the panel — and the
          number it showed was the count *after* the search field filtered it,
          which is not what any of the group labels were summing. When the list is
          filtered, nothing here now explains why it is shorter. */}
    </aside>
      </>
    )}
      {/* `relative` anchors the composer's absolute float. It is a sibling of the
          scroller rather than a child of it, so it can sit over the transcript
          instead of below it — which is both what makes the glass worth having
          and what lets the scroll fade dissolve text into it. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
      {/* No title bar. This row used to carry the session title and a metadata
          cluster, and it cost a third 56px bar of chrome above the transcript —
          stacked on the app header and the rail header, roughly 112px before any
          conversation was visible.

          The title now lives in the shell header's breadcrumb, where every other
          page's context does, and the metadata is gone entirely: the composer
          already owns agent, workspace and model as editable selects, so the bar
          was showing read-only copies of three choices the user was looking at
          fifteen pixels lower. The session menu moved to the rail header for the
          same reason — it acts on the current session, which is what that rail
          lists.

          What remains is the rail toggle, which still has to live here: below `lg`
          the rail overlays the transcript instead of taking a column, so without
          a toggle in this row there is no way to reach the session list. */}
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-line px-4 md:px-6 lg:hidden">
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-ink-3"
          onClick={() => onToggleSidebar?.()}
          aria-label="Show chat list"
          aria-expanded={sidebarOpen}
        >
          <PanelLeft className="size-4" />
        </Button>
      </div>
      {/* The rail's gutter: the scroller pads the viewport for it, but the caller's
          own `px-4 sm:px-6` is merged onto that same element and nets the result
          down to 24px — measured 16px between the ticks and the message text at
          every width below 1440, which puts a 1px rule against body copy. The
          content column carries the right-hand inset instead, where nothing
          overrides it.

          `scroll-fade-both` dissolves the transcript into the header above it
          and into the floating composer below, instead of letting either one cut
          a line of text off mid-sentence. The bottom fade is sized to clear the
          composer; `pb-40` below keeps the last message from resting inside it.

          `max-w-[44rem]` rather than `max-w-3xl`. At 768px on a 1440px screen the
          assistant's prose ran to well over 130 characters a line — past the
          point where the eye can find the start of the next one on the return
          sweep. 44rem lands near 70 characters at the transcript's type size. */}
      <MessageScroller
        className="min-h-0 flex-1"
        busy={isRunning}
        navigation="rail"
        showJump={showJumpToLatest}
        /* Clears the floating composer: 16px bottom inset + ~78px minimum box
           (two text rows, the control row and its padding) + 24px of gap. The
           composer auto-grows to 8 rows, so at its tallest this is not quite
           enough — but the button tracks the bottom of the *scroll* area, and
           the transcript's own `pb-40` keeps it above the composer for most of
           its range. Chat is the only consumer; other scrollers pass nothing. */
        jumpOffset={118}
        onFollowChange={(following) => {
          shouldFollowChatRef.current = following
          setShowJumpToLatest(!following)
        }}
        viewportClassName="scroll-fade-both px-4 py-4 pb-40 sm:px-6"
        contentClassName="mx-auto max-w-[44rem] space-y-6 pr-12"
      >
        {activeMessages.length === 0 && !run ? (
          <div className="rounded-card border border-dashed border-line bg-surface p-6">
            <div className="text-sm font-medium text-ink">{projectName ? `Start a chat in ${projectName}` : "Start a conversation"}</div>
            <div className="mt-1 text-sm leading-6 text-ink-3">
              {projectName
                ? `Type a prompt and a new session is created here automatically.${scopedSessions.length ? ` ${scopedSessions.length} chat${scopedSessions.length === 1 ? "" : "s"} already in this project.` : ""}`
                : "Pick a prompt or type your own. Agent runs show live context activity."}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">{EXAMPLE_PROMPTS.map((example) => <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40">{example}</button>)}</div>
          </div>
        ) : activeMessages.map((message) => (
          /* `data-slot="message"` and `data-from` are what MessageScroller's
             navigation rail queries to build its list, and it reads the row's
             text to compose each hover preview. Without them the rail silently
             renders nothing. */
          <div
            key={message.id}
            data-slot="message"
            data-from={message.role === "user" ? "user" : "assistant"}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            {message.role === "user" ? (
              /* The user's own message is the only solid-accent surface in the
                 transcript. Assistant output stays unframed on the page
                 surface, which is what lets a long answer read as a document
                 rather than a stack of cards. */
              <div className="max-w-[80%] rounded-card bg-accent px-4 py-2.5 text-sm text-accent-ink">
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
                  return <><SessionNotice text={response.notice} /><StreamingText status={messageStreaming ? "streaming" : "complete"} copyText={response.text} footer={<MessageFooter run={msgRun} sessionID={sessionID} isStreaming={messageStreaming} messageCreatedAt={message.created_at} />}><AgentMarkdown text={response.text} />{msgRun && messageStreaming && <LiveWorkerLog text={run?.id ? (streamBuffer[run.id] ?? "") : ""} active={isRunning} />}{msgRun && (!messageStreaming || !isRunning) && <ActivityContext run={msgRun} events={msgEvents} />}</StreamingText></>
                })()}
                {current.data && <div className="absolute right-0 top-0 z-10 opacity-70 hover:opacity-100"><SessionMenu session={current.data} forkMessageId={message.id} onDuplicate={() => duplicateSession(current.data!)} onFork={(session) => forkSession(session, message.id)} onDelete={() => openSessionAction("delete", current.data!)} /></div>}
              </div>
            )}
          </div>
        ))}
        {run && isRunning && <ActivityContext run={run} events={mergeActivityEvents(events.data ?? [], liveEvents)} />}
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
        /* PromptInput owns the Plus menu, so the existing dropdown becomes its
           action list and the three selects move to the leading slot. Same
           behaviour and same handlers, one implementation. */
        actions={[
          {
            value: "image",
            label: "Attach image",
            description: "Add a screenshot or visual reference.",
            icon: <FileImage />,
          },
          {
            value: "skill",
            label: "Use skill",
            description: "Give the agent a specialized workflow.",
            icon: <Puzzle />,
          },
        ]}
        onAction={(action) => {
          if (action === "image") fileRef.current?.click()
          if (action === "skill") setPrompt((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}$`)
        }}
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
            {/* These three are chips, not fields.
                `SelectTrigger` carries a `glass-flat` fill and a `shadow-xs`,
                which is right for a select sitting in a page toolbar next to an
                input — but here it would be a second bounded surface inside the
                composer's own glass, three boxes stacked in one 36px row.

                Stripped back to text and a chevron, they read as one metadata
                line and the composer keeps a single edge. This is the only
                metadata surface on the page now: the chat title bar that used to
                repeat agent/workspace/model is gone.

                They stay real `<button>`s with the trigger's own focus ring, so
                the dropdowns are unchanged for keyboard and pointer users — only
                the box is removed. `PROMPT_CHIP` is shared by all three because
                they must not drift apart. */}
            <Select value={agent} onValueChange={(v) => setAgent(v as ChatAgent)}>
              <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="Executor">
                <SelectValue placeholder="Executor" />
              </SelectTrigger>
              <SelectContent>
                {EXECUTORS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={profile || "default"} onValueChange={setProfile}>
              <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="Agent profile">
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

            <Select value={workspace || "__local"} onValueChange={(v) => setWorkspace(v === "__local" ? "" : v)} disabled={!!projectID}>
              <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="Workspace" disabled={!!projectID}>
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

            {agent === "hermes" ? (
              <Select value={model || "__default"} onValueChange={(v) => setModel(v === "__default" ? "" : v)}>
                <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label="Model">
                  <SelectValue placeholder="Default model" />
                </SelectTrigger>
                {/* `max-h-*` rather than `h-80`. A fixed height is what pushed this panel
                      past the viewport top on short windows: Radix anchors a
                      `position="popper"` panel to the trigger and will not push it
                      above, so the panel has to be willing to shrink. The sticky
                      search row above still pins inside it. */}
                <SelectContent position="popper" align="start" className="max-h-[min(20rem,var(--radix-select-content-available-height))] w-72">
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
            ) : executorDef(agent).option ? (
              /* dsh/commandcode fix their own model, so the roster select is
                 replaced by the executor's own knob: dsh's sandbox/approval
                 decision, or commandcode's permission mode. */
              <Select
                value={optionValue(executorOptions, agent)}
                onValueChange={(v) => setExecutorOptions((prev) => withOption(prev, agent, v))}
              >
                <SelectTrigger size="sm" className={PROMPT_CHIP} aria-label={executorDef(agent).option!.label}>
                  <SelectValue placeholder={executorDef(agent).option!.label} />
                </SelectTrigger>
                <SelectContent>
                  {executorDef(agent).option!.choices.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {agent !== "hermes" && isLocalWorkspace(workspace) && (
              <span className="text-2xs text-danger-text">execution needs a remote workspace</span>
            )}

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
      {newProject && (
        <ProjectDialog
          workspaces={workspaces}
          onClose={() => setNewProject(false)}
          onSaved={(p) => { setNewProject(false); if (onOpenProject) onOpenProject(p) }}
        />
      )}
  </div>
}

/* A collapsible rail section: the chevron + label header the Pinned, Projects
   and Recents blocks share. Open by default (the caller's `collapsed` record
   only holds what the user closed), so the tree reads fully the first time. */
function RailSection({
  id, label, count, collapsed, onToggle, children,
}: {
  id: string
  label: string
  count?: number
  collapsed: Record<string, boolean>
  onToggle: (id: string) => void
  children: ReactNode
}) {
  const isCollapsed = !!collapsed[id]
  return (
    <Collapsible open={!isCollapsed} onOpenChange={() => onToggle(id)} className="mb-2 last:mb-0">
      <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left outline-none hover:bg-well focus-visible:ring-[3px] focus-visible:ring-focus/40">
        <ChevronRight className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", !isCollapsed && "rotate-90")} />
        <span className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">{label}</span>
        {count !== undefined && <span className="tabular text-2xs font-normal text-ink-3">{count}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-0.5 space-y-0.5">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/* One session row. Lifted out of the old inline map so Pinned, a project node
   and Recents all render the identical control. */
function RailRow({
  item, active, running, archived, onSelect, onAction,
}: {
  item: ChatSession
  active: boolean
  running: boolean
  archived: boolean
  onSelect: (item: ChatSession) => void | Promise<void>
  onAction: (kind: SessionAction, item: ChatSession) => void
}) {
  return (
    <div
      className={cn(
        "group flex w-full items-stretch rounded-lg border transition-colors",
        active ? "border-line bg-accent-tint" : "border-transparent hover:border-line hover:bg-well",
      )}
    >
      <button
        type="button"
        onClick={() => void onSelect(item)}
        title={item.title}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
      >
        <div className={cn("max-w-full truncate text-[13px] leading-none", active ? "font-medium text-accent-text" : "text-ink-2")}>
          {item.title}
        </div>
        <div className="mt-1 flex max-w-full items-center gap-1 truncate text-2xs text-ink-3">
          {item.workspace && item.workspace !== "local" && (
            <span className="truncate">{item.workspace.split("/").filter(Boolean).pop()}</span>
          )}
          {item.model && (
            <>
              {item.workspace && item.workspace !== "local" && <span aria-hidden>·</span>}
              <span className="truncate font-mono text-2xs">{item.model.split("/").pop()}</span>
            </>
          )}
          {running && <StatusLamp status="running" label="Running" size="sm" className="ml-auto shrink-0" />}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${item.title}`}
            className="mr-1.5 self-center rounded-control p-1 text-ink-3 opacity-0 transition-opacity outline-none hover:bg-well hover:text-ink focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-focus/40 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-line bg-raised">
          <DropdownMenuItem onSelect={() => onAction("rename", item)}><Pencil className="size-3.5" /> Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction(archived ? "restore" : "archive", item)}><Archive className="size-3.5" /> {archived ? "Restore" : "Archive"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onAction("delete", item)}><Trash2 className="size-3.5" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
