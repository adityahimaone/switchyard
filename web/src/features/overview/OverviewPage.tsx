import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Activity, AlertTriangle, CheckCircle2, Clock3, Layers3 } from "lucide-react"
import { api, type Board, type Task } from "@/api"
import LoadingState from "@/components/LoadingState"

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: typeof Activity; tone: string }) {
  return (
    <div className="group rounded-2xl border border-[#273043] bg-[#151b27] p-4 transition-colors hover:border-[#3a465c]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#8d98ab]">{label}</span>
        <Icon className={`size-4 ${tone}`} aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-[#f4f7fb]">{value}</p>
      <p className="mt-1 text-xs text-[#778398]">{detail}</p>
    </div>
  )
}

export default function OverviewPage({ slug }: { slug: string }) {
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api<Board[]>("/api/boards") })
  const tasks = useQuery({ queryKey: ["overview-tasks", slug], queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`) })
  const list = tasks.data ?? []
  const counts = useMemo(() => ({
    running: list.filter((task) => task.status === "running").length,
    review: list.filter((task) => task.status === "review").length,
    failed: list.filter((task) => task.status === "blocked" || task.consecutive_failures > 0).length,
    done: list.filter((task) => task.status === "done").length,
  }), [list])
  const recent = [...list].sort((a, b) => b.created_at - a.created_at).slice(0, 6)

  if (tasks.isLoading || boards.isLoading) return <LoadingState label="Memuat overview" />
  if (tasks.isError) return <div className="p-6 text-sm text-red-300">Gagal load overview: {(tasks.error as Error).message}</div>

  return (
    <main className="min-h-full overflow-y-auto bg-[#0d1119] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#10e0dd]">Operations workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#f4f7fb]">What needs attention now?</h2>
            <p className="mt-1 text-sm text-[#8d98ab]">Live view from board task data. No synthetic metrics.</p>
          </div>
          <div className="rounded-xl border border-[#273043] bg-[#151b27] px-3 py-2 text-xs text-[#8d98ab]">
            Board <span className="font-mono text-[#d9e0ea]">{slug}</span> · {list.length} tasks
          </div>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Task metrics">
          <Metric label="Running tasks" value={counts.running} detail="Currently executing" icon={Activity} tone="text-sky-300" />
          <Metric label="Review queue" value={counts.review} detail="Waiting for handoff" icon={Clock3} tone="text-violet-300" />
          <Metric label="Needs attention" value={counts.failed} detail="Blocked or with failures" icon={AlertTriangle} tone="text-amber-300" />
          <Metric label="Completed" value={counts.done} detail="Done on this board" icon={CheckCircle2} tone="text-emerald-300" />
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-[#273043] bg-[#151b27]">
            <div className="flex items-center justify-between border-b border-[#273043] px-4 py-3">
              <div><h3 className="text-sm font-semibold text-[#f4f7fb]">Recent task activity</h3><p className="mt-0.5 text-xs text-[#778398]">Newest tasks from current board</p></div>
              <Layers3 className="size-4 text-[#778398]" />
            </div>
            <div className="divide-y divide-[#273043]">
              {recent.map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`size-2 rounded-full ${task.status === "running" ? "bg-sky-300" : task.status === "done" ? "bg-emerald-300" : task.status === "blocked" ? "bg-amber-300" : "bg-[#66748a]"}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm text-[#d9e0ea]">{task.title}</p><p className="mt-0.5 font-mono text-[10px] text-[#778398]">{task.id}</p></div>
                  <span className="rounded-full border border-[#334057] px-2 py-0.5 text-[10px] text-[#aab5c5]">{task.status}</span>
                </div>
              ))}
              {!recent.length && <p className="px-4 py-8 text-center text-sm text-[#778398]">No tasks on this board yet.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-[#273043] bg-[#151b27] p-4">
            <h3 className="text-sm font-semibold text-[#f4f7fb]">Available boards</h3>
            <div className="mt-4 flex flex-col gap-2">
              {(boards.data ?? []).filter((board) => board.slug !== "archived").map((board) => <div key={board.slug} className="flex items-center justify-between rounded-xl bg-[#0d1119] px-3 py-2.5"><span className="text-sm text-[#d9e0ea]">{board.icon} {board.name}</span><span className="font-mono text-[10px] text-[#778398]">{board.slug}</span></div>)}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
