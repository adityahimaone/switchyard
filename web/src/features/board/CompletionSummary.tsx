/* Completion summary: what a settled card actually produced.

   A finished card used to keep only its status, so "what ran, for how long,
   with which model, and what landed in git" lived in the worker log and the
   reviewer's memory. This panel reads it back from one endpoint that derives
   every value (wall time from the timestamps, git state from the checkout), so
   it reports the real state instead of a snapshot taken at completion time. */

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronDown, ChevronRight, FileText, GitCommit } from "lucide-react"
import { taskCompletion, type CompletionData, type Task } from "../../api"
import { Field, FieldList, Section } from "./taskDetailParts"

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—"
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rest = s % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${rest}s`
  return `${rest}s`
}

function bytes(n: number) {
  if (!n) return "0 B"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* Push state is the one thing a reviewer asks first: did the work leave this
   machine? Three answers, never a guess — no upstream is its own state. */
export function pushState(git: CompletionData["git"]) {
  if (!git.available) return { label: "unknown", tone: "muted" as const }
  if (!git.upstream) return { label: "no upstream", tone: "warn" as const }
  if (git.ahead > 0) return { label: `${git.ahead} unpushed`, tone: "warn" as const }
  if (git.behind > 0) return { label: `pushed · ${git.behind} behind`, tone: "muted" as const }
  return { label: "pushed", tone: "good" as const }
}

const TONE: Record<string, string> = {
  good: "border-success/30 bg-success-tint text-success-text",
  warn: "border-warning/30 bg-warning-tint text-warning-text",
  muted: "border-line bg-well text-ink-3",
}

function chip(label: string, tone: "good" | "warn" | "muted") {
  return <Badge variant="outline" className={`px-1.5 py-0 text-2xs leading-4 ${TONE[tone]}`}>{label}</Badge>
}

export function CompletionSummary({ slug, task, profileModel, compact = false, onViewLog }: {
  slug: string
  task: Task
  profileModel?: string
  compact?: boolean
  onViewLog?: () => void
}) {
  const [showFiles, setShowFiles] = useState(false)
  const settled = task.status === "done" || !!task.completed_at
  const q = useQuery({
    queryKey: ["completion", slug, task.id],
    queryFn: () => taskCompletion(slug, task.id),
    // A settled card's git state can still move (a push after the fact), but
    // not often enough to poll while nothing is running.
    refetchInterval: settled && task.status !== "running" ? false : 15_000,
    enabled: settled,
  })
  if (!settled || !q.data) return null

  const data = q.data
  const model = data.model || profileModel || "—"
  const push = pushState(data.git)
  const files = data.git.file_list ?? []

  if (compact) {
    return (
      <section className="glass-inset-card min-w-0 rounded-lg p-2.5" aria-label="Completion summary">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">Completed</span>
          {chip(`${data.executor || task.executor || "auto"} · ${model}`, "muted")}
          {chip(formatDuration(data.duration_seconds), "muted")}
          {chip(push.label, push.tone)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-3">
          {data.git.available && (
            <span className="font-mono">{data.git.short}{data.git.files ? ` · ${data.git.files} files` : ""}</span>
          )}
          {data.log.available && <span>log · {bytes(data.log.bytes)}</span>}
        </div>
      </section>
    )
  }

  return (
    <Section title="Completion">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {chip(data.executor || task.executor || "auto", "muted")}
        {data.execution_mode && chip(data.execution_mode, "muted")}
        {data.attempt > 1 && chip(`attempt ${data.attempt}`, "warn")}
        {chip(push.label, push.tone)}
        {data.git.available && data.git.dirty > 0 && chip(`${data.git.dirty} uncommitted`, "warn")}
      </div>

      <FieldList>
        <Field label="Model">
          <span className="font-mono" title={model}>{model}</span>
        </Field>
        <Field label="Total time">
          <span className="tabular-nums">{formatDuration(data.duration_seconds)}</span>
        </Field>
        {data.started_at && (
          <Field label="Started">{new Date(data.started_at * 1000).toLocaleString()}</Field>
        )}
        {data.completed_at && (
          <Field label="Finished">{new Date(data.completed_at * 1000).toLocaleString()}</Field>
        )}
        {data.approve_commit && (
          <Field label="Approved at">
            <span className="font-mono">{data.approve_commit.slice(0, 12)}</span>
          </Field>
        )}
        <Field label="Log file">
          <span className="flex min-w-0 items-center justify-end gap-1.5">
            <span className="truncate font-mono text-2xs" title={data.log.path}>
              {data.log.available ? `${data.log.path.split("/").pop()} · ${bytes(data.log.bytes)}` : "not written"}
            </span>
            {onViewLog && data.log.available && (
              <button
                type="button"
                onClick={onViewLog}
                className="shrink-0 rounded px-1 text-2xs text-accent-text hover:bg-[var(--c-line)]/50"
              >
                view
              </button>
            )}
          </span>
        </Field>
      </FieldList>

      <div className="mt-3 rounded-control border border-line/60 bg-well/40 p-2.5">
        <div className="flex items-center gap-1.5">
          <GitCommit className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <h3 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">Commit</h3>
          {data.git.available && (
            <span className="ml-auto shrink-0 font-mono text-2xs text-ink-3">{data.git.branch}</span>
          )}
        </div>
        {!data.git.available ? (
          <p className="mt-1.5 text-2xs text-ink-3">{data.git.reason || "No git state to report."}</p>
        ) : (
          <>
            <p className="mt-1.5 break-words text-body text-ink-2">
              <span className="mr-1.5 font-mono text-2xs text-ink-3">{data.git.short}</span>
              {data.git.subject || "(no subject)"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-ink-3">
              {data.git.files > 0 && <span>{data.git.files} files</span>}
              {data.git.insertions > 0 && <span className="text-success-text">+{data.git.insertions}</span>}
              {data.git.deletions > 0 && <span className="text-danger-text">−{data.git.deletions}</span>}
              {data.git.upstream && <span title={data.git.upstream}>{data.git.upstream}</span>}
              {data.git.committed_at ? <span>{new Date(data.git.committed_at * 1000).toLocaleString()}</span> : null}
            </div>
            {files.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={showFiles}
                  onClick={() => setShowFiles((v) => !v)}
                  className="-ml-1 mt-1.5 flex items-center gap-1 rounded px-1 text-2xs text-ink-3 hover:bg-[var(--c-line)]/50 hover:text-ink-2"
                >
                  {showFiles ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  {showFiles ? "Hide files" : `Show ${files.length} files`}
                </button>
                {showFiles && (
                  <ul className="mt-1 space-y-0.5">
                    {files.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 break-all font-mono text-2xs text-ink-3">
                        <FileText className="size-3 shrink-0" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {push.tone === "good" && (
              <p className="mt-1.5 flex items-center gap-1 text-2xs text-success-text">
                <Check className="size-3" aria-hidden /> Committed and pushed
              </p>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

export default CompletionSummary
