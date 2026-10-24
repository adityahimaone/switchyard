import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowDown, Check, Loader2, MessageSquare, RotateCcw, Send, Sparkles, Puzzle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, toastGlobal, type Profile, type Task, type TaskComment } from "../../api"
import { AgentMarkdown } from "./AgentMarkdown"
import {
  agentPhase, awaitedComment, deliveryNote, elapsedSeconds, isMine, isPending, phaseCopy,
  relativeTime, replyTarget, showHeader, USER_AUTHOR, withMention,
} from "./discussion"
import { commentsKey } from "./useTaskDiscussion"
import { readDraft, writeDraft } from "./discussionStore"

export interface ReviewerPersona {
  id: string
  name: string
  role: string
  icon: string
  skills: string[]
  color: string
}

export const REVIEWER_PERSONAS: ReviewerPersona[] = [
  {
    id: "board-ui",
    name: "You (Reviewer)",
    role: "Human Reviewer",
    icon: "👤",
    skills: [],
    color: "accent",
  },
  {
    id: "qa-engineer",
    name: "QA Engineer",
    role: "Test & Quality Assurance",
    icon: "🛡️",
    skills: ["e2e", "ui-verification", "audit"],
    color: "emerald",
  },
  {
    id: "design-reviewer",
    name: "Design Reviewer",
    role: "UI & Visual Polish",
    icon: "🎨",
    skills: ["apple-design", "emil-design-eng", "animate"],
    color: "purple",
  },
  {
    id: "lead-reviewer",
    name: "Lead Reviewer",
    role: "Architecture & Code Lead",
    icon: "🏛️",
    skills: ["writing-plans", "writing-skills", "git"],
    color: "blue",
  },
]

function personaForAuthor(author: string, profiles: Profile[] = []): { name: string; icon: string; role?: string } {
  const match = REVIEWER_PERSONAS.find((p) => p.id === author)
  if (match) return { name: match.name, icon: match.icon, role: match.role }
  const profileMatch = profiles.find((p) => p.name === author)
  if (profileMatch) return { name: profileMatch.name, icon: "🤖", role: profileMatch.model || "Agent Profile" }
  if (author === USER_AUTHOR || author === "board-ui") return { name: "You", icon: "👤", role: "Reviewer" }
  return { name: author, icon: "💬" }
}

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

function Avatar({ name, icon }: { name: string; icon?: string }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--c-line)] bg-[var(--c-line)]/30 text-2xs font-semibold uppercase text-ink-2"
    >
      {icon || name.trim().charAt(0) || "?"}
    </span>
  )
}

function Message({ c, head, fresh, now, profiles }: { c: TaskComment; head: boolean; fresh: boolean; now: number; profiles?: Profile[] }) {
  const persona = personaForAuthor(c.author, profiles)
  const isReqChanges = c.intent === "request_changes"
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
          <header className="mb-0.5 flex flex-wrap items-baseline gap-2 px-0.5">
            <span className="text-meta font-semibold text-[var(--c-accent)]">You</span>
            {isReqChanges && (
              <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Changes Requested
              </Badge>
            )}
            {c.resolved && (
              <Badge variant="outline" className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="mr-0.5 size-2.5" /> Resolved
              </Badge>
            )}
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
      {head ? <Avatar name={c.author} icon={persona.icon} /> : <span className="size-6 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        {head && (
          <header className="mb-0.5 flex flex-wrap items-baseline gap-2 px-0.5">
            <span className="text-meta font-semibold text-ink-2">{persona.name}</span>
            {persona.role && <span className="font-mono text-[10px] text-ink-3">({persona.role})</span>}
            {isReqChanges && (
              <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Changes Requested
              </Badge>
            )}
            {c.resolved && (
              <Badge variant="outline" className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="mr-0.5 size-2.5" /> Resolved
              </Badge>
            )}
            {c.file_path && (
              <span className="font-mono text-[10px] text-ink-3">
                [{c.file_path}{c.line_number ? `:${c.line_number}` : ""}]
              </span>
            )}
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

  const allPersonas = useMemo(() => {
    const list: ReviewerPersona[] = [...REVIEWER_PERSONAS]
    for (const p of profiles) {
      if (p.valid && !list.some((r) => r.id === p.name)) {
        list.push({
          id: p.name,
          name: p.name,
          role: p.model ? `Agent (${p.model})` : "Agent Profile",
          icon: "🤖",
          skills: p.skills || [],
          color: "sky",
        })
      }
    }
    return list
  }, [profiles])

  const [activePersonaId, setActivePersonaId] = useState("board-ui")
  const activePersona = allPersonas.find((p) => p.id === activePersonaId) ?? allPersonas[0]

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
    mutationFn: ({ body, intent, author }: { body: string; draft: string; intent?: "comment" | "request_changes"; author?: string }) =>
      api<TaskComment>(`/api/boards/${slug}/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, author: author || activePersona.id, intent: intent ?? "comment" }),
      }),
    onMutate: async ({ body, intent, author }) => {
      await qc.cancelQueries({ queryKey: key })
      const postAuthor = author || activePersona.id
      const optimistic: TaskComment = {
        id: -Date.now(),
        task_id: task.id,
        author: postAuthor,
        body,
        intent: intent ?? "comment",
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
        qc.invalidateQueries({ queryKey: ["tasks", slug], refetchType: "active" })
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

  function send(intent: "comment" | "request_changes" = "comment") {
    const body = withMention(draft, target, names)
    if (!body || post.isPending) return
    setErr(null)
    post.mutate({ body, draft, intent, author: activePersona.id })
    setDraft("")
    writeDraft(task.id, "")
    textareaRef.current?.focus()
  }

  function insertPersonaReviewTemplate() {
    let tpl = ""
    if (activePersona.id === "qa-engineer") {
      tpl = `### 🛡️ QA Engineer Review ($e2e, $ui-verification, $audit)\n- [ ] Test Coverage & Edge Cases: \n- [ ] Visual Regression & Accessibility: \n- [ ] Required Changes:`
    } else if (activePersona.id === "design-reviewer") {
      tpl = `### 🎨 Design Review ($apple-design, $emil-design-eng, $animate)\n- [ ] Typography & Spacing Hierarchy: \n- [ ] Contrast Ratio & Glass Token AA Check: \n- [ ] Motion Feel & Transitions: `
    } else if (activePersona.id === "lead-reviewer") {
      tpl = `### 🏛️ Lead Architect Review ($writing-plans, $code-review)\n- [ ] Architecture & Scope Boundaries: \n- [ ] Modularity & Type Safety: \n- [ ] Action Items:`
    } else {
      const skillsStr = activePersona.skills.length > 0 ? activePersona.skills.map((s) => `$${s}`).join(", ") : "general"
      tpl = `### ${activePersona.icon} ${activePersona.name} Review (${skillsStr})\n- [ ] Findings:\n- [ ] Action Required:`
    }
    setDraft((prev) => (prev ? `${prev}\n\n${tpl}` : tpl))
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
                profiles={profiles}
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
        {/* Persona Selector with Skills Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--c-line)] bg-[var(--c-surface)]/60 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-medium text-ink-3">Reviewer:</span>
            <Select value={activePersonaId} onValueChange={setActivePersonaId}>
              <SelectTrigger className="h-6 w-auto gap-1 border-[var(--c-line)] bg-transparent px-2 text-xs font-medium">
                <span className="mr-0.5 text-xs">{activePersona.icon}</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allPersonas.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>{p.icon}</span>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-[10px] text-ink-3">({p.role})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {activePersona.skills.length > 0 && (
              <div className="hidden sm:flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-ink-3">Skills:</span>
                {activePersona.skills.map((sk) => (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-0.5 rounded border border-purple-500/25 bg-purple-500/10 px-1.5 py-0.5 font-mono text-[9px] text-purple-700 dark:text-purple-300"
                  >
                    <Puzzle className="size-2 text-purple-600 dark:text-purple-400" />
                    ${sk}
                  </span>
                ))}
              </div>
            )}
            {activePersona.id !== "board-ui" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10"
                onClick={insertPersonaReviewTemplate}
                title={`Draft review template tailored to ${activePersona.name}'s skills`}
              >
                <Sparkles className="size-3" />
                Template
              </Button>
            )}
          </div>
        </div>

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
          {task.status === "review" || task.status === "blocked" ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" disabled={!canSend} onClick={() => send("comment")} className="shrink-0 gap-1 text-2xs">
                {post.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                Comment
              </Button>
              <Button size="sm" disabled={!canSend} onClick={() => send("request_changes")} className="shrink-0 gap-1 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 text-2xs">
                {post.isPending ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                Request Changes &amp; Re-run
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={!canSend} onClick={() => send("comment")} className="shrink-0 gap-1.5">
              {post.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Send
            </Button>
          )}
        </div>
      </div>
      {err && <p role="alert" className="mt-1.5 text-meta text-danger-text">Not sent: {err}. Your message is back in the box.</p>}
    </div>
  )
}
