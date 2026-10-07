/* Session state for the Discussion tab that is worth keeping across a
   reload: how far the user has read, and what they were writing.

   Everything here fails silently. Storage can be unavailable (private
   mode, disabled cookies, a full disk), and losing the marks must
   never break the thread — the worst case is a reply counted as read
   or a draft lost, which is exactly the behaviour without storage.
   Storage is read lazily on each call, so tests can swap in a stub. */

const SEEN_PREFIX = "switchyard:discussion-seen:"
const DRAFT_PREFIX = "switchyard:discussion-draft:"

function storage(): Storage | null {
  try { return window.localStorage } catch { return null }
}

/** Highest comment id the user has seen for a task, if recorded. */
export function readSeen(taskId: string): number | undefined {
  const raw = storage()?.getItem(SEEN_PREFIX + taskId)
  if (raw === null || raw === undefined) return undefined
  const id = Number(raw)
  // Corrupt or non-positive values read as "never seen", which makes
  // the first load the baseline again rather than marking everything
  // above a bogus id unread.
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function writeSeen(taskId: string, id: number) {
  try { storage()?.setItem(SEEN_PREFIX + taskId, String(id)) } catch { /* quota */ }
}

/** The unsent reply for a task, or "". */
export function readDraft(taskId: string): string {
  return storage()?.getItem(DRAFT_PREFIX + taskId) ?? ""
}

/** Store an unsent reply; an empty one clears it. */
export function writeDraft(taskId: string, text: string) {
  try {
    const s = storage()
    if (!s) return
    if (text) s.setItem(DRAFT_PREFIX + taskId, text)
    else s.removeItem(DRAFT_PREFIX + taskId)
  } catch { /* quota */ }
}
