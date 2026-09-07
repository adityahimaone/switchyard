import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, COLUMNS, type Profile, type Status, type Task, type TaskEvent, type Workspace } from "../../api"
import { Apple, ExternalLink, HardDrive, Laptop, Monitor } from "lucide-react"
import { AgentTaskStatus, splitAgentResult } from "./AgentStatus"

const STATUS_CHIP: Record<string, string> = {
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  running: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  review: "border-violet-500/40 bg-violet-500/10 text-violet-300",
}

function OsIcon({ ws }: { ws?: Workspace }) {
  const os = (ws?.os || "").toLowerCase()
  const path = ws?.path || ""
  const host = (ws?.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || /^[A-Za-z]:[\\/]/.test(path)) return <Laptop className="size-3" />
  if (os === "mac" || host.includes("mac") || path.startsWith("/Users/")) return <Apple className="size-3" />
  if (os === "linux" || ws) return <HardDrive className="size-3" />
  return <Monitor className="size-3" />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-[11px] text-neutral-300">{children}</span>
    </div>
  )
}

export default function TaskDetail({
  slug,
  task,
  profiles,
  workspaces,
  onClose,
  onMove,
  onReassign,
  onOpenPage,
}: {
  slug: string
  task: Task
  profiles: Profile[]
  workspaces: Workspace[]
  onClose: () => void
  onMove: (s: Status) => Promise<void>
  onReassign: (a: string) => Promise<void>
  onOpenPage: () => void
}) {
  const events = useQuery({
    queryKey: ["events", slug, task.id],
    queryFn: () => api<TaskEvent[]>(`/api/boards/${slug}/tasks/${task.id}/events`),
    refetchInterval: task.status === "running" ? 5_000 : false,
  })
  const profile = profiles.find((p) => p.name === task.assignee)
  const ws = workspaces.find((w) => w.path === task.workspace_path)
  const wsIsSsh = !!ws?.host && ws.host !== "localhost" && ws.host !== "127.0.0.1"
  const [showWorking, setShowWorking] = useState(false)
  const resultSplit = task.result ? splitAgentResult(task.result) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l border-[#1e2430] bg-[#11151f] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold leading-snug text-neutral-100">{task.title}</h2>
          <Button variant="outline" size="sm" className="shrink-0 px-2" onClick={onClose}>✕</Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <Badge variant="outline" className={`px-1.5 py-0 text-[9px] leading-none ${STATUS_CHIP[task.status] ?? "border-[#1e2430] bg-[#161b27] text-neutral-300"}`}>{task.status}</Badge>
          {task.priority > 0 && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] leading-none text-amber-300">P{task.priority}</Badge>
          )}
          <span className="font-mono text-[10px] text-neutral-500/60">{task.id}</span>
          {task.consecutive_failures > 0 && (
            <span className="text-[10px] text-red-400">{task.consecutive_failures} consecutive failures</span>
          )}
        </div>

        <AgentTaskStatus task={task} events={events.data ?? []} />

        {/* agent */}
        <div className="rounded-lg border border-[#1e2430] bg-[#0b0e14] p-2.5">
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Agent</label>
          <Select
            value={task.assignee || "unassigned"}
            onValueChange={(v) => onReassign(v === "unassigned" ? "" : v).catch((err: Error) => alert(err.message))}
            disabled={task.status === "running"}
          >
            <SelectTrigger className="mt-1 h-8 w-full border-[#1e2430] bg-[#11151f] text-xs disabled:opacity-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 border-[#1e2430] bg-[#11151f]">
              <SelectItem value="unassigned" className="text-xs">unassigned</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-xs">
                  {p.name}{p.active ? " (active)" : ""}{!p.valid ? " (broken)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {profile && (
            <p className="mt-1 truncate text-[10px] text-neutral-500" title={`${profile.model || "—"} · ${profile.provider || "—"}`}>
              {profile.model || "—"} · {profile.provider || "—"}
            </p>
          )}
          {profile && !profile.valid && (
            <p className="mt-0.5 text-[10px] text-red-400">Provider invalid — worker bakal crash.</p>
          )}
        </div>

        {/* meta rows */}
        <div className="divide-y divide-[#1e2430]/60 rounded-lg border border-[#1e2430] bg-[#0b0e14] px-2.5">
          <Row label="Workspace">
            {task.workspace_path
              ? <span className="flex items-center justify-end gap-1.5" title={task.workspace_path}>
                  <OsIcon ws={ws} />
                  {ws?.name ?? task.workspace_path.split(/[\\/]/).pop()}
                  {wsIsSsh && <span className="text-neutral-500">· ssh</span>}
                </span>
              : "scratch"}
          </Row>
          <Row label="Kind">{task.workspace_kind || "dir"}</Row>
          <Row label="Dibuat">{new Date(task.created_at * 1000).toLocaleString()}</Row>
          {task.started_at && <Row label="Mulai">{new Date(task.started_at * 1000).toLocaleString()}</Row>}
          {task.completed_at && <Row label="Selesai">{new Date(task.completed_at * 1000).toLocaleString()}</Row>}
          <Row label="Creator">{task.created_by || "—"}</Row>
          <Row label="Events">{events.data?.length ?? 0} tercatat</Row>
        </div>

        {task.body && (
          <div className="rounded-lg border border-[#1e2430] bg-[#0b0e14] p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Deskripsi</label>
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-300">{task.body}</p>
          </div>
        )}
        {task.last_failure_error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-red-300">Last failure</label>
            <p className="mt-1 max-h-20 overflow-y-auto break-words text-[11px] leading-relaxed text-red-300">{task.last_failure_error}</p>
          </div>
        )}
        {resultSplit?.working && (
          <div className="rounded-lg border border-[#1e2430] bg-[#11151f] p-2.5">
            <button
              type="button"
              onClick={() => setShowWorking((v) => !v)}
              aria-expanded={showWorking}
              className="flex w-full items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400 hover:text-neutral-200"
            >
              <span className={`transition-transform duration-200 ${showWorking ? "rotate-90" : ""}`}>▸</span>
              Working log{showWorking ? "" : " (tap untuk buka)"}
            </button>
            {showWorking && (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-[#1e2430] bg-[#0b0e14] p-2 font-mono text-[10px] leading-relaxed text-neutral-400">{resultSplit.working}</pre>
            )}
          </div>
        )}
        {resultSplit && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5">
            <label className="block text-[10px] uppercase tracking-wider text-emerald-300">Result</label>
            <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-500/20 bg-[#0b0e14] p-2 font-mono text-[11px] leading-relaxed text-emerald-100/90">{resultSplit.final || resultSplit.working}</pre>
          </div>
        )}

        {/* status moves */}
        <div className="flex flex-wrap gap-1.5">
          {COLUMNS.filter((s) => s !== task.status).map((s) => (
            <Button
              key={s}
              variant="outline"
              size="sm"
              onClick={() => onMove(s).catch((e: Error) => alert(e.message))}
              className="h-6 rounded px-2 text-[10px] text-neutral-400 hover:border-[#10e0dd]/50 hover:text-[#10e0dd]"
            >
              → {s}
            </Button>
          ))}
        </div>

        <div className="mt-auto pt-1">
          <Button onClick={onOpenPage} className="w-full gap-1.5 bg-[#10e0dd] text-black hover:bg-[#10e0dd]/90">
            <ExternalLink className="size-3.5" /> Open Command Center
          </Button>
        </div>
      </aside>
    </div>
  )
}
