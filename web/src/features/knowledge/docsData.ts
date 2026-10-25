import type { LucideIcon } from "lucide-react"
import {
  BrainCircuit,
  Command,
  Compass,
  Layers,
  MessageSquare,
  Palette,
  ShieldAlert,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react"

export interface DocSection {
  id: string
  title: string
  content: string
  codeSnippet?: {
    language: string
    filename?: string
    code: string
  }
  callout?: {
    type: "note" | "tip" | "warning" | "craft"
    title: string
    body: string
  }
  table?: {
    headers: string[]
    rows: string[][]
  }
}

export interface DocItem {
  id: string
  slug: string
  title: string
  subtitle: string
  category: "Getting Started" | "Design & Prototyping" | "Core Workflows" | "Executor Harnesses" | "Continuity & Reference" | "Safety & Verification"
  icon: LucideIcon
  badge?: string
  readTime: string
  updatedAt: string
  summary: string
  sections: DocSection[]
}

export const DOCS: DocItem[] = [
  {
    id: "pen-dev-canvas",
    slug: "pen-dev-canvas",
    title: "pen.dev & Canvas Studio",
    subtitle: "Visual component prototyping in isolated git worktrees with live DialKit tuning before creating a card.",
    category: "Design & Prototyping",
    icon: Palette,
    badge: "Design",
    readTime: "4 min read",
    updatedAt: "October 2026",
    summary: "Canvas Studio provides a rapid visual playground where engineers brainstorm, test, and tune React components in dedicated git worktrees (switchyard/canvas-*) before generating board tasks.",
    sections: [
      {
        id: "overview",
        title: "Overview & Visual-First Philosophy",
        content: "Writing code directly inside production branches without visual exploration leads to redundant iteration loops. Canvas Studio gives developers a lightweight, browser-native sandbox styled like Figma / pen.dev. It bridges visual design engineering with the Switchyard task pipeline, allowing developers to craft components with instant feedback, tweak styling parameters interactively, and export verified specs straight into task dialogs.",
        callout: {
          type: "craft",
          title: "Emil Kowalski Design Principle: Beauty is Leverage",
          body: "When building UI, don't just make it work. Study why the best interfaces feel the way they do. When you can touch the component, drag its knobs, and inspect its bounds before writing a line of backend logic, the compound quality of your software elevates dramatically.",
        },
      },
      {
        id: "isolated-worktrees",
        title: "Isolated Worktree Architecture",
        content: "Canvas Studio never touches your main repository working copy. Every canvas session dynamically allocates an isolated git worktree under `.switchyard/canvas-cv_<id>` on a dedicated branch `switchyard/canvas-cv_<id>`. Multiple engineers and browser tabs can prototype simultaneously without file collisions or uncommitted index corruption.",
        codeSnippet: {
          language: "bash",
          filename: "worktree-allocation.sh",
          code: `# Switchyard canvas worktree creation flow
git worktree add -B switchyard/canvas-cv_4d05065e \\
  .switchyard/canvas-cv_4d05065e origin/main

# File scaffolding for live React sandbox
cat << 'EOF' > .switchyard/canvas-cv_4d05065e/CanvasComponent.tsx
import React from 'react'
import { useDialKit } from 'dialkit'

export default function CanvasComponent() {
  const [knobs] = useDialKit('card', {
    title: 'Interactive Card',
    radius: { value: 12, min: 4, max: 24 },
    showBadge: true,
  })
  return <div style={{ borderRadius: knobs.radius }}>{knobs.title}</div>
}
EOF`,
        },
      },
      {
        id: "sandbox-engine",
        title: "In-Browser Babel Standalone & JSX Engine",
        content: "Rather than waiting for next dev servers to spin up (which can take 15–30 seconds), Canvas Studio embeds Babel Standalone directly inside a secured sandbox iframe. Components compile in milliseconds in-memory with automatic JSX transformation, CSS module simulation, and unified module resolution mapping `react`, `react-dom`, and `dialkit`.",
        codeSnippet: {
          language: "javascript",
          filename: "canvasSandboxBabel.js",
          code: `// Standalone Babel compilation configuration
Babel.transform(code, {
  presets: [
    ['env', { modules: 'commonjs' }],
    ['react', { runtime: 'automatic' }],
    'typescript',
  ],
  filename: 'Component.tsx',
})`,
        },
      },
      {
        id: "dialkit-inspector",
        title: "DialKit Popover & Element Inspector",
        content: "Double-clicking any element inside the canvas sandbox triggers real-time element inspection. The canvas host communicates via postMessage with the sandbox iframe, computing bounding rects, computed CSS properties, and automatically discovering matching `useDialKit` schema keys.",
        table: {
          headers: ["Gesture / Event", "Target", "Action", "Inspector State"],
          rows: [
            ["Double Click", "DOM Element", "Highlights element with accent bounding box", "Switches right sidebar to Element Inspector & copy editor"],
            ["Canvas Click", "Background / Scaler", "Deselects current element", "Returns to global Component DialKit Knobs"],
            ["Pinch / Ctrl+Wheel", "Canvas Viewport", "Focal zoom centered at cursor coordinates", "Updates viewport zoom level without shaking"],
            ["Two-Finger Drag", "Canvas Viewport", "Smooth panning across canvas coordinates", "Activates iframe event shield to prevent cursor stealing"],
          ],
        },
      },
      {
        id: "task-handoff",
        title: "Seamless Handoff to Kanban Board",
        content: "Once a component satisfies design criteria, clicking 'Create Task' from the Canvas header automatically carries the component title, brief, code diff, and workspace path into the Kanban Task creation modal. The resulting card is tagged with design provenance, ready for automated agent execution or review.",
      },
    ],
  },
  {
    id: "architecture-overview",
    slug: "architecture-overview",
    title: "System Architecture & Flow Map",
    subtitle: "End-to-end topological map of Switchyard control plane, scheduling, and distributed workers.",
    category: "Getting Started",
    icon: Compass,
    badge: "Core",
    readTime: "5 min read",
    updatedAt: "October 2026",
    summary: "Switchyard coordinates AI coding agents, background job dispatchers, visual design canvases, and distributed worker hosts over a secure Tailscale mesh network.",
    sections: [
      {
        id: "topology",
        title: "Distributed System Topology",
        content: "Switchyard divides workload responsibilities across distinct operational planes. The Control Plane manages intent parsing and durable SQLite task persistence. The Scheduling Plane claims ready work items and matches them against worker capabilities. The Execution Plane runs worker daemons across macOS, Windows, and Linux machines over encrypted Tailscale tunnels.",
        callout: {
          type: "note",
          title: "Visual Flow Map Inspection",
          body: "You can watch tasks travel across nodes in real-time in the Flow Map page (/agent-mapping). Node cards pulse with live activity and traveling dots show active data streams.",
        },
      },
      {
        id: "core-nodes",
        title: "The 10 Core Architectural Nodes",
        content: "Every operational stage is mapped to a dedicated service node in the system layout:",
        table: {
          headers: ["Node ID", "Label", "Plane / Group", "Primary Responsibility"],
          rows: [
            ["pen-dev", "pen.dev Canvas", "Design & Specs", "Interactive visual React component prototyping & DialKit parameter tuning in worktrees"],
            ["orchestrator", "Orchestrator", "Control Plane", "Intent decomposition, dependency tree generation, and prerequisite context mapping"],
            ["kanban", "Kanban State", "Task State", "Durable SQLite state machine managing transitions (todo → ready → running → review → done)"],
            ["dispatcher", "Task Dispatcher", "Scheduling", "Atomic card claiming, executor resolution, worker health checks, and retry dispatch"],
            ["memory", "Memory Store", "Context", "Fact store and prequest knowledge cache caching project context across turns"],
            ["node-agent-server", "Node-agent Server", "Dispatch", "Central tunnel hub for WebSocket/HTTPS dispatching to distributed workers"],
            ["tailscale", "Tailscale Transport", "Network", "Encrypted mesh network connecting host server to distributed worker hosts"],
            ["mac", "Mac Worker", "Execution", "macOS host running launchd daemon for Xcode, Swift, and Apple Silicon tasks"],
            ["windows", "Windows Worker", "Execution", "Windows host running scheduled task daemon for MSVC and PowerShell workloads"],
            ["review", "Review Gate", "Quality Gate", "Diff analysis, provenance verification, and approval gate before commit/push"],
          ],
        },
      },
      {
        id: "flow-lifecycle",
        title: "Task Lifecycle Journey",
        content: "A task begins as an intent in Kanban UI or pen.dev Canvas. Once validated, it is claimed by the dispatcher into `running` state. The dispatcher checks if a continuity harness (dsh, commandcode, omp, claude) is bound to the card; if so, it resumes the exact session. Work proceeds inside the designated workspace. Upon completion, results pass through the Review Gate where git diffs and provenance are verified before marking the task `done`.",
      },
    ],
  },
  {
    id: "kanban-flow",
    slug: "kanban-flow",
    title: "Kanban Task Lifecycle (A–Z)",
    subtitle: "Complete operational guide from user intent, validation, dispatching, execution, to review gate.",
    category: "Core Workflows",
    icon: Workflow,
    badge: "Core",
    readTime: "4 min read",
    updatedAt: "October 2026",
    summary: "Comprehensive breakdown of how tasks are validated, scheduled, executed by coding agents, and committed through the review gate.",
    sections: [
      {
        id: "intent-dispatch",
        title: "Phase 1: Intent & Dispatch",
        content: "A board task stores intent: title, body description, target workspace, profile, executor, and priority. Validation occurs strictly on the backend API. The dispatcher queries tasks in `ready` or `todo` status, atomically claims them into `running`, and routes execution commands to the worker host over SSH or node-agent channels.",
        codeSnippet: {
          language: "json",
          filename: "task-spec.json",
          code: `{
  "title": "Refactor authentication token refresh",
  "body": "Ensure expired tokens are refreshed with exponential backoff.",
  "workspace": "/Users/developer/Development/auth-service",
  "profile": "senior-backend",
  "executor": "commandcode",
  "priority": "high"
}`,
        },
      },
      {
        id: "execution-progress",
        title: "Phase 2: Execution & Progress Streaming",
        content: "The worker launches the selected executor in the exact workspace directory. Terminal output streams in real-time into the progress buffer. The planner formulates bounded iteration steps, executing shell operations and file modifications. When finished, diff summaries and test results are recorded.",
      },
      {
        id: "review-approval",
        title: "Phase 3: Review Gate & Continuation Prompts",
        content: "The Review Gate displays git diffs and CodeGraph provenance without requiring direct SSH to the worker host. Reviewers can approve and trigger `commit_push`, or leave a review comment. A review comment automatically moves the task back to `todo`, feeding the comment into the continuation prompt so the agent iteratively refines the code.",
        callout: {
          type: "tip",
          title: "Session Continuity Benefit",
          body: "For stateful executors (dsh, commandcode, claude, omp), continuation rounds do NOT start cold. The agent remembers all previous reasoning, files inspected, and decisions made in earlier rounds.",
        },
      },
    ],
  },
  {
    id: "dsh-harness",
    slug: "dsh-harness",
    title: "DeepSeek Harness (`dsh`)",
    subtitle: "DSH session continuity with monotonic turn cursors and isolated daemon homes.",
    category: "Executor Harnesses",
    icon: BrainCircuit,
    badge: "Stateful",
    readTime: "3 min read",
    updatedAt: "October 2026",
    summary: "DeepSeek Harness runs dsh in headless JSON mode with monotonic turn sequence tracking, guaranteeing that stale or out-of-order turns are rejected.",
    sections: [
      {
        id: "dsh-overview",
        title: "DeepSeek Harness Architecture",
        content: "DSH executes `dsh --profile headless --json` in the host workspace. Unlike stateless models, DSH maintains a persistent session keyed by `workspace_id`. On subsequent review rounds, Switchyard passes `--session-id <bound_id>`, resuming the conversation in place.",
        codeSnippet: {
          language: "bash",
          filename: "dsh-invocation.sh",
          code: `# First run: worker creates session and returns ID
dsh --profile headless --json --prompt "Implement rate limiter"

# Continuation run: Switchyard passes bound session ID
dsh --profile headless --json --session-id "dsh_sess_92fa84b1" --prompt "Add unit tests"`,
        },
      },
      {
        id: "dsh-cursors",
        title: "Monotonic Turn Cursors & Fences",
        content: "DSH reports a monotonic `last_turn_seq`. If a network glitch or worker restart delivers an older sequence number, Switchyard's identity check rejects the turn to prevent state regressions. Furthermore, DSH runs with an isolated `DSH_HOME` to prevent session locks from conflicting with background web daemons.",
        table: {
          headers: ["Fence Property", "DSH Implementation", "Failure Consequence"],
          rows: [
            ["Workspace Identity", "Keyed by workspace_id", "Missing workspace prevents session resumption"],
            ["Turn Cursor", "Monotonic last_turn_seq", "Stale turn is discarded immediately"],
            ["Session Binding", "Stored in harness_bindings", "Mismatch blocks card with identity_rejected"],
            ["Home Isolation", "Custom DSH_HOME directory", "Prevents daemon lock contention on worker"],
          ],
        },
      },
    ],
  },
  {
    id: "commandcode-executor",
    slug: "commandcode-executor",
    title: "Command Code Executor (`commandcode`)",
    subtitle: "High-performance autonomous coding CLI with deterministic session minting and run fences.",
    category: "Executor Harnesses",
    icon: Command,
    badge: "CLI",
    readTime: "3 min read",
    updatedAt: "October 2026",
    summary: "Command Code CLI operates in full autonomous yolo mode with structured JSON streaming and deterministic Switchyard session IDs.",
    sections: [
      {
        id: "commandcode-overview",
        title: "Command Code Operation",
        content: "The commandcode executor runs `cmd -p --yolo --skip-onboarding --output-format json [--resume <id>]`. On Windows hosts, the binary is identified as `cmdc` or `command-code`. It operates without workspace keying, resuming sessions by session ID prefix alone.",
        codeSnippet: {
          language: "bash",
          filename: "commandcode-cmd.sh",
          code: `# Execution invocation with JSON protocol
cmd -p --yolo --skip-onboarding --output-format json \\
  --resume "switchyard-commandcode-4d92a10e" \\
  "Fix memory leak in buffer pool"`,
        },
      },
      {
        id: "commandcode-fences",
        title: "Ownership & Run Fences",
        content: "Command Code frames return `sessionId`, `finalText`, and `usage`. Because Command Code does not emit a turn sequence number, stale turns are safeguarded exclusively by Switchyard's `current_run_id` ownership fence. Any frame received for a superseded run ID is discarded silently.",
      },
    ],
  },
  {
    id: "omp-executor",
    slug: "omp-executor",
    title: "oh-my-pi Agent (`omp`)",
    subtitle: "Minimalist coding agent with prefix-based session continuity and auto-approval.",
    category: "Executor Harnesses",
    icon: Terminal,
    badge: "Agent",
    readTime: "3 min read",
    updatedAt: "October 2026",
    summary: "oh-my-pi runs in non-interactive JSON mode with auto-approved file edits, resuming sessions by deterministic session ID prefixes.",
    sections: [
      {
        id: "omp-overview",
        title: "omp Execution Model",
        content: "The omp executor launches `omp -p --auto-approve --mode json [--resume <id>]`. On Windows worker hosts, the binary is `omp.exe`. It accepts prefix-based session resumes, allowing seamless multi-turn iterations without recreating workspace state.",
      },
      {
        id: "omp-safety",
        title: "Auto-Approve Guardrails",
        content: "Because `--auto-approve` permits unattended file edits and shell executions, omp is restricted to trusted worker nodes registered in the Switchyard environment. Output frames stream through the JSON channel and update card provenance upon completion.",
      },
    ],
  },
  {
    id: "claude-code-executor",
    slug: "claude-code-executor",
    title: "Claude Code CLI (`claude`)",
    subtitle: "Direct integration with Anthropic Claude Code CLI using bypassPermissions mode.",
    category: "Executor Harnesses",
    icon: Sparkles,
    badge: "CLI",
    readTime: "3 min read",
    updatedAt: "October 2026",
    summary: "Runs Claude Code CLI in headless JSON mode with bypassPermissions for unattended tasks. Explicit-only; never selected by auto fallback.",
    sections: [
      {
        id: "claude-overview",
        title: "Claude Code Execution",
        content: "The claude executor invokes `claude -p --output-format json --permission-mode bypassPermissions [--resume <id>]`. The CLI must be authenticated under the same OS user account hosting node-agent. It is explicit-only, meaning the user must deliberately pick Claude Code on the card.",
        codeSnippet: {
          language: "bash",
          filename: "claude-cli.sh",
          code: `# Claude Code headless execution
claude -p --output-format json \\
  --permission-mode bypassPermissions \\
  --resume "switchyard-claude-91ab4e02" \\
  "Audit SQL queries for injection vulnerabilities"`,
        },
      },
      {
        id: "claude-handling",
        title: "Session Validation & Deterministic Failures",
        content: "Upon completion, the terminal JSON payload must return `session_id`. If a successful exit lacks a session ID, Switchyard marks the card with `claude_session_missing:`, failing deterministically without wasteful retries.",
      },
    ],
  },
  {
    id: "continuity-matrix",
    slug: "continuity-matrix",
    title: "Continuity Fences & Comparison Matrix",
    subtitle: "Complete comparison of stateful harnesses vs stateless executors across all safety fences.",
    category: "Continuity & Reference",
    icon: Layers,
    badge: "Reference",
    readTime: "4 min read",
    updatedAt: "October 2026",
    summary: "Detailed reference comparing DeepSeek, Command Code, Claude Code, and omp against stateless Hermes, Codex, and Shell.",
    sections: [
      {
        id: "fence-matrix",
        title: "Harness Continuity Fence Matrix",
        content: "All four continuity harnesses use the shared `harness_bindings` SQLite table and resolver, but differ in verification fences:",
        table: {
          headers: ["Fence Characteristic", "dsh (DeepSeek)", "commandcode", "claude", "omp", "Safety Effect"],
          rows: [
            ["Workspace Identity", "Required", "Not required", "Not required", "Not required", "Only dsh keys its session store by workspace ID"],
            ["Turn Cursor", "last_turn_seq checked", "Not returned", "Not returned", "Not returned", "Only dsh can reject a stale turn sequence"],
            ["Session ID on Success", "Required", "Required", "Required", "Required", "Mismatch triggers identity_rejected, blocking the card"],
            ["Session ID on Failure", "Required", "May be omitted", "May be omitted", "May be omitted", "A failed initial run legitimately has no minted ID"],
            ["Home Isolation", "Isolated DSH_HOME", "None required", "None required", "None required", "dsh alone takes a daemon session lock"],
            ["Stale-Result Guard", "Turn seq + run fence", "Run fence only", "Run fence only", "Run fence only", "current_run_id drops superseded late results"],
          ],
        },
      },
      {
        id: "stateless-executors",
        title: "Stateless Executors: Hermes, Codex, Shell",
        content: "In contrast to continuity harnesses, Hermes, Codex, and Shell are stateless executors. Each execution creates a fresh turn. The planner assembles context from the card description, workspace files, CodeGraph relationships, and review comments, providing clean, idempotent execution.",
      },
    ],
  },
  {
    id: "chat-flow",
    slug: "chat-flow",
    title: "Chat Flow & SSE Progressive Streaming",
    subtitle: "Interactive conversational sessions with progressive SSE token streaming and durable rooms.",
    category: "Core Workflows",
    icon: MessageSquare,
    badge: "Streaming",
    readTime: "3 min read",
    updatedAt: "October 2026",
    summary: "Direct agent conversation protocol running on /chat/:sessionID with server-sent events for tool outputs and progressive rendering.",
    sections: [
      {
        id: "chat-architecture",
        title: "Chat Protocol & Sessions",
        content: "Chat operates independently from the Kanban task dispatcher. A chat room lives at `/chat/:sessionID` backed by a durable session record. Posting a message immediately returns `202 Accepted` while background processes stream live token events over SSE (`chat_run_event`).",
        table: {
          headers: ["Run State", "Underlying Action", "UI Presentation"],
          rows: [
            ["loading", "Run record created & context assembled", "Pulsing orb / loading skeleton in chat transcript"],
            ["running", "Hermes daemon or CLI generating output", "Progressive token streaming + elapsed timer + Stop button"],
            ["done", "Assistant response persisted with session ID", "Final markdown rendered with model token footer"],
            ["error / cancelled", "Execution halted or terminal failure", "Error banner with explicit retry action"],
          ],
        },
      },
      {
        id: "streaming-rendering",
        title: "Progressive Tool Output Rendering",
        content: "When the agent executes bash commands, searches files, or queries skills, tool execution events stream as individual events into the chat client. Collapsible cards render tool execution details live without blocking text generation.",
      },
    ],
  },
  {
    id: "safety-retry-policies",
    slug: "safety-retry-policies",
    title: "Safety, Retry & Failure Policies",
    subtitle: "Boundaries, deterministic vs transient failure handling, and automated card recovery.",
    category: "Safety & Verification",
    icon: ShieldAlert,
    badge: "Safety",
    readTime: "4 min read",
    updatedAt: "October 2026",
    summary: "Guarantees that prevent zombie tasks, drop stale results, and distinguish between retryable glitches and permanent configuration errors.",
    sections: [
      {
        id: "retry-rules",
        title: "Deterministic vs Transient Failures",
        content: "Not all errors should be retried. When a failure indicates missing credentials, unknown binaries, or mismatched session IDs, retrying will only waste compute and token quota. Switchyard classifies errors before retrying:",
        table: {
          headers: ["Failure Signal", "Classification", "Action Taken"],
          rows: [
            ["commandcode_session_missing", "Deterministic", "Immediately marked blocked; never retried"],
            ["claude_session_missing", "Deterministic", "Immediately marked blocked; never retried"],
            ["identity_rejected", "Deterministic", "Card blocked; human review required"],
            ["SSH connection timeout", "Transient", "Retried up to 3 times with exponential backoff"],
            ["Worker silent / lost (>10m)", "Transient", "Lock released automatically; rescheduled to ready"],
            ["Out of memory / killed", "Transient", "Logged with memory snapshot; retried once on fallback worker"],
          ],
        },
      },
      {
        id: "boundaries",
        title: "Core System Boundaries",
        content: "Key architectural boundaries keep Switchyard reliable: Chat never uses the Kanban dispatcher or review gate. Kanban tasks never depend on ephemeral chat states. Remote workspace paths are fail-closed: an unregistered path is rejected before command dispatch. Diff provenance is inspected in-memory, avoiding risky SSH commands into production workers.",
      },
    ],
  },
]
