import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { History, Play, Plus, RefreshCw, Search, Trash2, Wrench, X } from "lucide-react"
import { api, type CronExecution, type CronJob } from "@/api"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import LoadingState from "@/components/LoadingState"
import { HtLoader } from "@/components/HtLoader"

type Form = { name: string; schedule: string; prompt: string; deliver: string; script: string; no_agent: boolean; workdir: string; skills: string; paused: boolean; paused_reason: string }
const emptyForm: Form = { name: "", schedule: "", prompt: "", deliver: "local", script: "", no_agent: false, workdir: "", skills: "", paused: false, paused_reason: "" }

function formFrom(job?: CronJob): Form {
  return job ? { name: job.name, schedule: job.schedule?.expr || job.schedule_display, prompt: job.prompt, deliver: job.deliver || "local", script: job.script || "", no_agent: job.no_agent, workdir: job.workdir || "", skills: (job.skills || []).join(", "), paused: !job.enabled, paused_reason: job.paused_reason || "" } : { ...emptyForm }
}
function fmt(value?: string | null) { return value ? new Date(value).toLocaleString() : "—" }

export default function CronPage() {
  const qc = useQueryClient()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CronJob | null>(null)
  const [historyJob, setHistoryJob] = useState<CronJob | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const jobs = useQuery({ queryKey: ["cron-jobs"], queryFn: () => api<CronJob[]>("/api/cron/jobs?all=1"), refetchInterval: 10000 })
  const status = useQuery({ queryKey: ["cron-status"], queryFn: () => api<{ output: string }>("/api/cron/status"), refetchInterval: 30000 })
  const doctor = useQuery({ queryKey: ["cron-doctor"], queryFn: () => api<{ output: string }>("/api/cron/doctor"), enabled: false })
  const action = useMutation({ mutationFn: ({ id, op }: { id: string; op: "pause" | "resume" | "run" | "delete" }) => api(op === "delete" ? `/api/cron/jobs/${id}` : `/api/cron/jobs/${id}/${op}`, { method: op === "delete" ? "DELETE" : "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["cron-jobs"] }) })
  const save = useMutation({
    mutationFn: (payload: Form) => {
      const body = JSON.stringify({ ...payload, skills: payload.skills.split(",").map((x) => x.trim()).filter(Boolean) })
      if (selected) return api(`/api/cron/jobs/${selected.id}`, { method: "PATCH", body })
      return api("/api/cron/jobs", { method: "POST", body })
    },
    onSuccess: () => { setForm(null); setSelected(null); void qc.invalidateQueries({ queryKey: ["cron-jobs"] }) },
  })
  const filtered = useMemo(() => (jobs.data ?? []).filter((j) => `${j.name} ${j.id} ${j.prompt} ${j.schedule_display}`.toLowerCase().includes(query.toLowerCase())), [jobs.data, query])
  const active = (jobs.data ?? []).filter((j) => j.enabled).length
  const paused = (jobs.data ?? []).length - active
  const failed = (jobs.data ?? []).filter((j) => j.last_status === "error" || j.last_delivery_error).length

  if (jobs.isLoading) return <LoadingState variant="detail" label="Memuat cron jobs" />
  if (jobs.isError) return <div className="p-6 text-sm text-red-400">Gagal load cron jobs: {(jobs.error as Error).message}</div>
  return <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto p-4">
    <header className="flex flex-wrap items-end gap-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Runtime</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Cron Jobs</h1><p className="mt-1 text-xs text-[var(--color-ink-3)]">Schedule, pause, run, edit, delete.</p></div>
      <div className="ml-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => void qc.invalidateQueries({ queryKey: ["cron-jobs"] })}><RefreshCw className="size-3.5" /> Refresh</Button><Button size="sm" variant="outline" onClick={() => void doctor.refetch()}><Wrench className="size-3.5" /> Doctor</Button><Button size="sm" onClick={() => { setSelected(null); setForm(emptyForm) }}><Plus className="size-3.5" /> New job</Button></div>
    </header>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[["Total", jobs.data?.length ?? 0], ["Active", active], ["Paused", paused], ["Issues", failed]].map(([label, value]) => <div key={label} className="decorative-card rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p><p className="mt-1 font-mono text-2xl text-neutral-100">{value}</p></div>)}</div>
    <div className="flex items-center gap-2"><Search className="size-4 text-neutral-500" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, schedule, prompt, id…" className="h-8 max-w-md bg-[var(--color-bg)] text-xs" /><span className="ml-auto text-[10px] text-neutral-500">{status.data?.output.split("\n")[0] ?? "status loading…"}</span></div>
    {doctor.data && <pre className="max-h-48 overflow-auto rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 font-mono text-[11px] whitespace-pre-wrap text-amber-100/80">{doctor.data.output}</pre>}
    <div className="grid gap-2">{filtered.map((job) => <article key={job.id} className="rounded-lg border border-line/70 bg-surface/60 p-3"><div className="flex items-start gap-3"><div className={`mt-1 size-2 shrink-0 rounded-full ${job.enabled ? "bg-emerald-400" : "bg-neutral-600"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button className="truncate text-left text-sm font-semibold hover:text-[var(--color-accent)]" onClick={() => setSelected(job)}>{job.name || "Unnamed job"}</button><span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">{job.id}</span>{job.no_agent && <span className="text-[10px] text-violet-300">no-agent</span>}{job.last_status === "error" && <span className="text-[10px] text-red-300">error</span>}</div><p className="mt-1 text-xs text-neutral-400">{job.schedule_display} · {job.deliver || "no delivery"}</p><p className="mt-1 line-clamp-2 text-xs text-neutral-500">{job.prompt || job.script || "No prompt"}</p><p className="mt-2 text-[10px] text-neutral-600">next {fmt(job.next_run_at)} · last {fmt(job.last_run_at)}</p></div><div className="flex shrink-0 items-center gap-2"><Switch size="sm" checked={job.enabled} disabled={action.isPending} onCheckedChange={(on) => action.mutate({ id: job.id, op: on ? "resume" : "pause" })} aria-label={job.enabled ? "Pause job" : "Resume job"} /><Button size="icon-sm" variant="ghost" title="History" onClick={() => setHistoryJob(job)}><History className="size-3.5 text-sky-300" /></Button><Button size="icon-sm" variant="ghost" title="Run now" disabled={action.isPending} onClick={() => action.mutate({ id: job.id, op: "run" })}><Play className="size-3.5 text-emerald-300" /></Button><Button size="icon-sm" variant="ghost" title="Delete" disabled={action.isPending} onClick={() => window.confirm(`Delete ${job.name || job.id}?`) && action.mutate({ id: job.id, op: "delete" })}><Trash2 className="size-3.5 text-red-300" /></Button></div></div></article>)}</div>
    {selected && <CronDetail job={selected} onClose={() => setSelected(null)} onEdit={() => setForm(formFrom(selected))} />}
    {historyJob && <CronHistory job={historyJob} onClose={() => setHistoryJob(null)} />}
    {form && <CronForm value={form} editing={!!selected} onChange={setForm} onClose={() => setForm(null)} onSave={() => save.mutate(form)} busy={save.isPending} error={save.error as Error | null} />}
  </div>
}

function CronHistory({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const runs = useQuery({ queryKey: ["cron-runs-modal", job.id], queryFn: () => api<CronExecution[]>(`/api/cron/jobs/${job.id}/runs?limit=100`) })
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] text-[var(--color-accent)]">CRON HISTORY</p><h2 className="mt-1 text-lg font-semibold">{job.name || job.id}</h2><p className="mt-1 text-xs text-neutral-500">Last 100 executions</p></div><Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close history"><X className="size-4" /></Button></div>{runs.isLoading ? <div className="flex justify-center py-12"><HtLoader size={72} label="Loading history" /></div> : runs.isError ? <p className="mt-6 text-sm text-red-400">Gagal load history: {(runs.error as Error).message}</p> : <div className="mt-4 grid gap-2">{(runs.data ?? []).length === 0 ? <p className="rounded border border-line/60 p-4 text-sm text-neutral-500">Belum ada execution log.</p> : runs.data?.map((run) => <div key={run.id} className="rounded border border-line/60 bg-[var(--color-bg)] p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className={run.status === "error" ? "text-red-300" : "text-emerald-300"}>{run.status}</span><span className="font-mono text-neutral-500">{fmt(run.finished_at || run.started_at || run.claimed_at)}</span></div>{run.error && <p className="mt-2 whitespace-pre-wrap text-red-300/80">{run.error}</p>}{run.delivery_outcome && <p className="mt-2 text-neutral-500">Delivery: {run.delivery_outcome}</p>}</div>)}</div>}</section></div>
}

function CronDetail({ job, onClose, onEdit }: { job: CronJob; onClose: () => void; onEdit: () => void }) {
  const runs = useQuery({ queryKey: ["cron-runs", job.id], queryFn: () => api<CronExecution[]>(`/api/cron/jobs/${job.id}/runs?limit=20`) })
  return <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}><aside className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] text-[var(--color-accent)]">CRON DETAIL</p><h2 className="mt-1 text-lg font-semibold">{job.name || job.id}</h2></div><Button size="icon-sm" variant="ghost" onClick={onClose}><X className="size-4" /></Button></div><div className="mt-4 flex gap-2"><Button size="sm" onClick={onEdit}>Edit</Button><span className="rounded bg-[var(--color-bg)] px-2 py-1 text-xs text-neutral-400">{job.enabled ? "active" : "paused"}</span></div><dl className="mt-4 grid gap-3 text-xs">{[["Schedule", job.schedule_display], ["Delivery", job.deliver], ["Next run", fmt(job.next_run_at)], ["Last run", fmt(job.last_run_at)], ["Status", job.last_status || "—"], ["Script", job.script || "—"], ["Workdir", job.workdir || "—"]].map(([k, v]) => <div key={k}><dt className="text-neutral-500">{k}</dt><dd className="mt-0.5 break-words text-neutral-200">{v}</dd></div>)}</dl><h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Prompt</h3><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-bg)] p-3 font-mono text-[11px] text-neutral-300">{job.prompt || "—"}</pre><h3 className="mt-5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-neutral-500"><History className="size-3" /> Recent runs</h3><div className="mt-2 grid gap-1">{runs.data?.map((run) => <div key={run.id} className="rounded border border-line/60 px-2 py-1.5 font-mono text-[10px] text-neutral-400">{run.status} · {fmt(run.finished_at || run.claimed_at)}</div>)}</div></aside></div>
}

function CronForm({ value, editing, onChange, onClose, onSave, busy, error }: { value: Form; editing: boolean; onChange: (v: Form) => void; onClose: () => void; onSave: () => void; busy: boolean; error: Error | null }) {
  const set = (key: keyof Form, val: string | boolean) => onChange({ ...value, [key]: val })
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}><h2 className="text-sm font-semibold">{editing ? "Edit cron job" : "New cron job"}</h2><div className="grid gap-3 mt-4">{([['name','Name'],['schedule','Schedule (cron / every 2h / weekdays at 9am)'],['deliver','Delivery'],['script','Script'],['workdir','Workdir'],['skills','Skills (comma-separated)']] as [keyof Form,string][]).map(([key,label]) => <label key={key} className="text-xs text-neutral-400">{label}<Input value={String(value[key])} onChange={(e) => set(key, e.target.value)} className="mt-1 bg-[var(--color-bg)] text-xs" /></label>)}<label className="text-xs text-neutral-400">Prompt<Textarea value={value.prompt} onChange={(e) => set("prompt", e.target.value)} className="mt-1 min-h-32 bg-[var(--color-bg)] text-xs" /></label><label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={value.no_agent} onChange={(e) => set("no_agent", e.target.checked)} /> no-agent script mode</label><label className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={value.paused} onChange={(e) => set("paused", e.target.checked)} /> create paused</label>{error && <p className="text-xs text-red-400">{error.message}</p>}</div><div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={busy || !value.schedule.trim()} onClick={onSave}>{busy ? "Saving…" : "Save"}</Button></div></div></div>
}
