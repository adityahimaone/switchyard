import { BookOpen, CheckCircle2, GitBranch, KeyRound, MessageSquare, Terminal, Workflow, XCircle } from "lucide-react"

const kanbanSections = [
  {
    title: "A–H · Intent and dispatch",
    icon: Workflow,
    body: "Board task stores intent/title/body, workspace exact, profile, executor, dan priority. Validation di API, bukan sekadar UI. Dispatcher claim todo/ready → running, route exact workspace via SSH/node-agent, bukan tebakan path.",
  },
  {
    title: "I–Q · Execution to review",
    icon: GitBranch,
    body: "Worker jalankan hermes/codex/shell di cwd exact. Live progress lewat progress buffer → worker log. Result guarded ke review; diff, status, commit, dan commit_push untuk workspace node-agent berjalan lewat channel worker, sedangkan task SSH legacy tetap memakai SSH langsung.",
  },
  {
    title: "R–Z · Retry, safety, proof",
    icon: CheckCircle2,
    body: "Review atau blocked comment otomatis requeue ke todo dan komentar terbaru masuk ke continuation prompt; task done tetap mention-gated. Retry timeout diberi sumber error, continuation timeout berulang diblokir, dan run silent/lost otomatis dilepas setelah 10 menit.",
  },
]

const chatSections = [
  {
    title: "A–K · Session and streaming",
    icon: MessageSquare,
    body: "Chat pakai session/room /chat/:sessionID dengan hermes_session_id durable. Composer kirim 202, run loading→running→done/error, SSE chat_run_event untuk tool_output dan invalidasi messages.",
  },
  {
    title: "L–R · Context and identity",
    icon: Terminal,
    body: "Context dirakit dari profile/model/workspace + session messages + memory/skills. Resume key selalu kirim ke daemon/CLI, persist kembali dari completed. Remote workspace tetap via node-agent exact path.",
  },
  {
    title: "S–Z · Stop, failure, boundary",
    icon: XCircle,
    body: "Stop cancel run terminal, late output tidak boleh balikkan state. Chat tidak pakai Kanban dispatcher/review gate. Page history chat dan board tetap terpisah.",
  },
]

const kanbanMatrix = [
  ["hermes", "hermes chat -q", "CodeGraph + prerequisites"],
  ["codex", "codex exec --full-auto", "CodeGraph + prerequisites"],
  ["shell", "bash -lc", "RTK only; no AI preflight"],
  ["auto", "Hermes first; fallback", "Resolved executor decides"],
]

const chatMatrix = [
  ["loading", "run created", "SSE + streamBuffer"],
  ["running", "hermes process/daemon", "elapsed + Stop"],
  ["done", "assistant message", "footer model · HH:MM"],
  ["error/cancelled", "terminal failure", "retry explicit"],
]

export default function KnowledgePage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] p-4 text-[var(--color-ink)] md:p-6">
      <div className="mx-auto w-full max-w-6xl">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">System Knowledge</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Execution Knowledge</h1>
          <p className="mt-1 max-w-3xl text-xs text-[var(--color-ink-3)]">Kanban board flow dan Chat flow terpisah. Kanban untuk tracked task execution, Chat untuk direct agent conversation.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <a href="#kanban" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">kanban-board-flow.md</a>
            <a href="#chat" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">chat-flow.md</a>
          </div>
        </header>

        <section id="kanban" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><Workflow className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Kanban Board Flow — A sampai Z</h2></div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">Intent → board/task → validate → exact workspace → dispatcher → node-agent → executor → live progress → result → diff/provenance review → approve.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>Kanban UI → Create task</div><div className="pl-4">↓ validate profile/workspace/executor</div><div className="pl-4">↓ dispatcher claims todo/ready → running</div><div className="pl-4">↓ registered remote workspace → node-agent</div><div className="pl-4">↓ hermes | codex | shell + CodeGraph</div><div className="pl-4">↓ progress buffer → worker log + task events</div><div className="pl-4">↓ review diff + provenance → commit / commit_push → done</div><div className="pl-4">↓ review/blocked comment → todo → running continuation</div><div className="pl-4">↓ silent/lost run ≥10m → automatic todo release</div>
          </div>
        </section>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {kanbanSections.map(({ title, icon: Icon, body }) => (
            <section key={title} className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
              <div className="flex items-center gap-2"><Icon className="size-4 text-[var(--color-accent)]" /><h2 className="text-xs font-semibold">{title}</h2></div>
              <p className="mt-2 text-xs leading-5 text-[var(--color-ink-3)]">{body}</p>
            </section>
          ))}
        </div>

        <section className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <h2 className="text-sm font-semibold">Kanban executor matrix</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Mode</th><th className="pb-2">Process</th><th className="pb-2">Preflight</th></tr></thead><tbody>{kanbanMatrix.map(([mode, process, preflight]) => <tr key={mode} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-accent)]">{mode}</td><td className="py-2 font-mono text-[var(--color-ink-2)]">{process}</td><td className="py-2 text-[var(--color-ink-3)]">{preflight}</td></tr>)}</tbody></table></div>
        </section>

        <section id="chat" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><MessageSquare className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Chat Flow — A sampai Z</h2></div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">Direct chat ke agent (hermes-only saat ini) dengan room/session, bukan board task. Tidak lewat dispatcher Kanban.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>/chat/:sessionID → session + profile/model/workspace</div><div className="pl-4">↓ POST message → run loading</div><div className="pl-4">↓ validate → fast-path | daemon → CLI fallback | remote node-agent</div><div className="pl-4">↓ SSE chat_run_event → progressive rendering</div><div className="pl-4">↓ persist assistant message + hermes_session_id → resume next turn</div>
          </div>
        </section>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {chatSections.map(({ title, icon: Icon, body }) => (
            <section key={title} className="decorative-card rounded-xl border border-[var(--color-line)] p-4">
              <div className="flex items-center gap-2"><Icon className="size-4 text-[var(--color-accent)]" /><h2 className="text-xs font-semibold">{title}</h2></div>
              <p className="mt-2 text-xs leading-5 text-[var(--color-ink-3)]">{body}</p>
            </section>
          ))}
        </div>

        <section className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <h2 className="text-sm font-semibold">Chat run matrix</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">State</th><th className="pb-2">What</th><th className="pb-2">UI</th></tr></thead><tbody>{chatMatrix.map(([state, what, ui]) => <tr key={state} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-accent)]">{state}</td><td className="py-2 font-mono text-[var(--color-ink-2)]">{what}</td><td className="py-2 text-[var(--color-ink-3)]">{ui}</td></tr>)}</tbody></table></div>
        </section>

        <section className="mt-3 grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><KeyRound className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Boundary penting</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-[var(--color-ink-3)]">
              <li>Chat tidak pakai dispatcher/board claim/review gate.</li>
              <li>Kanban tidak pakai chat session sebagai task state.</li>
              <li>Remote path fail-closed; register exact workspace dulu. Registered remotes persist as node-agent transport.</li>
              <li>Node-agent job timeout default 10m; dispatcher wait = worker timeout + 2m.</li>
              <li>Review panel shows CodeGraph status and provenance without SSHing to the worker.</li>
              <li>Proof executor dari provenance, bukan dari teks output.</li>
            </ul>
          </section>
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><BookOpen className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Full reference</h2></div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--color-ink-3)]">
              <li><span className="text-[var(--color-accent)]">docs/features/kanban-board-flow.md</span> — Kanban A–Z</li>
              <li><span className="text-[var(--color-accent)]">docs/features/chat-flow.md</span> — Chat A–Z</li>
              <li><span className="text-[var(--color-accent)]">docs/features/chat-flow-architecture.md</span> — Current chat internals</li>
              <li><span className="text-[var(--color-accent)]">docs/execution-flow.md</span> — Legacy execution flow</li>
            </ul>
          </section>
        </section>
      </div>
    </div>
  )
}
