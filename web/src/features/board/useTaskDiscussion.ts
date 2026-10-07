import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, openEventStream, toastGlobal, type TaskComment } from "../../api"
import { awaitedComment, latestId, newAgentComments, unreadAgentCount } from "./discussion"
import { readSeen, writeSeen } from "./discussionStore"

/* One subscription per task page, owned here and not by the Discussion tab.

   The old panel opened its own EventSource, so it only listened while the tab
   was on screen: a reply that landed while you were looking at Output was
   invisible until you came back. Owning it at page level is what makes the tab
   badge, the toast and the title flash possible. */

export const commentsKey = (slug: string, taskId: string) => ["comments", slug, taskId] as const

const NO_COMMENTS: TaskComment[] = []

/** Server-sent events are the fast path. Polling is the safety net for a
    dropped stream, and it tightens while a reply is being waited on. */
const POLL_IDLE_MS = 15_000
const POLL_AWAITING_MS = 3_000

export interface TaskDiscussion {
  comments: TaskComment[]
  isLoading: boolean
  /** Agent comments the user has not seen. Always 0 while the tab is open. */
  unread: number
  /** Last id seen before this visit, or null until the first load settles. */
  seenId: number | null
}

export function useTaskDiscussion(slug: string, taskId: string, open: boolean): TaskDiscussion {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: commentsKey(slug, taskId),
    queryFn: () => api<TaskComment[]>(`/api/boards/${slug}/tasks/${taskId}/comments`),
    refetchInterval: (q) => (awaitedComment(q.state.data ?? NO_COMMENTS) ? POLL_AWAITING_MS : POLL_IDLE_MS),
  })
  const comments = query.data ?? NO_COMMENTS

  useEffect(() => openEventStream((event) => {
    if (event.data.task_id !== taskId) return
    if (event.kind === "commented" || event.kind === "task_event" || event.kind === "task_updated" || event.kind === "status_changed") {
      qc.invalidateQueries({ queryKey: commentsKey(slug, taskId) })
      qc.invalidateQueries({ queryKey: ["events", slug, taskId] })
    }
  }), [qc, slug, taskId])

  /* First load is the baseline: opening an old thread does not paint every past
     reply as unread. After that, the mark only advances while the tab is open.
     The mark is stored, so replies that arrived while the browser was closed
     still count as unread on the next visit instead of being read silently. */
  useEffect(() => {
    if (!query.data) return
    const stored = readSeen(taskId)
    const top = latestId(query.data)
    if (stored === undefined) writeSeen(taskId, top)
    else if (open) writeSeen(taskId, Math.max(stored, top))
  }, [query.data, open, taskId])

  // Alert only for replies that arrive after the first load.
  const alertedUpTo = useRef<number | null>(null)
  const baseTitle = useRef<string | null>(null)

  useEffect(() => {
    alertedUpTo.current = null
  }, [taskId])

  useEffect(() => {
    if (!query.data) return
    const top = latestId(query.data)
    if (alertedUpTo.current === null) {
      alertedUpTo.current = top
      return
    }
    const fresh = newAgentComments(query.data, alertedUpTo.current)
    alertedUpTo.current = Math.max(top, alertedUpTo.current)
    if (!fresh.length) return
    const who = fresh[fresh.length - 1].author
    if (document.hidden) {
      // The user switched away while waiting: put the reply in the browser tab.
      if (baseTitle.current === null) baseTitle.current = document.title
      document.title = `● ${who} replied · ${baseTitle.current}`
    } else if (!open) {
      toastGlobal(`${who} replied on this task`, "info")
    }
  }, [query.data, open])

  useEffect(() => {
    const restore = () => {
      if (!document.hidden && baseTitle.current !== null) {
        document.title = baseTitle.current
        baseTitle.current = null
      }
    }
    document.addEventListener("visibilitychange", restore)
    return () => {
      document.removeEventListener("visibilitychange", restore)
      if (baseTitle.current !== null) {
        document.title = baseTitle.current
        baseTitle.current = null
      }
    }
  }, [])

  const seen = readSeen(taskId)
  return {
    comments,
    isLoading: query.isLoading,
    unread: open || seen === undefined ? 0 : unreadAgentCount(comments, seen),
    seenId: seen ?? null,
  }
}
