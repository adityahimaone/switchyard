package kanban

import (
	"database/sql"
	"fmt"
	"log"
	"path"
	"strings"
	"time"
)

// Git worktree isolation.
//
// A worktree-isolated task does not edit the shared checkout. It gets its own
// worktree under <repo>/.switchyard/<task-id> on its own branch, so two tasks on
// one repository cannot interleave edits and the review diff belongs to exactly
// one task. That is the difference between a declared path list (a coordination
// aid) and real containment.
//
// Everything here runs as a shell command on the worker over node-agent, using
// the existing dispatch contract. No node-agent change is needed, and the reason
// is worth recording:
//
//   - Routing works because node-agent matches a node's registered workspace
//     prefixes segment-aware, so "<repo>/.switchyard/<id>" is claimed by the same
//     node as "<repo>".
//   - The worker refuses a workspace directory that does not exist
//     ("workspace not found"), so the worktree must be created BEFORE the agent
//     is dispatched into it. That ordering is enforced in EnsureTaskWorktree.
//
// Layout:
//
//	/Users/me/saas/                  main checkout (other tasks may edit this)
//	  .switchyard/
//	    t_123/                        this task's worktree
//	    t_124/                        another task's worktree
//
// .switchyard/ must be gitignored on the worker, or the review gate's own diff
// would include the worktree directories. EnsureWorktreeIgnored adds it.

// worktreeDirName is the directory, relative to the repo root, holding every
// worktree for that repo.
const worktreeDirName = ".switchyard"

// branchPrefix namespaces the per-task branches so they are visibly
// Switchyard's and never collide with a human's branch names.
const branchPrefix = "switchyard/"

// WorktreePlan is the derived location for a task's worktree.
type WorktreePlan struct {
	Repo     string
	Path     string
	Branch   string
	TaskID   string
	Worktree bool
}

// PlanWorktree derives where a task's worktree lives.
//
// It is a pure function of the repo path and task id, so the path can be
// computed and tested without a worker, and so a retry reuses the same location
// rather than inventing a new one.
func PlanWorktree(repo, taskID string) WorktreePlan {
	repo = strings.TrimRight(strings.TrimSpace(repo), "/")
	return WorktreePlan{
		Repo:     repo,
		Path:     path.Join(repo, worktreeDirName, taskID),
		Branch:   branchPrefix + taskID,
		TaskID:   taskID,
		Worktree: true,
	}
}

// shellQuotePath single-quotes a path for a POSIX shell on the worker.
//
// The repo path comes from the workspace registry, which is operator-entered
// JSON, and the task id is server-generated. Neither is untrusted enough to skip
// quoting: a path with a space would split the command, and this is the exact
// class of bug the review gate's shellQuote work already fixed once.
func shellQuotePath(p string) string {
	return "'" + strings.ReplaceAll(p, "'", `'\''`) + "'"
}

// gitWorktreeAddScript renders the command that creates a worktree.
//
// The parent directory is created first because `git worktree add` will not
// create intermediate directories itself. --quiet keeps git's advice out of the
// output, which the caller treats as an error signal.
//
// `-b` fails if the branch already exists, which is the right behaviour for a
// retry: the caller checks for an existing worktree first and reuses it, so
// reaching this with an existing branch means something is wrong and should be
// reported rather than silently reusing a half-finished one.
func gitWorktreeAddScript(p WorktreePlan) string {
	return fmt.Sprintf("mkdir -p %s && cd %s && git worktree add --quiet -b %s %s",
		shellQuotePath(path.Dir(p.Path)),
		shellQuotePath(p.Repo),
		shellQuotePath(p.Branch),
		shellQuotePath(p.Path))
}

// gitWorktreeListScript lists the worktrees of a repo as "path\tbranch" lines,
// which is the form git emits and the form the parser below expects.
func gitWorktreeListScript(repo string) string {
	return fmt.Sprintf("cd %s && git worktree list --porcelain", shellQuotePath(repo))
}

// WorktreeExists reports whether the planned worktree is already registered with
// the repo. A retry reuses it rather than creating a second one.
func WorktreeExists(listOutput, worktreePath string) bool {
	want := normalizePath(worktreePath)
	for _, line := range strings.Split(listOutput, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "worktree ") {
			continue
		}
		if normalizePath(strings.TrimPrefix(trimmed, "worktree ")) == want {
			return true
		}
	}
	return false
}

// BranchOnWorktree reads the branch checked out in a worktree, or "".
func BranchOnWorktree(listOutput, worktreePath string) string {
	want := normalizePath(worktreePath)
	lines := strings.Split(listOutput, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "worktree ") {
			continue
		}
		if normalizePath(strings.TrimPrefix(trimmed, "worktree ")) != want {
			continue
		}
		// The branch line follows the worktree line, possibly after a HEAD and
		// a detached marker.
		for _, next := range lines[i+1:] {
			t := strings.TrimSpace(next)
			if strings.HasPrefix(t, "worktree ") {
				break // moved to the next entry
			}
			if strings.HasPrefix(t, "branch ") {
				return strings.TrimPrefix(t, "branch ")
			}
		}
		return ""
	}
	return ""
}

// gitWorktreeRemoveScript removes a worktree and deletes its branch.
//
// --force is required because an agent may have left untracked files behind, and
// the point of removing the worktree is to discard exactly those. prune then
// clears the administrative entry, without which the repo keeps a stale record
// that blocks recreating the same path.
func gitWorktreeRemoveScript(p WorktreePlan) string {
	return fmt.Sprintf("cd %s && git worktree remove --force %s 2>/dev/null; git branch -D %s 2>/dev/null; git worktree prune",
		shellQuotePath(p.Repo),
		shellQuotePath(p.Path),
		shellQuotePath(p.Branch))
}

// ensureWorktreeIgnoredScript adds .switchyard/ to the repo's .git/info/exclude.
//
// .git/info/exclude rather than .gitignore: the exclusion is local to the
// machine, so it does not dirty the repo's tracked .gitignore and does not need
// to be committed for every clone. This matters because the worktree directory
// would otherwise appear in the review gate's own diff, making every task look
// like it rewrote the world.
func ensureWorktreeIgnoredScript(repo string) string {
	return fmt.Sprintf("cd %s && mkdir -p .git && grep -qxF '%s/' .git/info/exclude 2>/dev/null || printf '\\n# Switchyard task worktrees\\n%s/\\n' >> .git/info/exclude",
		shellQuotePath(repo), worktreeDirName, worktreeDirName)
}

// IsWorktreeIsolation reports whether a task asked for worktree isolation.
func IsWorktreeIsolation(isolation string) bool {
	return strings.TrimSpace(isolation) == "worktree"
}

// SaveWorktreeBinding records the branch and path a task was given.
//
// It is written after the worktree exists, so a task never claims a worktree
// that was not created. Recording it in the same transaction as nothing else is
// deliberate: this is a fact about the filesystem, and a later retry reuses it
// rather than re-deriving.
func SaveWorktreeBinding(db *sql.DB, taskID, branch, worktreePath string) error {
	_, err := db.Exec(`UPDATE tasks SET branch=?, worktree_path=? WHERE id=?`, branch, worktreePath, taskID)
	return err
}

// TaskWorktree returns a task's recorded branch and worktree path, or empty
// strings for a workspace-isolated task.
func TaskWorktree(db *sql.DB, taskID string) (branch, worktreePath string, err error) {
	err = db.QueryRow(`SELECT COALESCE(branch,''), COALESCE(worktree_path,'') FROM tasks WHERE id=?`, taskID).
		Scan(&branch, &worktreePath)
	return branch, worktreePath, err
}

// WorktreeWorkspace returns the path a task's executor and review commands
// should run in: its worktree when it has one, otherwise the shared workspace.
//
// This is the single place that answers it, so the dispatcher, the review gate
// and the quality gate cannot disagree about where a task's work lives.
func WorktreeWorkspace(sharedWorkspace, worktreePath string) string {
	if strings.TrimSpace(worktreePath) != "" {
		return worktreePath
	}
	return sharedWorkspace
}

// StartWorktreeLifetime logs the lifecycle of a worktree. Kept as a helper so
// the messages are in one place and read the same wherever a worktree is
// created or removed.
func logWorktree(action, taskID, path, branch string) {
	log.Printf("worktree: %s %s path=%s branch=%s", action, taskID, path, branch)
}

// worktreeGracePeriod is how long a worktree is kept after a task finishes.
//
// Long enough that a reviewer can still inspect it after approving, short enough
// that the repo does not accumulate directories indefinitely. A worktree for a
// task that reached done is removed by the cleanup sweep once this elapses.
const worktreeGracePeriod = 72 * time.Hour

// RecordWorktreeMergeConflict notes that an approve could not merge a task's
// worktree branch back into the base branch.
//
// The task stays in review with its diff intact, so the reviewer resolves the
// conflict against the other work. Recording it here is what makes the blocked
// approve visible in the task's history rather than only in the server log.
func RecordWorktreeMergeConflict(slug, taskID, message string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	return insertEvent(db, taskID, "worktree_merge_conflict", map[string]any{
		"source":  "board-ui",
		"message": truncateWorktreeOutput(message),
	})
}

// WorktreeDueForRemoval reports whether a completed task's worktree is old
// enough to reclaim.
//
// The branch is deliberately not deleted here: the commits it carries may have
// been pushed, and destroying that is a decision for a human, not a timer.
func WorktreeDueForRemoval(completedAt time.Time, now time.Time) bool {
	if completedAt.IsZero() {
		return false
	}
	return now.Sub(completedAt) > worktreeGracePeriod
}
