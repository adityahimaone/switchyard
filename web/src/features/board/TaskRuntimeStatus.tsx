import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { codeGraphReport, nodeAgentHealth, type CodeGraphReport, type NodeAgent, type Profile, type Task, type TaskEvent, type TaskRun, type Workspace } from "../../api"

function chip(label: string, tone: "good" | "warn" | "bad" | "muted" = "muted") {
  const styles = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    bad: "border-red-500/30 bg-red-500/10 text-red-300",
    muted: "border-[var(--color-line)] bg-[var(--color-inset)] text-neutral-400",
  }
  return <Badge variant="outline" className={`px-1.5 py-0 text-[9px] leading-4 ${styles[tone]}`}>{label}</Badge>
}

function phase(events: TaskEvent[], task: Task) {
  const latest = [...events].sort((a, b) => a.created_at - b.created_at).at(-1)?.kind
  if (task.status === "done") return "done"
  if (task.status === "blocked") return task.status
  if (latest === "codegraph_read" || latest === "codegraph_check") return "CodeGraph read"
  if (latest === "claimed" || latest === "spawned" || task.status === "running") return "running"
  if (task.status === "ready" || task.status === "todo") return "queued"
  return task.status
}

function nodeFor(workspace: Workspace | undefined, nodes: NodeAgent[]) {
  if (!workspace) return undefined
  return nodes.find((node) => node.workspaces?.some((path) => path === workspace.path || workspace.path.startsWith(path)))
}

function isRemoteWorkspace(workspace?: Workspace) {
  if (!workspace) return false
  const host = (workspace.host || "").toLowerCase()
  const os = (workspace.os || "").toLowerCase()
  const path = workspace.path || ""
  return Boolean(host && host !== "localhost" && host !== "127.0.0.1") ||
    os === "mac" || os === "windows" || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/Users/")
}

function StatusLine({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 py-1"><span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span><span className="min-w-0 truncate text-right text-[11px] text-neutral-300">{children}</span></div>
}

export default function TaskRuntimeStatus({ task, profile, workspace, events, runs = [], tasks = [], compact = false }: {
  task: Task
  profile?: Profile
  workspace?: Workspace
  events: TaskEvent[]
  runs?: TaskRun[]
  tasks?: Task[]
  compact?: boolean
}) {
  const nodes = useQuery({ queryKey: ["node-health"], queryFn: nodeAgentHealth, refetchInterval: task.status === "running" ? 5_000 : 15_000 })
  const graph = useQuery<CodeGraphReport>({
    queryKey: ["codegraph", workspace?.id],
    queryFn: () => codeGraphReport(workspace!.id),
    enabled: !!workspace,
    refetchInterval: 15_000,
  })
  const node = nodeFor(workspace, nodes.data?.nodes ?? [])
  const profileTasks = tasks.filter((item) => item.assignee === task.assignee)
  const running = profileTasks.filter((item) => item.status === "running").length
  const queued = profileTasks.filter((item) => item.status === "todo" || item.status === "ready").length
  const graphApps = graph.data?.apps ?? []
  const graphState = !workspace ? "not checked" : graph.isLoading ? "checking…" : graph.isError ? "unavailable" : graphApps.length ? `indexed · ${graphApps.length} app${graphApps.length === 1 ? "" : "s"}` : "unavailable"
  const graphTone = graphState.startsWith("indexed") ? "good" : graphState === "not checked" || graphState === "checking…" ? "muted" : "warn"
  const remote = isRemoteWorkspace(workspace)
  const nodeState = !workspace || !remote
    ? "local"
    : nodes.isLoading
      ? "checking…"
      : node?.status === "online"
        ? "online"
        : nodes.data?.status === "down"
          ? "offline"
          : nodes.data?.status === "up"
            ? "not registered"
            : "unavailable"
  const nodeTone = nodeState === "online" ? "good" : nodeState === "local" || nodeState === "not registered" || nodeState === "checking…" ? "muted" : "warn"
  const profileState = !profile ? "unassigned" : profile.valid ? "valid" : "invalid"
  const profileTone = !profile ? "muted" : profile.valid ? "good" : "bad"
  const currentPhase = phase(events, task)
  const usage = (runs ?? []).reduce((total: { inputTokens: number; outputTokens: number; totalTokens: number; cacheReadTokens: number }, run: TaskRun) => ({
    inputTokens: total.inputTokens + (run.usage?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (run.usage?.outputTokens ?? 0),
    totalTokens: total.totalTokens + (run.usage?.totalTokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (run.usage?.cacheReadTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0 })
  const hasUsage = usage.inputTokens + usage.outputTokens + usage.totalTokens + usage.cacheReadTokens > 0

  if (compact) return (
    <section className="glass-inset-card rounded-lg p-2.5" aria-label="Runtime status">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Runtime</span>
        {chip(`${task.assignee || "unassigned"} · ${profileState}`, profileTone)}
        {chip(`node · ${nodeState}`, nodeTone)}
        {chip(`CodeGraph · ${graphState}`, graphTone)}
        {hasUsage && chip(`tokens · ${usage.totalTokens.toLocaleString()}`, "good")}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-neutral-500">
        <span>phase: <strong className="font-medium text-neutral-300">{currentPhase}</strong></span>
        {profile && tasks.length > 0 && <span>{running} running · {queued} queued</span>}
      </div>
    </section>
  )

  return (
    <section className="glass-inset-card rounded-lg p-3" aria-label="Runtime status">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Runtime status</h3>
        {chip(currentPhase, task.status === "running" ? "good" : "muted")}
      </div>
      <div className="divide-y divide-[var(--color-line)]/60">
        <StatusLine label="Agent profile">{chip(profile ? `${profile.name} · ${profileState}` : "unassigned", profileTone)}</StatusLine>
        {profile && <StatusLine label="Queue">{running} running · {queued} queued</StatusLine>}
        <StatusLine label="Node">{chip(nodeState, nodeTone)} {node && <span className="ml-1 text-neutral-500">{node.hostname || node.node_id}</span>}</StatusLine>
        <StatusLine label="CodeGraph">{chip(graphState, graphTone)}</StatusLine>
        <StatusLine label="Current phase">{currentPhase}</StatusLine>
        {hasUsage && <StatusLine label="Token usage">{usage.totalTokens.toLocaleString()} total · {usage.inputTokens.toLocaleString()} in · {usage.outputTokens.toLocaleString()} out · {usage.cacheReadTokens.toLocaleString()} cache · {runs?.length ?? 0} runs</StatusLine>}
      </div>
      {nodeState === "offline" && <p className="mt-2 text-[10px] leading-relaxed text-amber-300">Node agent is unreachable. Remote runs may remain queued until the agent reconnects.</p>}
      {nodeState === "not registered" && <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">Node agent is reachable, but no node has claimed this workspace.</p>}
      {graphState === "unavailable" && <p className="mt-2 text-[10px] leading-relaxed text-amber-300">CodeGraph unavailable. Worker can continue with normal file inspection.</p>}
    </section>
  )
}
