package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// reviewGate implements the review column backend:
//   GET  /api/boards/{slug}/tasks/{id}/diff     -> git diff (full, inline)
//   POST /api/boards/{slug}/tasks/{id}/approve  -> {"action":"done"|"commit"|"commit_push"}
//
// Both run git ON the workspace host over SSH (workspace_transport=ssh).
// Approve is the ONLY path from review -> done; the plain status PATCH
// endpoint refuses that transition (see guard in main.go).

const diffLimit = 100 << 10 // 100KB truncation cap for raw diff output

// Git reports paths relative to the repository root, even when the command is
// run from a nested workspace. Normalize to that root first, while keeping the
// task workspace as the diff scope. This prevents nested workspaces from
// accidentally resolving untracked paths against the wrong directory.
const reviewScopeSetup = `repo_root=$(git rev-parse --show-toplevel) || exit 2; workspace=$(pwd -P); if [ "$workspace" = "$repo_root" ]; then scope="."; elif [ "${workspace#"$repo_root"/}" != "$workspace" ]; then scope="${workspace#"$repo_root"/}"; else echo "workspace is outside git root" >&2; exit 2; fi; cd "$repo_root" || exit 2; untracked() { git ls-files --others --exclude-standard -- "$scope" | while IFS= read -r f; do if [ -d "$f" ]; then find "$f" -type f -not -path '*/.git/*' -print; else printf '%s\n' "$f"; fi; done; }; `

// reviewScopeSetupWindows is the workspace/repo guard for a Windows worker.
// node-agent runs a Windows shell task as `cmd /c <one argv string>`, which
// forces two constraints the POSIX version above does not have:
//
//   - No double quotes. Go quotes that argv element, so every `"` arrives as
//     `\"` and cmd's own parsing breaks.
//   - No %VAR% set-then-read. cmd expands %VAR% when it PARSES the line, so a
//     variable assigned earlier on the same single line still reads as empty.
//     Delayed expansion is not available (the worker does not pass /v:on).
//
// So the guard is a single exit-code check that allocates no state. The diff
// commands scope with "." instead of a computed path: node-agent already sets
// the worker's cwd to the task workspace, and git resolves "." from there.
const reviewScopeSetupWindows = `@echo off & git rev-parse --is-inside-work-tree 1>nul || exit /b 2`

// reviewCleanWindows reports 0 clean, 1 has-changes, other = error. It reuses
// the guard plus `findstr` to test for any untracked line, because
// `git diff --quiet` ignores untracked files and review must treat them as
// changes. `|` binds tighter than `&&`/`||`, so each group stays independent.
const reviewCleanWindows = `@echo off & git rev-parse --is-inside-work-tree 1>nul || exit /b 2` +
	` & git ls-files --others --exclude-standard -- . | findstr . >nul && exit /b 1` +
	` & git diff --quiet HEAD -- . || exit /b 1 & exit /b 0`

type reviewTask struct {
	Slug          string
	ID            string
	Title         string
	Status        string
	WorkspacePath string
	Transport     string
	SSHTarget     string
	Result        string
	// Branch and WorktreePath are set for a worktree-isolated task. When
	// WorktreePath is non-empty the diff and the commit happen there, not in
	// the shared checkout, so the review covers exactly this task's changes.
	Branch       string
	WorktreePath string
}

// Workdir is where this task's commands run: its worktree when it has one,
// otherwise the shared workspace. Routing every command through this one method
// is what stops the diff, the commit and the agent run from disagreeing about
// which checkout they are looking at.
func (t *reviewTask) Workdir() string {
	return kanban.WorktreeWorkspace(t.WorkspacePath, t.WorktreePath)
}

func loadReviewTask(slug, id string) (*reviewTask, error) {
	// Migrate before querying: this function names columns that a board created
	// by an older binary does not have, and a raw sql.Open skips the migration
	// openDB would have run. Without this the review gate 500s with
	// "no such column" on exactly the boards that most need reviewing.
	if _, err := kanban.MigrateBoardSchemaPublic(slug); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	t := &reviewTask{}
	t.Slug = slug
	err = db.QueryRow(`SELECT id, title, status, workspace_path,
		COALESCE(workspace_transport,''), COALESCE(workspace_ssh_target,'mac-tailscale')
		, COALESCE(result,''), COALESCE(branch,''), COALESCE(worktree_path,'')
		FROM tasks WHERE id=?`, id).
		Scan(&t.ID, &t.Title, &t.Status, &t.WorkspacePath, &t.Transport, &t.SSHTarget, &t.Result,
			&t.Branch, &t.WorktreePath)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// runGitFunc runs a git command inside the task workspace over the task's
// transport. Indirected through a var so tests can exercise handleTaskDiff
// without a live Mac/Windows node.
var runGitFunc = runGit

// runGit executes a git command inside the task workspace, on the worker that
// owns the workspace, via node-agent.
//
// There is deliberately no SSH branch any more. The retired `ssh` transport was
// rewritten to `node-agent` at startup (see MigrateRetiredTransport), so a
// workspace is always reachable through exactly one path.
//
// The dispatch targets t.Workdir(), which is the task's worktree when it has one.
// That is what makes a worktree-isolated task's diff exact: the command runs in
// the same checkout the agent edited, not in the shared one.
func runGit(t *reviewTask, args string) (string, int) {
	res, err := kanban.DispatchRemoteRaw(kanban.NodeDispatchRequest{
		TaskID: fmt.Sprintf("review-%s-%d", t.ID, time.Now().UnixNano()),
		Title:  t.Title, Board: t.Slug, Workspace: t.Workdir(),
		Executor: "shell", Command: args, NoRTK: true,
	}, kanban.RemoteDispatchWait())
	if err != nil {
		return err.Error(), 255
	}
	if res == nil {
		return "node-agent returned no result", 255
	}
	out := res.Output
	if res.Error != "" {
		out += "\n" + res.Error
	}
	if !res.Success {
		return out, 1
	}
	return out, 0
}

// reviewIsWindowsWorker reports whether the WORKER owning this task is a
// Windows host. node-agent runs a shell task through `bash -lc` on macOS/Linux
// and `cmd /c` on Windows, so the workspace's OS picks the dialect — not the OS
// of the process running the control plane, which may be a Linux VPS dispatching
// to a Windows worker.
func reviewIsWindowsWorker(t *reviewTask) bool {
	return kanban.WorkspaceOS(t.WorkspacePath, t.SSHTarget) == "windows"
}

func reviewWorkspaceClean(t *reviewTask) (bool, string, int) {
	// git diff --quiet ignores untracked files; review must treat new files as changes.
	script := reviewScopeSetup + `git diff --quiet HEAD -- "$scope"; diff_code=$?; untracked=$(untracked | head -20); if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi; exit $diff_code`
	if reviewIsWindowsWorker(t) {
		script = reviewCleanWindows
	}
	out, code := runGitFunc(t, script)
	// 0 = clean, 1 = has changes, anything else is a transport or git failure.
	if code == 0 {
		return true, out, 0
	}
	if code == 1 {
		return false, out, 0
	}
	return false, out, code
}

type reviewSnapshot struct {
	stat  string
	diff  string
	names []string
	clean bool
}

// reviewSnapshotBody returns raw with any leading preamble removed, so the
// markers are found in the script's real output.
//
// node-agent prepends a "provenance executor=... args=[...]" line that echoes
// the entire command, including the literal strings printf '__STAT__\n' and
// printf '__NAMES__\n'. Searching for the first occurrence of a marker matched
// that echo instead of the real output, so the checklist came back empty and
// the diff body was the tail of the echoed command.
//
// The real markers are always printed alone on their own line, so match on a
// whole line rather than anywhere in the text.
func reviewSnapshotBody(raw string) string {
	markers := map[string]bool{"__STAT__": true, "__NAMES__": true, "__CLEAN__": true, "__DIFF__": true}
	lines := strings.Split(raw, "\n")
	for i, line := range lines {
		if markers[strings.TrimSpace(line)] {
			return strings.Join(lines[i:], "\n")
		}
	}
	return raw
}

// reviewSnapshotErr reports why a remote git run is untrustworthy, or nil when
// the output really is a snapshot. The __CLEAN__ marker is written last, so its
// presence proves the script ran to completion; without it the run aborted
// (node unreachable, workspace unknown, cwd missing) and any partial text is an
// error message, not a diff.
func reviewSnapshotErr(snapshot string, code int) error {
	if strings.Contains(reviewSnapshotBody(snapshot), "__CLEAN__") {
		return nil
	}
	detail := strings.TrimSpace(snapshot)
	if detail == "" {
		detail = fmt.Sprintf("no output (exit %d)", code)
	}
	return fmt.Errorf("git diff failed (exit %d): %s", code, truncate(detail, 500))
}

func parseReviewSnapshot(raw string) reviewSnapshot {
	raw = reviewSnapshotBody(raw)
	part := func(name, next string) string {
		value := raw
		if i := strings.Index(value, name); i >= 0 {
			value = value[i+len(name):]
		}
		if next != "" {
			if i := strings.Index(value, next); i >= 0 {
				value = value[:i]
			}
		}
		return strings.TrimSpace(value)
	}
	return reviewSnapshot{
		stat:  part("__STAT__", "__NAMES__"),
		diff:  part("__DIFF__", ""),
		names: parseChangedFilesRaw(part("__NAMES__", "__CLEAN__")),
		clean: part("__CLEAN__", "__DIFF__") == "1",
	}
}

func handleTaskDiff(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	t, err := loadReviewTask(slug, id)
	if err != nil {
		fail(w, err, 404)
		return
	}
	if t.Status != "review" {
		fail(w, fmt.Errorf("task not in review (status=%s)", t.Status), 400)
		return
	}
	if t.Transport != "node-agent" {
		// A local task never reaches review: nothing wrote to a remote
		// workspace, so there is no diff to show. The startup migration should
		// have rewritten any legacy 'ssh' row before this point.
		fail(w, fmt.Errorf("task %s is not on a worker workspace (transport=%q)", t.ID, t.Transport), 400)
		return
	}
	// Keep the clean-workspace path cheap. In particular, do not run a full
	// diff after Git has already told us there is nothing to review. Limit the
	// remote diff too, before it is sent back over SSH/node-agent.
	posixScript := reviewScopeSetup + `printf '__STAT__\n'; git diff --stat HEAD -- "$scope"; untracked | while IFS= read -r f; do [ -f "$f" ] || continue; git diff --no-index --stat /dev/null "$f" || true; done | tail -40; printf '__NAMES__\n'; git diff --name-only HEAD -- "$scope"; untracked; printf '__CLEAN__\n'; if git diff --quiet HEAD -- "$scope" && [ -z "$(untracked)" ]; then printf '1\n'; printf '__DIFF__\n'; exit 0; else printf '0\n'; fi; printf '__DIFF__\n'; git diff HEAD -- "$scope" | head -8000; untracked | while IFS= read -r f; do [ -f "$f" ] || continue; git diff --no-index /dev/null "$f" || true; done | head -8000`
	windowsScript := reviewScopeSetupWindows +
		` & echo __STAT__ & git diff --stat HEAD -- .` +
		` & echo __NAMES__ & git diff --name-only HEAD -- . & git ls-files --others --exclude-standard -- .` +
		` & echo __CLEAN__ & (git diff --quiet HEAD -- . && git ls-files --others --exclude-standard -- . | findstr . >nul && (echo 1) || (echo 0))` +
		` & echo __DIFF__ & git diff HEAD -- .`
	script := posixScript
	if reviewIsWindowsWorker(t) {
		script = windowsScript
	}
	snapshot, code := runGitFunc(t, script)
	// A transport failure (unreachable node, unknown workspace, bad cwd)
	// returns only an error string with no __STAT__ marker. Parsing that as a
	// snapshot yields an empty file list with clean=false, which the UI
	// renders as a review with no changes — hiding a hard failure behind an
	// empty card. Require a real marker before trusting the output.
	if err := reviewSnapshotErr(snapshot, code); err != nil {
		fail(w, err, 502)
		return
	}
	review := parseReviewSnapshot(snapshot)
	files := review.names
	if len(files) == 0 && strings.TrimSpace(review.diff) != "" {
		files = parseDiffNames(review.diff)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"stat":       truncate(review.stat, 4000),
		"diff":       truncate(review.diff, diffLimit),
		"files":      files,
		"clean":      review.clean,
		"provenance": reviewProvenance(t.Result),
		"codegraph":  reviewCodeGraph(t.Result),
	})
}

// GateFailedError reports that a task's quality gate failed, carrying the output
// so the reviewer can see why without a second request.
type GateFailedError struct {
	Output string
}

func (e *GateFailedError) Error() string {
	msg := "quality gate failed; review the output and approve anyway to override"
	if trimmed := strings.TrimSpace(e.Output); trimmed != "" {
		msg += ": " + truncate(trimmed, 500)
	}
	return msg
}

// VerifyFailedError reports that a task's verification failed, carrying the
// output so the reviewer can see which check failed without a second request.
type VerifyFailedError struct {
	Output string
}

func (e *VerifyFailedError) Error() string {
	msg := "verification failed; review the output and approve anyway to override"
	if trimmed := strings.TrimSpace(e.Output); trimmed != "" {
		msg += ": " + truncate(trimmed, 500)
	}
	return msg
}

// approveLocks serialises approve operations per task.
//
// The gate is deliberately wider than the git command: two approvals racing on
// one task would both see a dirty workspace, both run `git add`, and the second
// `git commit` would either fail with "nothing to commit" or sweep up the
// first one's staged changes. Holding the lock across the commit and the status
// write is what makes the whole sequence atomic from the caller's point of view.
var approveLocks sync.Map // map[string]*sync.Mutex

// lockApprove returns the mutex for a task, creating it on first use.
func lockApprove(taskID string) *sync.Mutex {
	v, _ := approveLocks.LoadOrStore(taskID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

func handleTaskApprove(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")

	// One approval at a time per task, released when this handler returns so a
	// crashed or abandoned request cannot wedge the card forever.
	mu := lockApprove(id)
	mu.Lock()
	defer mu.Unlock()

	var req struct {
		Action  string   `json:"action"`            // done | commit | commit_push
		Message string   `json:"message,omitempty"` // optional commit message override
		Files   []string `json:"files,omitempty"`   // per-file selective commit
		// Force approves a task whose quality gate failed. It is recorded in
		// task_events, so "who shipped past a red gate" is answerable later.
		Force bool `json:"force,omitempty"`
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err := json.Unmarshal(body, &req); err != nil {
		fail(w, err, 400)
		return
	}
	if req.Action != "done" && req.Action != "commit" && req.Action != "commit_push" {
		fail(w, fmt.Errorf("action must be done, commit, or commit_push"), 400)
		return
	}
	t, err := loadReviewTask(slug, id)
	if err != nil {
		fail(w, err, 404)
		return
	}
	if t.Status != "review" {
		// Re-approving a card that is already done is a no-op, not an error.
		// This is what makes a double-click, a retried request, or a refresh
		// after a slow response harmless.
		if t.Status == "done" {
			writeJSON(w, http.StatusOK, map[string]any{
				"status": "done",
				"output": "already approved",
			})
			return
		}
		fail(w, fmt.Errorf("task not in review (status=%s)", t.Status), 400)
		return
	}
	if t.Transport != "node-agent" {
		// A local task never reaches review. See the equivalent guard in
		// handleTaskDiff.
		fail(w, fmt.Errorf("task %s is not on a worker workspace (transport=%q)", t.ID, t.Transport), 400)
		return
	}
	// A failed quality gate is a signal, not a veto: the diff is still on
	// screen and the reviewer may knowingly accept it. What must not happen is
	// passing a red gate by accident, so approval is refused unless the caller
	// says so explicitly and the override is recorded.
	if gateStatus, gateOut, gErr := kanban.GateResult(slug, id); gErr == nil && gateStatus == "failed" {
		if !req.Force {
			fail(w, &GateFailedError{Output: gateOut}, http.StatusConflict)
			return
		}
		if err := kanban.RecordGateOverride(slug, id); err != nil {
			log.Printf("approve: %s: could not record gate override: %v", id, err)
		}
	}
	// Verification holds the same line, for the same reason and with the same
	// override: a UI change that failed its own visual or accessibility suite
	// must not pass by accident, and "we shipped past a red suite" must stay
	// answerable later.
	//
	// Only "failed" is vetoed. "unavailable" and "skipped" are honest degraded
	// states that the reviewer can see on the card, and vetoing them would
	// make a node without a browser unable to approve anything at all.
	if vStatus, vOut, vErr := kanban.VerifyResult(slug, id); vErr == nil && vStatus == "failed" {
		if !req.Force {
			fail(w, &VerifyFailedError{Output: vOut}, http.StatusConflict)
			return
		}
		if err := kanban.RecordVerifyOverride(slug, id); err != nil {
			log.Printf("approve: %s: could not record verify override: %v", id, err)
		}
	}
	if req.Action == "done" {
		if err := completeApprove(slug, id); err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": "marked done without committing workspace changes"})
		return
	}

	clean, status, code := reviewWorkspaceClean(t)
	if code != 0 {
		fail(w, fmt.Errorf("git diff failed: %s", truncate(status, 500)), 500)
		return
	}
	if clean {
		if err := completeApprove(slug, id); err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": "workspace clean; no commit needed"})
		return
	}
	// Build commit message: subject + bullet changes + Refs footer.
	subject := req.Message
	if subject == "" {
		subject = t.Title
	}

	// Files listed in the body: selective set when given, else all changed files.
	commitFiles := req.Files
	if len(commitFiles) == 0 {
		commitFiles = changedFiles(t)
	}
	const maxBullet = 100
	var msgBuilder strings.Builder
	msgBuilder.WriteString(subject)
	msgBuilder.WriteString("\n\n")
	for i, f := range commitFiles {
		if i >= maxBullet {
			fmt.Fprintf(&msgBuilder, "  - … (+%d more)\n", len(commitFiles)-maxBullet)
			break
		}
		msgBuilder.WriteString("  - " + f + "\n")
	}
	msgBuilder.WriteString("\nRefs: " + t.ID + "\n")
	msg := msgBuilder.String()

	var script string
	if len(req.Files) > 0 {
		if err := validateCommitFiles(req.Files); err != nil {
			fail(w, err, 400)
			return
		}
		quoted := make([]string, len(req.Files))
		for i, f := range req.Files {
			quoted[i] = shellQuote(f)
		}
		script = fmt.Sprintf("git add -- %s && git commit -m %s", strings.Join(quoted, " "), shellQuote(msg))
	} else {
		script = fmt.Sprintf("git add -A -- \"$scope\" && git commit -m %s", shellQuote(msg))
	}
	if req.Action == "commit_push" {
		script += " && git push"
	}
	out, code := runGitFunc(t, reviewScopeSetup+script)
	if code != 0 {
		// "nothing to commit" after a successful earlier attempt means the
		// commit already landed and only the bookkeeping failed. Treat that as
		// success, or the card is stuck in review forever and a retry can never
		// clear it.
		if isNothingToCommit(out) {
			log.Printf("approve: %s: nothing to commit, treating as already approved", id)
			if err := completeApprove(slug, id); err != nil {
				fail(w, err, 500)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"status": "done",
				"output": "already committed; marked done",
			})
			return
		}
		fail(w, fmt.Errorf("git failed (exit %d): %s", code, truncate(out, 500)), 500)
		return
	}
	// The commit exists now. Record the SHA before touching the status so that a
	// crash between the two leaves evidence of what happened, and so a retry can
	// recognise the commit as its own.
	sha := headSHA(t)
	if sha != "" {
		if err := recordApproveCommit(slug, id, sha); err != nil {
			log.Printf("approve: %s: could not record commit sha: %v", id, err)
		}
	}

	// A worktree-isolated task committed onto its own branch, which the shared
	// checkout does not have. Merge it back before marking the task done,
	// otherwise "done" would mean "committed somewhere nobody is working".
	//
	// A conflict is reported and the task is left in review: resolving it is a
	// judgement call about two pieces of work, and the reviewer is the one who
	// has both on screen.
	if t.WorktreePath != "" {
		if err := mergeWorktreeBack(t); err != nil {
			log.Printf("approve: %s: merge back failed: %v", id, err)
			kanban.RecordWorktreeMergeConflict(slug, id, err.Error())
			fail(w, err, http.StatusConflict)
			return
		}
	}

	if err := completeApprove(slug, id); err != nil {
		fail(w, err, 500)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": truncate(out, 4000), "commit": sha})
}

// mergePlanFor derives the worktree plan used to merge a task's branch back.
//
// It lives apart from mergeWorktreeBack so the plan can be asserted without a
// worker. The two subtleties it encodes: the repo is the shared checkout (a
// worktree cannot check out a branch that is already checked out elsewhere), and
// the recorded branch wins over the derived name, so a task whose branch was
// renamed is still merged.
func mergePlanFor(t *reviewTask) kanban.WorktreePlan {
	plan := kanban.PlanWorktree(t.WorkspacePath, t.ID)
	if t.Branch != "" {
		plan.Branch = t.Branch
	}
	if t.WorktreePath != "" {
		plan.Path = t.WorktreePath
	}
	return plan
}

// mergeWorktreeBack merges a task's worktree branch into the repository's
// current branch on the worker.
//
// A worktree cannot check out a branch that is already checked out elsewhere, so
// the merge has to happen from the main checkout, not from the worktree.
func mergeWorktreeBack(t *reviewTask) error {
	plan := mergePlanFor(t)
	out, err := kanban.MergeWorktreeToBase(t.WorkspacePath, plan)
	if err != nil {
		return fmt.Errorf("%w\n%s", err, truncate(out, 500))
	}
	log.Printf("approve: %s: merged %s into the base branch", t.ID, plan.Branch)
	return nil
}

// completeApprove moves a task to done and stamps completed_at in one
// statement, so the two can never disagree.
//
// It also refuses to move a task that is no longer in review, which is what
// makes a second approval a no-op rather than a second event.
func completeApprove(slug, id string) error {
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return err
	}
	defer db.Close()
	res, err := db.Exec(`UPDATE tasks SET status='done', completed_at=COALESCE(completed_at, ?) WHERE id=? AND status='review'`,
		time.Now().Unix(), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Either the task is gone or another path already moved it. Report
		// success rather than a 500: the desired end state is already reached.
		return nil
	}
	// Reaching done is the end of this task's declared scope: nothing it
	// declared is being edited any more, so its paths are free for others.
	// A failure here only delays a path becoming available — the startup sweep
	// reclaims it — so it is logged rather than failing an approved commit.
	if err := kanban.ReleaseTaskLeases(db, id); err != nil {
		log.Printf("approve: %s: could not release path leases: %v", id, err)
	}
	return nil
}

// recordApproveCommit stores the SHA the approve produced, for diagnostics and
// for recognising an already-applied commit.
func recordApproveCommit(slug, id, sha string) error {
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE tasks SET last_approve_commit=? WHERE id=?`, sha, id); err != nil {
		return err
	}
	return nil
}

// headSHA reads the current HEAD commit, or "" if it cannot be determined.
func headSHA(t *reviewTask) string {
	out, code := runGitFunc(t, "git rev-parse HEAD 2>/dev/null")
	if code != 0 {
		return ""
	}
	fields := strings.Fields(out)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// isNothingToCommit reports whether git refused because the index matched HEAD.
// Both phrasings matter: older git says "nothing to commit", newer versions
// add "working tree clean" or "nothing added to commit".
func isNothingToCommit(out string) bool {
	l := strings.ToLower(out)
	return strings.Contains(l, "nothing to commit") ||
		strings.Contains(l, "nothing added to commit") ||
		strings.Contains(l, "no changes added to commit")
}

func reviewProvenance(result string) []string {
	var out []string
	for _, line := range strings.Split(result, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "provenance ") {
			out = append(out, strings.TrimSpace(line))
		}
	}
	return out
}

func reviewCodeGraph(result string) string {
	for _, line := range strings.Split(result, "\n") {
		if strings.Contains(strings.ToLower(line), "codegraph") {
			return strings.TrimSpace(line)
		}
	}
	return "skipped or unavailable"
}

func parseChangedFilesRaw(raw string) []string {
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		files = append(files, line)
	}
	return files
}

func parseDiffNames(raw string) []string {
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "diff --git ") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 4 {
			continue
		}
		name := strings.TrimPrefix(parts[len(parts)-1], "b/")
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		files = append(files, name)
	}
	return files
}

func changedFiles(t *reviewTask) []string {
	out, code := runGitFunc(t, reviewScopeSetup+`git diff --name-only HEAD -- "$scope"; untracked`)
	if code != 0 {
		return nil
	}
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		files = append(files, line)
	}
	return files
}

func validateCommitFiles(files []string) error {
	for _, f := range files {
		if f == "" {
			return fmt.Errorf("empty file path")
		}
		if strings.Contains(f, "..") {
			return fmt.Errorf("path traversal rejected: %s", f)
		}
		if filepath.IsAbs(f) {
			return fmt.Errorf("absolute path rejected: %s", f)
		}
	}
	return nil
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
