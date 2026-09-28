import { BookOpen, BrainCircuit, CheckCircle2, Command, Fingerprint, GitBranch, KeyRound, MessageSquare, Terminal, Workflow, XCircle } from "lucide-react"

const kanbanSections = [
  {
    title: "A–H · Intent and dispatch",
    icon: Workflow,
    body: "Board task stores intent/title/body, workspace exact, profile, executor, dan priority. Validation di API, bukan sekadar UI. Dispatcher claim todo/ready → running, route exact workspace via SSH/node-agent, lalu shell agent merencanakan dan menjalankan command bounded.",
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
  ["dsh", "dsh --profile headless --json", "health check + CodeGraph"],
  ["commandcode", "cmd -p --yolo --output-format json", "binary probe"],
  ["omp", "omp -p --auto-approve --mode json", "binary probe"],
  ["shell", "planner → bash -lc", "read-only plan + bounded iterations"],
  ["auto", "Hermes first; fallback", "Resolved executor decides"],
]

const dshContinuity = [
  ["binding", "harness_bindings per card", "workspace + session + cursors"],
  ["first run", "no --session-id sent", "DSH creates; worker returns real id"],
  ["continuation", "--session-id <bound>", "same session, never cold"],
  ["cursor", "last_turn_seq advances", "stale result rejected"],
  ["comments", "last_comment_id advances on success", "failed turn replays comment"],
  ["worker home", "isolated DSH_HOME", "keeps off dsh web flock"],
]

const chatMatrix = [
  ["loading", "run created", "SSE + streamBuffer"],
  ["running", "hermes process/daemon", "elapsed + Stop"],
  ["done", "assistant message", "footer model · HH:MM"],
  ["error/cancelled", "terminal failure", "retry explicit"],
]

const commandCodeContinuity = [
  ["harness_kind", "commandcode", "binds one card to one Command Code session"],
  ["session id", "switchyard-commandcode-<hash>", "deterministic, minted by Switchyard"],
  ["first run", "empty commandcode_session_id", "worker mints the real id, returns it"],
  ["continuation", "--resume <bound id>", "same session, never cold"],
  ["stale guard", "current_run_id ownership fence", "late result for an old run is discarded"],
  ["worker home", "none required", "headless sessions stay out of /resume by design"],
]

const continuityFences = [
  ["workspace identity", "required", "not required", "not required", "only dsh keys its session store by workspace"],
  ["turn cursor", "last_turn_seq checked", "not returned", "not returned", "commandcode and omp have no stale-turn rejection"],
  ["session id on success", "required", "required", "required", "mismatch → identity_rejected, card blocked"],
  ["session id on failure", "required", "may be omitted", "may be omitted", "a failed first run legitimately has none"],
  ["home isolation", "isolated DSH_HOME", "none", "none", "no daemon write-handle contention"],
  ["stale-result guard", "turn seq + run fence", "run fence only", "run fence only", "current_run_id drops a superseded result"],
]

const ompContinuity = [
  ["harness_kind", "omp", "binds one card to one omp session"],
  ["session id", "switchyard-omp-<hash>", "deterministic, minted by Switchyard"],
  ["first run", "empty omp_session_id", "worker mints the real id, returns it"],
  ["continuation", "--resume <bound id>", "same session, never cold"],
  ["stale guard", "current_run_id ownership fence", "late result for an old run is discarded"],
  ["binary", "omp / omp.exe", "no alias; probed directly on each host"],
]

const commandCodeIdentity = [
  ["binding", "harness_bindings row", "workspace + session + status"],
  ["first run", "session id empty", "DSH/CommandCode creates; worker returns real id"],
  ["continuation", "session id bound", "same session, never cold start"],
  ["cursor", "last_turn_seq advances", "stale result rejected (dsh only)"],
  ["comments", "last_comment_id advances on success", "failed turn replays the comment"],
  ["run fence", "current_run_id", "late result for a superseded run is dropped"],
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
            <a href="#dsh" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">dsh-harness.md</a>
            <a href="#commandcode" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">commandcode-executor.md</a>
            <a href="#omp" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">omp-executor.md</a>
            <a href="#chat" className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[var(--color-accent)]">chat-flow.md</a>
          </div>
        </header>

        <section id="kanban" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><Workflow className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Kanban Board Flow — A sampai Z</h2></div>
          <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">Intent → board/task → validate → exact workspace → dispatcher → node-agent → planner → shell+RTK → bounded decision loop → diff/provenance review → approve.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>Kanban UI → Create task</div><div className="pl-4">↓ validate profile/workspace/executor</div><div className="pl-4">↓ dispatcher claims todo/ready → running</div><div className="pl-4">↓ registered remote workspace → node-agent</div><div className="pl-4">↓ hermes | codex | dsh | commandcode | shell</div><div className="pl-4">↓ read-only plan → RTK shell → worker output</div><div className="pl-4">↓ bounded retry / complete / blocked decision</div><div className="pl-4">↓ review diff + provenance → commit / commit_push → done</div><div className="pl-4">↓ review/blocked comment → todo → running continuation</div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[var(--color-ink-3)]">Executor <span className="font-mono text-[var(--color-accent)]">dsh</span> dan <span className="font-mono text-[var(--color-accent)]">commandcode</span> punya satu lapisan tambahan yang executor lain tidak punya: <strong className="font-medium text-[var(--color-ink-2)]">session continuity</strong>. Keduanya mengikat satu card ke satu session lewat <span className="font-mono">harness_bindings</span>, jadi round review ke-N melanjutkan session yang sama alih-alih cold start. Executor lain stateless: setiap run adalah obrolan baru.</p>
        </section>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><BrainCircuit className="size-4 text-[var(--color-accent)]" /><h3 className="text-xs font-semibold">dsh — DeepSeek Harness</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-3)]">Menjalankan <span className="font-mono">dsh --profile headless --json</span> di workspace host dengan <span className="font-mono">DSH_HOME</span> terisolasi, supaya lock session tidak bentrok dengan daemon <span className="font-mono">dsh web</span>.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-[var(--color-ink-3)]">
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Session store di-key by <span className="font-mono">workspace_id</span>, jadi workspace wajib ada sebelum resume.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Melaporkan <span className="font-mono">last_turn_seq</span> monotonik, jadi turn basi bisa ditolak.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Result wajib mengembalikan <span className="font-mono">dsh_workspace_id</span>, <span className="font-mono">dsh_session_id</span>, dan <span className="font-mono">last_turn_seq</span> tertinggi yang dikonsumsi.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Session yang selesai dipublish balik ke <span className="font-mono">~/.dsh</span> supaya bisa dilisting di UI.</span></li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><Command className="size-4 text-[var(--color-accent)]" /><h3 className="text-xs font-semibold">commandcode — Command Code CLI</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-3)]">Menjalankan <span className="font-mono">cmd -p --yolo --skip-onboarding --output-format json [--resume &lt;id&gt;]</span> di workspace host. Binary <span className="font-mono">cmdc</span> di Windows, <span className="font-mono">command-code</span> sebagai alias lain.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-[var(--color-ink-3)]">
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Tidak punya workspace identity, jadi resume tidak butuh workspace id.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Frame <span className="font-mono">result</span> membawa <span className="font-mono">sessionId</span>, <span className="font-mono">finalText</span>, dan <span className="font-mono">usage</span>, tapi tidak ada turn cursor.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Karena itu <strong className="font-medium text-[var(--color-ink-2)]">tidak ada stale-turn rejection</strong>; satu-satunya pagar adalah <span className="font-mono">current_run_id</span>.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Tidak butuh <span className="font-mono">DSH_HOME</span>: session headless tersembunyi dari picker <span className="font-mono">/resume</span> secara design.</span></li>
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><Terminal className="size-4 text-[var(--color-accent)]" /><h3 className="text-xs font-semibold">omp — oh-my-pi coding agent</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-3)]">Menjalankan <span className="font-mono">omp -p --auto-approve --mode json [--resume &lt;id&gt;]</span> di workspace host. Binary <span className="font-mono">omp</span>, atau <span className="font-mono">omp.exe</span> di Windows.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-[var(--color-ink-3)]">
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Resume by session-id prefix, jadi tidak butuh workspace identity.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Frame <span className="font-mono">result</span> membawa <span className="font-mono">sessionId</span> dan <span className="font-mono">finalText</span>, tanpa turn cursor.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span>Karena itu <strong className="font-medium text-[var(--color-ink-2)]">tidak ada stale-turn rejection</strong>; satu-satunya pagar adalah <span className="font-mono">current_run_id</span>.</span></li>
              <li className="flex gap-1.5"><span className="text-[var(--color-accent)]">→</span><span><span className="font-mono">--auto-approve</span> mengizinkan edit dan shell tanpa prompt; hanya untuk node tepercaya.</span></li>
            </ul>
          </section>
        </div>

        <section className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <h2 className="text-sm font-semibold">Continuity fence matrix</h2>
          <p className="mt-1 text-[11px] text-[var(--color-ink-3)]">Ketiganya memakai tabel binding dan resolver yang sama; yang membedakan hanya <span className="font-mono">harness_kind</span> dan tiga pemeriksaan di bawah.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Fence</th><th className="pb-2">dsh</th><th className="pb-2">commandcode</th><th className="pb-2">omp</th><th className="pb-2">Effect</th></tr></thead><tbody>{continuityFences.map(([fence, dsh, cc, ompv, effect]) => <tr key={fence} className="border-t border-[var(--color-line)]"><td className="py-2 text-[var(--color-ink-2)]">{fence}</td><td className="py-2 font-mono text-[var(--color-ink-3)]">{dsh}</td><td className="py-2 font-mono text-[var(--color-accent)]">{cc}</td><td className="py-2 font-mono text-[var(--color-accent)]">{ompv}</td><td className="py-2 text-[var(--color-ink-3)]">{effect}</td></tr>)}</tbody></table></div>
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

        <section id="dsh" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><BrainCircuit className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">DSH Harness — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-[var(--color-ink-3)]">Executor DeepSeek Harness memakai satu session per card supaya setiap round review lanjut di session yang sama, bukan cold start. Switchyard menyimpan binding, worker menjaga identity, dan hasil yang berbeda dari yang di-dispatch ditolak.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>card executor dsh → ResolveHarnessBinding</div><div className="pl-4">↓ first run: session_id kosong → DSH create → worker return id</div><div className="pl-4">↓ dispatch: workspace_id + session_id + last_turn_seq + last_comment_id + run_id</div><div className="pl-4">↓ worker: --session-id bound, isolated DSH_HOME, no cold session</div><div className="pl-4">↓ result identity divalidasi (session/workspace/cursor)</div><div className="pl-4">↓ binding diupdate → review | todo (comment baru) | blocked</div><div className="pl-4">↓ comment + reopen-review → continuation round berikutnya</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{dshContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-accent)]">{aspect}</td><td className="py-2 font-mono text-[var(--color-ink-2)]">{behaviour}</td><td className="py-2 text-[var(--color-ink-3)]">{note}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-[11px] leading-5 text-[var(--color-ink-3)]">Loop card: kirim comment lalu <span className="font-mono text-[var(--color-accent)]">reopen-review</span>. Comment biasa tidak membuka kembali card yang sudah <span className="font-mono">review</span>.</p>
        </section>

        <section id="commandcode" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><Command className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Command Code Executor — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-[var(--color-ink-3)]">Executor <span className="font-mono text-[var(--color-accent)]">commandcode</span> memakai mechanism harness yang sama dengan DSH, dengan satu perbedaan penting: Command Code tidak punya workspace identity, jadi session bisa di-resume tanpa itu. Binding disimpan di <span className="font-mono">harness_bindings</span> dengan <span className="font-mono">harness_kind=commandcode</span>, dan run pertama mengirim session id kosong supaya worker mint id asli.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>card executor commandcode → HarnessContinuityEnabled</div><div className="pl-4">↓ resolve binding: session id empty (first run) → worker mints</div><div className="pl-4">↓ POST /api/dispatch · harness_kind=commandcode · commandcode_session_id</div><div className="pl-4">↓ worker: cmd -p --yolo --skip-onboarding --output-format json [--resume &lt;id&gt;]</div><div className="pl-4">↓ result frame: sessionId + finalText + usage</div><div className="pl-4">↓ identity check: session mismatch ditolak → commandcode_identity_rejected</div><div className="pl-4">↓ binding diupdate → review | todo (comment baru) | blocked</div><div className="pl-4">↓ review comment → todo → running → --resume session yang sama</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{commandCodeContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-accent)]">{aspect}</td><td className="py-2 font-mono text-[var(--color-ink-2)]">{behaviour}</td><td className="py-2 text-[var(--color-ink-3)]">{note}</td></tr>)}</tbody></table></div>
        </section>

        <section id="omp" className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><Terminal className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">omp Executor — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-[var(--color-ink-3)]">Executor <span className="font-mono text-[var(--color-accent)]">omp</span> memakai mechanism harness yang sama dengan DSH dan Command Code. omp me-<span className="font-mono">resume</span> session berdasarkan id prefix, bukan workspace, jadi tidak butuh workspace identity. Binding disimpan di <span className="font-mono">harness_bindings</span> dengan <span className="font-mono">harness_kind=omp</span>.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-[var(--color-ink-2)]">
            <div>card executor omp → HarnessContinuityEnabled</div><div className="pl-4">↓ resolve binding: session id empty (first run) → worker mints</div><div className="pl-4">↓ POST /api/dispatch · harness_kind=omp · omp_session_id</div><div className="pl-4">↓ worker: omp -p --auto-approve --mode json [--resume &lt;id&gt;]</div><div className="pl-4">↓ result frame: sessionId + finalText</div><div className="pl-4">↓ identity check: session mismatch ditolak → omp_identity_rejected</div><div className="pl-4">↓ binding diupdate → review | todo (comment baru) | blocked</div><div className="pl-4">↓ review comment → todo → running → --resume session yang sama</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{ompContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-accent)]">{aspect}</td><td className="py-2 font-mono text-[var(--color-ink-2)]">{behaviour}</td><td className="py-2 text-[var(--color-ink-3)]">{note}</td></tr>)}</tbody></table></div>
        </section>

        <section className="mt-3 grid gap-3 md:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><Fingerprint className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Identity fence</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-[var(--color-ink-3)]">
              <li>Session id hasil run harus sama dengan yang di-dispatch. Beda → <span className="font-mono">commandcode_identity_rejected</span> dan card jadi <span className="font-mono">blocked</span>, bukan retry.</li>
              <li>Run gagal sebelum session resolve boleh tanpa <span className="font-mono">sessionId</span>, dan itu diterima.</li>
              <li>Card yang ter-bound ke workspace lain ditolak saat resolve, bukan saat run.</li>
              <li>Result run lama yang arrive setelah run baru dijatuhkan lewat <span className="font-mono">current_run_id</span> fence.</li>
              <li>Comment cursor naik hanya pada sukses; turn gagal memutar ulang comment yang sama.</li>
            </ul>
          </section>
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><Terminal className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Worker prerequisites</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-[var(--color-ink-3)]">
              <li>Binary <span className="font-mono">cmd</span>, <span className="font-mono">cmdc</span> (Windows), atau <span className="font-mono">command-code</span> di worker host.</li>
              <li>Version dilaporkan lewat heartbeat <span className="font-mono">versions.commandcode</span>; worker lama tidak muncul di daftar executor.</li>
              <li>CodeGraph dipakai sebagai preflight untuk <span className="font-mono">commandcode</span>, sama seperti hermes/codex.</li>
              <li>Build tanpa <span className="font-mono">--output-format json</span> fallback ke <span className="font-mono">text</span> sekali per binary, dan run itu tidak bisa membuktikan continuity.</li>
              <li><span className="font-mono">--yolo</span> mengizinkan worker edit file dan jalankan shell. Hanya untuk node tepercaya.</li>
            </ul>
          </section>
        </section>

        <section className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
          <div className="flex items-center gap-2"><KeyRound className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Retry policy</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-[var(--color-ink-3)]">Failure dengan prefix <span className="font-mono text-[var(--color-accent)]">commandcode_session_missing</span> bersifat deterministik dan tidak di-retry — langsung <span className="font-mono">blocked</span>. Failure transient lain masih di-retry maksimal 3 kali sebelum <span className="font-mono">blocked</span>.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]"><tr><th className="pb-2">Signal</th><th className="pb-2">Retry?</th><th className="pb-2">Final status</th></tr></thead><tbody>{commandCodeIdentity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-[var(--color-line)]"><td className="py-2 font-mono text-[var(--color-ink-2)]">{aspect}</td><td className="py-2 font-mono text-[var(--color-accent)]">{behaviour}</td><td className="py-2 text-[var(--color-ink-3)]">{note}</td></tr>)}</tbody></table></div>
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
              <li>Card <span className="font-mono">dsh</span> terikat ke satu workspace dan satu session; pindah workspace atau ganti session ditolak, bukan di-retry.</li>
            </ul>
          </section>
          <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4">
            <div className="flex items-center gap-2"><BookOpen className="size-4 text-[var(--color-accent)]" /><h2 className="text-sm font-semibold">Full reference</h2></div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--color-ink-3)]">
              <li><span className="text-[var(--color-accent)]">docs/features/kanban-board-flow.md</span> — Kanban A–Z</li>
              <li><span className="text-[var(--color-accent)]">docs/features/dsh-harness.md</span> — DSH session continuity</li>
              <li><span className="text-[var(--color-accent)]">docs/features/commandcode-executor.md</span> — CommandCode execution</li>
              <li><span className="text-[var(--color-accent)]">docs/features/omp-executor.md</span> — omp execution</li>
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
