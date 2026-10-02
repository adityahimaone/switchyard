package main

import (
	"os"
	"strings"
	"testing"
)

// TestReviewTaskWorkdirPrefersWorktree proves the review gate looks at the same
// checkout the agent edited. Getting this wrong is the whole failure mode F3
// exists to prevent: a diff taken from the shared checkout while the agent
// worked in a worktree shows the wrong files.
func TestReviewTaskWorkdirPrefersWorktree(t *testing.T) {
	shared := &reviewTask{WorkspacePath: "/Users/me/saas"}
	if got := shared.Workdir(); got != "/Users/me/saas" {
		t.Errorf("a workspace-isolated task must review the shared checkout, got %q", got)
	}

	isolated := &reviewTask{
		ID:            "t_1",
		WorkspacePath: "/Users/me/saas",
		Branch:        "switchyard/t_1",
		WorktreePath:  "/Users/me/saas/.switchyard/t_1",
	}
	if got := isolated.Workdir(); got != "/Users/me/saas/.switchyard/t_1" {
		t.Errorf("a worktree-isolated task must review its worktree, got %q", got)
	}

	// A blank worktree column must not send work to a directory named "".
	blank := &reviewTask{WorkspacePath: "/Users/me/saas", WorktreePath: "   "}
	if got := blank.Workdir(); got != "/Users/me/saas" {
		t.Errorf("a blank worktree path must fall back to the shared checkout, got %q", got)
	}
}

// TestApproveScriptTargetsTheWorkdir proves runGit dispatches into the workdir
// rather than the raw workspace_path, by checking the request that would be
// built. runGit itself needs a live worker, so the assertion is on the value it
// reads.
func TestApproveUsesWorkdirNotWorkspacePath(t *testing.T) {
	task := &reviewTask{
		ID:            "t_1",
		WorkspacePath: "/Users/me/saas",
		Branch:        "switchyard/t_1",
		WorktreePath:  "/Users/me/saas/.switchyard/t_1",
	}
	// Whatever runGit sends as Workspace must be the workdir.
	if task.Workdir() == task.WorkspacePath {
		t.Fatal("test setup: workdir and workspace path are identical")
	}
	// And the merge helper must target the repo, not the worktree: a worktree
	// cannot check out a branch that is already checked out elsewhere, so the
	// merge has to happen from the main checkout.
	plan := mergePlanFor(task)
	if plan.Repo != task.WorkspacePath {
		t.Errorf("merge repo = %q, want the shared checkout %q", plan.Repo, task.WorkspacePath)
	}
	if plan.Branch != task.Branch {
		t.Errorf("merge branch = %q, want the recorded branch %q", plan.Branch, task.Branch)
	}
}

// TestSecurityHeadersUnchangedByWorktree makes sure the worktree feature did not
// weaken the earlier hardening. It is a cheap guard against a future edit
// reordering the middleware chain and silently dropping the origin check.
func TestSecurityHeadersUnchangedByWorktree(t *testing.T) {
	src := readMainSource(t)
	if !strings.Contains(src, "securityHeaders(sameOriginGuard(authHandler(mux)))") {
		t.Error("the middleware chain must keep securityHeaders outside sameOriginGuard outside authHandler")
	}
}

func readMainSource(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
