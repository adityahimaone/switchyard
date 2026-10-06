import { BookOpen, BrainCircuit, CheckCircle2, Command, Fingerprint, GitBranch, KeyRound, MessageSquare, Terminal, Workflow, XCircle } from "lucide-react"
import { PageHeader } from "@/components/app/page-header"
import { CollectionBody } from "@/components/app/collection"
import { Integration, IntegrationCard } from "@/components/ui/integration-card"

const kanbanSections = [
  {
    title: "A–H · Intent and dispatch",
    icon: Workflow,
    body: "A board task stores the intent, title and body, plus the exact workspace, profile, executor and priority. Validation happens in the API, not just the UI. The dispatcher claims a todo/ready task into running, routes it to the exact workspace over SSH/node-agent, and the shell agent then plans and runs bounded commands.",
  },
  {
    title: "I–Q · Execution to review",
    icon: GitBranch,
    body: "The worker runs hermes/codex/shell in the exact working directory. Live progress flows through the progress buffer into the worker log. Results are guarded into review: diff, status, commit and commit_push travel over the worker channel for node-agent workspaces, while legacy SSH tasks still use SSH directly.",
  },
  {
    title: "R–Z · Retry, safety, proof",
    icon: CheckCircle2,
    body: "A review or blocked comment automatically requeues the task to todo and the newest comment enters the continuation prompt; done tasks stay mention-gated. A timeout retry is given the error source, a repeated continuation timeout is blocked, and a silent or lost run is released automatically after 10 minutes.",
  },
]

const chatSections = [
  {
    title: "A–K · Session and streaming",
    icon: MessageSquare,
    body: "Chat uses a session/room at /chat/:sessionID with a durable hermes_session_id. The composer posts and returns 202, the run moves loading → running → done/error, and SSE chat_run_event carries tool_output and message invalidation.",
  },
  {
    title: "L–R · Context and identity",
    icon: Terminal,
    body: "Context is assembled from the profile/model/workspace, the session messages, and memory/skills. The resume key is always sent to the daemon or CLI and persisted back once completed. Remote workspaces still go through node-agent on the exact path.",
  },
  {
    title: "S–Z · Stop, failure, boundary",
    icon: XCircle,
    body: "Stop cancels the terminal run, and late output must never flip the state back. Chat does not use the Kanban dispatcher or review gate. The chat history page and the board stay separate.",
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
    <div className="min-h-0 flex-1 overflow-y-auto">
        <PageHeader
          title="Execution Knowledge"
          description="How work actually moves through Switchyard: the board flow, each executor harness, and the chat flow."
        >
          <div className="flex flex-wrap gap-2 text-[11px]">
            <a href="#kanban" className="rounded-control border border-line bg-raised px-3 py-1 font-mono text-accent-text">kanban-board-flow.md</a>
            <a href="#dsh" className="rounded-control border border-line bg-raised px-3 py-1 font-mono text-accent-text">dsh-harness.md</a>
            <a href="#commandcode" className="rounded-control border border-line bg-raised px-3 py-1 font-mono text-accent-text">commandcode-executor.md</a>
            <a href="#omp" className="rounded-control border border-line bg-raised px-3 py-1 font-mono text-accent-text">omp-executor.md</a>
            <a href="#chat" className="rounded-control border border-line bg-raised px-3 py-1 font-mono text-accent-text">chat-flow.md</a>
          </div>
        </PageHeader>

        <CollectionBody className="flex flex-col gap-3 pt-5 pb-6">

        <IntegrationCard
          visual={<Integration />}
          title="Switchyard Integrations"
          description="CodeGraph feeds every executor its context, pen.dev designs the canvas before a line of code, e2e verifies the flow — and hermes, codex, deepseek, omp and commandcode carry each card from intent to done over the node agent and git."
          url="#full-reference"
          ctaLabel="Full reference"
        />

        <section id="kanban" className="glass-card p-4">
          <div className="flex items-center gap-2"><Workflow className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Kanban Board Flow — end to end</h2></div>
          <p className="mt-1 text-[11px] text-ink-3">Intent → board/task → validate → exact workspace → dispatcher → node-agent → planner → shell+RTK → bounded decision loop → diff/provenance review → approve.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-ink-2">
            <div>Kanban UI → Create task</div><div className="pl-4">↓ validate profile/workspace/executor</div><div className="pl-4">↓ dispatcher claims todo/ready → running</div><div className="pl-4">↓ registered remote workspace → node-agent</div><div className="pl-4">↓ hermes | codex | dsh | commandcode | shell</div><div className="pl-4">↓ read-only plan → RTK shell → worker output</div><div className="pl-4">↓ bounded retry / complete / blocked decision</div><div className="pl-4">↓ review diff + provenance → commit / commit_push → done</div><div className="pl-4">↓ review/blocked comment → todo → running continuation</div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-ink-3">The <span className="font-mono text-accent-text">dsh</span> and <span className="font-mono text-accent-text">commandcode</span> executors have one extra layer the others lack: <strong className="font-medium text-ink-2">session continuity</strong>. Both bind one card to one session through <span className="font-mono">harness_bindings</span>, so the Nth review round continues in the same session rather than cold starting. The other executors are stateless: every run is a new conversation.</p>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><BrainCircuit className="size-4 text-accent-text" /><h3 className="text-xs font-semibold">dsh — DeepSeek Harness</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-ink-3">Runs <span className="font-mono">dsh --profile headless --json</span> in the host workspace with an isolated <span className="font-mono">DSH_HOME</span>, so the session lock does not collide with the <span className="font-mono">dsh web</span> daemon.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-ink-3">
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>The session store is keyed by <span className="font-mono">workspace_id</span>, so the workspace must exist before resuming.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>It reports a monotonic <span className="font-mono">last_turn_seq</span>, so a stale turn can be rejected.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>The result must return <span className="font-mono">dsh_workspace_id</span>, <span className="font-mono">dsh_session_id</span> and the highest <span className="font-mono">last_turn_seq</span> it consumed.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>Completed sessions are published back to <span className="font-mono">~/.dsh</span> so they can be listed in the UI.</span></li>
            </ul>
          </section>

          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><Command className="size-4 text-accent-text" /><h3 className="text-xs font-semibold">commandcode — Command Code CLI</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-ink-3">Runs <span className="font-mono">cmd -p --yolo --skip-onboarding --output-format json [--resume &lt;id&gt;]</span> in the host workspace. The binary is <span className="font-mono">cmdc</span> on Windows, with <span className="font-mono">command-code</span> as another alias.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-ink-3">
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>It has no workspace identity, so resuming does not need a workspace id.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>The <span className="font-mono">result</span> frame carries <span className="font-mono">sessionId</span>, <span className="font-mono">finalText</span> and <span className="font-mono">usage</span>, but there is no turn cursor.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>Because of that there is <strong className="font-medium text-ink-2">no stale-turn rejection</strong>; the only fence is <span className="font-mono">current_run_id</span>.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>It needs no <span className="font-mono">DSH_HOME</span>: headless sessions stay hidden from the <span className="font-mono">/resume</span> picker by design.</span></li>
            </ul>
          </section>

          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><Terminal className="size-4 text-accent-text" /><h3 className="text-xs font-semibold">omp — oh-my-pi coding agent</h3></div>
            <p className="mt-2 text-[11px] leading-5 text-ink-3">Runs <span className="font-mono">omp -p --auto-approve --mode json [--resume &lt;id&gt;]</span> in the host workspace. The binary is <span className="font-mono">omp</span>, or <span className="font-mono">omp.exe</span> on Windows.</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-ink-3">
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>It resumes by session-id prefix, so it needs no workspace identity.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>The <span className="font-mono">result</span> frame carries <span className="font-mono">sessionId</span> and <span className="font-mono">finalText</span>, with no turn cursor.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span>Because of that there is <strong className="font-medium text-ink-2">no stale-turn rejection</strong>; the only fence is <span className="font-mono">current_run_id</span>.</span></li>
              <li className="flex gap-1.5"><span className="text-accent-text">→</span><span><span className="font-mono">--auto-approve</span> permits edits and shell without prompting; trusted nodes only.</span></li>
            </ul>
          </section>
        </div>

        <section className="mt-3 glass-card p-4">
          <h2 className="text-sm font-semibold">Continuity fence matrix</h2>
          <p className="mt-1 text-[11px] text-ink-3">All three use the same binding table and resolver; only <span className="font-mono">harness_kind</span> and the three checks below differ.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Fence</th><th className="pb-2">dsh</th><th className="pb-2">commandcode</th><th className="pb-2">omp</th><th className="pb-2">Effect</th></tr></thead><tbody>{continuityFences.map(([fence, dsh, cc, ompv, effect]) => <tr key={fence} className="border-t border-line"><td className="py-2 text-ink-2">{fence}</td><td className="py-2 font-mono text-ink-3">{dsh}</td><td className="py-2 font-mono text-accent-text">{cc}</td><td className="py-2 font-mono text-accent-text">{ompv}</td><td className="py-2 text-ink-3">{effect}</td></tr>)}</tbody></table></div>
        </section>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {kanbanSections.map(({ title, icon: Icon, body }) => (
            <section key={title} className="glass-card p-4">
              <div className="flex items-center gap-2"><Icon className="size-4 text-accent-text" /><h2 className="text-xs font-semibold">{title}</h2></div>
              <p className="mt-2 text-xs leading-5 text-ink-3">{body}</p>
            </section>
          ))}
        </div>

        <section className="mt-3 glass-card p-4">
          <h2 className="text-sm font-semibold">Kanban executor matrix</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Mode</th><th className="pb-2">Process</th><th className="pb-2">Preflight</th></tr></thead><tbody>{kanbanMatrix.map(([mode, process, preflight]) => <tr key={mode} className="border-t border-line"><td className="py-2 font-mono text-accent-text">{mode}</td><td className="py-2 font-mono text-ink-2">{process}</td><td className="py-2 text-ink-3">{preflight}</td></tr>)}</tbody></table></div>
        </section>

        <section id="chat" className="mt-6 glass-card p-4">
          <div className="flex items-center gap-2"><MessageSquare className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Chat Flow — end to end</h2></div>
          <p className="mt-1 text-[11px] text-ink-3">Direct chat with an agent (hermes-only at the moment) using a room/session rather than a board task. It does not go through the Kanban dispatcher.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-ink-2">
            <div>/chat/:sessionID → session + profile/model/workspace</div><div className="pl-4">↓ POST message → run loading</div><div className="pl-4">↓ validate → fast-path | daemon → CLI fallback | remote node-agent</div><div className="pl-4">↓ SSE chat_run_event → progressive rendering</div><div className="pl-4">↓ persist assistant message + hermes_session_id → resume next turn</div>
          </div>
        </section>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {chatSections.map(({ title, icon: Icon, body }) => (
            <section key={title} className="glass-card p-4">
              <div className="flex items-center gap-2"><Icon className="size-4 text-accent-text" /><h2 className="text-xs font-semibold">{title}</h2></div>
              <p className="mt-2 text-xs leading-5 text-ink-3">{body}</p>
            </section>
          ))}
        </div>

        <section className="mt-3 glass-card p-4">
          <h2 className="text-sm font-semibold">Chat run matrix</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">State</th><th className="pb-2">What</th><th className="pb-2">UI</th></tr></thead><tbody>{chatMatrix.map(([state, what, ui]) => <tr key={state} className="border-t border-line"><td className="py-2 font-mono text-accent-text">{state}</td><td className="py-2 font-mono text-ink-2">{what}</td><td className="py-2 text-ink-3">{ui}</td></tr>)}</tbody></table></div>
        </section>

        <section id="dsh" className="mt-6 glass-card p-4">
          <div className="flex items-center gap-2"><BrainCircuit className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">DSH Harness — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-ink-3">The DeepSeek Harness executor uses one session per card, so each review round continues in the same session instead of cold starting. Switchyard stores the binding, the worker preserves identity, and a result that does not match what was dispatched is rejected.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-ink-2">
            <div>card executor dsh → ResolveHarnessBinding</div><div className="pl-4">↓ first run: session_id empty → DSH creates → worker returns the id</div><div className="pl-4">↓ dispatch: workspace_id + session_id + last_turn_seq + last_comment_id + run_id</div><div className="pl-4">↓ worker: --session-id bound, isolated DSH_HOME, never a cold session</div><div className="pl-4">↓ result identity validated (session/workspace/cursor)</div><div className="pl-4">↓ binding updated → review | todo (new comment) | blocked</div><div className="pl-4">↓ comment + reopen-review → the next continuation round</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{dshContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-line"><td className="py-2 font-mono text-accent-text">{aspect}</td><td className="py-2 font-mono text-ink-2">{behaviour}</td><td className="py-2 text-ink-3">{note}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-[11px] leading-5 text-ink-3">Card loop: send a comment, then <span className="font-mono text-accent-text">reopen-review</span>. An ordinary comment does not reopen a card that is already in <span className="font-mono">review</span>.</p>
        </section>

        <section id="commandcode" className="mt-6 glass-card p-4">
          <div className="flex items-center gap-2"><Command className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Command Code Executor — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-ink-3">The <span className="font-mono text-accent-text">commandcode</span> executor uses the same harness mechanism as DSH, with one important difference: Command Code has no workspace identity, so a session can be resumed without one. The binding is stored in <span className="font-mono">harness_bindings</span> with <span className="font-mono">harness_kind=commandcode</span>, and the first run sends an empty session id so the worker mints the real one.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-ink-2">
            <div>card executor commandcode → HarnessContinuityEnabled</div><div className="pl-4">↓ resolve binding: session id empty (first run) → worker mints</div><div className="pl-4">↓ POST /api/dispatch · harness_kind=commandcode · commandcode_session_id</div><div className="pl-4">↓ worker: cmd -p --yolo --skip-onboarding --output-format json [--resume &lt;id&gt;]</div><div className="pl-4">↓ result frame: sessionId + finalText + usage</div><div className="pl-4">↓ identity check: session mismatch rejected → commandcode_identity_rejected</div><div className="pl-4">↓ binding updated → review | todo (new comment) | blocked</div><div className="pl-4">↓ review comment → todo → running → --resume the same session</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{commandCodeContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-line"><td className="py-2 font-mono text-accent-text">{aspect}</td><td className="py-2 font-mono text-ink-2">{behaviour}</td><td className="py-2 text-ink-3">{note}</td></tr>)}</tbody></table></div>
        </section>

        <section id="omp" className="mt-6 glass-card p-4">
          <div className="flex items-center gap-2"><Terminal className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">omp Executor — session continuity</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-ink-3">The <span className="font-mono text-accent-text">omp</span> executor uses the same harness mechanism as DSH and Command Code. omp re<span className="font-mono">sumes</span> a session by id prefix rather than by workspace, so it needs no workspace identity. The binding is stored in <span className="font-mono">harness_bindings</span> with <span className="font-mono">harness_kind=omp</span>.</p>
          <div className="mt-3 font-mono text-[11px] leading-6 text-ink-2">
            <div>card executor omp → HarnessContinuityEnabled</div><div className="pl-4">↓ resolve binding: session id empty (first run) → worker mints</div><div className="pl-4">↓ POST /api/dispatch · harness_kind=omp · omp_session_id</div><div className="pl-4">↓ worker: omp -p --auto-approve --mode json [--resume &lt;id&gt;]</div><div className="pl-4">↓ result frame: sessionId + finalText</div><div className="pl-4">↓ identity check: session mismatch rejected → omp_identity_rejected</div><div className="pl-4">↓ binding updated → review | todo (new comment) | blocked</div><div className="pl-4">↓ review comment → todo → running → --resume the same session</div>
          </div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Aspect</th><th className="pb-2">Behaviour</th><th className="pb-2">Note</th></tr></thead><tbody>{ompContinuity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-line"><td className="py-2 font-mono text-accent-text">{aspect}</td><td className="py-2 font-mono text-ink-2">{behaviour}</td><td className="py-2 text-ink-3">{note}</td></tr>)}</tbody></table></div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><Fingerprint className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Identity fence</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-ink-3">
              <li>The session id returned by a run must match the one that was dispatched. A mismatch → <span className="font-mono">commandcode_identity_rejected</span> and the card becomes <span className="font-mono">blocked</span>, not a retry.</li>
              <li>A run that fails before the session resolves may omit <span className="font-mono">sessionId</span>, and that is accepted.</li>
              <li>A card bound to a different workspace is rejected at resolve time, not at run time.</li>
              <li>A late result from an old run is dropped by the <span className="font-mono">current_run_id</span> fence.</li>
              <li>The comment cursor only advances on success; a failed turn replays the same comment.</li>
            </ul>
          </section>
          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><Terminal className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Worker prerequisites</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-ink-3">
              <li>The binary <span className="font-mono">cmd</span>, <span className="font-mono">cmdc</span> (Windows), or <span className="font-mono">command-code</span> on the worker host.</li>
              <li>The version is reported through the <span className="font-mono">versions.commandcode</span> heartbeat; an old worker does not appear in the executor list.</li>
              <li>CodeGraph is used as the preflight for <span className="font-mono">commandcode</span>, the same as for hermes/codex.</li>
              <li>A build without <span className="font-mono">--output-format json</span> falls back to <span className="font-mono">text</span> once per binary, and such a run cannot prove continuity.</li>
              <li><span className="font-mono">--yolo</span> lets the worker edit files and run shell. Trusted nodes only.</li>
            </ul>
          </section>
        </section>

        <section className="mt-3 glass-card p-4">
          <div className="flex items-center gap-2"><KeyRound className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Retry policy</h2></div>
          <p className="mt-1 max-w-3xl text-[11px] text-ink-3">A failure with the prefix <span className="font-mono text-accent-text">commandcode_session_missing</span> is deterministic and is not retried — it goes straight to <span className="font-mono">blocked</span>. Other transient failures are retried up to 3 times before <span className="font-mono">blocked</span>.</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-3"><tr><th className="pb-2">Signal</th><th className="pb-2">Retry?</th><th className="pb-2">Final status</th></tr></thead><tbody>{commandCodeIdentity.map(([aspect, behaviour, note]) => <tr key={aspect} className="border-t border-line"><td className="py-2 font-mono text-ink-2">{aspect}</td><td className="py-2 font-mono text-accent-text">{behaviour}</td><td className="py-2 text-ink-3">{note}</td></tr>)}</tbody></table></div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <section className="glass-card p-4">
            <div className="flex items-center gap-2"><KeyRound className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Important boundaries</h2></div>
            <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-ink-3">
              <li>Chat does not use the dispatcher, board claim or review gate.</li>
              <li>Kanban does not use a chat session as task state.</li>
              <li>The remote path is fail-closed; register the exact workspace first. Registered remotes persist as node-agent transport.</li>
              <li>Node-agent job timeout defaults to 10m; dispatcher wait = worker timeout + 2m.</li>
              <li>The review panel shows CodeGraph status and provenance without SSHing to the worker.</li>
              <li>Executor proof comes from provenance, not from output text.</li>
              <li>A <span className="font-mono">dsh</span> card is bound to one workspace and one session; changing workspace or session is rejected, not retried.</li>
            </ul>
          </section>
          <section id="full-reference" className="glass-card p-4">
            <div className="flex items-center gap-2"><BookOpen className="size-4 text-accent-text" /><h2 className="text-sm font-semibold">Full reference</h2></div>
            <ul className="mt-2 space-y-1 font-mono text-xs text-ink-3">
              <li><span className="text-accent-text">docs/features/kanban-board-flow.md</span> — Kanban A–Z</li>
              <li><span className="text-accent-text">docs/features/dsh-harness.md</span> — DSH session continuity</li>
              <li><span className="text-accent-text">docs/features/commandcode-executor.md</span> — CommandCode execution</li>
              <li><span className="text-accent-text">docs/features/omp-executor.md</span> — omp execution</li>
              <li><span className="text-accent-text">docs/features/chat-flow.md</span> — Chat A–Z</li>
              <li><span className="text-accent-text">docs/features/chat-flow-architecture.md</span> — Current chat internals</li>
              <li><span className="text-accent-text">docs/execution-flow.md</span> — Legacy execution flow</li>
            </ul>
          </section>
        </section>
        </CollectionBody>
    </div>
  )
}
