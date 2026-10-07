export interface Board {
  slug: string
  name: string
  icon: string
  color: string
  default_workdir: string
  archived?: boolean
}

export interface Task {
  id: string
  title: string
  body: string
  status: Status
  priority: number
  assignee: string
  executor: "auto" | "hermes" | "codex" | "commandcode" | "dsh" | "omp" | "shell"
  command?: string
  execution_mode?: "direct" | "agentic"
  max_iterations?: number
  workspace_kind: string
  workspace_path: string
  result: string
  created_by: string
  created_at: number
  started_at: number | null
  completed_at: number | null
  consecutive_failures: number
  last_failure_error: string
  execution_meta?: string
  /** Declared edit scope, as globs relative to workspace_path. */
  paths?: string[]
  /** Quality gate run on the worker before a human may approve. */
  gate_command?: string
  /** "", "running", "passed" or "failed". */
  gate_status?: string
  gate_output?: string
  /** "manual" waits for the dispatcher poll; "now" claims on create. */
  start_mode?: "manual" | "now"
  /** Retry counter. Attempt 1 is the original run. */
  attempt?: number
  /** "workspace" edits the shared checkout; "worktree" uses a per-task worktree. */
  isolation?: "workspace" | "worktree"
  /** Branch and worktree path, set at dispatch for a worktree-isolated task. */
  branch?: string
  worktree_path?: string
  /**
   * Which verification rung applies before approval: "none" | "fast" | "ui" |
   * "e2e". Undefined means auto — routed from the diff, and recorded in
   * verify_profile_effective once decided.
   */
  verify_profile?: VerifyProfile
  /** What routing actually chose. Shown when verify_profile is unset. */
  verify_profile_effective?: string
  /** "", "skipped", "running", "passed", "failed" or "unavailable". */
  verify_status?: string
  verify_output?: string
  /** A committed .pen design this task implements verbatim. */
  design_source?: string
  /**
   * Which pen.dev surface produces this card's design:
   * "pen_cli" (the headless CLI — the only surface that can
   * create a new .pen on a worker) or "pencil_mcp" (the
   * desktop app's MCP, which edits the document already open
   * in the app). Undefined means no pen.dev design is involved.
   */
  design_tool?: "pen_cli" | "pencil_mcp"
}

/** The verification ladder, weakest first. */
export type VerifyProfile = "none" | "fast" | "ui" | "e2e"

/** One file a verification run produced, stored as a task attachment. */
export interface VerifyAttachment {
  id: string
  filename: string
  mime: string
  size: number
  sha256: string
  created_at: number
}

/** What the review UI needs to render the Verification block. */
export interface TaskVerify {
  task_id: string
  /** What the card asked for; "" when it is auto-routed. */
  profile: string
  /** What routing chose, or what the re-run used. */
  profile_effective: string
  status: string
  output: string
  ladder: string[]
  attachments: VerifyAttachment[]
}

export interface TaskExecutionMeta {
  case: string
  scope: string
  confidence: number
  source: string
  model?: string
  input_tokens?: number
}

export function parseTaskExecutionMeta(raw?: string): TaskExecutionMeta | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TaskExecutionMeta>
    if (typeof parsed.case !== "string" || typeof parsed.scope !== "string") return null
    return {
      case: parsed.case,
      scope: parsed.scope,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      source: typeof parsed.source === "string" ? parsed.source : "unknown",
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      input_tokens: typeof parsed.input_tokens === "number" ? parsed.input_tokens : undefined,
    }
  } catch {
    return null
  }
}

export interface TaskRunUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
}

export interface TaskRun {
  index: number
  started_at: number
  ended_at: number
  outcome: string
  usage: TaskRunUsage
  events: TaskEvent[]
}

export interface TaskDependency {
  task_id: string
  depends_on_id: string
  created_at: number
}

export function taskRuns(slug: string, taskId: string) {
  return api<TaskRun[]>(`/api/boards/${slug}/tasks/${taskId}/runs`)
}

export function taskDependencies(slug: string, taskId: string) {
  return api<TaskDependency[]>(`/api/boards/${slug}/tasks/${taskId}/dependencies`)
}

/** One held path claim, as shown in the board header. */
export interface PathLease {
  glob: string
  task_id: string
  project: string
  acquired_at: number
  title?: string
  status?: string
}

/** A validation problem, mirroring the server's Issue type. */
export interface ValidationIssue {
  code: string
  message: string
  field?: string
}

/** validateTask runs the same checks as create, writing nothing. */
export function validateTask(slug: string, draft: Record<string, unknown>) {
  return api<{ ok: boolean; issues: ValidationIssue[] }>(
    `/api/boards/${slug}/tasks/validate`,
    { method: "POST", body: JSON.stringify(draft) },
  )
}

/** boardLeases lists the path scopes currently held on a board. */
export function boardLeases(slug: string) {
  return api<PathLease[]>(`/api/boards/${slug}/leases`)
}

/** startTask claims a task now instead of waiting for the next poll. */
export function startTask(slug: string, taskId: string) {
  return api<{ task_id: string; status: string; started: boolean; code?: string; message?: string }>(
    `/api/boards/${slug}/tasks/${taskId}/start`,
    { method: "POST" },
  )
}

/** rerunGate re-runs a task's quality gate without re-running the agent. */
export function rerunGate(slug: string, taskId: string) {
  return api<{ task_id: string; gate_status: string; gate_output: string }>(
    `/api/boards/${slug}/tasks/${taskId}/gate`,
    { method: "POST" },
  )
}

/** taskVerify reads a task's verification verdict and its evidence. */
export function taskVerify(slug: string, taskId: string) {
  return api<TaskVerify>(`/api/boards/${slug}/tasks/${taskId}/verify`)
}

/**
 * rerunVerify re-runs verification without re-running the agent. Useful after a
 * flaky visual suite, or when the rung itself was wrong.
 */
export function rerunVerify(slug: string, taskId: string) {
  return api<{ task_id: string; verify_status?: string; verify_output?: string; error?: string }>(
    `/api/boards/${slug}/tasks/${taskId}/verify`,
    { method: "POST" },
  )
}

/**
 * patchTaskFields edits the post-create verification fields.
 *
 * Only these two fields are editable after create — there is no generic task
 * PATCH, because that would be a way to rewrite dispatcher-owned columns such
 * as gate_run_id or attempt.
 */
export function patchTaskFields(
  slug: string,
  taskId: string,
  fields: { verify_profile?: VerifyProfile | ""; design_source?: string; design_tool?: "pen_cli" | "pencil_mcp" | "" },
) {
  return api<Task>(`/api/boards/${slug}/tasks/${taskId}/fields`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  })
}


export function addTaskDependency(slug: string, taskId: string, dependsOnId: string) {
  return api<{ ok: boolean }>(`/api/boards/${slug}/tasks/${taskId}/dependencies`, {
    method: "POST",
    body: JSON.stringify({ depends_on_id: dependsOnId }),
  })
}

export function removeTaskDependency(slug: string, taskId: string, dependsOnId: string) {
  return api<{ ok: boolean }>(`/api/boards/${slug}/tasks/${taskId}/dependencies/${dependsOnId}`, {
    method: "DELETE",
  })
}

export function archiveBoard(slug: string, archived: boolean) {
  return api<Board>(`/api/boards/${slug}`, { method: "PATCH", body: JSON.stringify({ archived }) })
}

export interface TaskEvent {
  id: number
  task_id: string
  kind: string
  payload: string
  created_at: number
}

export interface TaskHealth {
  task_id: string
  status: Status
  health: "not_running" | "healthy" | "silent" | "stuck" | "lost" | "unknown"
  last_activity_at: number
  age_seconds: number
  source: string
  reason: string
}

export type RunControlAction = "retry" | "release" | "clone"

export function runControl(slug: string, taskId: string, action: RunControlAction) {
  return api<Task>(`/api/boards/${slug}/tasks/${taskId}/${action}`, { method: "POST" })
}

export interface WorkerLog {
  text: string
  offset: number
  modified: number
  available: boolean
}

export function workerLog(slug: string, taskId: string, offset = 0) {
  return api<WorkerLog>(`/api/boards/${slug}/tasks/${taskId}/worker-log?offset=${offset}`)
}

export function taskHealth(slug: string, taskId: string) {
  return api<TaskHealth>(`/api/boards/${slug}/tasks/${taskId}/health`)
}

export function boardHealth(slug: string) {
  return api<Record<string, TaskHealth>>(`/api/boards/${slug}/health`)
}

export function reorderTasks(slug: string, order: string[]) {
  return api<{ ok: boolean }>(`/api/boards/${slug}/tasks/reorder`, {
    method: "POST",
    body: JSON.stringify({ order }),
  })
}

export function bulkTasks(
  slug: string,
  payload: { ids: string[]; action: "archive" | "move" | "assign"; status?: Status; assignee?: string },
) {
  return api<{ moved?: string[]; skipped?: string[]; ok?: boolean }>(`/api/boards/${slug}/tasks/bulk`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export interface BoardSnapshot {
  board: Board
  tasks: Task[]
  events: TaskEvent[]
  comments: TaskComment[]
}

export function exportBoard(slug: string) {
  return api<BoardSnapshot>(`/api/boards/${slug}/export`)
}

export function importBoard(snapshot: BoardSnapshot) {
  return api<{ created: boolean; imported: number }>("/api/boards/import", {
    method: "POST",
    body: JSON.stringify(snapshot),
  })
}

export interface OverviewHealth {
  healthy: number
  silent: number
  stuck: number
  lost: number
  unknown: number
}

export interface ServerEvent {
  kind: string
  data: { board?: string; task_id?: string; run_id?: string; message_id?: string; session_id?: string; state?: string; kind?: string; payload?: string | Record<string, unknown> }
  at: number
}

/** Kinds the stream subscribes to. The server also emits default
    (unnamed) events, which `onmessage` covers. */
const STREAM_KINDS = [
  "task_created", "task_updated", "status_changed", "task_event", "commented",
  "workspace_ping", "node_health", "chat_session_created", "chat_session_updated",
  "chat_message", "chat_run", "chat_run_state", "chat_run_event",
]

/* One EventSource for the whole app, fanned out to subscribers. The
   shell, the task page and the chat page all listen; a browser caps
   the connections it opens per origin, so sharing one stream keeps
   that budget for the API calls that actually need it. */
type StreamListener = (event: ServerEvent) => void

let stream: EventSource | null = null
const streamListeners = new Set<StreamListener>()

function ensureEventStream() {
  if (stream) return
  const source = new EventSource("/api/events/stream")
  const dispatch = (message: MessageEvent<string>) => {
    let event: ServerEvent
    try { event = JSON.parse(message.data) as ServerEvent } catch { return }
    streamListeners.forEach((fn) => {
      // One broken listener must not drop the event for the rest.
      try { fn(event) } catch { /* refetch remains fallback */ }
    })
  }
  source.onmessage = dispatch
  STREAM_KINDS.forEach((kind) => source.addEventListener(kind, dispatch))
  stream = source
}

export function openEventStream(onEvent: StreamListener) {
  ensureEventStream()
  streamListeners.add(onEvent)
  return () => {
    streamListeners.delete(onEvent)
    if (streamListeners.size === 0) {
      stream?.close()
      stream = null
    }
  }
}

export interface Workspace {
  id: string
  name: string
  path: string
  host: string
  os?: string
  kind: string
  note?: string
  codegraph_apps?: { path: string; name: string }[]
  codegraph_hidden?: string[]
  status?: string
  status_message?: string
  ping_ms?: number | null
}

export interface WorkspaceFile { name: string; path: string; is_dir: boolean; size?: number }
export interface WorkspacePreview { path: string; mime: string; body?: string; bytes: number; truncated?: boolean; is_binary?: boolean }
export interface WorkspaceFilesResponse { workspace_id: string; transport: string; files: WorkspaceFile[] }
export interface WorkspaceTerminal { session_id: string; transport: string; host?: string }
export function listWorkspaceFiles(id: string, path = ".") { return api<WorkspaceFilesResponse>(`/api/workspaces/${id}/files?path=${encodeURIComponent(path)}`) }
export function previewWorkspaceFile(id: string, path: string) { return api<WorkspacePreview>(`/api/workspaces/${id}/files/preview?path=${encodeURIComponent(path)}`) }
export function saveWorkspaceFile(id: string, path: string, content: string) { return api<{ path: string; status: string }>(`/api/workspaces/${id}/files/edit`, { method: "PUT", body: JSON.stringify({ path, content }) }) }
export function startWorkspaceTerminal(id: string, command: string) { return api<WorkspaceTerminal>(`/api/workspaces/${id}/terminal/start`, { method: "POST", body: JSON.stringify({ command }) }) }
export function downloadWorkspaceFileURL(id: string, path: string) { return `/api/workspaces/${id}/files/download?path=${encodeURIComponent(path)}` }

export interface NodeAgent {
  node_id: string
  hostname: string
  workspaces: string[]
  executors?: string[]
  status: string
  last_seen: string
}

export interface NodeAgentStatus {
  status: string
  nodes?: NodeAgent[]
  error?: string
}

export function nodeAgentHealth() { return api<NodeAgentStatus>("/api/nodes") }

export interface CodeGraphEntry {
  path: string
  name: string
  manual?: boolean
  status: { state: string; available: boolean; indexed: boolean; last_changed?: number; last_label?: string; message?: string }
}

export interface CodeGraphReport { workspace_id: string; apps: CodeGraphEntry[]; hidden: string[] }
export interface CodeGraphJob { id: string; path: string; state: string; message?: string }

export function codeGraphReport(id: string) { return api<CodeGraphReport>(`/api/workspaces/${id}/codegraph`) }
export function codeGraphIndex(id: string, path: string) { return api<CodeGraphJob>(`/api/workspaces/${id}/codegraph/index`, { method: "POST", body: JSON.stringify({ path }) }) }
export function codeGraphJob(id: string, jobID: string) { return api<CodeGraphJob>(`/api/workspaces/${id}/codegraph/jobs/${jobID}`) }

export interface MCPServer { id: string; name: string; transport: "stdio" | "http"; endpoint?: string; command?: string; enabled: boolean; capabilities?: string[]; created_at: number }
export interface ExtensionManifest { id: string; name: string; version: string; description?: string; capabilities: string[] }
export interface GatewayStatus { state: "disabled" | "up" | "down"; url?: string; error?: string }
export function listMCPServers(profile = "default") { return api<MCPServer[]>(`/api/ecosystem/mcp?profile=${encodeURIComponent(profile)}`) }
export function saveMCPServer(item: Omit<MCPServer, "created_at">, profile = "default") { return api<MCPServer[]>(`/api/ecosystem/mcp?profile=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify(item) }) }
export function deleteMCPServer(id: string, profile = "default") { return api<MCPServer[]>(`/api/ecosystem/mcp/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}`, { method: "DELETE" }) }
export function listExtensions(profile = "default") { return api<ExtensionManifest[]>(`/api/ecosystem/extensions?profile=${encodeURIComponent(profile)}`) }
export function saveExtension(item: ExtensionManifest, profile = "default") { return api<ExtensionManifest[]>(`/api/ecosystem/extensions?profile=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify(item) }) }
export function deleteExtension(id: string, profile = "default") { return api<ExtensionManifest[]>(`/api/ecosystem/extensions/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}`, { method: "DELETE" }) }
export function gatewayStatus() { return api<GatewayStatus>("/api/ecosystem/gateway") }

// Live MCP state read from the hermes agent's own config.yaml (mcp_servers:).
// Secrets are never returned — only key names and a secret_set flag.
export interface HermesMCPServer {
  name: string
  transport: "stdio" | "http"
  command?: string
  args?: string[]
  url?: string
  headers?: string[]
  env_keys?: string[]
  secret_set: boolean
  enabled: boolean
  timeout?: number
  auth_hint?: string
}
export interface MCPServerHealth {
  name: string
  state: "ok" | "failed" | "disabled" | "unknown"
  enabled: boolean
  transport: "stdio" | "http"
  tools: number
  tool_names?: string[]
  latency_ms?: number
  error?: string
}
export function listHermesMCPServers(profile = "default") { return api<HermesMCPServer[]>(`/api/ecosystem/mcp/servers?profile=${encodeURIComponent(profile)}`) }
export function listMCPToolsets(profile = "default") { return api<Record<string, string[]>>(`/api/ecosystem/mcp/toolsets?profile=${encodeURIComponent(profile)}`) }
export function testMCPServer(name: string, profile = "default") { return api<MCPServerHealth>(`/api/ecosystem/mcp/${encodeURIComponent(name)}/test?profile=${encodeURIComponent(profile)}`, { method: "POST" }) }

export interface PingPoint {
  at: number
  ms?: number | null
  ok: boolean
  msg?: string
}

export interface Profile {
  name: string
  model: string
  provider: string
  active: boolean
  valid: boolean
  avatar_url?: string
}

export interface ProfileDetail {
  name: string
  model: string
  provider: string
  active: boolean
  valid: boolean
  base_url?: string
  system_prompt: string
  skills: string[]
  avatar_url?: string
}

export interface ModelCapability { vision: boolean; pdf: boolean }
export interface ProviderModel {
  name: string
  base_url: string
  default_model: string
  models: string[]
  capabilities: Record<string, ModelCapability>
  api_key_set: boolean
}
export interface ExecutorSettings {
  order: string[]
  disabled: string[]
  default_execution_mode: "direct" | "agentic"
}
export interface JEVStatus {
  enabled: boolean
  configured: boolean
  online: boolean
  mode: "jev" | "local_fallback"
  model: string
  endpoint: string
  calls: number
  successful_calls: number
  fallback_calls: number
  chat_calls: number
  kanban_calls: number
  chat_successful_calls: number
  kanban_successful_calls: number
  last_latency_ms: number
  last_input_tokens: number
  checked_at: number
}

export interface AttachmentAnalysisConfig {
  mode: "auto" | "dedicated"
  dedicated_model: string
  dedicated_provider: string
  fallback_on_error: boolean
  model_capabilities: Record<string, ModelCapability>
}

export interface TaskComment {
  id: number
  task_id: string
  author: string
  body: string
  created_at: number
  requeued?: boolean
}

export interface CronSchedule { kind: string; expr?: string; minutes?: number; display?: string }
export interface CronJob {
  id: string; name: string; prompt: string; skills: string[]; schedule_display: string; deliver: string
  enabled: boolean; state: string; next_run_at?: string | null; last_run_at?: string | null; last_status?: string | null
  last_error?: string | null; last_delivery_error?: string | null; script?: string | null; no_agent: boolean; paused_reason?: string | null
  workdir?: string | null; schedule?: CronSchedule | null
}
export interface CronExecution { id: string; job_id: string; source: string; status: string; claimed_at: string; started_at?: string | null; finished_at?: string | null; error?: string | null; delivery_outcome?: string | null; scheduled_instant?: string | null }

export type Status =
  | "triage" | "todo" | "scheduled" | "ready" | "running"
  | "blocked" | "review" | "done" | "archived"

export const COLUMNS: Status[] = [
  "triage", "todo", "scheduled", "ready", "running", "blocked", "review", "done",
]

// Concurrent 401s (polling refetch + SSE invalidation) would each call
// reload() and tear the page down mid-navigation, which surfaces as a blank
// screen. One reload per page instance is enough: AuthGate re-checks
// /api/auth/status after the reload and falls back to the login screen.
let reloadingForAuth = false

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (res.status === 401) {
    if (!reloadingForAuth) {
      reloadingForAuth = true
      window.location.reload()
    }
    throw new Error("Authentication expired")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    // Surface 401 as recoverable auth error so callers can gate login.
    const msg = (body as { error?: string }).error ?? res.statusText
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}

export async function uploadProfileAvatar(name: string, file: File) {
  const body = new FormData()
  body.append("avatar", file)
  const res = await fetch(`/api/profiles/${name}/avatar`, { method: "POST", body })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((data as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<ProfileDetail>
}

export function setProfileAvatarUrl(name: string, url: string) {
  return api<ProfileDetail>(`/api/profiles/${name}/avatar-url`, {
    method: "PUT",
    body: JSON.stringify({ url }),
  })
}

export function removeProfileAvatar(name: string) {
  return api<{ ok: boolean }>(`/api/profiles/${name}/avatar`, { method: "DELETE" })
}

/**
 * The workspace's own name and avatar, as opposed to an agent profile.
 * `name` is empty until someone sets it — the caller owns the fallback, so the
 * server never invents a label for the workspace.
 */
export interface WorkspaceIdentity {
  name: string
  /** The URL to render: either `/api/workspace/avatar` or an external image. */
  avatar_url: string
  /** Distinguishes an uploaded blob (cache-bust it) from an external URL. */
  has_uploaded_avatar: boolean
}

export function getWorkspaceIdentity() {
  return api<WorkspaceIdentity>("/api/workspace")
}

export function saveWorkspaceIdentity(name: string) {
  return api<WorkspaceIdentity>("/api/workspace", {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
}

export function setWorkspaceAvatarUrl(url: string) {
  return api<WorkspaceIdentity>("/api/workspace/avatar-url", {
    method: "PUT",
    body: JSON.stringify({ url }),
  })
}

/**
 * Multipart, so it bypasses `api()` — that helper hardcodes a JSON content
 * type. Includes credentials explicitly: the sibling profile uploader omits
 * them and only works because the request happens to be same-origin.
 */
export async function uploadWorkspaceAvatar(file: File) {
  const body = new FormData()
  body.append("avatar", file)
  const res = await fetch("/api/workspace/avatar", {
    method: "POST",
    body,
    credentials: "include",
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((data as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<WorkspaceIdentity>
}

export function removeWorkspaceAvatar() {
  return api<WorkspaceIdentity>("/api/workspace/avatar", { method: "DELETE" })
}

export function runTask(slug: string, taskId: string) {
  return api<Task>(`/api/boards/${slug}/tasks/${taskId}/run`, { method: "POST" })
}

export function cancelRun(slug: string, taskId: string) {
  return api<Task>(`/api/boards/${slug}/tasks/${taskId}/stop`, { method: "POST" })
}

export function queueReason(task: Task, profile: Profile | undefined): string | null {
  if (!task.assignee) return "No agent assigned"
  if (profile && !profile.valid) return "Agent profile broken"
  if (["todo", "ready", "blocked", "review"].indexOf(task.status) < 0) return `Status ${task.status} not queueable`
  return null
}

export function attemptGroups(events: TaskEvent[]): { attempt: number; events: TaskEvent[] }[] {
  const groups: { attempt: number; events: TaskEvent[] }[] = []
  for (const event of events) {
    if (event.kind === "claimed" || event.kind === "spawned") {
      groups.push({ attempt: groups.length + 1, events: [event] })
    } else {
      if (groups.length === 0) groups.push({ attempt: 1, events: [] })
      groups[groups.length - 1].events.push(event)
    }
  }
  return groups
}

export function toastGlobal(message: string, tone: "success" | "error" | "info" = "info") {
  window.dispatchEvent(new CustomEvent("kb-toast", { detail: { message, tone } }))
}

export type ChatAgent = "hermes"
export type ChatState = "loading" | "running" | "done" | "error" | "cancelled"
export interface ChatSession { id: string; title: string; agent: ChatAgent; profile: string; workspace: string; model: string; hermes_session_id?: string; created_at: number; updated_at: number; archived?: boolean; pinned?: boolean; project_id?: string; tags?: string[] }
export interface ChatProject { id: string; name: string; color: string; created_at: number }
export interface ChatForkLink { fork_id: string; source_session_id: string; source_message_id: string; created_at: number }
export interface ChatLineage { forks: ChatForkLink[]; source: ChatForkLink | null }
export interface ChatExport { session: Omit<ChatSession, "id" | "hermes_session_id"> & { id?: string; hermes_session_id?: never }; messages: ChatMessage[] }
export interface ChatMessage { id: string; session_id: string; role: "user" | "assistant" | "system"; content: string; created_at: number; run_id?: string; attachments?: Attachment[] }
export interface Attachment { id: string; filename: string; mime: string; size: number; sha256: string; storage_provider: string; storage_key: string; created_at: number }
export interface ChatRun { id: string; session_id: string; message_id: string; agent: ChatAgent; profile: string; workspace: string; model: string; state: ChatState; prompt: string; output: string; error: string; started_at: number; ended_at?: number | null }
export interface ChatRunEvent { id: number; run_id: string; kind: string; payload: string; created_at: number }
export interface SkillMeta { name: string; description: string; category?: string; path?: string; origin?: string; origin_source?: string }
export function listChatSessions(archived = false, filters: { q?: string; pinned?: boolean; project?: string; tag?: string } = {}) { const params = new URLSearchParams(); if (archived) params.set("archived", "1"); if (filters.q?.trim()) params.set("q", filters.q.trim()); if (filters.pinned) params.set("pinned", "1"); if (filters.project) params.set("project", filters.project); if (filters.tag) params.set("tag", filters.tag); const query = params.toString(); return api<ChatSession[]>(`/api/chat/sessions${query ? `?${query}` : ""}`) }
export function createChatSession(input: Partial<ChatSession>) { return api<ChatSession>("/api/chat/sessions", { method: "POST", body: JSON.stringify(input) }) }
export function getChatSession(id: string) { return api<ChatSession>(`/api/chat/sessions/${id}`) }
export function updateChatSession(id: string, input: { title?: string; pinned?: boolean; project_id?: string }) { return api<ChatSession>(`/api/chat/sessions/${id}`, { method: "PATCH", body: JSON.stringify(input) }) }
export function listChatProjects() { return api<ChatProject[]>("/api/chat/projects") }
export function createChatProject(input: { name: string; color?: string }) { return api<ChatProject>("/api/chat/projects", { method: "POST", body: JSON.stringify(input) }) }
export function updateChatProject(id: string, input: { name?: string; color?: string }) { return api<ChatProject>(`/api/chat/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }) }
export function deleteChatProject(id: string) { return api<{ ok: boolean }>(`/api/chat/projects/${id}`, { method: "DELETE" }) }
export function duplicateChatSession(id: string) { return api<ChatSession>(`/api/chat/sessions/${id}/duplicate`, { method: "POST" }) }
export function forkChatSession(id: string, message_id: string) { return api<ChatSession>(`/api/chat/sessions/${id}/fork`, { method: "POST", body: JSON.stringify({ message_id }) }) }
export function getChatLineage(id: string) { return api<ChatLineage>(`/api/chat/sessions/${id}/lineage`) }
export function exportChatSession(id: string) { return api<ChatExport>(`/api/chat/sessions/${id}/export`) }
export function importChatSession(snapshot: ChatExport) { return api<{ session: ChatSession }>("/api/chat/sessions/import", { method: "POST", body: JSON.stringify(snapshot) }) }
export async function downloadChatTranscript(id: string) { const res = await fetch(`/api/chat/sessions/${id}/transcript`, { credentials: "include" }); if (!res.ok) throw new Error(res.statusText); return res.text() }
export function archiveChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}/archive`, { method: "POST" }) }
export function unarchiveChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}/unarchive`, { method: "POST" }) }
export function deleteChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}`, { method: "DELETE" }) }
export function listChatMessages(id: string) { return api<ChatMessage[]>(`/api/chat/sessions/${id}/messages`) }
const attachmentMaxBytes = 10 * 1024 * 1024
const attachmentMIMEs = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"])
const attachmentExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "pdf"])

export async function uploadAttachment(file: File) {
  if (file.size === 0) throw new Error(`${file.name}: file kosong`)
  if (file.size > attachmentMaxBytes) throw new Error(`${file.name}: ukuran maksimal 10 MB`)
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  if (!attachmentMIMEs.has(file.type) && !attachmentExtensions.has(extension)) throw new Error(`${file.name}: format tidak didukung. Gunakan PNG, JPEG, WEBP, GIF, atau PDF`)
  const body = new FormData()
  body.append("file", file)
  const res = await fetch("/api/attachments", { method: "POST", body, credentials: "include" })
  if (!res.ok) { const data = await res.json().catch(() => ({ error: res.statusText })); throw new Error((data as { error?: string }).error ?? res.statusText) }
  return res.json() as Promise<Attachment>
}
export function attachmentURL(id: string) { return `/api/attachments/${id}` }
export function analyzeAttachment(id: string, model: string, prompt = "") { return api<{ result: string; model: string; mime: string }>(`/api/attachments/${id}/analyze`, { method: "POST", body: JSON.stringify({ model, prompt }) }) }
export function sendChatMessage(id: string, input: { content: string; agent?: string; profile?: string; workspace?: string; model?: string; attachment_ids?: string[] }) { return api<{ message: ChatMessage; run: ChatRun }>(`/api/chat/sessions/${id}/messages`, { method: "POST", body: JSON.stringify(input) }) }
export function getChatRun(id: string) { return api<ChatRun>(`/api/chat/runs/${id}`) }
export function listChatRunEvents(id: string) { return api<ChatRunEvent[]>(`/api/chat/runs/${id}/events`) }
export interface ProviderInput { name: string; base_url: string; api_key?: string; default_model?: string }
export function listProviders() { return api<ProviderModel[]>("/api/providers") }
export function createProvider(input: ProviderInput) { return api<ProviderModel>("/api/providers", { method: "POST", body: JSON.stringify(input) }) }
export function updateProvider(name: string, input: Omit<ProviderInput, "name">) { return api<ProviderModel>(`/api/providers/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(input) }) }
export function deleteProvider(name: string) { return api<{ deleted: string }>(`/api/providers/${encodeURIComponent(name)}`, { method: "DELETE" }) }
export interface NotificationItem { id: string; profile: string; kind: string; data: Record<string, unknown>; unread: boolean; created_at: number }
export function listNotifications(profile = "default", unread = false) { return api<NotificationItem[]>(`/api/notifications?profile=${encodeURIComponent(profile)}${unread ? "&unread=1" : ""}`) }
export function markNotificationRead(id: string) { return api<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }) }
export function markAllNotificationsRead(profile = "default") { return api<{ ok: boolean }>(`/api/notifications/read-all?profile=${encodeURIComponent(profile)}`, { method: "POST" }) }
export function discoverProviderModels(name: string) { return api<{ name: string; models: string[] }>(`/api/providers/${encodeURIComponent(name)}/models/discover`, { method: "POST" }) }
export function listSkills(query = "") { return api<SkillMeta[]>(`/api/skills${query ? `?q=${encodeURIComponent(query)}` : ""}`) }
export function getJEVStatus() { return api<JEVStatus>("/api/settings/jev") }
export function getExecutorSettings() { return api<ExecutorSettings>("/api/settings/executors") }
export function saveExecutorSettings(settings: ExecutorSettings) { return api<ExecutorSettings>("/api/settings/executors", { method: "PUT", body: JSON.stringify(settings) }) }
export function getAttachmentAnalysisConfig() { return api<AttachmentAnalysisConfig>("/api/settings/attachment-analysis") }
export function saveAttachmentAnalysisConfig(config: AttachmentAnalysisConfig) { return api<AttachmentAnalysisConfig>("/api/settings/attachment-analysis", { method: "PUT", body: JSON.stringify(config) }) }
export function stopChatRun(id: string) { return api<{ state: ChatState }>(`/api/chat/runs/${id}/stop`, { method: "POST" }) }
export function retryChatRun(id: string) { return api<ChatRun>(`/api/chat/runs/${id}/retry`, { method: "POST" }) }
export function getChatActiveRun(sessionID: string) { return api<ChatRun | null>(`/api/chat/sessions/${sessionID}/active-run`) }
export function listActiveChatRuns() { return api<ChatRun[]>("/api/chat/active") }

export interface ActivityDay { date: string; chat_messages: number; task_dispatches: number; total: number }
export function getOverviewActivity(days = 180) { return api<ActivityDay[]>(`/api/overview/activity?days=${days}`) }

export interface ReviewMetrics { approved: number; reopened: number; now_in_review: number; avg_latency_s: number }
export function getOverviewReview() { return api<ReviewMetrics>("/api/overview/review") }

export interface QueueTrendPoint { date: string; queue_size: number; completed: number; failed: number }
export function getOverviewQueueTrend(days = 30) { return api<QueueTrendPoint[]>(`/api/overview/queue-trend?days=${days}`) }
