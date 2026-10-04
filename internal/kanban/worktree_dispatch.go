package kanban

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

// Running worktree commands on the worker.
//
// Everything in this file is a shell command dispatched through node-agent using
// the existing contract: Executor "shell", NoRTK, and the task's workspace as
// the routing key. No node-agent change is required, for two reasons that are
// worth keeping in mind if that ever changes:
//
//   - node-agent matches a node's registered workspace prefixes segment-aware, so
//     "<repo>/.switchyard/<id>" routes to the same node as "<repo>".
//   - the worker refuses a workspace that does not exist, so the worktree must
//     exist before anything is dispatched into it. That is why creation happens
//     here, before the agent dispatch, rather than as a step inside the agent.

// workerShell runs one command in a workspace on a worker and returns its
// combined output. A non-zero exit is reported through code, not as an error, so
// a caller can inspect git's own message.
func workerShell(workspace, title, command string) (string, int) {
	res, err := DispatchRemoteRaw(NodeDispatchRequest{
		TaskID:    "worktree",
		Title:     title,
		Workspace: workspace,
		Executor:  "shell",
		Command:   command,
		NoRTK:     true,
	}, RemoteDispatchWait())
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

// EnsureTaskWorktree creates the worktree for a task if it does not already
// have one, and returns the path its work should happen in.
//
// It is called after the claim and before the agent dispatch, because the worker
// refuses a workspace directory that does not exist. A task that is retried
// reuses its existing worktree rather than creating a second one, so a retry
// continues from whatever the previous attempt left behind.
func EnsureTaskWorktree(db *sql.DB, taskID, repoPath string) (string, error) {
	if strings.TrimSpace(repoPath) == "" {
		return "", fmt.Errorf("worktree isolation needs a workspace path")
	}
	plan := PlanWorktree(repoPath, taskID)

	// Already bound by an earlier attempt: reuse it.
	if _, existing, err := TaskWorktree(db, taskID); err == nil && existing != "" {
		return existing, nil
	}

	// Make the directory invisible to this repo's own diffs first, so creating
	// the worktree does not itself show up as a change.
	if out, code := workerShell(repoPath, "worktree: exclude .switchyard",
		ensureWorktreeIgnoredScript(repoPath)); code != 0 {
		log.Printf("worktree: %s: could not add %s to .git/info/exclude: %s", taskID, worktreeDirName, strings.TrimSpace(out))
	}

	// Reuse an existing worktree if one is already registered — a retry, or a
	// server that restarted between the worktree add and the binding write.
	if out, code := workerShell(repoPath, "worktree: list", gitWorktreeListScript(repoPath)); code == 0 {
		if WorktreeExists(out, plan.Path) {
			branch := BranchOnWorktree(out, plan.Path)
			if branch == "" {
				branch = plan.Branch
			}
			if err := SaveWorktreeBinding(db, taskID, branch, plan.Path); err != nil {
				return "", err
			}
			logWorktree("reusing", taskID, plan.Path, branch)
			return plan.Path, nil
		}
	}

	if out, code := workerShell(repoPath, "worktree: add", gitWorktreeAddScript(plan)); code != 0 {
		// A concurrent attempt for the same task can win the race. Re-check
		// before reporting a failure, so a duplicate does not surface as a
		// broken task.
		if out2, code2 := workerShell(repoPath, "worktree: list", gitWorktreeListScript(repoPath)); code2 == 0 && WorktreeExists(out2, plan.Path) {
			if err := SaveWorktreeBinding(db, taskID, plan.Branch, plan.Path); err != nil {
				return "", err
			}
			logWorktree("reusing-after-race", taskID, plan.Path, plan.Branch)
			return plan.Path, nil
		}
		return "", fmt.Errorf("git worktree add failed (exit %d): %s", code, truncateWorktreeOutput(out))
	}
	if err := SaveWorktreeBinding(db, taskID, plan.Branch, plan.Path); err != nil {
		return "", err
	}
	logWorktree("created", taskID, plan.Path, plan.Branch)
	return plan.Path, nil
}

// RemoveTaskWorktree discards a task's worktree.
//
// The branch is kept when the worktree does not exist, because this is also the
// path taken when a task never got as far as creating one, and deleting a
// branch that a human pushed would be destructive.
func RemoveTaskWorktree(db *sql.DB, taskID, repoPath string) error {
	_, worktreePath, err := TaskWorktree(db, taskID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(worktreePath) == "" {
		return nil
	}
	plan := PlanWorktree(repoPath, taskID)
	plan.Path = worktreePath
	if out, code := workerShell(repoPath, "worktree: remove", gitWorktreeRemoveScript(plan)); code != 0 {
		// Not fatal: the worktree may already be gone, which is the desired
		// end state. Log so a real failure is visible.
		log.Printf("worktree: %s: remove returned %d: %s", taskID, code, strings.TrimSpace(out))
	}
	logWorktree("removed", taskID, worktreePath, plan.Branch)
	return nil
}

// MergeWorktreeToBase merges a worktree branch back into the repository's
// current branch, which is how an approved worktree change lands in the shared
// checkout.
//
// It is a merge rather than a rebase so the commit keeps its identity: the
// reviewer approved a specific commit, and rewriting it after approval would
// invalidate what they saw. A conflict is reported rather than auto-resolved —
// resolving it is a judgement call, and doing it in the server would hide it.
func MergeWorktreeToBase(repoPath string, p WorktreePlan) (string, error) {
	base := currentBranchScript(repoPath)
	script := fmt.Sprintf("cd %s && base=$(%s) && git merge --no-edit %s",
		shellQuotePath(repoPath), base, shellQuotePath(p.Branch))
	out, code := workerShell(repoPath, "worktree: merge", script)
	if code != 0 {
		return out, fmt.Errorf("merge of %s failed (exit %d): %s", p.Branch, code, truncateWorktreeOutput(out))
	}
	return out, nil
}

// currentBranchScript resolves the base branch name on the worker.
//
// A detached HEAD has no branch to merge into, and the merge target would be
// ambiguous, so the caller gets an explicit error rather than a merge into
// whatever HEAD happened to be.
func currentBranchScript(repoPath string) string {
	return fmt.Sprintf("cd %s && git rev-parse --abbrev-ref HEAD", shellQuotePath(repoPath))
}

// truncateWorktreeOutput keeps a git error readable in a log line and in a task
// event, where the full message would be noise.
func truncateWorktreeOutput(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 800 {
		return s[:800] + "…"
	}
	return s
}

// SweepAllBoardWorktrees reclaims stale worktrees across every board.
//
// It reports rather than returns an error: one unreachable worker must not stop
// the other boards from being cleaned up, and a failure here is a leaked
// directory, not a lost task.
func SweepAllBoardWorktrees(now time.Time) int {
	boards, err := ListBoards()
	if err != nil {
		log.Printf("worktree: sweep: could not list boards: %v", err)
		return 0
	}
	total := 0
	for _, b := range boards {
		db, err := openDB(b.Slug)
		if err != nil {
			continue
		}
		n, err := SweepStaleWorktrees(db, now)
		db.Close()
		if err != nil {
			log.Printf("worktree: sweep: board %s: %v", b.Slug, err)
			continue
		}
		if n > 0 {
			log.Printf("worktree: sweep: board %s: reclaimed %d worktree(s)", b.Slug, n)
		}
		total += n
	}
	return total
}

// SweepStaleWorktrees removes worktrees belonging to tasks that finished long ago.
//
// The branch is intentionally not deleted by the sweep: those commits may have
// been pushed, and discarding them on a timer is not a decision the server
// should make unattended.
func SweepStaleWorktrees(db *sql.DB, now time.Time) (removed int, err error) {
	rows, err := db.Query(`SELECT id, COALESCE(workspace_path,''), COALESCE(worktree_path,''), completed_at
		FROM tasks
		WHERE COALESCE(worktree_path,'') <> '' AND completed_at IS NOT NULL`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type candidate struct {
		id, repo, path string
		completedAt    time.Time
	}
	var due []candidate
	for rows.Next() {
		var c candidate
		var completed int64
		if err := rows.Scan(&c.id, &c.repo, &c.path, &completed); err != nil {
			continue
		}
		c.completedAt = time.Unix(completed, 0)
		if WorktreeDueForRemoval(c.completedAt, now) {
			due = append(due, c)
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, c := range due {
		plan := PlanWorktree(c.repo, c.id)
		plan.Path = c.path
		if _, code := workerShell(c.repo, "worktree: sweep", gitWorktreeRemoveScript(plan)); code != 0 {
			log.Printf("worktree: sweep: %s: remove returned %d", c.id, code)
			continue
		}
		// Clear the binding so the sweep does not retry it forever, and so the
		// card stops advertising a worktree that no longer exists.
		if _, err := db.Exec(`UPDATE tasks SET worktree_path='', branch='' WHERE id=?`, c.id); err != nil {
			log.Printf("worktree: sweep: %s: could not clear binding: %v", c.id, err)
			continue
		}
		if err := insertEvent(db, c.id, "worktree_reclaimed", map[string]any{
			"source": "sweeper", "path": c.path, "branch": plan.Branch,
		}); err != nil {
			log.Printf("worktree: sweep: %s: could not record event: %v", c.id, err)
		}
		logWorktree("reclaimed", c.id, c.path, plan.Branch)
		removed++
	}
	return removed, nil
}
