package kanban

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// workspaceRepoRoot resolves the local checkout a git command should run in.
//
// Branch listing, pull and checkout all operate on the workspace root itself.
// This deliberately does NOT go through ResolveWorkspaceFile: that helper
// resolves a path *inside* a workspace and rejects the empty relative path
// these calls need, and it also demands a non-empty workspace id — which
// path-only registry entries written by the hermes CLI do not carry. Routing
// through it made every branch and pull call fail with "invalid workspace
// path" before git was ever invoked.
func workspaceRepoRoot(ws Workspace) (string, error) {
	path := strings.TrimSpace(ws.Path)
	if path == "" {
		return "", fmt.Errorf("workspace has no path")
	}
	if ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1" {
		// The branch list is only useful before dispatch, and a remote checkout
		// is reachable only through node-agent.
		return "", fmt.Errorf("remote workspace requires node-agent")
	}
	abs, err := filepath.Abs(localWorkspacePath(path))
	if err != nil {
		return "", fmt.Errorf("invalid workspace path")
	}
	return abs, nil
}

// GitBranches is the branch state both branch pickers render.
type GitBranches struct {
	Branches []string `json:"branches"`
	// Current is the checked-out branch. Empty when HEAD is detached.
	Current string `json:"current"`
}

// gitIn runs git inside root and returns its combined output, trimmed.
func gitIn(root string, args ...string) (string, error) {
	full := append([]string{"-C", root}, args...)
	out, err := exec.Command("git", full...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// firstLine reduces a git failure to the one line that explains it.
//
// git writes the reason to stderr and exits non-zero, so the useful text is in
// the output, not in Go's "exit status 1". The error is only a fallback for the
// rare case where git said nothing at all.
func firstLine(out string, err error) string {
	line := strings.TrimSpace(out)
	if i := strings.IndexByte(line, '\n'); i >= 0 {
		line = line[:i]
	}
	if line == "" && err != nil {
		line = err.Error()
	}
	return line
}

// ListGitBranches returns local branches plus the checked-out branch.
//
// switchyard/* branches are the per-task worktrees and are hidden: they are
// machinery, not something to base new work on.
func ListGitBranches(ws Workspace) (GitBranches, error) {
	root, err := workspaceRepoRoot(ws)
	if err != nil {
		return GitBranches{}, err
	}
	out, err := gitIn(root, "branch", "--format=%(refname:short)")
	if err != nil {
		return GitBranches{}, fmt.Errorf("git branch failed: %s", firstLine(out, err))
	}
	branches := []string{}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "switchyard/") {
			branches = append(branches, line)
		}
	}
	// Detached HEAD reports the literal "HEAD"; that is not a branch name, so it
	// is reported as "no current branch" rather than offered as a choice.
	current, err := gitIn(root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || current == "HEAD" {
		current = ""
	}
	return GitBranches{Branches: branches, Current: current}, nil
}

// GitPull fast-forwards the checked-out branch.
func GitPull(ws Workspace) (string, error) {
	root, err := workspaceRepoRoot(ws)
	if err != nil {
		return "", err
	}
	out, err := gitIn(root, "pull", "--ff-only")
	if err != nil {
		return out, fmt.Errorf("git pull failed: %s", firstLine(out, err))
	}
	return out, nil
}

// GitCheckout switches the workspace to another local branch.
//
// The checkout is deliberately not forced. A dirty tree must fail loudly rather
// than quietly carry uncommitted work onto another branch — the caller shows
// git's own refusal, which names the conflicting files.
func GitCheckout(ws Workspace, branch string) (string, error) {
	root, err := workspaceRepoRoot(ws)
	if err != nil {
		return "", err
	}
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return "", fmt.Errorf("branch required")
	}
	if strings.HasPrefix(branch, "switchyard/") {
		return "", fmt.Errorf("cannot switch to a task worktree branch")
	}
	// Verify before checking out so an unknown name fails as "unknown branch"
	// instead of git's more confusing "pathspec did not match".
	if out, err := gitIn(root, "rev-parse", "--verify", "--quiet", "refs/heads/"+branch); err != nil || out == "" {
		return "", fmt.Errorf("unknown branch %q", branch)
	}
	out, err := gitIn(root, "checkout", branch)
	if err != nil {
		return out, fmt.Errorf("git checkout failed: %s", firstLine(out, err))
	}
	return out, nil
}
