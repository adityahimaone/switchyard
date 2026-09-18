import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, CheckCircle2, Cpu, Database, Gauge as GaugeIcon, GitPullRequest, Layers3, MemoryStick, Minus, Radio, Server, Users, Workflow, XCircle } from "lucide-react"
import { api, getOverviewActivity, getOverviewQueueTrend, getOverviewReview } from "@/api"
import type { ActivityDay, QueueTrendPoint, ReviewMetrics } from "@/api"
import LoadingState from "@/components/LoadingState"
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapXAxis,
  HeatmapYAxis,
  HeatmapTooltip,
  type HeatmapColumn,
  type HeatmapBin,
} from "@/components/charts/heatmap"
import { AreaChart } from "@/components/charts/area-chart"
import { Area } from "@/components/charts/area"
import { FunnelChart, type FunnelStage } from "@/components/charts/funnel-chart"
import { Gauge } from "@/components/charts/gauge"
import { RingChart } from "@/components/charts/ring-chart"
import { Ring } from "@/components/charts/ring"
import { RingCenter } from "@/components/charts/ring-center"

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

// ── bklit heatmap data transform ───────────────────────────────────────────

function activityToHeatmap(data: ActivityDay[]): HeatmapColumn[] {
  // group days into week columns, bin 0=Sun, 1=Mon, ... 6=Sat
  const byWeek = new Map<string, HeatmapBin[]>()
  const weekOrder: string[] = []
  for (const d of data) {
    const date = new Date(d.date + "T00:00")
    const dayOfWeek = date.getDay() // 0=Sun
    // week key = ISO week start (Mon) — use date - dayOfWeek + 1
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
    const wk = weekStart.toISOString().slice(0, 10)
    if (!byWeek.has(wk)) { byWeek.set(wk, []); weekOrder.push(wk) }
    byWeek.get(wk)!.push({ bin: dayOfWeek, count: d.total, date })
  }
  return weekOrder.map((_, i) => ({
    bin: i,
    bins: byWeek.get(weekOrder[i]) ?? [],
  }))
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
    <div className="flex flex-col items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-4">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]"><Icon className="size-3" style={{ color }} />{label}</span>
      <div className="mt-3 w-full">
        <Gauge
          value={pct}
          totalNotches={46}
          spacing={22}
          notchCornerRadius={4}
          inactiveFillOpacity={0.35}
          activeFill={color}
          minWidth={0}
          defaultLabel={label}
          centerValue={Math.round(pct)}
        />
      </div>
      <p className="mt-2 text-center text-[10px] leading-3 text-[var(--color-ink-4)]">{detail}</p>
    </div>
  )
}

// ── task health donut ──────────────────────────────────────────────────────

function TaskHealthChart({ data }: { data: Overview }) {
  const rows = statusRows(data)
  const total = Math.max(1, data.total_tasks)
  const rings = rows.map((row) => ({ label: row.category, value: row.value, maxValue: total, color: row.fill }))
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,.8fr)]">
      <div className="mx-auto h-64 w-full max-w-[260px]">
        <RingChart data={rings} baseInnerRadius={62} strokeWidth={12} ringGap={7}>
          {rings.map((item) => <Ring key={item.label} index={rings.indexOf(item)} />)}
          <RingCenter defaultLabel="Total tasks" />
        </RingChart>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const pct = data.total_tasks > 0 ? Math.round((row.value / data.total_tasks) * 100) : 0
          return <div key={row.category} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[var(--color-ink-3)]"><i className="size-2 rounded-full" style={{ background: row.fill }} />{row.category}</span><span className="font-mono tabular-nums text-[var(--color-ink-2)]">{row.value} <small className="text-[var(--color-ink-4)]">({pct}%)</small></span></div>
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

// ── review gate metrics ────────────────────────────────────────────────────

function ReviewGateCard({ data, loading }: { data?: ReviewMetrics; loading: boolean }) {
  return (
    <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Review gate</p>
          <h2 className="mt-1 text-sm font-semibold">Approval pipeline</h2>
        </div>
        <GitPullRequest className="size-4 text-[var(--color-accent)]" />
      </div>
      {loading || !data ? (
        <p className="mt-6 text-xs text-[var(--color-ink-4)]">Loading review metrics…</p>
      ) : (
        <>
          <FunnelChart
            className="mt-4 h-44 w-full"
            data={[
              { label: "In review", value: data.now_in_review, displayValue: String(data.now_in_review), color: "var(--color-accent)" },
              { label: "Reopened", value: data.reopened, displayValue: String(data.reopened), color: "var(--color-warning)" },
              { label: "Approved", value: data.approved, displayValue: String(data.approved), color: "var(--color-success)" },
            ] satisfies FunnelStage[]}
            color="var(--color-accent)"
            layers={2}
            gap={3}
            showPercentage={false}
          />
          <div className="mt-2 flex justify-end"><span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 px-3 py-2 text-center"><span className="block text-[9px] uppercase tracking-wider text-[var(--color-ink-4)]">Avg latency</span><span className="mt-1 block font-mono text-lg text-[var(--color-ink-2)]">{data.avg_latency_s > 0 ? formatDuration(data.avg_latency_s) : "-"}</span></span></div>
        </>
      )}
    </section>
  )
}

// ── queue trend sparkline (bklit area chart) ───────────────────────────────

function QueueTrendChart({ data, loading }: { data?: QueueTrendPoint[]; loading: boolean }) {
  const chartData = useMemo(() => (data ?? []).map((d) => ({
    date: new Date(d.date + "T12:00"),
    queue_size: d.queue_size,
    completed: d.completed,
    failed: d.failed,
  })), [data])

  return (
    <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Dispatcher</p>
          <h2 className="mt-1 text-sm font-semibold">Queue trend — 30 days</h2>
        </div>
        <Database className="size-4 text-[var(--color-accent)]" />
      </div>
      <div className="mt-4 min-h-[200px]">
        {loading ? (
          <p className="text-xs text-[var(--color-ink-4)]">Loading queue trend…</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-4)]">No queue data yet — dispatch some tasks</p>
        ) : (
          <AreaChart
            data={chartData}
            xDataKey="date"
            aspectRatio="3 / 1"
            status="ready"
          >
            <Area dataKey="completed" fill="var(--color-success)" fillOpacity={0.25} stroke="var(--color-success)" showLine />
            <Area dataKey="failed" fill="var(--color-danger)" fillOpacity={0.2} stroke="var(--color-danger)" showLine />
            <Area dataKey="queue_size" fill="var(--color-accent)" fillOpacity={0.35} stroke="var(--color-accent)" showLine showHighlight />
          </AreaChart>
        )}
      </div>
    </section>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/api/overview"), refetchInterval: 5000 })
  const daemon = useQuery({ queryKey: ["chat-daemon-health"], queryFn: () => api<DaemonHealth>("/api/chat/daemon-health"), refetchInterval: 10_000 })
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: () => api<NodeHealth>("/api/nodes"), refetchInterval: 10_000 })
  const activity = useQuery({ queryKey: ["overview-activity"], queryFn: () => getOverviewActivity(180), refetchInterval: 60_000 })
  const review = useQuery({ queryKey: ["overview-review"], queryFn: () => getOverviewReview(), refetchInterval: 30_000 })
  const queueTrend = useQuery({ queryKey: ["overview-queue-trend"], queryFn: () => getOverviewQueueTrend(30), refetchInterval: 60_000 })
  const data = overview.data

  const heatmapData = useMemo(() => activity.data ? activityToHeatmap(activity.data) : [], [activity.data])

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

        {/* ── Activity heatmap (bklit) ── */}
        <section className="mt-3 decorative-card rounded-xl border border-[var(--color-line)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Activity</p>
              <h2 className="mt-1 text-sm font-semibold">Chat + task heatmap — 6 months</h2>
            </div>
            <Database className="size-4 text-[var(--color-accent)]" />
          </div>
          <div className="mt-4 min-h-[140px]">
            {activity.isLoading ? (
              <p className="text-xs text-[var(--color-ink-4)]">Loading activity…</p>
            ) : heatmapData.length === 0 ? (
              <p className="text-xs text-[var(--color-ink-4)]">No activity data yet - start chatting or dispatching tasks</p>
            ) : (
              <HeatmapInteractionProvider>
                <HeatmapInteractionBoundary>
                  <div className="flex w-full flex-col items-stretch gap-3">
                    <HeatmapChart
                      data={heatmapData}
                      className="w-full"
                      layout="fluid"
                      weekStartDay={1}
                      animate
                      levelColors={["var(--color-inset)", "color-mix(in srgb, var(--color-accent) 20%, var(--color-inset))", "color-mix(in srgb, var(--color-accent) 40%, var(--color-inset))", "color-mix(in srgb, var(--color-accent) 65%, var(--color-inset))", "var(--color-accent)"]}
                    >
                      <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                      <HeatmapXAxis />
                      <HeatmapYAxis />
                      <HeatmapTooltip instant formatLabel={(count, date) => `${count} total · ${date.toLocaleDateString("en-ID", { weekday: "short", day: "numeric", month: "short" })}`} />
                    </HeatmapChart>
                    <HeatmapLegend inactiveOpacity={1} inactiveScale={1} align="end" />
                  </div>
                </HeatmapInteractionBoundary>
              </HeatmapInteractionProvider>
            )}
          </div>
        </section>

        {/* ── System health + Task health side by side ── */}
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">System health</p><h2 className="mt-1 text-sm font-semibold">Resource utilization</h2></div><GaugeIcon className="size-4 text-[var(--color-accent)]" /></div>
            <div className="mt-5 grid min-h-64 grid-cols-2 items-stretch gap-3"><GaugeDial icon={Cpu} label="CPU load" value={data.metrics.cpu_percent} detail={`${data.metrics.goroutines} active Go runtime goroutines`} /><GaugeDial icon={MemoryStick} label="Memory" value={memoryPct} detail={`${data.metrics.memory_used_mb} MB used of ${data.metrics.memory_total_mb} MB`} tone={memoryPct > 80 ? "danger" : memoryPct > 60 ? "warning" : "accent"} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Goroutines</p><p className="mt-1 font-mono text-lg text-[var(--color-ink)]">{data.metrics.goroutines}</p></div><div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Finished</p><p className="mt-1 font-mono text-lg text-[var(--color-ink)]">{finished}</p></div></div>
          </section>

          <section className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.14em] text-[var(--color-accent)]">Task health</p><h2 className="mt-1 text-sm font-semibold">Status distribution</h2></div><Workflow className="size-4 text-[var(--color-accent)]" /></div>
            <TaskHealthChart data={data} />
            <div className="mt-6 rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-3"><div className="flex items-center justify-between text-xs"><span className="text-[var(--color-ink-3)]">Completion rate</span><b className="font-mono text-[var(--color-success)]">{completionRate}%</b></div><div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg)]"><div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${completionRate}%` }} /></div></div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {(["healthy", "silent", "stuck", "lost", "unknown"] as const).map((health) => <div key={health} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)]/45 p-2"><p className="text-[9px] uppercase tracking-wider text-[var(--color-ink-4)]">{health}</p><p className="mt-1 font-mono text-sm text-[var(--color-ink)]">{data.task_health?.[health] ?? 0}</p></div>)}
            </div>
          </section>
        </div>

        {/* ── Profiles + Workspaces ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatCard icon={Users} label="Agent profiles" value={data.profiles} note="Configured execution profiles" tone="accent" />
          <StatCard icon={Server} label="Workspaces" value={data.workspaces} note="Connected execution targets" tone="info" />
        </div>

        {/* ── Hermes daemon + Node fleet ── */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <HealthCard icon={Activity} label="Hermes daemon" status={daemon.data?.status === "ready" ? "ready" : daemon.isLoading ? "checking" : "down"} detail={daemon.data?.socket ?? "Local Unix socket"} />
          <NodeFleetCard nodes={nodes.data} loading={nodes.isLoading} />
        </div>

        {/* ── Review gate metrics ── */}
        <div className="mt-3">
          <ReviewGateCard data={review.data} loading={review.isLoading} />
        </div>

        {/* ── Queue trend ── */}
        <div className="mt-3">
          <QueueTrendChart data={queueTrend.data} loading={queueTrend.isLoading} />
        </div>

        {/* ── footer ── */}
        <footer className="mt-4 pb-4 flex items-center gap-2 text-[10px] text-[var(--color-ink-4)]"><Radio className="size-3.5 text-[var(--color-accent)]" />Live data from Hermes API · refresh interval 5 seconds</footer>
      </div>
    </div>
  )
}
