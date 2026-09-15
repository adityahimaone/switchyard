import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, CheckCircle2, Cpu, Database, Gauge, Layers3, MemoryStick, Minus, Radio, Server, Users, Workflow, XCircle } from "lucide-react"
import { LabelList, Pie, PieChart } from "recharts"
import { api, getOverviewActivity } from "@/api"
import type { ActivityDay } from "@/api"
import LoadingState from "@/components/LoadingState"

// ── types ──────────────────────────────────────────────────────────────────

interface DaemonHealth { status: string; socket?: string }
interface NodeHealth { status: string; nodes?: { node_id: string; hostname: string; status: string; last_seen: string }[]; error?: string }

type Overview = {
  metrics: { cpu_percent: number; memory_used_mb: number; memory_total_mb: number; goroutines: number }
  total_tasks: number
  running_tasks: number
  completed_tasks: number
  failed_tasks: number
  queue_depth: number
  profiles: number
  workspaces: number
  task_health: { healthy: number; silent: number; stuck: number; lost: number; unknown: number }
}

type Tone = "accent" | "success" | "warning" | "danger" | "info"

// ── shared colors / labels ─────────────────────────────────────────────────

const STATUS_COLORS = ["var(--color-accent)", "var(--color-info)", "var(--color-success)", "var(--color-danger)"]
const STATUS_LABELS = ["Todo / ready", "Running", "Completed", "Failed"]

const tones: Record<Tone, { icon: string; tint: string }> = {
  accent: { icon: "var(--color-accent)", tint: "var(--color-accent-tint)" },
  success: { icon: "var(--color-success)", tint: "var(--color-success-tint)" },
  warning: { icon: "var(--color-warning)", tint: "var(--color-warning-tint)" },
  danger: { icon: "var(--color-danger)", tint: "var(--color-danger-tint)" },
  info: { icon: "var(--color-info)", tint: "var(--color-accent-tint)" },
}

// ── helpers ────────────────────────────────────────────────────────────────

function statusRows(data: Overview) {
  const finished = data.completed_tasks + data.failed_tasks
  return [
    { category: STATUS_LABELS[0], value: Math.max(0, data.total_tasks - finished - data.running_tasks), fill: STATUS_COLORS[0] },
    { category: STATUS_LABELS[1], value: data.running_tasks, fill: STATUS_COLORS[1] },
    { category: STATUS_LABELS[2], value: data.completed_tasks, fill: STATUS_COLORS[2] },
    { category: STATUS_LABELS[3], value: data.failed_tasks, fill: STATUS_COLORS[3] },
  ]
}

// ── activity heatmap ───────────────────────────────────────────────────────

const HEATMAP_LEVELS = [0, 0.12, 0.28, 0.52, 0.80] as const

function heatmapLevel(total: number, max: number): number {
  if (total === 0 || max === 0) return 0
  const ratio = total / max
  for (let i = HEATMAP_LEVELS.length - 1; i >= 1; i--) {
    if (ratio >= HEATMAP_LEVELS[i]) return i
  }
  return 1
}

function HeatmapCell({ day, max }: { day: ActivityDay; max: number }) {
  const level = heatmapLevel(day.total, max)
  const cellColor = level === 0
    ? "var(--color-inset)"
    : level <= 1
      ? "color-mix(in srgb, var(--color-accent) 18%, var(--color-inset))"
      : level === 2
        ? "color-mix(in srgb, var(--color-accent) 36%, var(--color-inset))"
        : level === 3
          ? "color-mix(in srgb, var(--color-accent) 60%, var(--color-inset))"
          : "var(--color-accent)"
  const tooltip = `${day.date}: ${day.chat_messages} chat, ${day.task_dispatches} tasks`
  return (
    <div
      className="size-2.5 rounded-sm transition-shadow hover:shadow-[0_0_6px_var(--color-accent)]"
      style={{ background: cellColor }}
      title={tooltip}
    />
  )
}

function ActivityHeatmap({ data }: { data: ActivityDay[] }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.total)), [data])

  // group by week rows: fill partial weeks, pad leading days
  const weeks = useMemo(() => {
    const result: ActivityDay[][] = []
    let row: ActivityDay[] = []
    // pad first row with empties to align to week start
    if (data.length > 0) {
      const firstDow = new Date(data[0].date + "T00:00").getDay() // 0=Sun
      for (let i = 0; i < firstDow; i++) row.push({ date: "", chat_messages: 0, task_dispatches: 0, total: 0 })
    }
    for (const d of data) {
      row.push(d)
      if (row.length === 7) { result.push(row); row = [] }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push({ date: "", chat_messages: 0, task_dispatches: 0, total: 0 })
      result.push(row)
    }
    return result
  }, [data])

  return (
    <div className="flex gap-1 overflow-x-auto">
      {weeks.map((wk, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {wk.map((d, di) =>
            d.date ? <HeatmapCell key={d.date} day={d} max={max} /> : <div key={di} className="size-2.5" />
          )}
        </div>
      ))}
    </div>
  )
}

// ── stat card ──────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, note, tone = "accent" }: { icon: typeof Activity; label: string; value: string | number; note: string; tone?: Tone }) {
  const color = tones[tone]
  return (
    <section className="aurora-stat decorative-card rounded-xl border border-[var(--color-line)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-[var(--color-ink-3)]">
          <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: color.tint }}><Icon className="size-3.5" style={{ color: color.icon }} /></span>
          {label}
        </div>
        <span className="size-1.5 rounded-full" style={{ background: color.icon, boxShadow: `0 0 10px ${color.icon}` }} />
      </div>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-tight text-[var(--color-ink)]">{value}</p>
      <p className="mt-1 text-[10px] text-[var(--color-ink-4)]">{note}</p>
    </section>
  )
}

// ── gauge dial ─────────────────────────────────────────────────────────────

function GaugeDial({ value, tone = "accent", label, detail, icon: Icon }: { value: number; tone?: Tone; label: string; detail: string; icon: typeof Cpu }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = tones[tone].icon
  return (
    <div className="gauge-dial flex flex-col items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-4">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]"><Icon className="size-3" style={{ color }} />{label}</span>
      <div className="relative mt-3">
        <svg width="140" height="84" viewBox="0 0 140 84" className="overflow-visible">
          <path pathLength="100" d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke="var(--color-bg)" strokeWidth="10" strokeLinecap="round" />
          <path pathLength="100" d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct} 100`} strokeDashoffset="0" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="font-mono text-xl font-semibold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <p className="mt-2 text-center text-[10px] leading-3 text-[var(--color-ink-4)]">{detail}</p>
    </div>
  )
}

// ── task health donut ──────────────────────────────────────────────────────

function TaskHealthChart({ data }: { data: Overview }) {
  const rows = statusRows(data)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,.8fr)]">
      <div className="h-64 min-w-0">
        <PieChart width={260} height={250} className="mx-auto max-w-full">
          <Pie data={rows} dataKey="value" nameKey="category" innerRadius={62} outerRadius="84%" cornerRadius={5} paddingAngle={2} stroke="var(--color-surface)" strokeWidth={4}>
            <LabelList dataKey="value" position="inside" className="fill-background text-xs font-semibold" stroke="none" formatter={(value) => Number(value) > 0 ? value : ""} />
          </Pie>
        </PieChart>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const pct = data.total_tasks > 0 ? Math.round((row.value / data.total_tasks) * 100) : 0
          return <div key={row.category} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[var(--color-ink-3)]"><i className="size-2 rounded-full" style={{ background: row.fill, boxShadow: `0 0 8px ${row.fill}` }} />{row.category}</span><span className="font-mono tabular-nums text-[var(--color-ink-2)]">{row.value} <small className="text-[var(--color-ink-4)]">({pct}%)</small></span></div>
        })}
      </div>
    </div>
  )
}

// ── health card ────────────────────────────────────────────────────────────

function HealthCard({ icon: Icon, label, status, detail }: { icon: typeof Activity; label: string; status: string; detail: string }) {
  const ready = status === "ready" || status === "up"
  return <section className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${ready ? "bg-[var(--color-success-tint)] text-[var(--color-success)]" : status === "down" ? "bg-[var(--color-danger-tint)] text-[var(--color-danger)]" : "bg-[var(--color-accent-tint)] text-[var(--color-accent)]"}`}><Icon className="size-4" /></span>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-xs font-medium text-[var(--color-ink-2)]">{label}</p><span className={`size-1.5 rounded-full ${ready ? "bg-[var(--color-success)]" : status === "down" ? "bg-[var(--color-danger)]" : "bg-[var(--color-accent)] animate-pulse"}`} /><span className="font-mono text-[10px] uppercase text-[var(--color-ink-3)]">{status}</span></div><p className="mt-1 truncate text-[11px] text-[var(--color-ink-4)]" title={detail}>{detail}</p></div>
  </section>
}

// ── node fleet list ────────────────────────────────────────────────────────

function NodeFleetCard({ nodes, loading }: { nodes?: NodeHealth; loading: boolean }) {
  const list = nodes?.nodes ?? []
  const anyOnline = list.some((n) => n.status === "up" || n.status === "online")
  return (
    <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Node fleet</p>
          <h2 className="mt-1 text-sm font-semibold">Worker fleet status</h2>
        </div>
        <Server className="size-4 text-[var(--color-accent)]" />
      </div>
      {loading ? (
        <p className="mt-6 text-xs text-[var(--color-ink-4)]">Checking nodes…</p>
      ) : list.length === 0 ? (
        <p className="mt-6 text-xs text-[var(--color-ink-4)]">{nodes?.error || "No registered nodes"}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {list.map((n) => {
            const isUp = n.status === "up" || n.status === "online"
            const last = n.last_seen ? new Date(Number(n.last_seen) > 1e10 ? Number(n.last_seen) : n.last_seen).toLocaleString("en-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—"
            return (
              <div key={n.node_id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 px-3 py-2">
                <span className={`size-2 shrink-0 rounded-full ${isUp ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[var(--color-ink-2)]" title={n.hostname}>{n.hostname}</p>
                  <p className="font-mono text-[10px] text-[var(--color-ink-4)]">last seen {last}</p>
                </div>
                <span className={`shrink-0 font-mono text-[10px] uppercase ${isUp ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>{n.status}</span>
              </div>
            )
          })}
        </div>
      )}
      {list.length > 0 && (
        <p className="mt-3 text-[10px] text-[var(--color-ink-4)]">{anyOnline ? list.filter((n) => n.status === "up" || n.status === "online").length : 0} of {list.length} online</p>
      )}
    </section>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/api/overview"), refetchInterval: 5000 })
  const daemon = useQuery({ queryKey: ["chat-daemon-health"], queryFn: () => api<DaemonHealth>("/api/chat/daemon-health"), refetchInterval: 10_000 })
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => api<NodeHealth>("/api/nodes"), refetchInterval: 10_000 })
  const activity = useQuery({ queryKey: ["overview-activity"], queryFn: () => getOverviewActivity(180), refetchInterval: 60_000 })
  const data = overview.data

  if (overview.isLoading) return <LoadingState label="Memuat overview" />
  if (overview.isError || !data) return <LoadingState label="Gagal load overview" description={(overview.error as Error)?.message} />

  const memoryPct = data.metrics.memory_total_mb > 0 ? (data.metrics.memory_used_mb / data.metrics.memory_total_mb) * 100 : 0
  const finished = data.completed_tasks + data.failed_tasks
  const completionRate = data.total_tasks > 0 ? Math.round((data.completed_tasks / data.total_tasks) * 100) : 0
  const failureRate = data.total_tasks > 0 ? Math.round((data.failed_tasks / data.total_tasks) * 100) : 0

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] p-4 text-[var(--color-ink)] md:p-6">
      <div className="mx-auto w-full max-w-6xl">
        {/* ── header ── */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Runtime</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Overview</h1>
            <p className="mt-1 text-xs text-[var(--color-ink-3)]">Complete runtime statistics, task health, and resource utilization.</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-success)]/25 bg-[var(--color-success-tint)] px-2.5 py-1 font-mono text-[10px] text-[var(--color-success)]"><i className="size-1.5 animate-pulse rounded-full bg-current" /> live · 5s</span>
        </header>

        {/* ── KPI row: Total / Running / Completed / Failed / Queue ── */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={Layers3} label="Total tasks" value={data.total_tasks} note="Across all Kanban boards" />
          <StatCard icon={Activity} label="Running" value={data.running_tasks} note="Tasks currently executing" tone="info" />
          <StatCard icon={CheckCircle2} label="Completed" value={data.completed_tasks} note={`${completionRate}% of all tasks`} tone="success" />
          <StatCard icon={XCircle} label="Failed" value={data.failed_tasks} note={`${failureRate}% of all tasks`} tone="danger" />
          <StatCard icon={Minus} label="Queue" value={data.queue_depth} note="Pending / ready / waiting" tone="warning" />
        </div>

        {/* ── Activity heatmap (chat + task) ── */}
        <section className="mt-3 decorative-card rounded-xl border border-[var(--color-line)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Activity</p>
              <h2 className="mt-1 text-sm font-semibold">Chat + task heatmap — 6 months</h2>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-4)]">Daily buckets: hover for chat / task breakdown</p>
            </div>
            <Database className="size-4 text-[var(--color-accent)]" />
          </div>
          <div className="mt-4 flex min-h-[80px] items-start overflow-x-auto pb-1">
            {activity.isLoading ? (
              <p className="text-xs text-[var(--color-ink-4)]">Loading activity data…</p>
            ) : (activity.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-[var(--color-ink-4)]">No activity data yet — start chatting or dispatching tasks</p>
            ) : (
              <ActivityHeatmap data={activity.data!} />
            )}
          </div>
        </section>

        {/* ── System health + Task health side by side ── */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">System health</p><h2 className="mt-1 text-sm font-semibold">Resource utilization</h2></div><Gauge className="size-4 text-[var(--color-accent)]" /></div>
            <div className="mt-5 grid min-h-64 grid-cols-2 items-stretch gap-3"><GaugeDial icon={Cpu} label="CPU load" value={data.metrics.cpu_percent} detail={`${data.metrics.goroutines} active Go runtime goroutines`} /><GaugeDial icon={MemoryStick} label="Memory" value={memoryPct} detail={`${data.metrics.memory_used_mb} MB used of ${data.metrics.memory_total_mb} MB`} tone={memoryPct > 80 ? "danger" : memoryPct > 60 ? "warning" : "accent"} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Goroutines</p><p className="mt-1 font-mono text-lg text-[var(--color-ink)]">{data.metrics.goroutines}</p></div><div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Finished</p><p className="mt-1 font-mono text-lg text-[var(--color-ink)]">{finished}</p></div></div>
          </section>

          <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Task health</p><h2 className="mt-1 text-sm font-semibold">Status distribution</h2></div><Workflow className="size-4 text-[var(--color-accent)]" /></div>
            <TaskHealthChart data={data} />
            <div className="mt-6 rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><div className="flex items-center justify-between text-xs"><span className="text-[var(--color-ink-3)]">Completion rate</span><b className="font-mono text-[var(--color-success)]">{completionRate}%</b></div><div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg)]"><div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${completionRate}%` }} /></div></div>
            {/* 5-cell grid: healthy / silent / stuck / lost / unknown — fix: include unknown bucket */}
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {(["healthy", "silent", "stuck", "lost", "unknown"] as const).map((health) => <div key={health} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-2"><p className="text-[9px] uppercase tracking-wider text-[var(--color-ink-4)]">{health}</p><p className="mt-1 font-mono text-sm text-[var(--color-ink)]">{data.task_health?.[health] ?? 0}</p></div>)}
            </div>
          </section>
        </div>

        {/* ── Profiles + Workspaces (2 cards — Runtime mode removed) ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatCard icon={Users} label="Agent profiles" value={data.profiles} note="Configured execution profiles" tone="accent" />
          <StatCard icon={Server} label="Workspaces" value={data.workspaces} note="Connected execution targets" tone="info" />
        </div>

        {/* ── Hermes daemon + Node fleet (memory source removed) ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <HealthCard icon={Activity} label="Hermes daemon" status={daemon.data?.status === "ready" ? "ready" : daemon.isLoading ? "checking" : "down"} detail={daemon.data?.socket ?? "Local Unix socket"} />
          <NodeFleetCard nodes={nodes.data} loading={nodes.isLoading} />
        </div>

        {/* ── footer ── */}
        <footer className="mt-4 flex items-center gap-2 text-[10px] text-[var(--color-ink-4)]"><Radio className="size-3.5 text-[var(--color-accent)]" />Live data from Hermes API · refresh interval 5 seconds</footer>
      </div>
    </div>
  )
}
