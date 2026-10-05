import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { api, parseTaskExecutionMeta, runControl, taskHealth, toastGlobal, type Profile, type Task, type TaskEvent, type Workspace, type TaskHealth } from "../../api"
import { ExternalLink, X } from "lucide-react"
import { AgentTaskStatus, splitAgentResult } from "./AgentStatus"
import { TaskOutput } from "./OutputPanels"
import { ReviewSection } from "./ReviewSection"
import TaskRuntimeStatus from "./TaskRuntimeStatus"
import {
  AgentPicker, FailureBlock, Field, FieldList, OsIcon, PriorityBadge,
  Section, StatusBadge, TaskActions,
} from "./taskDetailParts"

export default function TaskDetail({
  slug,
  task,
  profiles,
  workspaces,
  onClose,
  onMove,
  onStop,
  onReassign,
  onOpenPage,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  workspaces: Workspace[]
  onClose: () => void
  onMove: (s: Task["status"]) => Promise<void>
  onStop: () => Promise<void>
  onReassign: (a: string) => Promise<void>
  onOpenPage: () => void
}) {
  const [panel, setPanel] = useState<"overview" | "output">("overview")

  /* Focus management: the drawer is a modal dialog, so move focus in on open
     and let Escape + backdrop close it. Tab is trapped by the container. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab") return
      const root = document.getElementById("task-detail-drawer")
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = workspaces.find((w) => w.path === task.workspace_path)
  const wsIsSsh = !!ws?.host && ws.host !== "localhost" && ws.host !== "127.0.0.1"
  const qc = useQueryClient()
  const health = useQuery<TaskHealth>({
    queryKey: ["health", slug, task.id],
    queryFn: () => taskHealth(slug, task.id),
    refetchInterval: task.status === "running" ? 5_000 : false,
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
  const resultSplit = task.result ? splitAgentResult(task.result) : null
  const jev = parseTaskExecutionMeta(task.execution_meta)
  const eventCount = events.data?.length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--c-well)]/60 p-0 sm:p-3" onClick={onClose}>
      <aside
        id="task-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="task-detail-drawer glass flex h-full w-full max-w-md flex-col overflow-hidden rounded-none border-y-0 border-l-0 pb-[env(safe-area-inset-bottom)] sm:rounded-xl sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* No backdrop-filter, and that is not a downgrade. The drawer itself is
           `glass`; these bars sit inside it with a `shrink-0` header and footer
           around a `flex-1 overflow-y-auto` body, so the transcript never scrolls
           under them and the region behind each bar is static. `composer.tsx`
           spells out the rule: a varying backdrop is the one condition
           backdrop-filter is for, and a bar with solid surface behind it has
           nothing to diffuse. At /95 the tint was doing the work anyway. Each
           filter is its own compositing layer that cannot be batched, which is
           the cost design.md 5.2 measures. The drawer keeps the frost; these
           keep the tint. */}
        <div className="shrink-0 border-b border-[var(--c-line)] bg-[var(--c-surface)]/95 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 id="task-detail-title" className="line-clamp-2 text-base font-semibold leading-snug text-ink" title={task.title}>
                {task.title}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close task details"
              autoFocus
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <span className="max-w-full truncate font-mono text-2xs text-ink-3">{task.id}</span>
          </div>
          <div role="tablist" aria-label="Task detail sections" className="mt-3 flex gap-1">
            {(["overview", "output"] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={panel === key}
                onClick={() => setPanel(key)}
                className={`h-7 rounded-md px-2.5 text-meta transition-colors ${
                  panel === key
                    ? "bg-[var(--c-accent-tint)] text-[var(--c-accent)]"
                    : "text-ink-3 hover:bg-[var(--c-line)]/40 hover:text-ink-2"
                }`}
              >
                {key === "overview" ? "Overview" : "Output"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          {panel === "overview" ? (
            <>
              <AgentTaskStatus task={task} events={events.data ?? []} />
              <TaskRuntimeStatus task={task} profile={profile} workspace={ws} events={events.data ?? []} compact />

              <AgentPicker
                task={task}
                profiles={profiles}
                onReassign={onReassign}
                onError={(m) => toastGlobal(m, "error")}
              />

              <Section title="Workspace">
                <FieldList>
                  <Field label="Path">
                    {task.workspace_path ? (
                      <span className="flex items-center justify-end gap-1.5" title={task.workspace_path}>
                        <OsIcon ws={ws} />
                        <span className="truncate">{ws?.name ?? task.workspace_path.split(/[\\/]/).pop()}</span>
                        {wsIsSsh && <span className="text-ink-3">· ssh</span>}
                      </span>
                    ) : "scratch"}
                  </Field>
                  <Field label="Kind">{task.workspace_kind || "dir"}</Field>
                  <Field label="Execution">
                    {task.executor || "auto"}
                    {task.execution_mode === "agentic" ? " · agentic" : task.command ? ` · ${task.command}` : ""}
                  </Field>
                </FieldList>
              </Section>

              <Section title="Verification">
                <FieldList>
                  <Field label="Profile">
                    {task.verify_profile ? (
                      task.verify_profile
                    ) : (
                      <span className="text-ink-3">
                        auto{task.verify_profile_effective ? ` → ${task.verify_profile_effective}` : ""}
                      </span>
                    )}
                  </Field>
                  {task.verify_status && <Field label="Result">{task.verify_status}</Field>}
                  {task.design_source && (
                    <Field label="Design">
                      <span className="truncate" title={task.design_source}>
                        {task.design_source}
                      </span>
                    </Field>
                  )}
                </FieldList>
              </Section>

              {jev && (
                <Section title={<span className="text-review-text">JEV routing</span>}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-meta text-ink-3">{jev.case}</span>
                    <span className="text-ink-3">·</span>
                    <span className="text-meta text-ink-3">scope: {jev.scope}</span>
                    <span className="text-ink-3">·</span>
                    <span className="text-meta text-ink-3">{(jev.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="mt-1.5 truncate text-2xs text-ink-3" title={jev.model}>
                    {jev.model || "local"}{jev.input_tokens ? ` · ${jev.input_tokens} input tokens` : ""}
                  </p>
                </Section>
              )}

              <Section title="Timeline">
                <FieldList>
                  <Field label="Created">{new Date(task.created_at * 1000).toLocaleString()}</Field>
                  {task.started_at && <Field label="Started">{new Date(task.started_at * 1000).toLocaleString()}</Field>}
                  {task.completed_at && <Field label="Finished">{new Date(task.completed_at * 1000).toLocaleString()}</Field>}
                  <Field label="Creator">{task.created_by || "—"}</Field>
                  <Field label="Events">{eventCount} recorded</Field>
                </FieldList>
              </Section>

              {task.body && (
                <Section title="Description">
                  <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-body leading-relaxed text-ink-2">
                    {task.body}
                  </p>
                </Section>
              )}

              {task.last_failure_error && <FailureBlock message={task.last_failure_error} />}
            </>
          ) : (
            <>
              <TaskOutput
                compact
                task={task}
                events={events.data || []}
                working={resultSplit?.working ?? ""}
                running={task.status === "running"}
                slug={slug}
              />

              {task.status === "review" && <ReviewSection slug={slug} task={task} onDone={onOpenPage} />}

              <TaskActions
                task={task}
                health={health.data}
                canRelease={canRelease}
                showRun={false}
                onRun={() => undefined}
                onStop={() => onStop().catch((e: Error) => toastGlobal(e.message, "error"))}
                onMove={(s) => onMove(s).catch((e: Error) => toastGlobal(e.message, "error"))}
                onControl={(a) => control.mutate(a)}
                controlPending={control.isPending}
                error={control.error ? (control.error as Error).message : undefined}
              />
            </>
          )}
        </div>

        {/* Same reasoning as the header above: shrink-0 footer over a body that scrolls
           inside itself, so nothing moves behind it. */}
        <div className="shrink-0 border-t border-[var(--c-line)] bg-[var(--c-surface)]/95 p-3">
          <Button onClick={onOpenPage} size="sm" className="w-full gap-1.5">
            <ExternalLink className="size-3.5" /> Open full detail page
          </Button>
        </div>
      </aside>
    </div>
  )
}
