import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, ExternalLink, Loader2 } from "lucide-react"
import { api, type Profile, type Task, type TaskEvent, type Workspace } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AgentTaskStatus, splitAgentResult } from "@/features/board/AgentStatus"

const EVENT_LABELS: Record<string, string> = {
  created: "Task created", assigned: "Agent assigned", claimed: "Worker claimed",
  spawned: "Worker started", heartbeat: "Heartbeat", completed: "Completed",
  failed: "Failed", blocked: "Blocked", review: "Review", updated: "Task updated",
}

function eventLabel(kind: string) {
  return EVENT_LABELS[kind] ?? kind.replaceAll("_", " ")
}

function eventIcon(kind: string) {
  if (["failed", "blocked"].includes(kind)) return <CircleAlert className="size-4 text-status-danger" />
  if (kind === "completed") return <CheckCircle2 className="size-4 text-status-success" />
  if (["claimed", "spawned", "heartbeat"].includes(kind)) return <Clock3 className="size-4 text-status-info" />
  return <span className="size-2 rounded-full bg-accent-500" />
}

function payloadPreview(payload: string) {
  if (!payload) return ""
  try {
    const data = JSON.parse(payload) as Record<string, unknown>
    return Object.entries(data).filter(([, value]) => value != null && value !== "").map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ")
  } catch {
    return payload
  }
}

export default function CommandCenterPage({ slug, task, profiles, workspaces, onBack }: { slug: string; task: Task; profiles: Profile[]; workspaces: Workspace[]; onBack: () => void }) {
  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((item) => item.name === task.assignee)
  const workspace = workspaces.find((item) => item.path === task.workspace_path)
  const result = task.result ? splitAgentResult(task.result) : null
  const timeline = [...(events.data ?? [])].sort((a, b) => a.created_at - b.created_at)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background-full p-4 lg:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1 border-border-default bg-background-primary text-text-secondary">
            <ArrowLeft className="size-3.5" /> Board
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-caption-2-regular text-text-tertiary">COMMAND CENTER · {task.id}</p>
            <h1 className="truncate text-title-3-semibold text-text-primary">{task.title}</h1>
          </div>
          <Badge variant="outline" className="border-border-default bg-background-tertiary text-text-secondary">{task.status}</Badge>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <main className="min-w-0 space-y-4">
            <section className="rounded-3xl border border-border-default bg-background-primary p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-caption-1-semibold uppercase text-text-tertiary">Execution timeline</p>
                  <p className="mt-1 text-body-2-regular text-text-secondary">Events reported by current HTTP polling pipeline.</p>
                </div>
                {events.isFetching && <Loader2 className="size-4 animate-spin text-accent-400" aria-label="Refreshing events" />}
              </div>
              <AgentTaskStatus task={task} events={timeline} />
              <div className="mt-4 space-y-1">
                {timeline.length ? timeline.map((event) => (
                  <article key={event.id} className="flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-background-primary-hover">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background-tertiary">{eventIcon(event.kind)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-body-medium text-text-primary">{eventLabel(event.kind)}</h2>
                        <time className="font-mono text-caption-2-regular text-text-tertiary">{new Date(event.created_at * 1000).toLocaleString()}</time>
                      </div>
                      {payloadPreview(event.payload) && <p className="mt-1 break-words font-mono text-caption-2-regular text-text-tertiary">{payloadPreview(event.payload)}</p>}
                    </div>
                  </article>
                )) : events.isLoading ? <p className="py-8 text-center text-body-2-regular text-text-tertiary">Loading execution events…</p> : <p className="py-8 text-center text-body-2-regular text-text-tertiary">No execution events recorded.</p>}
              </div>
            </section>

            <section className="rounded-3xl border border-border-default bg-background-primary p-4 shadow-card">
              <p className="text-caption-1-semibold uppercase text-text-tertiary">Task intent</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-body-regular text-text-secondary">{task.body || "No task description provided."}</p>
            </section>

            {result && <section className="rounded-3xl border border-status-success/40 bg-status-success/5 p-4 shadow-card">
              <p className="text-caption-1-semibold uppercase text-status-success">Result</p>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-status-success/20 bg-background-secondary p-3 font-mono text-caption-1-regular leading-relaxed text-text-secondary">{result.final || result.working}</pre>
            </section>}
          </main>

          <aside className="h-fit space-y-4">
            <section className="rounded-3xl border border-border-default bg-background-primary p-4 shadow-card">
              <p className="text-caption-1-semibold uppercase text-text-tertiary">Execution context</p>
              <dl className="mt-3 divide-y divide-border-default">
                <div className="flex justify-between gap-3 py-2"><dt className="text-caption-1-regular text-text-tertiary">Agent</dt><dd className="truncate text-right text-body-2-regular text-text-secondary">{profile?.name ?? (task.assignee || "unassigned")}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-caption-1-regular text-text-tertiary">Workspace</dt><dd className="truncate text-right text-body-2-regular text-text-secondary" title={task.workspace_path}>{workspace?.name ?? (task.workspace_path || "scratch")}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-caption-1-regular text-text-tertiary">Executor</dt><dd className="text-right text-body-2-regular text-text-secondary">{profile?.model ?? "Unavailable"}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-caption-1-regular text-text-tertiary">Events</dt><dd className="text-right font-mono text-caption-1-regular text-text-secondary">{timeline.length}</dd></div>
              </dl>
            </section>
            <section className="rounded-3xl border border-border-default bg-background-primary p-4 shadow-card">
              <p className="text-caption-1-semibold uppercase text-text-tertiary">Review handoff</p>
              <p className="mt-2 text-body-2-regular text-text-secondary">{task.status === "review" ? "Task is ready for existing review actions." : "Review panel appears when task enters review."}</p>
              <Button variant="outline" size="sm" onClick={onBack} className="mt-3 w-full gap-1 border-border-default text-text-secondary"><ExternalLink className="size-3.5" /> Open task detail</Button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
