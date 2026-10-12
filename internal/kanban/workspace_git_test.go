package kanban

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// gitFixture builds a throwaway repo with a "main" branch and a "feature"
// branch, so the branch calls have something real to read.
func gitFixture(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		full := append([]string{"-C", dir}, args...)
		if out, err := exec.Command("git", full...).CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	run("init", "-b", "main")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "test")
	run("commit", "--allow-empty", "-m", "init")
	run("branch", "feature")
	return dir
}

// TestListGitBranchesPathOnlyWorkspace is the regression guard for the bug that
// made the whole feature dead: ListGitBranches used to resolve the workspace
// through ResolveWorkspaceFile(ws, ""), which rejects an empty relative path and
// demands a non-empty workspace id. Every call failed with "invalid workspace
// path" before git was ever reached — and a path-only registry entry (what the
// hermes CLI writes) has no id at all.
func TestListGitBranchesPathOnlyWorkspace(t *testing.T) {
	dir := gitFixture(t)

	got, err := ListGitBranches(Workspace{Path: dir}) // deliberately no ID
	if err != nil {
		t.Fatalf("ListGitBranches: %v", err)
	}
	if got.Current != "main" {
		t.Errorf("Current = %q, want main", got.Current)
	}
	if !branchListContains(got.Branches, "main") || !branchListContains(got.Branches, "feature") {
		t.Errorf("Branches = %v, want main and feature", got.Branches)
	}
}

// TestListGitBranchesHidesWorktreeBranches keeps the per-task worktrees out of
// the picker: they are machinery, not a base for new work.
func TestListGitBranchesHidesWorktreeBranches(t *testing.T) {
	dir := gitFixture(t)
	if out, err := exec.Command("git", "-C", dir, "branch", "switchyard/t_1").CombinedOutput(); err != nil {
		t.Fatalf("branch: %v\n%s", err, out)
	}
	got, err := ListGitBranches(Workspace{Path: dir})
	if err != nil {
		t.Fatalf("ListGitBranches: %v", err)
	}
	for _, b := range got.Branches {
		if strings.HasPrefix(b, "switchyard/") {
			t.Errorf("worktree branch %q leaked into the picker", b)
		}
	}
}

func TestGitCheckoutSwitchesBranch(t *testing.T) {
	dir := gitFixture(t)
	ws := Workspace{Path: dir}

	if _, err := GitCheckout(ws, "feature"); err != nil {
		t.Fatalf("GitCheckout: %v", err)
	}
	got, err := ListGitBranches(ws)
	if err != nil {
		t.Fatalf("ListGitBranches: %v", err)
	}
	if got.Current != "feature" {
		t.Errorf("Current = %q, want feature", got.Current)
	}
}

func TestGitCheckoutRejectsUnknownAndWorktreeBranches(t *testing.T) {
	dir := gitFixture(t)
	ws := Workspace{Path: dir}

	if _, err := GitCheckout(ws, "nope"); err == nil {
		t.Error("checkout of an unknown branch must fail")
	}
	// A switchyard/* branch is a task worktree; switching the shared checkout
	// onto it would fight the dispatcher for it.
	if _, err := GitCheckout(ws, "switchyard/t_1"); err == nil {
		t.Error("checkout of a worktree branch must fail")
	}
	if _, err := GitCheckout(ws, "  "); err == nil {
		t.Error("checkout with an empty branch must fail")
	}
	// None of the refusals may have moved HEAD.
	got, err := ListGitBranches(ws)
	if err != nil {
		t.Fatalf("ListGitBranches: %v", err)
	}
	if got.Current != "main" {
		t.Errorf("Current = %q, want main (a refused checkout must not move HEAD)", got.Current)
	}
}

// TestGitCallsRejectRemoteAndPathlessWorkspaces pins the two cases that cannot
// work locally, so they fail with a message the UI can show rather than a
// confusing git error.
func TestGitCallsRejectRemoteAndPathlessWorkspaces(t *testing.T) {
	remote := Workspace{ID: "mac", Name: "mac", Path: "/Users/me/saas", Host: "mac-tailscale"}
	if _, err := ListGitBranches(remote); err == nil || !strings.Contains(err.Error(), "node-agent") {
		t.Errorf("remote workspace error = %v, want a node-agent message", err)
	}
	if _, err := GitPull(remote); err == nil || !strings.Contains(err.Error(), "node-agent") {
		t.Errorf("remote pull error = %v, want a node-agent message", err)
	}
	if _, err := ListGitBranches(Workspace{ID: "empty"}); err == nil {
		t.Error("a workspace with no path must fail")
	}
}

// TestWorkspaceRepoRootDoesNotEscapeTheWorkspace: the root is the workspace
// itself, so a relative path can never widen what git is pointed at.
func TestWorkspaceRepoRootDoesNotEscapeTheWorkspace(t *testing.T) {
	dir := gitFixture(t)
	root, err := workspaceRepoRoot(Workspace{Path: dir})
	if err != nil {
		t.Fatalf("workspaceRepoRoot: %v", err)
	}
	if root != filepath.Clean(dir) {
		t.Errorf("root = %q, want %q", root, filepath.Clean(dir))
	}
}

func branchListContains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}
