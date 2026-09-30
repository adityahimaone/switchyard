import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History, MoreHorizontal, Play, Plus, RefreshCw, Trash2, Wrench } from "lucide-react"
import { api, type CronExecution, type CronJob, type SkillMeta } from "@/api"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { EmptyState } from "@/components/app/empty-state"
import { FilterBar } from "@/components/app/filter-bar"
import { PageHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"
import LoadingState from "@/components/feedback/loading-state"

type Form = {
  name: string
  schedule: string
  prompt: string
  deliver: string
  script: string
  no_agent: boolean
  workdir: string
  skills: string
  paused: boolean
  paused_reason: string
}

const emptyForm: Form = {
  name: "", schedule: "", prompt: "", deliver: "local", script: "",
  no_agent: false, workdir: "", skills: "", paused: false, paused_reason: "",
}

function formFrom(job?: CronJob): Form {
  return job
    ? {
        name: job.name,
        schedule: job.schedule?.expr || job.schedule_display,
        prompt: job.prompt,
        deliver: job.deliver || "local",
        script: job.script || "",
        no_agent: job.no_agent,
        workdir: job.workdir || "",
        skills: (job.skills || []).join(", "),
        paused: !job.enabled,
        paused_reason: job.paused_reason || "",
      }
    : { ...emptyForm }
}

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never"
}

function schedulePreview(value: string) {
  const normalized = value.trim()
  if (!normalized) return "A cron expression, or a phrase like \"every 2 hours\"."
  if (normalized.startsWith("every ")) return `Repeats ${normalized.slice(6)}.`
  if (normalized.includes(" at ")) return `Runs ${normalized}.`
  return `Cron expression: ${normalized}`
}

const SCHEDULE_PRESETS = ["every 1h", "every 6h", "every day at 09:00", "weekdays at 09:00"]

export default function CronPage() {
  const qc = useQueryClient()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CronJob | null>(null)
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CronJob | null>(null)

  const jobs = useQuery({
    queryKey: ["cron-jobs"],
    queryFn: () => api<CronJob[]>("/api/cron/jobs?all=1"),
    refetchInterval: 10_000,
  })
  const status = useQuery({
    queryKey: ["cron-status"],
    queryFn: () => api<{ output: string }>("/api/cron/status"),
    refetchInterval: 30_000,
  })
  const doctor = useQuery({
    queryKey: ["cron-doctor"],
    queryFn: () => api<{ output: string }>("/api/cron/doctor"),
    enabled: false,
  })
  const skills = useQuery({ queryKey: ["cron-skills"], queryFn: () => api<SkillMeta[]>("/api/skills"), staleTime: 30_000 })

  const action = useMutation({
    mutationFn: ({ id, op }: { id: string; op: "pause" | "resume" | "run" | "delete" }) =>
      api(op === "delete" ? `/api/cron/jobs/${id}` : `/api/cron/jobs/${id}/${op}`, {
        method: op === "delete" ? "DELETE" : "POST",
      }),
    onSuccess: () => {
      setPendingDelete(null)
      void qc.invalidateQueries({ queryKey: ["cron-jobs"] })
    },
  })

  const save = useMutation({
    mutationFn: (payload: Form) => {
      const body = JSON.stringify({
        ...payload,
        skills: payload.skills.split(",").map((x) => x.trim()).filter(Boolean),
      })
      if (selected) return api(`/api/cron/jobs/${selected.id}`, { method: "PATCH", body })
      return api("/api/cron/jobs", { method: "POST", body })
    },
    onSuccess: () => {
      setForm(null)
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ["cron-jobs"] })
    },
  })

  const all = jobs.data ?? []
  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      needle === ""
        ? all
        : all.filter((j) =>
            `${j.name} ${j.id} ${j.prompt} ${j.schedule_display}`.toLowerCase().includes(needle),
          ),
    [all, needle],
  )

  const active = all.filter((j) => j.enabled).length
  const failed = all.filter((j) => j.last_status === "error" || j.last_delivery_error).length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Cron jobs"
        description="Scheduled prompts and scripts. Pause, run on demand, or edit."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: ["cron-jobs"] })}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void doctor.refetch()}>
              <Wrench className="size-3.5" /> Doctor
            </Button>
            <Button variant="signal" size="sm" onClick={() => { setSelected(null); setForm({ ...emptyForm }) }}>
              <Plus className="size-3.5" /> New job
            </Button>
          </>
        }
      >
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search jobs"
          shown={filtered.length}
          total={all.length}
        />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {doctor.data && (
          <pre className="mx-auto mt-4 max-h-48 w-full max-w-[1680px] overflow-auto whitespace-pre-wrap rounded-control border border-warning/30 bg-warning-tint p-3 font-mono text-2xs text-ink-2 md:px-6">
            {doctor.data.output}
          </pre>
        )}

        {jobs.isLoading ? (
          <LoadingState variant="detail" label="Loading cron jobs" />
        ) : jobs.isError ? (
          <EmptyState
            title="Couldn't load cron jobs"
            hint={(jobs.error as Error).message}
            action={<Button variant="secondary" onClick={() => void jobs.refetch()}>Retry</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={all.length ? `No jobs match "${query.trim()}"` : "No cron jobs yet"}
            hint={all.length ? undefined : "A job runs a prompt or a script on a schedule."}
            action={
              all.length ? undefined : (
                <Button variant="signal" onClick={() => { setSelected(null); setForm({ ...emptyForm }) }}>
                  New job
                </Button>
              )
            }
          />
        ) : (
          <div className="mx-auto w-full max-w-[1680px] px-4 py-4 md:px-6">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Scheduled jobs</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th scope="col" className="px-2 py-2 font-medium">Job</th>
                  <th scope="col" className="px-2 py-2 font-medium">Schedule</th>
                  <th scope="col" className="px-2 py-2 font-medium">Last run</th>
                  <th scope="col" className="px-2 py-2 font-medium">Next run</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => {
                  const problem = job.last_status === "error" || !!job.last_delivery_error
                  return (
                    <tr key={job.id} className="border-b border-line last:border-0 hover:bg-well">
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={() => setSelected(job)}
                          className="truncate text-left text-sm font-medium text-ink outline-none hover:text-accent focus-visible:ring-[3px] focus-visible:ring-focus/40"
                          title={job.name || job.id}
                        >
                          {job.name || "Unnamed job"}
                        </button>
                        <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-3">
                          <span className="font-mono">{job.id}</span>
                          {job.no_agent && <span>no agent</span>}
                          {problem && (
                            <span className="inline-flex items-center gap-1 text-danger-text">
                              {job.last_delivery_error ?? job.last_status}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-2xs text-ink-2" title={job.schedule_display}>
                        {job.schedule_display}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-ink-3 tabular">{fmt(job.last_run_at)}</td>
                      <td className="px-2 py-2.5 text-xs text-ink-3 tabular">{fmt(job.next_run_at)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Switch
                            size="sm"
                            checked={job.enabled}
                            disabled={action.isPending}
                            onCheckedChange={(on) => action.mutate({ id: job.id, op: on ? "resume" : "pause" })}
                            aria-label={job.enabled ? `Pause ${job.name || job.id}` : `Resume ${job.name || job.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Run ${job.name || job.id} now`}
                            disabled={action.isPending}
                            onClick={() => action.mutate({ id: job.id, op: "run" })}
                          >
                            <Play className="size-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`More actions for ${job.name || job.id}`}
                              >
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setHistoryJob(job)}>
                                <History className="size-3.5" /> Run history
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPendingDelete(job)}
                                className="text-danger-text focus:text-danger-text"
                              >
                                <Trash2 className="size-3.5" /> Delete job
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <p className="mt-4 text-xs text-ink-3 tabular">
              {active} active · {all.length - active} paused · {failed} with issues
              {status.data?.output ? ` · ${status.data.output.split("\n")[0]}` : ""}
            </p>
          </div>
        )}
      </div>

      <DetailSheet
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected?.name || selected?.id || ""}
        description={selected?.enabled ? "Active" : "Paused"}
        footer={
          <Button variant="signal" size="sm" onClick={() => selected && setForm(formFrom(selected))}>
            Edit job
          </Button>
        }
      >
        {selected && <JobDetail job={selected} />}
      </DetailSheet>

      <CronHistory
        job={historyJob}
        onOpenChange={(o) => !o && setHistoryJob(null)}
      />

      <DetailSheet
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        title={selected ? "Edit cron job" : "New cron job"}
        description="A prompt or script that runs on a schedule."
      >
        {form && (
          <CronForm
            value={form}
            editing={!!selected}
            skills={skills.data ?? []}
            onChange={setForm}
            onClose={() => setForm(null)}
            onSave={() => save.mutate(form)}
            busy={save.isPending}
            error={save.error as Error | null}
          />
        )}
      </DetailSheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete cron job"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name || pendingDelete.id}"? It stops running immediately. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete job"
        busy={action.isPending}
        onConfirm={() => pendingDelete && action.mutate({ id: pendingDelete.id, op: "delete" })}
      />
    </div>
  )
}

function JobDetail({ job }: { job: CronJob }) {
  const runs = useQuery({
    queryKey: ["cron-runs", job.id],
    queryFn: () => api<CronExecution[]>(`/api/cron/jobs/${job.id}/runs?limit=20`),
  })
  const rows: [string, string][] = [
    ["Schedule", job.schedule_display],
    ["Delivery", job.deliver || "None"],
    ["Next run", fmt(job.next_run_at)],
    ["Last run", fmt(job.last_run_at)],
    ["Status", job.last_status || "No runs yet"],
    ["Script", job.script || "None"],
    ["Working directory", job.workdir || "None"],
  ]
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 text-xs">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-3">{k}</dt>
            <dd className="mt-0.5 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="text-sm font-medium text-ink">Prompt</h3>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-line bg-well p-3 font-mono text-2xs text-ink-2">
          {job.prompt || "No prompt. This job runs a script."}
        </pre>
      </div>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <History className="size-3.5" /> Recent runs
        </h3>
        <div className="mt-2 flex flex-col gap-1">
          {(runs.data ?? []).length === 0 ? (
            <p className="text-xs text-ink-3">No runs recorded yet.</p>
          ) : (
            runs.data?.map((run) => (
              <p key={run.id} className="font-mono text-2xs text-ink-3 tabular">
                {run.status} · {fmt(run.finished_at || run.claimed_at)}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function CronHistory({ job, onOpenChange }: { job: CronJob | null; onOpenChange: (open: boolean) => void }) {
  const runs = useQuery({
    queryKey: ["cron-runs-modal", job?.id],
    queryFn: () => api<CronExecution[]>(`/api/cron/jobs/${job!.id}/runs?limit=100`),
    enabled: !!job,
  })
  return (
    <Dialog open={!!job} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{job?.name || job?.id}</DialogTitle>
          <DialogDescription>Last 100 executions</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {runs.isLoading ? (
            <LoadingState variant="detail" label="Loading history" />
          ) : runs.isError ? (
            <EmptyState
              title="Couldn't load history"
              hint={(runs.error as Error).message}
              action={<Button variant="secondary" onClick={() => void runs.refetch()}>Retry</Button>}
            />
          ) : (runs.data ?? []).length === 0 ? (
            <EmptyState title="No executions yet" />
          ) : (
            <div className="flex flex-col gap-2">
              {runs.data?.map((run) => (
                <div key={run.id} className="rounded-control border border-line bg-well p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-medium",
                        run.status === "error" ? "text-danger-text" : "text-success-text",
                      )}
                    >
                      {run.status}
                    </span>
                    <span className="font-mono text-2xs text-ink-3 tabular">
                      {fmt(run.finished_at || run.started_at || run.claimed_at)}
                    </span>
                  </div>
                  {run.error && <p className="mt-2 whitespace-pre-wrap text-danger-text">{run.error}</p>}
                  {run.delivery_outcome && (
                    <p className="mt-2 text-ink-3">Delivery: {run.delivery_outcome}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function CronForm({
  value, editing, skills, onChange, onClose, onSave, busy, error,
}: {
  value: Form
  editing: boolean
  skills: SkillMeta[]
  onChange: (v: Form) => void
  onClose: () => void
  onSave: () => void
  busy: boolean
  error: Error | null
}) {
  const set = (key: keyof Form, val: string | boolean) => onChange({ ...value, [key]: val })
  const textFields: [keyof Form, string][] = [
    ["name", "Name"],
    ["deliver", "Delivery"],
    ["script", "Script"],
    ["workdir", "Working directory"],
  ]
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); onSave() }}
    >
      {textFields.map(([key, label]) => (
        <Field key={key} label={label} htmlFor={`cf-${key}`}>
          <Input
            id={`cf-${key}`}
            value={String(value[key])}
            onChange={(e) => set(key, e.target.value)}
            className={key === "script" || key === "workdir" ? "font-mono text-xs" : undefined}
          />
        </Field>
      ))}

      <Field label="Schedule" htmlFor="cf-schedule">
        <Input
          id="cf-schedule"
          value={value.schedule}
          onChange={(e) => set("schedule", e.target.value)}
          placeholder="every 2 hours, or a cron expression"
          className="font-mono text-xs"
        />
        <span className="mt-1.5 block text-xs text-ink-3">{schedulePreview(value.schedule)}</span>
        <div className="mt-2 flex flex-wrap gap-1">
          {SCHEDULE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => set("schedule", preset)}
              className="rounded-control border border-line px-1.5 py-0.5 text-2xs text-ink-3 outline-none hover:border-line-strong hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
            >
              {preset}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Skills" htmlFor="cf-skills">
        <Input
          id="cf-skills"
          value={value.skills}
          onChange={(e) => set("skills", e.target.value)}
          placeholder="Comma-separated skill names"
        />
        {skills.length > 0 && (
          <span className="mt-1.5 block text-xs text-ink-3">
            {skills.length} available
          </span>
        )}
      </Field>

      <Field label="Prompt" htmlFor="cf-prompt">
        <Textarea
          id="cf-prompt"
          value={value.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          className="min-h-32"
        />
      </Field>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink">Script mode (no agent)</span>
        <Switch
          size="sm"
          checked={value.no_agent}
          onCheckedChange={(v) => set("no_agent", v)}
          aria-label="Script mode"
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink">Create paused</span>
        <Switch
          size="sm"
          checked={value.paused}
          onCheckedChange={(v) => set("paused", v)}
          aria-label="Create paused"
        />
      </label>

      {error && <p className="text-sm text-danger-text" role="alert">{error.message}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="signal" loading={busy} disabled={!value.schedule.trim()}>
          {editing ? "Save changes" : "Create job"}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label, htmlFor, children,
}: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
