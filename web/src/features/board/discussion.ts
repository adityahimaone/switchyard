import type { Status, TaskComment } from "../../api"

/* Decision logic for the Discussion tab, kept free of React so it can be unit
   tested. The panel renders; this file decides.

   The old panel tracked "sent -> notified -> replied" in component state. Two
   of those three steps were not real: "notified" fired as soon as any comment
   existed, and the state was lost on a tab switch and never reset. Everything
   here is derived from the thread plus the task's real status instead, so it is
   correct after a reload and cannot drift. */

/** Author the board UI posts under. The backend defaults to the same value. */
export const USER_AUTHOR = "board-ui"

export const isMine = (c: Pick<TaskComment, "author">) => c.author === USER_AUTHOR

/** Optimistic comments carry a negative id until the server assigns a real one. */
export const isPending = (c: Pick<TaskComment, "id">) => c.id < 0

/** The agent a reply is addressed to: the assignee, else whoever spoke last. */
export function replyTarget(assignee: string, comments: readonly TaskComment[]): string {
  const a = assignee.trim()
  if (a) return a
  for (let i = comments.length - 1; i >= 0; i--) {
    if (!isMine(comments[i])) return comments[i].author
  }
  return ""
}

/** Does the text already tag one of these names? */
export function mentionsAny(text: string, names: readonly string[]): boolean {
  return names.some((n) => n !== "" && text.includes(`@${n}`))
}

/** Prefix the target tag unless the text already tags somebody.

    The backend decides whether a comment addresses the assignee with
    strings.Contains(body, "@"+assignee), so this mirrors that check exactly
    rather than being cleverer than the server. A draft that already tags an
    agent is left alone, so choosing a different agent by typing still works. */
export function withMention(body: string, target: string, knownNames: readonly string[]): string {
  const text = body.trim()
  if (!target || !text) return text
  if (mentionsAny(text, [target, ...knownNames])) return text
  return `@${target} ${text}`
}

/** The newest comment, when it is the user's: the thread is waiting on an agent. */
export function awaitedComment(comments: readonly TaskComment[]): TaskComment | null {
  const last = comments[comments.length - 1]
  return last && isMine(last) ? last : null
}

export type AgentPhase =
  | "none" //    nothing is waiting on an agent
  | "sending" // optimistic comment, server has not confirmed yet
  | "queued" //  confirmed, task is waiting for a worker
  | "working" // task is running
  | "parked" //  confirmed, but the task is in a state that will not run

const QUEUED: ReadonlySet<Status> = new Set(["triage", "todo", "scheduled", "ready"])

export function agentPhase(status: Status, awaiting: TaskComment | null): AgentPhase {
  if (!awaiting) return "none"
  if (isPending(awaiting)) return "sending"
  if (status === "running") return "working"
  if (QUEUED.has(status)) return "queued"
  return "parked"
}

/** Seconds since a server unix timestamp. Clamped, because a client clock that
    runs behind the server would otherwise produce a negative duration. */
export function elapsedSeconds(sinceUnix: number, nowMs: number): number {
  return Math.max(0, Math.floor(nowMs / 1000 - sinceUnix))
}

export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (sec < 600) return `${m}m ${String(sec % 60).padStart(2, "0")}s`
  return `${m}m`
}

export interface PhaseCopy {
  label: string
  /** Shown after the label in a quieter tone. */
  detail?: string
  tone: "progress" | "warn"
}

/** The dispatcher polls on a fixed interval, so "queued" for a little while is
    normal. Past this, say so rather than leave the user guessing. */
export const QUEUE_SLOW_AFTER_SEC = 90

export function phaseCopy(phase: AgentPhase, who: string, elapsedSec: number, status: Status): PhaseCopy | null {
  const name = who || "The agent"
  switch (phase) {
    case "none":
      return null
    case "sending":
      return { label: "Sending", tone: "progress" }
    case "queued":
      return elapsedSec >= QUEUE_SLOW_AFTER_SEC
        ? { label: "Still queued", detail: "No worker has picked this up yet. Check the node on the Overview tab.", tone: "warn" }
        : { label: `Queued for ${name}`, detail: "Waiting for a worker to pick it up", tone: "progress" }
    case "working":
      return { label: `${name} is working`, detail: formatElapsed(elapsedSec), tone: "progress" }
    case "parked":
      return {
        label: "Saved, but not delivered",
        detail: `This task is ${status}, so no agent will see it yet. Tag an assignee or move it back to todo.`,
        tone: "warn",
      }
  }
}

/** One line under the composer: what sending will actually do. */
export function deliveryNote(
  status: Status,
  assignee: string,
  tagged: boolean,
): { text: string; tone: "info" | "warn" } {
  switch (status) {
    case "review":
    case "blocked":
      return { text: "Sending moves this task back to todo so the agent can respond.", tone: "info" }
    case "done":
      if (!assignee.trim()) {
        return { text: "This task is done and has no assignee, so a comment will not reopen it. Assign an agent first.", tone: "warn" }
      }
      return tagged
        ? { text: `Tagging @${assignee} reopens this task so the agent can respond.`, tone: "info" }
        : { text: `Without a tag for @${assignee} this task stays done and the agent will not see your reply.`, tone: "warn" }
    case "archived":
      return { text: "Archived tasks do not run. Restore it first if you want a response.", tone: "warn" }
    default:
      return { text: "The agent reads this the next time it picks up the task.", tone: "info" }
  }
}

/** Agent comments newer than the last one the user has seen. */
export function unreadAgentCount(comments: readonly TaskComment[], seenId: number): number {
  let n = 0
  for (const c of comments) if (!isMine(c) && !isPending(c) && c.id > seenId) n++
  return n
}

export function latestId(comments: readonly TaskComment[]): number {
  let max = 0
  for (const c of comments) if (c.id > max) max = c.id
  return max
}

/** Agent comments with an id above `afterId`, oldest first. */
export function newAgentComments(comments: readonly TaskComment[], afterId: number): TaskComment[] {
  return comments.filter((c) => !isMine(c) && !isPending(c) && c.id > afterId)
}

const GROUP_GAP_SEC = 5 * 60

/** Repeat the author line only when the speaker changes or the gap is long. */
export function showHeader(prev: TaskComment | undefined, cur: TaskComment): boolean {
  if (!prev) return true
  if (prev.author !== cur.author) return true
  return cur.created_at - prev.created_at > GROUP_GAP_SEC
}

export function relativeTime(tsSec: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor(nowMs / 1000 - tsSec))
  if (sec < 45) return "just now"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(tsSec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
