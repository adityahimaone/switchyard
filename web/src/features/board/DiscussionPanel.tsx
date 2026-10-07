import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowDown, Check, Loader2, MessageSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { api, toastGlobal, type Profile, type Task, type TaskComment } from "../../api"
import { AgentMarkdown } from "./AgentMarkdown"
import {
  agentPhase, awaitedComment, deliveryNote, elapsedSeconds, isMine, isPending, phaseCopy,
  relativeTime, replyTarget, showHeader, USER_AUTHOR, withMention,
} from "./discussion"
import { commentsKey } from "./useTaskDiscussion"
import { readDraft, writeDraft } from "./discussionStore"

/* The Discussion tab as a conversation.

   What changed against the old inline CommentSection, and why:
   - Sending is optimistic. The message is in the thread before the round trip
     finishes and the box is clear and focused, so a second message is one
     keystroke away.
   - What happens next is shown from real state (queued, working, parked), not
     from a three-step tracker whose middle step was not wired to anything.
   - A reply is hard to miss: highlighted on arrival, a "New" divider on the
     first unread one, and a pill when you are scrolled up and it lands below.
   - Enter sends. Shift+Enter is a newline. */

const FRESH_MS = 3200
const STICK_PX = 96

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="size-1.5 rounded-full bg-ink-3 motion-safe:animate-pulse"
        />
      ))}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--c-line)] bg-[var(--c-line)]/30 text-2xs font-semibold uppercase text-ink-2"
    >
      {name.trim().charAt(0) || "?"}
    </span>
  )
}

function Message({ c, head, fresh, now }: { c: TaskComment; head: boolean; fresh: boolean; now: number }) {
  const mine = isMine(c)
  const pending = isPending(c)
  const when = (
    <time
      className="font-mono text-2xs tabular-nums text-ink-3"
      dateTime={new Date(c.created_at * 1000).toISOString()}
      title={new Date(c.created_at * 1000).toLocaleString()}
    >
      {pending ? "Sending…" : relativeTime(c.created_at, now)}
    </time>
  )

  if (mine) {
    return (
      <article className={`flex flex-col items-end ${head ? "mt-2.5" : "mt-0.5"} first:mt-0`}>
        {head && (
          <header className="mb-0.5 flex items-baseline gap-2 px-0.5">
            <span className="text-meta font-semibold text-[var(--c-accent)]">You</span>
            {when}
          </header>
        )}
        <p
          className={`max-w-[88%] whitespace-pre-wrap break-words rounded-lg border border-[var(--c-line-strong)] bg-[var(--c-accent-tint)]/40 px-3 py-2 text-body leading-relaxed text-ink-2 transition-opacity ${
            pending ? "opacity-60" : ""
          }`}
          title={head ? undefined : new Date(c.created_at * 1000).toLocaleString()}
        >
          {c.body}
        </p>
      </article>
    )
  }

  return (
    <article className={`flex gap-2 ${head ? "mt-2.5" : "mt-0.5"} first:mt-0`}>
      {head ? <Avatar name={c.author} /> : <span className="size-6 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {head && (
          <header className="mb-0.5 flex items-baseline gap-2 px-0.5">
            <span className="text-meta font-semibold text-ink-2">{c.author}</span>
            {when}
          </header>
        )}
        <div
          className={`max-w-[92%] break-words rounded-lg border bg-[var(--c-surface)]/50 px-3 py-2 text-body leading-relaxed text-ink-2 transition-[border-color,box-shadow] duration-700 ${
            fresh
              ? "border-[var(--c-accent)] shadow-[0_0_0_3px_var(--c-accent-tint)]"
              : "border-[var(--c-line)]"
          }`}
        >
          <AgentMarkdown text={c.body} />
        </div>
      </div>
    </article>
  )
}

export function DiscussionPanel({
  slug,
  task,
  profiles,
  comments,
  isLoading,
  seenId,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  comments: TaskComment[]
  isLoading: boolean
  seenId: number | null
}) {
  const qc = useQueryClient()
  const key = commentsKey(slug, task.id)

  const [draft, setDraft] = useState(() => readDraft(task.id))
  const [err, setErr] = useState<string | null>(null)
  /** null = follow the default target; "" = the user turned tagging off. */
  const [override, setOverride] = useState<string | null>(null)
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set())
  const [behind, setBehind] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const known = useRef<Set<number> | null>(null)
  const timers = useRef<number[]>([])

  // Where "New" starts is fixed for this visit, so it does not slide as the
  // mark advances behind it.
  const dividerFrom = useRef<number | null>(null)
  if (dividerFrom.current === null && seenId !== null) dividerFrom.current = seenId

  const names = useMemo(() => profiles.filter((p) => p.valid).map((p) => p.name), [profiles])
  const defaultTarget = replyTarget(task.assignee, comments)
  const target = override ?? defaultTarget
  const chipNames = useMemo(
    () => (target && !names.includes(target) ? [target, ...names] : names),
    [names, target],
  )

  const awaiting = awaitedComment(comments)
  const phase = agentPhase(task.status, awaiting)
  const waiting = phase === "queued" || phase === "working"
  const now = useNow(waiting ? 1000 : 30_000)
  const copy = phaseCopy(phase, target, awaiting ? elapsedSeconds(awaiting.created_at, now) : 0, task.status)

  useEffect(() => { writeDraft(task.id, draft) }, [task.id, draft])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  useEffect(() => {
    // Touch devices would pop the keyboard just for opening a tab.
    if (window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus({ preventScroll: true })
  }, [])

  const from = dividerFrom.current
  const firstNewId = from === null ? null : comments.find((c) => !isMine(c) && !isPending(c) && c.id > from)?.id ?? null
  const newCount = firstNewId === null ? 0 : comments.filter((c) => !isMine(c) && !isPending(c) && c.id >= firstNewId).length

  const scrollToBottom = () => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    stick.current = true
    setBehind(0)
  }

  /* Runs before paint so a new message never flashes at the wrong scroll
     position. `stick` is recorded on scroll, because by the time this runs the
     new message has already grown the content. */
  useLayoutEffect(() => {
    const el = threadRef.current
    if (!el || isLoading) return
    if (known.current === null) {
      known.current = new Set(comments.map((c) => c.id))
      if (firstNewId !== null && dividerRef.current) {
        el.scrollTop = Math.max(0, dividerRef.current.offsetTop - 8)
        stick.current = false
      } else {
        el.scrollTop = el.scrollHeight
      }
      return
    }
    const added = comments.filter((c) => !known.current!.has(c.id))
    if (!added.length) return
    added.forEach((c) => known.current!.add(c.id))

    const mineAdded = added.some(isMine)
    const agentAdded = added.filter((c) => !isMine(c))
    if (mineAdded || stick.current) {
      el.scrollTop = el.scrollHeight
      stick.current = true
    } else if (agentAdded.length) {
      setBehind((n) => n + agentAdded.length)
    }
    if (agentAdded.length) {
      const ids = agentAdded.map((c) => c.id)
      setFresh((prev) => new Set([...prev, ...ids]))
      timers.current.push(window.setTimeout(() => {
        setFresh((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
      }, FRESH_MS))
    }
  }, [comments, isLoading, firstNewId])

  // The status line and the typing bubble add height at the bottom too.
  useLayoutEffect(() => {
    if (stick.current) {
      const el = threadRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [phase])

  const post = useMutation({
    mutationFn: ({ body }: { body: string; draft: string }) =>
      api<TaskComment>(`/api/boards/${slug}/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, author: USER_AUTHOR }),
      }),
    onMutate: async ({ body }) => {
      await qc.cancelQueries({ queryKey: key })
      const optimistic: TaskComment = {
        id: -Date.now(),
        task_id: task.id,
        author: USER_AUTHOR,
        body,
        created_at: Math.floor(Date.now() / 1000),
      }
      qc.setQueryData<TaskComment[]>(key, (old) => [...(old ?? []), optimistic])
      return { optimisticId: optimistic.id }
    },
    onError: (e: Error, vars, ctx) => {
      // Remove just our optimistic row. Restoring a snapshot could discard a
      // reply that arrived over the event stream while the request was in flight.
      qc.setQueryData<TaskComment[]>(key, (old) => old?.filter((c) => c.id !== ctx?.optimisticId))
      // Give the text back instead of losing it, unless they have started again.
      setDraft((d) => d || vars.draft)
      setErr(e.message)
    },
    onSuccess: (comment) => {
      if (comment.requeued) {
        // Reflect the requeue now. Without this the task still reads "review"
        // for a beat and the status line would wrongly say "not delivered".
        qc.setQueryData<Task[]>(["tasks", slug], (old) =>
          old?.map((t) => (t.id === task.id ? { ...t, status: "todo" } : t)))
      } else if (task.status === "done" || task.status === "archived") {
        toastGlobal("Comment saved. The task was not reopened.", "info")
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
    },
  })

  function send() {
    const body = withMention(draft, target, names)
    if (!body || post.isPending) return
    setErr(null)
    post.mutate({ body, draft })
    setDraft("")
    writeDraft(task.id, "")
    textareaRef.current?.focus()
  }

  const canSend = !!draft.trim() && !post.isPending
  // The server reopens a done task only when the body tags the *assignee*, so
  // that is what the note must predict, not merely "someone is tagged".
  const tagged = !!task.assignee.trim() && withMention(draft, target, names).includes(`@${task.assignee.trim()}`)
  const note = deliveryNote(task.status, task.assignee, tagged)
  const agentCount = comments.filter((c) => !isMine(c)).length

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        <h2 className="text-2xs font-semibold tracking-[0.14em] text-ink-3 uppercase">Discussion</h2>
        {comments.length > 0 && (
          <span className="text-2xs tabular-nums text-ink-3">
            {comments.length} {comments.length === 1 ? "message" : "messages"}
            {agentCount > 0 && ` · ${agentCount} from agent`}
          </span>
        )}
      </div>

      <div className="relative mt-2.5">
        <div
          ref={threadRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Task discussion"
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
            if (stick.current) setBehind(0)
          }}
          className="relative max-h-[min(32rem,60vh)] min-h-[6rem] overflow-y-auto overscroll-contain pr-0.5"
        >
          {comments.map((c, i) => (
            <Fragment key={c.id}>
              {c.id === firstNewId && (
                <div ref={dividerRef} className="my-2.5 flex items-center gap-2" role="separator" aria-label={`${newCount} new`}>
                  <span className="h-px flex-1 bg-[var(--c-accent)]/40" aria-hidden />
                  <span className="text-2xs font-semibold tracking-[0.14em] text-[var(--c-accent)] uppercase">
                    New{newCount > 1 ? ` · ${newCount}` : ""}
                  </span>
                  <span className="h-px flex-1 bg-[var(--c-accent)]/40" aria-hidden />
                </div>
              )}
              <Message
                c={c}
                head={c.id === firstNewId || showHeader(comments[i - 1], c)}
                fresh={fresh.has(c.id)}
                now={now}
              />
            </Fragment>
          ))}

          {isLoading && (
            <div className="space-y-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg border border-[var(--c-line)] bg-[var(--c-line)]/20" />
              ))}
            </div>
          )}

          {!isLoading && !comments.length && (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--c-line)] px-3 py-8 text-center">
              <MessageSquare className="size-5 text-ink-3" aria-hidden />
              <p className="text-meta text-ink-3">No messages yet</p>
              <p className="max-w-[40ch] text-2xs leading-relaxed text-ink-3">
                Start a conversation. Tag an agent below and it will respond here.
              </p>
            </div>
          )}

          {copy && (
            <div className="mt-2.5 flex gap-2">
              <Avatar name={target || "?"} />
              <div
                className={`flex min-w-0 max-w-[92%] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2 text-meta ${
                  copy.tone === "warn"
                    ? "border-[var(--c-warning)]/40 bg-[var(--c-warning-tint)] text-warning"
                    : "border-dashed border-[var(--c-line)] text-ink-3"
                }`}
              >
                {copy.tone === "warn" ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> : <Dots />}
                <span className="font-medium">{copy.label}</span>
                {copy.detail && <span className="text-2xs tabular-nums opacity-90">{copy.detail}</span>}
              </div>
            </div>
          )}
        </div>

        {behind > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--c-accent)] bg-[var(--c-surface)] px-3 text-2xs font-medium text-[var(--c-accent)] shadow-sm transition-colors hover:bg-[var(--c-accent-tint)]"
          >
            <ArrowDown className="size-3" aria-hidden />
            {behind} new {behind === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      <div className="mt-2.5 rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)]/40 focus-within:border-[var(--c-line-strong)]">
        {chipNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-[var(--c-line)] px-2.5 py-1.5">
            <span className="text-2xs text-ink-3">Reply to</span>
            {chipNames.map((name) => {
              const on = target === name
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOverride(on ? "" : name)}
                  title={on ? `Stop tagging @${name}` : `Tag @${name} on send`}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-2xs transition-colors ${
                    on
                      ? "border-[var(--c-line-strong)] bg-[var(--c-accent-tint)] text-[var(--c-accent)]"
                      : "border-[var(--c-line)] text-ink-3 hover:border-[var(--c-line-strong)] hover:text-[var(--c-accent)]"
                  }`}
                >
                  {on && <Check className="size-3" aria-hidden />}@{name}
                </button>
              )
            })}
          </div>
        )}

        <label htmlFor={`reply-${task.id}`} className="sr-only">Write a reply</label>
        <Textarea
          ref={textareaRef}
          id={`reply-${task.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: Enter confirms an IME candidate and must not send.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            send()
          }}
          rows={2}
          placeholder={target ? `Message @${target}…` : "Write a message…"}
          className="min-h-0 resize-none border-none bg-transparent text-body focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c-line)] px-2.5 py-2">
          <p className={`min-w-0 flex-1 text-2xs leading-relaxed ${note.tone === "warn" ? "text-warning" : "text-ink-3"}`}>
            {note.text}
          </p>
          <span className="hidden shrink-0 font-mono text-2xs text-ink-3 sm:inline">{"↵"} send {"·"} {"⇧↵"} new line</span>
          <Button size="sm" disabled={!canSend} onClick={send} className="shrink-0 gap-1.5">
            {post.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </Button>
        </div>
      </div>
      {err && <p role="alert" className="mt-1.5 text-meta text-danger-text">Not sent: {err}. Your message is back in the box.</p>}
    </div>
  )
}
