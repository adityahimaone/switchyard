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
  executor: "auto" | "hermes" | "codex" | "commandcode" | "shell"
  command?: string
  workspace_kind: string
  workspace_path: string
  result: string
  created_by: string
  created_at: number
  started_at: number | null
  completed_at: number | null
  consecutive_failures: number
  last_failure_error: string
}

export interface TaskRun {
  index: number
  started_at: number
  ended_at: number
  outcome: string
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
  data: { board?: string; task_id?: string; run_id?: string; session_id?: string; kind?: string; payload?: string | Record<string, unknown> }
  at: number
}

export function openEventStream(onEvent: (event: ServerEvent) => void) {
  const source = new EventSource("/api/events/stream")
  const handle = (message: MessageEvent<string>) => {
    try { onEvent(JSON.parse(message.data) as ServerEvent) } catch { /* refetch remains fallback */ }
  }
  source.onmessage = handle
  ;["task_created", "task_updated", "status_changed", "task_event", "commented", "workspace_ping", "node_health", "chat_session_created", "chat_session_updated", "chat_message", "chat_run", "chat_run_event"].forEach((kind) => source.addEventListener(kind, handle))
  return () => source.close()
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

export interface ProviderModel {
  name: string
  base_url: string
  default_model: string
  models: string[]
  api_key_set: boolean
}

export interface TaskComment {
  id: number
  task_id: string
  author: string
  body: string
  created_at: number
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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (res.status === 401) {
    window.location.reload()
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
export interface ChatSession { id: string; title: string; agent: ChatAgent; profile: string; workspace: string; model: string; hermes_session_id?: string; created_at: number; updated_at: number }
export interface ChatMessage { id: string; session_id: string; role: "user" | "assistant" | "system"; content: string; created_at: number; run_id?: string }
export interface ChatRun { id: string; session_id: string; message_id: string; agent: ChatAgent; profile: string; workspace: string; model: string; state: ChatState; prompt: string; output: string; error: string; started_at: number; ended_at?: number | null }
export interface ChatRunEvent { id: number; run_id: string; kind: string; payload: string; created_at: number }
export function listChatSessions(archived = false) { return api<ChatSession[]>(`/api/chat/sessions${archived ? "?archived=1" : ""}`) }
export function createChatSession(input: Partial<ChatSession>) { return api<ChatSession>("/api/chat/sessions", { method: "POST", body: JSON.stringify(input) }) }
export function getChatSession(id: string) { return api<ChatSession>(`/api/chat/sessions/${id}`) }
export function updateChatSession(id: string, input: { title?: string }) { return api<ChatSession>(`/api/chat/sessions/${id}`, { method: "PATCH", body: JSON.stringify(input) }) }
export function archiveChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}/archive`, { method: "POST" }) }
export function unarchiveChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}/unarchive`, { method: "POST" }) }
export function deleteChatSession(id: string) { return api<{ ok: boolean }>(`/api/chat/sessions/${id}`, { method: "DELETE" }) }
export function listChatMessages(id: string) { return api<ChatMessage[]>(`/api/chat/sessions/${id}/messages`) }
export function sendChatMessage(id: string, input: { content: string; agent?: string; profile?: string; workspace?: string; model?: string }) { return api<{ message: ChatMessage; run: ChatRun }>(`/api/chat/sessions/${id}/messages`, { method: "POST", body: JSON.stringify(input) }) }
export function getChatRun(id: string) { return api<ChatRun>(`/api/chat/runs/${id}`) }
export function listChatRunEvents(id: string) { return api<ChatRunEvent[]>(`/api/chat/runs/${id}/events`) }
export function listProviders() { return api<ProviderModel[]>("/api/providers") }
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
