# Shell Agent Execution Brainstorm

Status: design checklist only. This document describes the execution flow to fix before adding more automation.

## Incident: `t_2f4dc397`

The task failed with:

```text
shell planner: invalid character '\\' looking for beginning of object key string
```

The shell worker reached the planner, but the planner response was parsed as invalid JSON. The prompt currently embeds the JSON contract with escaped quotes inside a Go string. Some model responses preserve those backslashes and return this shape:

```text
{\"action\":\"run\",\"command\":\"...\"}
```

That is not valid JSON for `json.Unmarshal`. The contract must be emitted as normal JSON syntax, and the parser must tolerate a small amount of model formatting without silently accepting unsafe output.

The earlier retry also showed that iteration count alone is not enough. The agent spent iterations on broad repository discovery, parent-repository `git status`, large `find` output, and RTK rewrites before reaching the requested files.

## Current capability checklist

Already present:

- [x] RTK command rewrite with bounded timeout.
- [x] RTK output compaction / caveman mode behind `NODE_AGENT_SHELL_CAVEMAN=1`.
- [x] CodeGraph preflight when `.codegraph` exists or initialization is available.
- [x] Read-only planner process using Codex.
- [x] One structured shell command per iteration.
- [x] Task-controlled iteration budget.
- [x] Destructive-command guard for common high-risk commands.
- [x] Progress events and worker-log persistence.
- [x] Provenance showing executor, workspace, and iteration count.
- [x] Review gate after successful execution.

Missing or incomplete:

- [ ] Strict, valid JSON planner contract with recovery for fenced or escaped JSON.
- [ ] Planner schema validation before execution.
- [ ] Workspace scope guard so discovery stays inside the selected workspace and does not inspect a parent Git repository.
- [ ] Output budgets per command, not only final-output compaction.
- [ ] A discovery budget separate from implementation/test iterations.
- [ ] Explicit phase state: discover → plan → edit → verify → finish.
- [ ] Acceptance checks that are machine-verifiable before `complete`.
- [ ] Retry continuation that preserves planner transcript and failed-command context.
- [ ] Loop detection for repeated commands and repeated identical failures.
- [ ] Tool capability awareness: `rg`/`fd` availability, macOS `grep` differences, RTK rewrite support.
- [ ] A concise task brief containing target files, expected behavior, and verification commands.
- [ ] Structured final summary: files changed, tests run, remaining risks.

## Proposed execution flow

```text
prepare
  ↓
scope workspace + load project instructions
  ↓
bounded discovery
  ↓
write an execution plan with acceptance checks
  ↓
edit one coherent slice
  ↓
run focused verification
  ↓
inspect diff and acceptance evidence
  ├─ pass → complete and send to review
  ├─ fixable failure → continue with failure context
  └─ budget/error → resumable blocked state
```

### Phase 1 — Prepare

Collect once, before the loop:

- Absolute workspace path and resolved Git root.
- Whether the task path is a nested workspace.
- `AGENTS.md`, workspace note, README head, and available test commands.
- CodeGraph health and a compact structural summary.
- Executor capabilities: `rg`, `fd`, `git`, runtime, package manager, RTK.
- Task acceptance criteria converted into a short checklist.

Do not run repository-wide `git status` or unbounded `find`. Every command must include the workspace scope and an output limit.

### Phase 2 — Bounded discovery

The planner should spend at most 2–4 iterations finding relevant files. Prefer:

```sh
rg -n --glob '*.php' --glob '*.js' 'target symbols' . | head -200
```

If `rg` is unavailable, use a bounded `find` plus `grep`, excluding `.git`, `vendor`, `node_modules`, build output, caches, and unrelated sibling apps. Never use the parent Git root as the default search scope.

Discovery output should be compacted before being added to planner context. The raw output can remain in the worker log.

### Phase 3 — Plan

The planner returns exactly one validated object:

```json
{
  "action": "run",
  "command": "...",
  "reason": "...",
  "phase": "discover|edit|verify"
}
```

The prompt should show this as normal JSON, not a backslash-escaped sample. The worker should:

1. Strip surrounding Markdown fences if present.
2. Extract the first balanced JSON object only when the response contains explanation around it.
3. Reject invalid JSON after one bounded normalization attempt.
4. Validate `action`, `command`, `reason`, and `phase`.
5. Reject empty commands and commands outside the workspace.

If parsing fails, make one repair request that contains only the parse error and required schema. Do not burn the entire task budget on repeated malformed responses.

### Phase 4 — Edit

Edits should be coherent and narrow. The planner may propose safe edits, but the worker must reject destructive patterns and commands that escape the workspace. Prefer the repository's native editing tool or a small scripted replacement with an immediate diff check.

After an edit, the next command should normally be a focused diff or targeted test—not another broad discovery scan.

### Phase 5 — Verify

Verification order:

1. Syntax/type check for touched files.
2. Targeted unit or integration test.
3. Relevant lint/build command.
4. `git diff --check` and scoped diff summary.
5. Acceptance checklist evidence.

The planner may only return `complete` when the acceptance checklist has evidence. A successful shell exit alone is not enough.

## Tool roles

| Tool | Role | Guardrail |
|---|---|---|
| CodeGraph | Identify files, symbols, and relationships | Compact summary; do not replace verification |
| `rg` / `fd` | Narrow discovery | Required path scope and output cap |
| RTK rewrite | Reduce or normalize command output | Fail open; never change command meaning silently |
| RTK caveman | Compact large command output | Keep raw output in logs; use compact output for planner context |
| Shell worker | Execute one planned command | Workspace cwd, timeout, destructive-command guard |
| Git diff | Confirm changed files and review scope | Never inspect or stage the parent repository accidentally |
| Planner model | Choose next action and interpret evidence | JSON schema, phase, budget, loop detection |

## Budget model

Use separate budgets instead of one undifferentiated counter:

- `prepare`: one fixed preflight.
- `discover`: 4 iterations maximum.
- `edit`: 12 iterations maximum.
- `verify`: 6 iterations maximum.
- Total default: 16–24 iterations depending on task complexity.

An iteration that only retries malformed planner JSON should not consume a full edit/verify budget. Repeated identical commands should trigger a recovery prompt or resumable blocked state.

## Failure and continuation behavior

Classify failures before retrying:

- `planner_json_invalid`: repair once, then retry the same phase.
- `tool_unavailable`: switch to a known fallback or block with a clear prerequisite.
- `command_failed`: include exit code and bounded output in the next planner context.
- `repeated_command`: force a different strategy.
- `budget_exhausted`: preserve transcript, phase, changed files, and last evidence; allow continuation rather than starting from an empty context.
- `acceptance_not_met`: remain running/continuable if budget remains; otherwise blocked with the exact missing checklist item.

Continuation should be resumable with:

- task intent and acceptance criteria;
- current phase;
- files already changed;
- commands already executed;
- last 2–4 relevant outputs;
- failed command and error;
- remaining budget.

## Recommended implementation order

### P0 — Correctness

- Fix planner JSON prompt escaping.
- Add robust JSON extraction/normalization and schema validation.
- Add tests for normal JSON, fenced JSON, escaped JSON, extra explanation, malformed JSON, and invalid actions.

### P1 — Task effectiveness

- Add explicit phases and acceptance checklist to planner context.
- Add workspace-root/scope guard to every discovery command.
- Cap command output before it reaches planner context.
- Exclude parent repositories, vendor, node_modules, caches, and generated files.

### P2 — Reliability

- Add loop detection and one repair/recovery attempt.
- Persist resumable continuation state on budget exhaustion.
- Separate discovery/edit/verify budgets.
- Expose phase, budget remaining, and last command in the UI.

### P3 — Optimization

- Use CodeGraph symbol results to skip broad discovery.
- Use RTK rewrite only for commands it recognizes confidently.
- Prefer targeted tests derived from changed files.
- Add task complexity presets: small 8, normal 16, complex 24.

## Acceptance checklist for the shell agent itself

- [ ] Planner output always parses into the schema or produces a bounded, actionable error.
- [ ] No command searches outside the selected workspace unless explicitly required.
- [ ] No single command can flood planner context or worker progress indefinitely.
- [ ] Edit commands are allowed when safe and remain review-gated.
- [ ] The agent does not call `complete` without acceptance evidence.
- [ ] A failed run can continue without losing its transcript.
- [ ] Every result reports phase, iterations used, files changed, tests, and remaining risk.
- [ ] `t_2f4dc397` can complete the requested change without relying on malformed planner JSON or broad parent-repository scans.
