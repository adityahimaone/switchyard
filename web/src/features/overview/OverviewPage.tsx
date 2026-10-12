import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Activity, Check, CheckCircle2, Copy, Cpu, Database, Eye, EyeOff, Gauge as GaugeIcon, GitPullRequest, Layers3, Loader2, MemoryStick, Minus, Plug, Power, PowerOff, Radio, RefreshCw, RotateCw, Server, Terminal, Users, Workflow, XCircle } from "lucide-react"
import { api, getNodeAgentSetup, getOverviewActivity, getOverviewQueueTrend, getOverviewReview, getPowerTargets, nodePower, refreshNodeVersions, savedIntegrations } from "@/api"
import type { ActivityDay, PowerTarget, QueueTrendPoint, ReviewMetrics } from "@/api"
import LoadingState from "@/components/feedback/loading-state"
import { PageHeader } from "@/components/app/page-header"
import { CollectionBody } from "@/components/app/collection"
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
import { Grid } from "@/components/charts/grid"
import { XAxis } from "@/components/charts/x-axis"
import { ChartTooltip } from "@/components/charts/tooltip"
import { FunnelChart, type FunnelStage } from "@/components/charts/funnel-chart"
import { Gauge } from "@/components/charts/gauge"
import { RingChart } from "@/components/charts/ring-chart"
import { Ring } from "@/components/charts/ring"
import { RingCenter } from "@/components/charts/ring-center"
import {
  INTEGRATIONS as KNOWLEDGE_INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  IntegrationGlyph,
  type Integration,
} from "@/components/ui/integration-card"
import {
  integrationColumnState,
  integrationColumns,
  integrationGroupHealthFromColumns,
  integrationGroups,
  type IntegrationColumn,
  type IntegrationState,
} from "./integrationHealth"

// ── types ──────────────────────────────────────────────────────────────────

interface DaemonHealth { status: string; socket?: string }
interface NodeHealth { status: string; nodes?: { node_id: string; hostname: string; status: string; last_seen: string; versions?: Record<string, string>; dsh_health?: { ok: boolean; version?: string; model?: string; provider?: string; error?: string; checked_at?: number } }[]; error?: string }

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
  app_version?: string
}

type Tone = "accent" | "success" | "warning" | "danger" | "info"

// ── shared colors / labels ─────────────────────────────────────────────────

const STATUS_COLORS = ["var(--c-accent)", "var(--c-accent-text)", "var(--c-success-text)", "var(--c-danger)"]
const STATUS_LABELS = ["Todo / ready", "Running", "Completed", "Failed"]

const tones: Record<Tone, { icon: string; tint: string }> = {
  accent: { icon: "var(--c-accent)", tint: "var(--c-accent-tint)" },
  success: { icon: "var(--c-success-text)", tint: "var(--c-success-tint)" },
  warning: { icon: "var(--c-warning-text)", tint: "var(--c-warning-tint)" },
  danger: { icon: "var(--c-danger)", tint: "var(--c-danger-tint)" },
  info: { icon: "var(--c-accent-text)", tint: "var(--c-accent-tint)" },
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

/** Sun-first weekday count — matches `HeatmapBin.bin` and `HeatmapWeekStartDay`. */
const HEATMAP_DAYS_PER_WEEK = 7

/** DST-safe day offset — `setDate` rolls the calendar, `+ n * 86400000` does not. */
function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function activityToHeatmap(data: ActivityDay[]): HeatmapColumn[] {
  // Group days into week columns, bin 0=Sun, 1=Mon, ... 6=Sat.
  //
  // Every column is emitted as a *dense* 7-bin array. `HeatmapRect` derives each
  // cell's row from the array index (`yScale(cell.row)`) — not from `bin.bin` —
  // so a short column collapses the grid. The backend returns a contiguous
  // window, leaving the first and last weeks partial; before padding, a 4-day
  // first week made `rowCount` 4 while `HeatmapYAxis` still labelled rows 1/3/5,
  // pushing "Sat" (row 5) a full 1.5 rows below the grid and outside the card.
  const byWeek = new Map<string, HeatmapBin[]>()
  const weekOrder: string[] = []
  for (const d of data) {
    const date = new Date(d.date + "T00:00")
    const dayOfWeek = date.getDay() // 0=Sun
    // week key = ISO week start (Mon) — use date - dayOfWeek + 1
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
    const wk = weekStart.toISOString().slice(0, 10)
    let bins = byWeek.get(wk)
    if (!bins) {
      // Bins are Sun-first but the week key is the Monday, so bin `b` sits at
      // `weekStart + (b + 6) % 7` (b=0 -> Sun, b=1 -> Mon, ... b=6 -> Sat).
      // Placeholder bins carry a real date: the ghost-cell range check reads it.
      bins = Array.from({ length: HEATMAP_DAYS_PER_WEEK }, (_, bin) => ({
        bin,
        count: 0,
        date: addDays(weekStart, (bin + HEATMAP_DAYS_PER_WEEK - 1) % HEATMAP_DAYS_PER_WEEK),
      }))
      byWeek.set(wk, bins)
      weekOrder.push(wk)
    }
    bins[dayOfWeek] = { bin: dayOfWeek, count: d.total, date }
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
    <section className="glass-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-2">
          <span className="flex size-7 items-center justify-center rounded-control" style={{ background: color.tint }}><Icon className="size-3.5" style={{ color: color.icon }} /></span>
          {label}
        </div>
        <span className="size-1.5 rounded-full" style={{ background: color.icon, boxShadow: `0 0 10px ${color.icon}` }} />
      </div>
      <p className="mt-4 font-mono text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-ink-3">{note}</p>
    </section>
  )
}

// ── gauge dial ─────────────────────────────────────────────────────────────

function GaugeDial({ value, tone = "accent", label, detail, icon: Icon }: { value: number; tone?: Tone; label: string; detail: string; icon: typeof Cpu }) {
  const pct = Math.max(0, Math.min(100, value))
  const color = tones[tone].icon
  return (
    <div className="flex flex-col items-center rounded-control border border-line bg-well/45 p-4">
      <span className="flex items-center gap-1.5 text-[10px] text-ink-3"><Icon className="size-3" style={{ color }} />{label}</span>
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
      <p className="mt-2 text-center text-[10px] leading-3 text-ink-3">{detail}</p>
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
          return <div key={row.category} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-ink-3"><i className="size-2 rounded-full" style={{ background: row.fill }} />{row.category}</span><span className="font-mono tabular-nums text-ink-2">{row.value} <small className="text-ink-3">({pct}%)</small></span></div>
        })}
      </div>
    </div>
  )
}

// ── health card ────────────────────────────────────────────────────────────

function HealthCard({ icon: Icon, label, status, detail }: { icon: typeof Activity; label: string; status: string; detail: string }) {
  const ready = status === "ready" || status === "up"
  const tone = ready
    ? "bg-success-tint text-success-text"
    : status === "down"
      ? "bg-danger-tint text-danger-text"
      : "bg-accent-tint text-accent-text"
  return <section className="glass-card flex min-w-0 items-start gap-3 p-3">
    <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control ${tone}`}><Icon className="size-4" /></span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        {/* A bare dot rather than a HealthLamp: the status word sits right
            beside it, so the lamp would repeat what the text already says. */}
        <span className={`size-1.5 shrink-0 rounded-full ${ready ? "bg-success-text" : status === "down" ? "bg-danger" : "bg-accent"}`} />
        <span className="font-mono text-[10px] text-ink-3">{status}</span>
      </div>
      <p className="mt-1 truncate text-[11px] text-ink-3" title={detail}>{detail}</p>
    </div>
  </section>
}

// ── node fleet list ────────────────────────────────────────────────────────

function NodeFleetCard({ nodes, loading }: { nodes?: NodeHealth; loading: boolean }) {
  const list = nodes?.nodes ?? []
  const queryClient = useQueryClient()
  const isOnline = (status: string) => ["up", "online", "idle", "busy"].includes(status.toLowerCase())
  // Which nodes expose remote power control; nodes without an entry get no buttons.
  const targets = useQuery({ queryKey: ["power-targets"], queryFn: getPowerTargets, refetchInterval: 60_000 })
  const powerByNode = useMemo(() => {
    const m = new Map<string, PowerTarget>()
    for (const t of targets.data?.targets ?? []) m.set(t.node_id, t)
    return m
  }, [targets.data])
  // Track which node+action is in flight and the last result, so a long cold
  // boot (~100s) shows progress instead of a dead button.
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ node: string; text: string; ok: boolean } | null>(null)
  const power = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => nodePower(id, action),
    onMutate: ({ id, action }) => { setBusy(`${id}:${action}`); setNotice(null) },
    onSuccess: (res, { id }) => {
      setNotice({ node: id, text: res.output?.trim() || "done", ok: true })
      queryClient.invalidateQueries({ queryKey: ["nodes"] })
    },
    onError: (err: Error, { id }) => setNotice({ node: id, text: err.message, ok: false }),
    onSettled: () => setBusy(null),
  })

  const runPower = (id: string, action: string) => power.mutate({ id, action })

  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-accent-text">Node fleet</p>
          <h2 className="mt-1 text-sm font-semibold">Worker fleet status</h2>
        </div>
        <Server className="size-4 text-accent-text" />
      </div>
      {loading ? (
        <p className="mt-6 text-xs text-ink-3">Checking nodes…</p>
      ) : list.length === 0 ? (
        <p className="mt-6 text-xs text-ink-3">{nodes?.error || "No registered nodes"}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {list.map((n) => {
            const isUp = isOnline(n.status)
            const last = n.last_seen ? new Date(Number(n.last_seen) > 1e10 ? Number(n.last_seen) : n.last_seen).toLocaleString("en-ID", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "—"
            const dh = n.dsh_health
            const hasDsh = !!dh
            const dshOk = hasDsh && dh.ok
            const target = powerByNode.get(n.node_id)
            const has = (a: string) => !!target?.actions.includes(a)
            const isBusy = (a: string) => busy === `${n.node_id}:${a}`
            return (
              <div key={n.node_id} className="flex items-center gap-3 rounded-control border border-line bg-well/45 px-3 py-2">
                <span className={`size-2 shrink-0 rounded-full ${isUp ? "bg-success" : "bg-danger"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-2" title={n.hostname}>{n.hostname}</p>
                  {/* `last seen` is the live node heartbeat, so it moves on every run and would
                    make the Overview baseline permanently red. design.md 12 wants
                    the node fleet visible; the timestamp is what has to go. */}
                  <p data-volatile="last-seen" className="font-mono text-[10px] text-ink-3">last seen {last}</p>
                  {hasDsh && (
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      <span className={`size-2 rounded-full ${dshOk ? "bg-success" : "bg-danger"}`} />
                      <span className="font-mono text-ink-3">DSH</span>
                      {dh.version && <span className="text-ink-3">{dh.version}</span>}
                      {dh.model && <span className="text-ink-3">{dh.model}</span>}
                      {dh.provider && <span className="text-ink-3">{dh.provider}</span>}
                      {dh.error && !dshOk && <span className="text-danger-text">{dh.error}</span>}
                    </div>
                  )}
                  {notice?.node === n.node_id && (
                    <p className={`mt-1 truncate font-mono text-[10px] ${notice.ok ? "text-success-text" : "text-danger-text"}`} title={notice.text}>
                      {notice.text}
                    </p>
                  )}
                </div>
                {target && (
                  <div className="flex shrink-0 items-center gap-1">
                    {has("on") && (
                      <button
                        type="button"
                        title="Power on"
                        disabled={isBusy("on")}
                        onClick={() => runPower(n.node_id, "on")}
                        className="rounded-control border border-line p-1 text-ink-3 hover:border-accent/40 hover:text-accent-text disabled:opacity-50"
                      >
                        {isBusy("on") ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                      </button>
                    )}
                    {has("cycle") && (
                      <button
                        type="button"
                        title="Power cycle"
                        disabled={isBusy("cycle")}
                        onClick={() => runPower(n.node_id, "cycle")}
                        className="rounded-control border border-line p-1 text-ink-3 hover:border-accent/40 hover:text-accent-text disabled:opacity-50"
                      >
                        {isBusy("cycle") ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                      </button>
                    )}
                    {has("off") && (
                      <button
                        type="button"
                        title="Power off"
                        disabled={isBusy("off")}
                        onClick={() => runPower(n.node_id, "off")}
                        className="rounded-control border border-line p-1 text-ink-3 hover:border-danger/40 hover:text-danger-text disabled:opacity-50"
                      >
                        {isBusy("off") ? <Loader2 className="size-3.5 animate-spin" /> : <PowerOff className="size-3.5" />}
                      </button>
                    )}
                  </div>
                )}
                <span className={`shrink-0 font-mono text-[10px] ${isUp ? "text-success-text" : "text-danger-text"}`}>{n.status}</span>
              </div>
            )
          })}
        </div>
      )}
      {list.length > 0 && (
        <p className="mt-3 text-[10px] text-ink-3">{list.filter((n) => isOnline(n.status)).length} of {list.length} online</p>
      )}
    </section>
  )
}

// ── integration health ────────────────────────────────────────────
//
// The model behind this card — what a worker reports, what that means, and how
// the catalog rolls up into role groups — lives in `integrationHealth.ts`. It is
// pure and has no brand assets or motion in its graph, so it can be exercised on
// its own.

/**
 * One integration across every device column.
 *
 * Split out of the card because the grouping moved the row two levels deeper;
 * keeping it inline would have put the per-device verdict logic inside a map
 * inside a map, where the three-state cell is the hardest thing to read and the
 * last thing anyone would find.
 */
function IntegrationRow({
  integration,
  columns,
  stateFor,
}: {
  integration: Integration
  columns: IntegrationColumn[]
  stateFor: (column: IntegrationColumn, integrationId: string) => IntegrationState
}) {
  return (
    <div className="grid gap-2 rounded-control border border-line bg-well/45 px-3 py-2 sm:grid-cols-[minmax(0,1.1fr)_repeat(2,minmax(0,1fr))] sm:items-center">
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-control bg-accent-tint text-accent-text">
          <IntegrationGlyph integration={integration} className="size-3" />
        </span>
        <span className="truncate text-xs font-medium text-ink-2">{integration.label}</span>
      </span>
      {columns.map((column) => {
        const state = stateFor(column, integration.id)
        return (
          <span
            key={column.key}
            className="flex min-w-0 items-center gap-2 sm:justify-center"
            title={`${column.label} · ${integration.label}: ${state.status}${state.version ? ` · ${state.version}` : ""}${column.source === "saved" ? " (saved)" : ""}`}
          >
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${state.ok ? "bg-success" : "bg-danger"}`}
              style={state.ok ? { boxShadow: "0 0 10px var(--c-success)" } : undefined}
            />
            <span className="font-mono text-[9px] text-ink-3 sm:hidden">{column.label}</span>
            <span className={`truncate font-mono text-[10px] ${state.ok ? "text-success-text" : "text-ink-3"}`}>{state.status}</span>
            {state.version && <span className={`truncate font-mono text-[10px] ${state.ok ? "text-ink-2" : "text-ink-3"}`}>{state.version}</span>}
          </span>
        )
      })}
    </div>
  )
}

/**
 * A group heading and its verdict lamp.
 *
 * Three states, not two: a category where *some* tools are missing is neither
 * healthy nor down, and calling it either would send the reader to the wrong
 * place. `warning` is the app's existing token for exactly that middle case.
 */
function IntegrationGroupHeading({
  label,
  description,
  healthy,
  total,
  workers,
}: {
  label: string
  description: string
  healthy: number
  total: number
  workers: number
}) {
  const tone = healthy === total ? "ok" : healthy === 0 ? "down" : "partial"
  const dot = tone === "ok" ? "bg-success" : tone === "partial" ? "bg-warning" : "bg-danger"
  const text = tone === "ok" ? "text-success-text" : tone === "partial" ? "text-warning-text" : "text-ink-3"
  return (
    <div className="flex items-center justify-between gap-2 px-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-2">{label}</h3>
        <p className="hidden min-w-0 truncate text-[10px] text-ink-3 sm:block">{description}</p>
      </div>
      <span
        className="flex shrink-0 items-center gap-1.5"
        title={
          workers > 0
            ? `${label}: ${healthy} of ${total} available on all ${workers} registered worker${workers === 1 ? "" : "s"}`
            : `${label}: no worker registered`
        }
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${dot}`}
          style={tone === "ok" ? { boxShadow: "0 0 8px var(--c-success)" } : undefined}
        />
        <span className={`font-mono text-[10px] tabular-nums ${text}`}>
          {healthy}/{total}
        </span>
      </span>
    </div>
  )
}

function IntegrationHealthCard({ nodes, loading, unavailable, appVersion }: { nodes?: NodeHealth; loading: boolean; unavailable: boolean; appVersion: string }) {
  // Versions live in SQLite as well as on screen. The stored snapshot is read
  // first because the grid falls back to it for any worker that is not
  // registered live — the last version a device reported must stay on screen
  // until the next "ping all versions" writes a new one.
  const saved = useQuery({ queryKey: ["nodes-integrations"], queryFn: savedIntegrations, refetchInterval: 60_000 })
  const agentDown = unavailable || nodes?.status === "down"
  const columns = integrationColumns(nodes?.nodes, saved.data)
  const stateFor = (column: IntegrationColumn, integrationId: string) =>
    integrationColumnState(column, saved.data, integrationId, agentDown)
  const connected = columns.map((column) => KNOWLEDGE_INTEGRATIONS.filter((integration) => stateFor(column, integration.id).ok).length)
  const showingSaved = columns.some((column) => column.source === "saved")
  const queryClient = useQueryClient()
  const [pinging, setPinging] = useState(false)
  const [pingMsg, setPingMsg] = useState("")
  const pingAllVersions = async () => {
    setPinging(true)
    setPingMsg("")
    try {
      const res = await refreshNodeVersions()
      setPingMsg(res.message)
      await queryClient.invalidateQueries({ queryKey: ["nodes"] })
      await queryClient.invalidateQueries({ queryKey: ["nodes-integrations"] })
    } catch (err) {
      // A failed ping must say so: a silent no-op would look like a
      // refresh that found nothing to change.
      setPingMsg(err instanceof Error ? err.message : "ping failed")
    } finally {
      setPinging(false)
    }
  }
  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-accent-text">Integration health</p>
          <h2 className="mt-1 text-sm font-semibold">Connected to kanban</h2>
          <p className="mt-1 font-mono text-[10px] text-ink-3">Kanban {appVersion}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={pingAllVersions}
            disabled={pinging}
            title="Ask every worker to re-probe its tools, then save the versions"
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-well/60 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent-border hover:text-accent-text disabled:opacity-60"
          >
            {pinging ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            {pinging ? "pinging…" : "ping all versions"}
          </button>
          <Plug className="size-4 text-accent-text" />
        </div>
      </div>
      {showingSaved && (
        <p className="mt-2 text-[10px] text-warning-text">
          not every worker is live — showing the versions last saved
          {saved.data?.saved_at ? ` (${new Date(saved.data.saved_at * 1000).toLocaleString()})` : ""}; press “ping all versions” to re-probe.
        </p>
      )}
      {loading ? (
        <p className="mt-6 text-xs text-ink-3">Checking integrations…</p>
      ) : (
        <>
          {/* Column headers only line up on sm+, where the rows are a
              three-column grid; on narrow screens each cell carries its
              own device label instead. */}
          <div className="mt-4 hidden gap-2 px-3 pb-1 text-[9px] font-medium uppercase tracking-wider text-ink-3 sm:grid sm:grid-cols-[minmax(0,1.1fr)_repeat(2,minmax(0,1fr))]">
            <span>integration</span>
            <span className="text-center">mac</span>
            <span className="text-center">windows</span>
          </div>
          <div className="mt-2 space-y-4">
            {integrationGroups(KNOWLEDGE_INTEGRATIONS, INTEGRATION_CATEGORIES).map(({ category, integrations }) => {
              const health = integrationGroupHealthFromColumns(columns, saved.data, integrations, agentDown)
              return (
                <section key={category.id}>
                  <IntegrationGroupHeading
                    label={category.label}
                    description={category.description}
                    healthy={health.healthy}
                    total={health.total}
                    workers={health.workers}
                  />
                  <div className="mt-1.5 space-y-2">
                    {integrations.map((integration) => (
                      <IntegrationRow
                        key={integration.id}
                        integration={integration}
                        columns={columns}
                        stateFor={stateFor}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
          <p className="mt-3 text-[10px] text-ink-3">
            {columns.map((column, i) => `${column.label} ${connected[i]} of ${KNOWLEDGE_INTEGRATIONS.length}${column.source === "saved" ? " (saved)" : ""}`).join(" · ")}
            {nodes?.error ? ` — ${nodes.error}` : ""}
          </p>
          {pingMsg && <p className="mt-1 text-[10px] text-accent-text">{pingMsg}</p>}
          <p className="mt-1 text-[10px] text-ink-3">
            {saved.data?.saved_at
              ? `versions saved ${new Date(saved.data.saved_at * 1000).toLocaleTimeString()}`
              : "versions not saved yet"}
            {saved.data?.last_ping ? ` · last ping ${new Date(saved.data.last_ping.started_at * 1000).toLocaleTimeString()}` : ""}
          </p>
        </>
      )}
    </section>
  )
}

// ── node agent onboarding ─────────────────────────────────────────

function SetupCommandRow({ label, command, copied, onCopy }: { label: string; command: string; copied: boolean; onCopy: (command: string) => void }) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-line bg-well/45 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-ink-3">{label}</p>
        <code className="mt-0.5 block break-all font-mono text-[10px] leading-4 text-ink-2">{command}</code>
      </div>
      <button
        type="button"
        onClick={() => onCopy(command)}
        className="shrink-0 rounded-control border border-line bg-canvas p-1.5 text-ink-3 transition-colors hover:text-ink-2"
        aria-label={`Copy ${label} command`}
        title="Copy command"
      >
        {copied ? <Check className="size-3 text-success-text" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

function NodeAgentSetupCard() {
  const { data, isLoading } = useQuery({ queryKey: ["node-agent-setup"], queryFn: getNodeAgentSetup })
  const [revealed, setRevealed] = useState(false)
  const [copiedLabel, setCopiedLabel] = useState("")
  const copy = (label: string, command: string) => {
    void navigator.clipboard.writeText(command)
    setCopiedLabel(label)
    window.setTimeout(() => setCopiedLabel((cur) => (cur === label ? "" : cur)), 1500)
  }
  const masked = (t: string) => (t.length <= 10 ? "••••••••" : `${t.slice(0, 6)}…${t.slice(-4)}`)

  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-accent-text">Node agent</p>
          <h2 className="mt-1 text-sm font-semibold">Worker install &amp; update</h2>
        </div>
        <Terminal className="size-4 text-accent-text" />
      </div>
      {isLoading || !data ? (
        <p className="mt-6 text-xs text-ink-3">Loading node agent setup…</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-control border border-line bg-well/45 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-ink-3">Shared token{data.token_created ? " — generated on first view" : ""}</p>
              <code className="mt-0.5 block break-all font-mono text-[10px] leading-4 text-ink-2">{revealed ? data.token : masked(data.token)}</code>
            </div>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="shrink-0 rounded-control border border-line bg-canvas p-1.5 text-ink-3 transition-colors hover:text-ink-2"
              aria-label={revealed ? "Hide token" : "Reveal token"}
              title={revealed ? "Hide token" : "Reveal token"}
            >
              {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            </button>
            <button
              type="button"
              onClick={() => copy("token", data.token)}
              className="shrink-0 rounded-control border border-line bg-canvas p-1.5 text-ink-3 transition-colors hover:text-ink-2"
              aria-label="Copy token"
              title="Copy token"
            >
              {copiedLabel === "token" ? <Check className="size-3 text-success-text" /> : <Copy className="size-3" />}
            </button>
          </div>
          {data.token_created && (
            <p className="mt-2 text-[10px] text-ink-3">The node-agent server reads this same file, so the pair shares one secret — no shell exports needed.</p>
          )}
          {!data.server_url ? (
            <p className="mt-4 text-xs text-ink-3">Set <code className="font-mono text-ink-2">NODE_AGENT_PUBLIC_URL</code> on the server (e.g. <code className="font-mono text-ink-2">http://100.75.2.78:8788</code>) to generate the install commands.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <SetupCommandRow label="Install — macOS" command={data.install_mac} copied={copiedLabel === "install_mac"} onCopy={(c) => copy("install_mac", c)} />
              <SetupCommandRow label="Install — Windows" command={data.install_windows} copied={copiedLabel === "install_windows"} onCopy={(c) => copy("install_windows", c)} />
              <SetupCommandRow label="Update — macOS" command={data.update_mac} copied={copiedLabel === "update_mac"} onCopy={(c) => copy("update_mac", c)} />
              <SetupCommandRow label="Update — Windows" command={data.update_windows} copied={copiedLabel === "update_windows"} onCopy={(c) => copy("update_windows", c)} />
            </div>
          )}
          <p className="mt-3 text-[10px] text-ink-3">Update commands carry no token — the updater reads the one already on the worker. First install: run the command on the worker, once.</p>
        </>
      )}
    </section>
  )
}

// ── review gate metrics ────────────────────────────────────────────────────

function ReviewGateCard({ data, loading }: { data?: ReviewMetrics; loading: boolean }) {
  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-accent-text">Review gate</p>
          <h2 className="mt-1 text-sm font-semibold">Approval pipeline</h2>
        </div>
        <GitPullRequest className="size-4 text-accent-text" />
      </div>
      {loading || !data ? (
        <p className="mt-6 text-xs text-ink-3">Loading review metrics…</p>
      ) : (
        <>
          <FunnelChart
            className="mt-4 h-44 w-full"
            data={[
              { label: "In review", value: data.now_in_review, displayValue: String(data.now_in_review), color: "var(--c-accent)" },
              { label: "Reopened", value: data.reopened, displayValue: String(data.reopened), color: "var(--c-warning-text)" },
              { label: "Approved", value: data.approved, displayValue: String(data.approved), color: "var(--c-success-text)" },
            ] satisfies FunnelStage[]}
            color="var(--c-accent)"
            layers={2}
            gap={3}
            showPercentage={false}
          />
          <div className="mt-2 flex justify-end"><span className="rounded-control border border-line bg-well/45 px-3 py-2 text-center"><span className="block text-[9px] text-ink-3">Avg latency</span><span className="mt-1 block font-mono text-lg text-ink-2">{data.avg_latency_s > 0 ? formatDuration(data.avg_latency_s) : "-"}</span></span></div>
        </>
      )}
    </section>
  )
}

// ── queue trend line chart ─────────────────────────────────────────────────

function QueueTrendChart({ data, loading }: { data?: QueueTrendPoint[]; loading: boolean }) {
  const chartData = useMemo(() => (data ?? []).map((d) => ({
    date: new Date(d.date + "T12:00"),
    queue_size: d.queue_size,
    completed: d.completed,
    failed: d.failed,
  })), [data])

  return (
    <section className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium text-accent-text">Dispatcher</p>
          <h2 className="mt-1 text-sm font-semibold">Queue trend — 30 days</h2>
        </div>
        <Database className="size-4 text-accent-text" />
      </div>
      <div className="mt-4 min-h-[200px]">
        {loading ? (
          <p className="text-xs text-ink-3">Loading queue trend…</p>
        ) : chartData.length === 0 ? (
          <p className="text-xs text-ink-3">No queue data yet — dispatch some tasks</p>
        ) : (
          <AreaChart
            data={chartData}
            xDataKey="date"
            aspectRatio="2.6 / 1"
            status="ready"
            yDomainTween
          >
            <Grid horizontal />
            <Area dataKey="completed" fill="var(--c-success-text)" fillOpacity={0} stroke="var(--c-success-text)" showLine showMarkers />
            <Area dataKey="failed" fill="var(--c-danger)" fillOpacity={0} stroke="var(--c-danger)" showLine showMarkers />
            <Area dataKey="queue_size" fill="var(--c-accent)" fillOpacity={0} stroke="var(--c-accent)" showLine showHighlight showMarkers />
            <XAxis numTicks={6} tickMode="data" />
            <ChartTooltip />
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

  if (overview.isLoading) return <LoadingState label="Loading overview" />
  if (overview.isError || !data) return <LoadingState label="Could not load overview" description={(overview.error as Error)?.message} />

  const memoryPct = data.metrics.memory_total_mb > 0 ? (data.metrics.memory_used_mb / data.metrics.memory_total_mb) * 100 : 0
  const finished = data.completed_tasks + data.failed_tasks
  const completionRate = data.total_tasks > 0 ? Math.round((data.completed_tasks / data.total_tasks) * 100) : 0
  const failureRate = data.total_tasks > 0 ? Math.round((data.failed_tasks / data.total_tasks) * 100) : 0

  return (
    <div
      /* tabIndex, because axe (wcag2aa, scrollable-region-focusable) requires a
         scrollable region to be keyboard-reachable, and without it the only way
         to scroll Overview with a keyboard is to tab through every card first.
         0 rather than -1: the rule wants the region reachable, not merely
         focusable in principle, and -1 is what it rejected. The focus ring is
         explicit so reaching it by keyboard is visible rather than silent. */
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
    >
      <PageHeader
        title="Overview"
        description="Complete runtime statistics, task health, and resource utilization."
        actions={
          /* Masked as data-volatile: the "live" age ticks every run.

             `font-medium` and `aria-hidden` are both deliberate. The weight
             renders at 500 here, not 600 — which is NOT enough to reach the 3:1
             large-text bar at 10px, so typography is not the fix. The token is:
             `--c-success-text` at 500 measured 4.32:1 composited over the 10%
             `--c-success-tint` and failed WCAG AA, because that token is tuned
             against `surface` (5.31:1), not against its own tint. `#1e7047` clears
             4.5 on every ground the tint can land on — see index.css.

             The pulsing dot is decorative and the text carries the meaning, so it
             is aria-hidden rather than announced as an empty element. */
          <span
            data-volatile="live-age"
            className="flex items-center gap-1.5 rounded-control border border-success/25 bg-success-tint px-2.5 py-1 font-mono text-[10px] font-medium text-success-text"
          >
            <i aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> live · 5s
          </span>
        }
      />

      {/* Nearly every number on Overview is a LIVE aggregate read at request time:
          task totals, cpu_percent, goroutines, memory_used_mb, the completion rate,
          the five health buckets, the queue trend. Masking each one individually was
          a losing game — a diff image came back with a literal "P95: url (0.4s)"
          label in it — so the whole data region is masked as one block.

          What is still compared, and is the point of capturing this page at all:
          the shell, the type scale, the card grid, the glass, the spacing, and every
          colour. Layout and style regressions are what a visual gate is for; the
          numbers change every run and were never going to be a useful signal. */}
      <CollectionBody data-volatile="live-aggregates" className="flex flex-col gap-4 pt-5 pb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={Layers3} label="Total tasks" value={data.total_tasks} note="Across all Kanban boards" />
          <StatCard icon={Activity} label="Running" value={data.running_tasks} note="Tasks currently executing" tone="info" />
          <StatCard icon={CheckCircle2} label="Completed" value={data.completed_tasks} note={`${completionRate}% of all tasks`} tone="success" />
          <StatCard icon={XCircle} label="Failed" value={data.failed_tasks} note={`${failureRate}% of all tasks`} tone="danger" />
          <StatCard icon={Minus} label="Queue" value={data.queue_depth} note="Pending / ready / waiting" tone="warning" />
        </div>

        {/* ── Activity heatmap (bklit) ── */}
        <section className="mt-3 glass-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-accent-text">Activity</p>
              <h2 className="mt-1 text-sm font-semibold">Chat + task heatmap — 6 months</h2>
            </div>
            <Database className="size-4 text-accent-text" />
          </div>
          <div className="mt-4 min-h-[140px]">
            {activity.isLoading ? (
              <p className="text-xs text-ink-3">Loading activity…</p>
            ) : heatmapData.length === 0 ? (
              <p className="text-xs text-ink-3">No activity data yet - start chatting or dispatching tasks</p>
            ) : (
              <HeatmapInteractionProvider>
                <HeatmapInteractionBoundary>
                  <div className="flex w-full flex-col items-stretch gap-3">
                    <HeatmapChart
                      data={heatmapData}
                      className="w-full"
                      layout="fluid"
                      weekStartDay={1}
                      margin={{ left: 58 }}
                      animate
                      levelColors={["var(--c-well)", "color-mix(in srgb, var(--c-accent) 20%, var(--c-well))", "color-mix(in srgb, var(--c-accent) 40%, var(--c-well))", "color-mix(in srgb, var(--c-accent) 65%, var(--c-well))", "var(--c-accent)"]}
                    >
                      <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                      <HeatmapXAxis />
                      <HeatmapYAxis labelFormat="abbreviated" />
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
          <section className="glass-card p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium text-accent-text">System health</p><h2 className="mt-1 text-sm font-semibold">Resource utilization</h2></div><GaugeIcon className="size-4 text-accent-text" /></div>
            <div className="mt-5 grid min-h-64 grid-cols-2 items-stretch gap-3"><GaugeDial icon={Cpu} label="CPU load" value={data.metrics.cpu_percent} detail={`${data.metrics.goroutines} active Go runtime goroutines`} /><GaugeDial icon={MemoryStick} label="Memory" value={memoryPct} detail={`${data.metrics.memory_used_mb} MB used of ${data.metrics.memory_total_mb} MB`} tone={memoryPct > 80 ? "danger" : memoryPct > 60 ? "warning" : "accent"} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-control border border-line bg-well/45 p-3"><p className="text-[10px] text-ink-3">Goroutines</p><p className="mt-1 font-mono text-lg text-ink">{data.metrics.goroutines}</p></div><div className="rounded-control border border-line bg-well/45 p-3"><p className="text-[10px] text-ink-3">Finished</p><p className="mt-1 font-mono text-lg text-ink">{finished}</p></div></div>
          </section>

          <section className="glass-card p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium text-accent-text">Task health</p><h2 className="mt-1 text-sm font-semibold">Status distribution</h2></div><Workflow className="size-4 text-accent-text" /></div>
            <TaskHealthChart data={data} />
            <div className="mt-6 rounded-control border border-line bg-well/45 p-3"><div className="flex items-center justify-between text-xs"><span className="text-ink-3">Completion rate</span><b className="font-mono text-success-text">{completionRate}%</b></div><div className="mt-2 h-1.5 rounded-full bg-canvas"><div className="h-full rounded-full bg-success" style={{ width: `${completionRate}%` }} /></div></div>
            <div className="mt-3 grid grid-cols-5 gap-2 text-center">
              {(["healthy", "silent", "stuck", "lost", "unknown"] as const).map((health) => <div key={health} className="rounded-control border border-line bg-well/45 p-2"><p className="text-[9px] text-ink-3">{health}</p><p className="mt-1 font-mono text-sm text-ink">{data.task_health?.[health] ?? 0}</p></div>)}
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

        {/* ── Integration health: what each worker device has
              installed, read from the fleet's registration-time
              version probe ── */}
        <IntegrationHealthCard nodes={nodes.data} loading={nodes.isLoading} unavailable={nodes.isError} appVersion={data.app_version ?? "unknown"} />

        {/* ── Review gate metrics ── */}
        <ReviewGateCard data={review.data} loading={review.isLoading} />

        {/* ── Queue trend ── */}
        <QueueTrendChart data={queueTrend.data} loading={queueTrend.isLoading} />

        {/* ── Node agent onboarding ── */}
        <NodeAgentSetupCard />

        <footer className="flex items-center gap-2 text-[10px] text-ink-3">
          <Radio className="size-3.5 text-accent-text" />
          Live data from the Hermes API · refresh interval 5 seconds
        </footer>
      </CollectionBody>
    </div>
  )
}
