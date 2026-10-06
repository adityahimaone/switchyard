import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { addTaskDependency, api, cancelRun, openEventStream, parseTaskExecutionMeta, patchTaskFields, queueReason, removeTaskDependency, runControl, runTask, taskDependencies, taskHealth, taskRuns, toastGlobal, type Profile, type Task, type TaskComment, type TaskEvent, type VerifyProfile, type Workspace, type TaskHealth as TH } from "../../api"
import { parseEventCards, TONE_BORDER, TONE_DOT, TONE_TEXT, FIELD_TRUNCATE_LEN, type EventGroup, type EventCard } from "./eventCards"
import { VerifySettings } from "./VerifySettings"
import { ArrowLeft, Check, ChevronDown, ChevronRight, GitBranch, History, Loader2, MessageSquare, Send, Trash2 } from "lucide-react"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import type { Attachment } from "../../api"
import { AgentTaskStatus, splitAgentResult } from "./AgentStatus"
import { TaskOutput } from "./OutputPanels"
import { ReviewSection } from "./ReviewSection"
import TaskRuntimeStatus from "./TaskRuntimeStatus"
import {
  AgentPicker, EmptyNote, FailureBlock, Field, FieldList, OsIcon, PriorityBadge,
  Section, StatusBadge, TaskActions,
} from "./taskDetailParts"
import { AgentTrace } from "@/components/ui/agent-trace"
import { traceOrigin, traceSpansFromHistory } from "./taskTrace"

type ReplyState = "idle" | "sent" | "notified" | "replied"

const REPLY_STEPS = [
  { key: "sent", label: "Sent" },
  { key: "notified", label: "Agent notified" },
  { key: "replied", label: "Agent replied" },
] as const

const REPLY_ORDER: Record<Exclude<ReplyState, "idle">, number> = { sent: 1, notified: 2, replied: 3 }

function ReplyStatus({ state }: { state: ReplyState }) {
  if (state === "idle") return null
  const reached = REPLY_ORDER[state]
  return (
    <ol className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-live="polite">
      {REPLY_STEPS.map((step, index) => {
        const done = REPLY_ORDER[step.key] <= reached
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs transition-colors ${
                done
                  ? "border-[var(--c-line-strong)] bg-[var(--c-accent-tint)] text-[var(--c-accent)]"
                  : "border-[var(--c-line)] text-ink-3"
              }`}
            >
              {done ? <Check className="size-3" aria-hidden /> : <span className="size-1.5 rounded-full bg-ink-4" aria-hidden />}
              {step.label}
            </span>
            {index < REPLY_STEPS.length - 1 && <ChevronRight className="size-3 shrink-0 text-ink-3" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function CommentSection({ slug, task, profiles }: { slug: string; task: Task; profiles: Profile[] }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [replyState, setReplyState] = useState<ReplyState>("idle")
  const [lastSentAt, setLastSentAt] = useState(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(0)

  const comments = useQuery({
    queryKey: ["comments", slug, task.id],
    queryFn: () => api<TaskComment[]>(`/api/boards/${slug}/tasks/${task.id}/comments`),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    const latest = comments.data?.[comments.data.length - 1]
    if (!latest) return
    if (replyState === "sent") setReplyState("notified")
    if (lastSentAt && latest.created_at >= lastSentAt && latest.author !== "board-ui") setReplyState("replied")
  }, [comments.data, lastSentAt, replyState])

  /* Keep the newest message in view when one arrives, but only when the user
     was already at the bottom. Otherwise scrolling fights the reader. */
  useEffect(() => {
    const count = comments.data?.length ?? 0
    if (!count) return
    const grew = count > previousCount.current
    previousCount.current = count
    if (!grew) return
    const el = threadRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [comments.data])

  useEffect(() => openEventStream((event) => {
    if (event.data.task_id !== task.id) return
    if (event.kind === "commented" || event.kind === "task_event" || event.kind === "task_updated" || event.kind === "status_changed") {
      qc.invalidateQueries({ queryKey: ["comments", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
    }
  }), [qc, slug, task.id])

  const post = useMutation({
    mutationFn: (body: string) =>
      api<TaskComment>(`/api/boards/${slug}/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, author: "board-ui" }),
      }),
    onSuccess: (comment) => {
      setDraft("")
      setLastSentAt(comment.created_at)
      setReplyState("sent")
      toastGlobal(comment.requeued ? "Comment sent. Task requeued to todo." : "Comment sent. Task was not requeued.", comment.requeued ? "success" : "info")
      qc.invalidateQueries({ queryKey: ["comments", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
    },
    onError: (e: Error) => setErr(e.message),
  })

  function mention(name: string) {
    setDraft((d) => (d.endsWith(" ") || d === "" ? `${d}@${name} ` : `${d} @${name} `))
  }

  const list = comments.data ?? []
  const agentReplies = list.filter((c) => c.author !== "board-ui").length
  const canSend = !!draft.trim() && !post.isPending

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        <h2 className="text-2xs font-semibold tracking-[0.14em] text-ink-3 uppercase">Discussion</h2>
        {list.length > 0 && (
          <span className="text-2xs tabular-nums text-ink-3">
            {list.length} {list.length === 1 ? "message" : "messages"}
            {agentReplies > 0 && ` · ${agentReplies} from agent`}
          </span>
        )}

        {profiles.filter((p) => p.valid).length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <span className="text-2xs text-ink-3">Tag</span>
            {profiles.filter((p) => p.valid).map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => mention(p.name)}
                className={`inline-flex h-6 items-center rounded-full border px-2 text-2xs transition-colors ${
                  task.assignee === p.name
                    ? "border-[var(--c-line-strong)] bg-[var(--c-accent-tint)] text-[var(--c-accent)]"
                    : "border-[var(--c-line)] text-ink-3 hover:border-[var(--c-line-strong)] hover:text-[var(--c-accent)]"
                }`}
                title={`Insert @${p.name} into the reply`}
                aria-label={`Tag ${p.name}`}
              >
                @{p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={threadRef}
        className="mt-2.5 max-h-[26rem] min-h-[6rem] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
      >
        {list.map((c) => {
          const mine = c.author === "board-ui"
          return (
            <article
              key={c.id}
              className={`rounded-lg border px-3 py-2 ${
                mine
                  ? "border-[var(--c-line-strong)] bg-[var(--c-accent-tint)]/40"
                  : "border-[var(--c-line)] bg-[var(--c-surface)]/50"
              }`}
            >
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`text-meta font-semibold ${mine ? "text-[var(--c-accent)]" : "text-ink-2"}`}>
                  {mine ? "You" : c.author}
                </span>
                <time
                  className="font-mono text-2xs tabular-nums text-ink-3"
                  dateTime={new Date(c.created_at * 1000).toISOString()}
                >
                  {new Date(c.created_at * 1000).toLocaleString()}
                </time>
                {!mine && (
                  <span className="ml-auto shrink-0 rounded-full border border-[var(--c-line)] px-1.5 text-2xs text-ink-3">
                    agent
                  </span>
                )}
              </header>
              <p className="mt-1 whitespace-pre-wrap break-words text-body leading-relaxed text-ink-2">{c.body}</p>
            </article>
          )
        })}

        {comments.isLoading && (
          <div className="space-y-1.5" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-[var(--c-line)] bg-[var(--c-line)]/20" />
            ))}
          </div>
        )}

        {!comments.isLoading && !list.length && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--c-line)] px-3 py-8 text-center">
            <MessageSquare className="size-5 text-ink-3" aria-hidden />
            <p className="text-meta text-ink-3">No messages yet</p>
            <p className="max-w-[40ch] text-2xs leading-relaxed text-ink-3">
              Start a conversation. Comments are delivered into the agent's worker context, so a tagged
              agent sees them on its next step.
            </p>
          </div>
        )}
      </div>

      <ReplyStatus state={replyState} />

      <div className="mt-2.5 rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)]/40 focus-within:border-[var(--c-line-strong)]">
        <label htmlFor={`reply-${task.id}`} className="sr-only">Write a reply</label>
        <Textarea
          id={`reply-${task.id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSend) {
              e.preventDefault()
              setErr(null)
              post.mutate(draft.trim())
            }
          }}
          rows={3}
          placeholder={`Reply to the agent… tag @${task.assignee || "an agent"} to get a response`}
          className="min-h-0 resize-none border-none bg-transparent text-body focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--c-line)] px-2.5 py-2">
          <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-3">
            If the task is done or blocked, tagging the assignee requeues it to todo so the agent respawns and replies.
          </p>
          <span className="hidden shrink-0 font-mono text-2xs text-ink-3 sm:inline">⌘↵</span>
          <Button
            size="sm"
            disabled={!canSend}
            onClick={() => { setErr(null); post.mutate(draft.trim()) }}
            className="shrink-0 gap-1.5"
          >
            {post.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Send
          </Button>
        </div>
      </div>
      {err && <p className="mt-1.5 text-meta text-danger-text">{err}</p>}
    </div>
  )
}

function TruncValue({ value, mono, tone }: { value: string; mono?: boolean; tone?: string }) {
  const long = value.length > FIELD_TRUNCATE_LEN
  const [expanded, setExpanded] = useState(false)
  const toneCls = tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning" : "text-ink-2"
  if (!long) return <dd className={`break-all text-body ${mono ? "font-mono" : ""} ${toneCls}`}>{value}</dd>
  return (
    <dd className={`break-all text-body ${mono ? "font-mono" : ""} ${toneCls}`}>
      {expanded ? value : `${value.slice(0, FIELD_TRUNCATE_LEN)}…`}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="-mb-1 ml-1 inline-flex h-6 items-center rounded px-1 text-2xs text-[var(--color-info)] hover:bg-[var(--c-line)]/50"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </dd>
  )
}

function EventCardNode({ card }: { card: EventCard }) {
  const [open, setOpen] = useState(true)
  const hasContent = !!card.note || card.fields.length > 0
  return (
    <article className={`rounded-md border p-2 ${TONE_BORDER[card.tone]}`}>
      <div className="flex items-center gap-1.5">
        {hasContent ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${card.label}`}
            onClick={() => setOpen((v) => !v)}
            className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-[var(--c-line)]/50 hover:text-ink-2"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        <card.icon className={`size-3.5 shrink-0 ${TONE_TEXT[card.tone]}`} aria-hidden />
        <span className={`min-w-0 flex-1 truncate text-body font-medium ${TONE_TEXT[card.tone]}`}>{card.label}</span>
        <span className="shrink-0 font-mono text-2xs text-ink-3">
          {new Date(card.at * 1000).toLocaleTimeString()}
        </span>
      </div>
      {open && hasContent && (
        <>
          {card.note && (
            <p className="mt-1.5 ml-7.5 break-words font-mono text-body leading-relaxed text-ink-2">{card.note}</p>
          )}
          {card.fields.length > 0 && (
            <dl className="mt-1.5 ml-7.5 space-y-0.5">
              {card.fields.map((f, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2.5">
                  <dt className="truncate text-2xs text-ink-3">{f.label}</dt>
                  <TruncValue value={f.value} mono={f.mono} tone={f.tone} />
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </article>
  )
}

function CollapsibleGroup({ group }: { group: EventGroup }) {
  const isProblem = group.title === "Problem"
  const [open, setOpen] = useState(!isProblem)
  return (
    <Section className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group/head -mx-1 flex w-full items-center gap-1.5 rounded px-1 text-left"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0 text-ink-3" /> : <ChevronRight className="size-3.5 shrink-0 text-ink-3" />}
        <span className={`size-2 shrink-0 rounded-full ${TONE_DOT[group.tone]}`} aria-hidden />
        <h2 className={`text-2xs font-semibold tracking-[0.14em] uppercase ${TONE_TEXT[group.tone]}`}>{group.title}</h2>
        <span className="h-px flex-1 bg-[var(--c-line)]" aria-hidden />
        <span className="shrink-0 text-2xs tabular-nums text-ink-3">{group.cards.length}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {group.cards.map((c) => (
            <EventCardNode key={`${c.kind}-${c.at}-${c.fields.map((f) => f.value).join("|")}`} card={c} />
          ))}
        </div>
      )}
    </Section>
  )
}

export default function TaskDetailPage({
  slug,
  task,
  profiles,
  workspaces,
  onBack,
  onMove,
  onStop,
  onReassign,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  workspaces: Workspace[]
  onBack: () => void
  onMove: (s: Task["status"]) => Promise<void>
  onStop: () => Promise<void>
  onReassign: (a: string) => Promise<void>
}) {
  const qc = useQueryClient()
  const attachments = useQuery<Attachment[]>({
    queryKey: ["attachments", slug, task.id],
    queryFn: () => api<Attachment[]>(`/api/boards/${slug}/tasks/${task.id}/attachments`),
  })
  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = workspaces.find((w) => w.path === task.workspace_path)
  const health = useQuery<TH>({
    queryKey: ["health", slug, task.id],
    queryFn: () => taskHealth(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const runs = useQuery({
    queryKey: ["runs", slug, task.id],
    queryFn: () => taskRuns(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const dependencies = useQuery({
    queryKey: ["dependencies", slug, task.id],
    queryFn: () => taskDependencies(slug, task.id),
  })
  const [dependencyId, setDependencyId] = useState("")
  const boardTasks = useQuery({ queryKey: ["tasks", slug], queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`) })
  const dependencyChoices = useMemo(() => {
    const taken = new Set((dependencies.data ?? []).map((d) => d.depends_on_id))
    return (boardTasks.data ?? []).filter((t) => t.id !== task.id && !taken.has(t.id)).map((t) => ({ id: t.id, title: t.title }))
  }, [boardTasks.data, dependencies.data, task.id])
  const dependencyMutation = useMutation({
    mutationFn: (dependsOnId: string) => addTaskDependency(slug, task.id, dependsOnId),
    onSuccess: () => {
      setDependencyId("")
      qc.invalidateQueries({ queryKey: ["dependencies", slug, task.id] })
      toastGlobal("Dependency added", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const removeDependency = useMutation({
    mutationFn: (dependsOnId: string) => removeTaskDependency(slug, task.id, dependsOnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", slug, task.id] })
      toastGlobal("Dependency removed", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const runMutation = useMutation({
    mutationFn: () => runTask(slug, task.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["runs", slug, task.id] })
      toastGlobal("Task queued", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const cancelMutation = useMutation({
    mutationFn: async () => {
      await cancelRun(slug, task.id)
      await onStop()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["runs", slug, task.id] })
      toastGlobal("Run stopped", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const control = useMutation({
    mutationFn: (action: "retry" | "release" | "clone") => runControl(slug, task.id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["health", slug, task.id] })
    },
  })
  const canRelease = health.data?.health === "stuck" || health.data?.health === "lost"
  const fields = useMutation({
    mutationFn: (patch: { verify_profile?: VerifyProfile | ""; design_source?: string }) =>
      patchTaskFields(slug, task.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["verify", slug, task.id] })
      toastGlobal("Verification settings saved", "success")
    },
    onError: (e: Error) => toastGlobal(e.message, "error"),
  })
  const groups = events.data ? parseEventCards(events.data) : []
  const traceSpans = useMemo(
    () => traceSpansFromHistory(events.data ?? [], runs.data ?? []),
    [events.data, runs.data]
  )
  const resultSplit = task.result ? splitAgentResult(task.result) : null
  const jev = parseTaskExecutionMeta(task.execution_meta)
  const runReason = queueReason(task, profile)
  const eventCount = events.data?.length ?? 0

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-4 py-4 sm:px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to board" title="Back to board">
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink" title={task.title}>{task.title}</h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList variant="line" className="w-full justify-start gap-1 border-b border-[var(--c-line)] pb-0">
            <TabsTrigger value="overview" className="gap-1.5 text-meta"><GitBranch className="size-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="output" className="gap-1.5 text-meta">Output</TabsTrigger>
            <TabsTrigger value="discussion" className="gap-1.5 text-meta"><MessageSquare className="size-3.5" />Discussion</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-meta">
              <History className="size-3.5" />History
              {eventCount > 0 && <span className="rounded-full bg-[var(--c-line)]/60 px-1.5 text-2xs tabular-nums text-ink-3">{eventCount}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------- overview -- */}
          <TabsContent value="overview" className="mt-4 space-y-3">
            <div className="rounded-xl border border-[var(--c-line)] bg-[var(--c-canvas)] p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="px-1.5 py-0 font-mono text-2xs leading-none text-ink-3">{task.id}</Badge>
                {jev && <Badge variant="outline" className="border-review/30 bg-review-tint px-1.5 py-0 text-2xs leading-none text-review-text">JEV {jev.case}</Badge>}
                <span className="text-2xs text-ink-3">created {new Date(task.created_at * 1000).toLocaleString()}</span>
                {task.completed_at && <span className="text-2xs text-ink-3">· finished {new Date(task.completed_at * 1000).toLocaleString()}</span>}
              </div>

              <div className="mt-3 space-y-3">
                <AgentTaskStatus task={task} events={events.data ?? []} />
                <TaskRuntimeStatus task={task} profile={profile} workspace={ws} events={events.data ?? []} runs={runs.data ?? []} tasks={boardTasks.data ?? []} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                <AgentPicker
                  task={task}
                  profiles={profiles}
                  onReassign={onReassign}
                  onError={(m) => toastGlobal(m, "error")}
                />
                <Section title="Workspace">
                  <p className="truncate text-body text-ink-2" title={task.workspace_path || "scratch"}>
                    <span className="inline-flex items-center gap-1.5">
                      <OsIcon ws={ws} />
                      {ws ? ws.name : task.workspace_path ? task.workspace_path.split(/[\\/]/).pop() : "scratch"}
                    </span>
                  </p>
                  <p className="mt-1.5 truncate font-mono text-2xs text-ink-3">
                    {task.workspace_kind || "dir"}{ws?.host ? ` · ${ws.host}` : ""}
                  </p>
                  {task.consecutive_failures > 0 && (
                    <p className="mt-1 text-2xs text-danger-text">{task.consecutive_failures} consecutive failures</p>
                  )}
                </Section>
              </div>

              {jev && (
                <Section title={<span className="text-review-text">JEV routing</span>} className="mt-2.5">
                  <FieldList>
                    <Field label="Case">{jev.case}</Field>
                    <Field label="Scope">{jev.scope}</Field>
                    <Field label="Confidence">{(jev.confidence * 100).toFixed(0)}%</Field>
                    <Field label="Source">{jev.source}</Field>
                    <Field label="Input tokens">{jev.input_tokens ?? 0}</Field>
                    {jev.model && <Field label="Model">{jev.model}</Field>}
                  </FieldList>
                </Section>
              )}

              <VerifySettings
                slug={slug}
                task={task}
                saving={fields.isPending}
                onSave={fields.mutate}
              />

              {task.body && (
                <Section title="Description" className="mt-2.5">
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-body leading-relaxed text-ink-2">
                    {task.body}
                  </p>
                </Section>
              )}

              {(attachments.data ?? []).length > 0 && (
                <Section title="Attachments" className="mt-2.5">
                  <div className="flex flex-wrap gap-2">
                    {attachments.data!.map((a) => <AttachmentChip key={a.id} att={a} showPreview />)}
                  </div>
                </Section>
              )}

              {task.last_failure_error && <FailureBlock message={task.last_failure_error} className="mt-2.5" />}

              <TaskActions
                className="mt-3"
                task={task}
                health={health.data}
                canRelease={canRelease}
                onRun={() => runMutation.mutate()}
                runPending={runMutation.isPending}
                runDisabledReason={runReason}
                onStop={() => cancelMutation.mutate()}
                stopPending={cancelMutation.isPending}
                onMove={(s) => onMove(s).catch((e: Error) => toastGlobal(e.message, "error"))}
                onControl={(a) => control.mutate(a)}
                controlPending={control.isPending}
                error={control.error ? (control.error as Error).message : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <Section title={<><GitBranch className="size-3" /> Dependencies</>}>
                <div className="space-y-1">
                  {(dependencies.data ?? []).map((d) => {
                    const dep = boardTasks.data?.find((t) => t.id === d.depends_on_id)
                    return (
                      <div key={d.depends_on_id} className="flex items-center gap-2 rounded-md border border-[var(--c-line)] px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate font-mono text-meta" title={dep ? `${dep.id} · ${dep.title}` : d.depends_on_id}>
                          {dep ? `${dep.id} — ${dep.title}` : d.depends_on_id}
                        </span>
                        {dep && <StatusBadge status={dep.status} />}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove dependency ${dep?.title ?? d.depends_on_id}`}
                          onClick={() => removeDependency.mutate(d.depends_on_id)}
                          disabled={removeDependency.isPending}
                          className="text-danger-text hover:bg-danger/10"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    )
                  })}
                  {!(dependencies.data ?? []).length && (
                    <EmptyNote icon={<GitBranch className="size-4" />} title="No dependencies" hint="This task does not wait on any other task." />
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <label htmlFor={`dep-${task.id}`} className="sr-only">Task to depend on</label>
                  <Input
                    id={`dep-${task.id}`}
                    value={dependencyId}
                    onChange={(e) => setDependencyId(e.target.value)}
                    placeholder="Task ID…"
                    className="h-8 min-w-0 flex-1 font-mono text-body"
                  />
                  <Select value={dependencyId} onValueChange={setDependencyId}>
                    <SelectTrigger size="sm" className="w-32 text-body" aria-label="Pick a task to depend on">
                      <SelectValue placeholder="Pick" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(16rem,var(--radix-select-content-available-height))]">
                      {dependencyChoices.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="font-mono text-body">
                          {t.id} · {t.title.slice(0, 28)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!dependencyId.trim() || dependencyMutation.isPending}
                    onClick={() => dependencyMutation.mutate(dependencyId.trim())}
                  >
                    Add
                  </Button>
                </div>
              </Section>

              <Section title="Runs">
                <div className="space-y-1.5">
                  {(runs.data ?? []).map((run) => (
                    <div key={run.index} className="rounded-md border border-[var(--c-line)] px-2 py-1.5">
                      <div className="flex items-center gap-2 text-meta">
                        <span className="font-medium text-ink-2">Run {run.index}</span>
                        <span className="text-ink-3">{run.outcome}</span>
                        <span className="ml-auto text-2xs tabular-nums text-ink-3">{run.events.length} events</span>
                      </div>
                      {run.usage && run.usage.totalTokens > 0 && (
                        <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-ink-3">
                          <span>{run.usage.totalTokens.toLocaleString()} total</span>
                          <span>{run.usage.inputTokens.toLocaleString()} in</span>
                          <span>{run.usage.outputTokens.toLocaleString()} out</span>
                          <span>{run.usage.cacheReadTokens.toLocaleString()} cache</span>
                        </dl>
                      )}
                    </div>
                  ))}
                  {!runs.data?.length && (
                    <EmptyNote title="No runs yet" hint="Each attempt gets its own run record with events and token usage." />
                  )}
                </div>
              </Section>
            </div>

            {task.status === "review" && <ReviewSection slug={slug} task={task} onDone={onBack} />}
          </TabsContent>

          {/* ------------------------------------------------------ output -- */}
          <TabsContent value="output" className="mt-4 space-y-4">
            <TaskOutput
              task={task}
              events={events.data || []}
              working={resultSplit?.working ?? ""}
              running={task.status === "running"}
              slug={slug}
            />
            {task.status === "review" && <ReviewSection slug={slug} task={task} onDone={onBack} />}
          </TabsContent>

          {/* -------------------------------------------------- discussion -- */}
          <TabsContent value="discussion" className="mt-4">
            <CommentSection slug={slug} task={task} profiles={profiles} />
          </TabsContent>

          {/* ----------------------------------------------------- history -- */}
          <TabsContent value="history" className="mt-4">
            {events.isLoading ? (
              <EmptyNote title="Loading events…" />
            ) : !groups.length ? (
              <EmptyNote icon={<History className="size-4" />} title="No events yet" hint="Lifecycle events appear here as the task is created, assigned and run." />
            ) : (
              <div className="space-y-4 pb-4">
                {/* The run as a replayable time axis, above the event
                    cards: the trace answers "what did the agent do",
                    the cards below answer "what was decided". */}
                <AgentTrace
                  spans={traceSpans}
                  timeOrigin={traceOrigin(events.data ?? [])}
                  runId={task.id}
                  model={profile?.model}
                  autoPlay={false}
                  collapsible
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((g) => <CollapsibleGroup key={g.title} group={g} />)}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
