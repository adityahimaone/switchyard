# Design: Continuation flow + stacked results + per-file commit

Date: 2026-09-16
Status: draft — awaiting user approval
Board: f8-saas (task t_60c3ea45 reference)

## Goal

Fix continuation flow so reply @agent on `review` requeues `todo -> running -> review` with live worker log, preserve result history as Result 1/2 stack, and make Review Diff show all workspace changes with per-file commit selection.

## Context & evidence

- t_60c3ea45: status `review`, workspace_path `/Users/adityahimawan/Development/saas` (parent dir, not portal-hadirr child), 14 untracked files under portal-hadirr + artifacts. `GET /diff` returned empty stat due to path handling.
- Live logs: node-agent progress buffer -> kanban `logs/<id>.log` -> `WorkerLogTail` (256KB bounded) -> `WorkerLogPanel` polling 1.2s while running. Result persistence: `tasks.result` (latest) + `task_events` `completed` payloads (history).
- Dispatcher: `ssh_dispatch.go` polls 30s, injects `[CONTINUATION] Previous Result (800 chars) + Recent Comments` before claim. `comments.go` requeue preserves `result`, clears only `completed_at`.
- Existing UI: `TaskDetailPage.tsx` + `TaskDetail.tsx` share `OutputPanels.tsx` (WorkerLogPanel, ResultPanel, ResultEmpty) + `AgentStatus.splitAgentResult`. Review diff = `review.go:handleTaskDiff` via `sshRun` (`git diff HEAD` + `git diff --no-index` loop for untracked).

## Scope

In: detail page continuation UX, result history display, worker log visibility rule, diff scan + per-file selection + selective commit.
Out: hunk-level selection, folder grouping, new DB table, container runtime (Docker removed), auth.

## Approaches considered

1) Result history — A: event-sourced from `task_events` completed payloads (no migration, read existing audit trail). B: new `task_results` table (clean but migration + backfill). C: JSON array in `tasks.result_history` (simple but unbounded column). Recommend A.

2) Diff selection — A: per-file checkbox (user chose). B: per-hunk. C: folder grouping. Recommend A; add folder badge for orientation but no grouping logic.

3) Worker log — A: stack per run (needs log segmentation by run_id offset). B: current run only (user chose B). Recommend B — single file stays simple, no segmentation.

## Architecture

- Backend (Go):
  - `internal/kanban/comments.go`, `cmd/server/ssh_dispatch.go` keep current continuation injection (800 chars) and preserve result on requeue.
  - `cmd/server/review.go`: `handleTaskDiff` — ensure workdir = task.workspace_path (guard empty), run `git diff --stat` + `git diff HEAD` + untracked loop using `git ls-files --others --exclude-standard -- .` (dot arg critical when workspace is parent). Return `stat/diff/clean` with `path` absolute check to reject traversal. Selective commit: new `POST /approve` field `files?: string[]` — when present, `git add -- <files>` instead of `git add -A`. Validate each path via `git ls-files --others --exclude-standard -- <path>` or `git diff` membership; reject `..` or absolute paths outside workdir.
  - `internal/kanban/task_runs` exists but not populated by ssh_dispatcher; do not rely. Derive runs from `task_events` `GroupTaskRuns` for result stack.
- Frontend (React):
  - `web/src/api.ts`: extend approve helper to accept `files` array; add `taskResults(task)` helper that merges `tasks.result` + `task_events` completed payloads grouped by run.
  - `web/src/features/board/TaskDetailPage.tsx`: replace single `ResultPanel` with `ResultStack` — vertical stack, latest expanded, older collapsed, titles Result N (N = run index). Data source: `task.result` as Result N + prior completed events as Result 1..N-1 (dedup by payload equality). Copy per panel.
  - Keep single `WorkerLogPanel` visible only while `status === running` (poll `worker-log?offset=`). No stacking.
  - `ReviewSection`: add `selectedFiles: Set<string>` from parsed `parseDiffFiles` names. UI: header row Select all / Invert / count, each file card has checkbox. Commit buttons disabled when selection empty. On approve, send `{action, files: [...selected]}`. Backend response unchanged.
  - Both detail surfaces (`TaskDetail` drawer + `TaskDetailPage`) reuse same `ResultStack` + `ReviewSection`; no duplicate `<pre>` blocks.

## Data flow

1. User posts comment `@assignee opsi 1` on review → `comments.go` → `status=todo, completed_at=NULL, result preserved` + `status_changed` event.
2. Dispatcher tick → builds `msg = [CONTINUATION] + result(800) + comments(5)` → claim `running, started_at=now` → `DispatchRemote` (node-agent) → streams progress -> `logs/<id>.log` → UI `WorkerLogPanel` live.
3. Worker success → `status=review, result=output, consecutive_failures=0` + `completed` event with output payload.
4. Detail page polls `events` + `worker-log` + `diff`; renders ResultStack (history) + live log + diff per-file. User checks files → Approve `commit` or `commit_push` with file list → `review.go` does `git add -- <files> && git commit && (push)` → `status=done` else `Mark done` when clean.

## UI spec

- Prototype: `web/public/prototype/index.html` Variant 1 (stack) served at `/prototype/`, built via `pnpm build`.
- ResultStack: container `border-emerald-500/20`, header `Results · N`, each entry `<details>` with summary `Result {index} · {outcome} · {size}` + copy, latest `open`. Monospace body `whitespace-pre-wrap`.
- WorkerLogPanel: `border-sky-500/20`, traffic dots, `live` badge, collapsible `max-h-80`, single instance.
- ReviewSection: `border-violet-500/30`, file card `DiffDisclosure` with checkbox left, `+added -removed` right. Controls: Select all, Invert, selected count. Approve row: `Commit (N)`, `Commit & Push`, `Mark done` (when `clean`). Error inline.
- No change to board column layout or card metadata.

## Error handling

- Diff: if `sshRun` returns non-zero and stat/diff both empty → surface `Gagal load diff` with truncated error; do not mark clean.
- Approve: validate `files` against actual changed set; reject unknown paths 400. If `git add` fails (file vanished) → return 500 with `git failed` excerpt.
- Result history: if `task_events` completed payload missing/error, fallback to `tasks.result` alone.
- Continuation: truncate previous result 800, comments 5. No log segmentation.

## Testing

- Backend: `go vet ./...`, `go test ./internal/kanban -run TestGroupTaskRuns|TestAddComment|TestReview` (HERMES_HOME=t.TempDir isolation). Add table test for selective commit path validation (reject `../`, allow known untracked file).
- Frontend: `pnpm build` in `web/` must pass; verify bundle hash rotation and `curl http://127.0.0.1:8790/prototype/` 200.
- Manual: t_60c3ea45 — `GET /api/boards/f8-saas/tasks/t_60c3ea45/diff` via authenticated cookie shows 11+ files; posting comment `@default opsi 1` requeues to todo then running; worker log streams; completion shows Result 2 added and diff reflects new state.

## Open decisions (resolved)

- Q1 diff selection → A per-file checkbox.
- Q2 result history → A vertical stack (latest expanded).
- Q3 worker log → B current run only.

All three answered by user 2026-09-16.

## Self-check

- No placeholders / TODOs.
- Internal consistency: no DB migration, uses existing `task_events` + `tasks.result`; diff scan covers parent workspace correctly.
- Scope single plan: detail page continuation UX only.
- No ambiguity: per-file commit validation via git membership check, not path allowlist guess.

## Next step

Await user review of this spec. On approval, call `writing-plans` to produce implementation plan.
