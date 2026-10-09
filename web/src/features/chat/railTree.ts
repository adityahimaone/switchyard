import type { ChatSession } from "@/api"

/* Pure partition behind the chat rail's tree. Kept out of ChatPage so the
   "shown in exactly one place" rule is unit-testable: pinned wins, then the
   session's project, then the time-grouped Recents bucket. Without the
   precedence a pinned session that also belongs to a project renders twice. */

export type GroupKey = "today" | "yesterday" | "prev7" | "prev30" | "older"
export const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "prev7", "prev30", "older"]
export const GROUP_LABEL: Record<GroupKey, string> = { today: "Today", yesterday: "Yesterday", prev7: "Previous 7 days", prev30: "Previous 30 days", older: "Older" }

export function groupKeyFor(tsSeconds: number, nowMs = Date.now()): GroupKey {
  const startOfToday = new Date(nowMs)
  startOfToday.setHours(0, 0, 0, 0)
  const dayMs = 86_400_000
  const t0 = startOfToday.getTime()
  // ChatSession timestamps are unix SECONDS; the day boundaries are ms.
  const ts = tsSeconds * 1000
  if (ts >= t0) return "today"
  if (ts >= t0 - dayMs) return "yesterday"
  if (ts >= t0 - 7 * dayMs) return "prev7"
  if (ts >= t0 - 30 * dayMs) return "prev30"
  return "older"
}

export function buildRailTree(sessions: ChatSession[], nowMs = Date.now()) {
  const pinned: ChatSession[] = []
  const byProject = new Map<string, ChatSession[]>()
  const recentsGrouped: Record<GroupKey, ChatSession[]> = { today: [], yesterday: [], prev7: [], prev30: [], older: [] }
  for (const s of sessions) {
    if (s.pinned) { pinned.push(s); continue }
    if (s.project_id) {
      const list = byProject.get(s.project_id) ?? []
      list.push(s)
      byProject.set(s.project_id, list)
      continue
    }
    recentsGrouped[groupKeyFor(s.updated_at, nowMs)].push(s)
  }
  return { pinned, byProject, recentsGrouped }
}
