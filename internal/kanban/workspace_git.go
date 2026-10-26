package kanban

import (
	"fmt"
	"os"
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
	root, remote, err := workspaceRepoTarget(ws)
	if err != nil {
		return "", err
	}
	if remote {
		return "", fmt.Errorf("remote workspace requires node-agent")
	}
	return root, nil
}

// workspaceRepoTarget decides whether git should run against a local checkout
// or be dispatched to the remote worker through node-agent. When a workspace
// carries a remote host (such as "mac-tailscale") but its path is also mounted
// locally on this machine (and KANBAN_NODE_AGENT is not overriding the endpoint
// for a test), local git is used directly for sub-10ms branch listing.
func workspaceRepoTarget(ws Workspace) (root string, remote bool, err error) {
	path := strings.TrimSpace(ws.Path)
	if path == "" {
		return "", false, fmt.Errorf("workspace has no path")
	}
	isRemoteHost := ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1"
	expanded := localWorkspacePath(path)
	if !isRemoteHost {
		abs, absErr := filepath.Abs(expanded)
		if absErr != nil {
			return "", false, fmt.Errorf("invalid workspace path")
		}
		return abs, false, nil
	}
	if os.Getenv("KANBAN_NODE_AGENT") == "" && !strings.Contains(expanded, `\`) {
		if abs, absErr := filepath.Abs(expanded); absErr == nil {
			if st, statErr := os.Stat(abs); statErr == nil && st.IsDir() {
				return abs, false, nil
			}
		}
	}
	return path, true, nil
}

// GitBranches is the branch state both branch pickers render.
type GitBranches struct {
	Branches []string `json:"branches"`
	// Current is the checked-out branch. Empty when HEAD is detached.
	Current string `json:"current"`
	Warning string `json:"warning,omitempty"`
}

// gitIn runs git inside root and returns its combined output, trimmed.
func gitIn(root string, args ...string) (string, error) {
	full := append([]string{"-C", root}, args...)
	out, err := exec.Command("git", full...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// stripShellProvenance removes node-agent's provenance header/footer lines so
// git output parsed from workerShell matches local git output line-for-line.
func stripShellProvenance(raw string) string {
	var kept []string
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "provenance executor=") || strings.HasPrefix(trimmed, "EXECUTOR_PROOF=") {
			continue
		}
		kept = append(kept, line)
	}
	return strings.TrimSpace(strings.Join(kept, "\n"))
}

// gitInWorkspace runs git either locally or on the workspace's remote worker
// via node-agent.
func gitInWorkspace(ws Workspace, title string, args ...string) (string, error) {
	root, remote, err := workspaceRepoTarget(ws)
	if err != nil {
		return "", err
	}
	if !remote {
		return gitIn(root, args...)
	}
	quotedArgs := make([]string, 0, len(args)+1)
	quotedArgs = append(quotedArgs, "git")
	for _, a := range args {
		quotedArgs = append(quotedArgs, shellQuotePath(a))
	}
	script := fmt.Sprintf("cd %s && %s", shellQuotePath(root), strings.Join(quotedArgs, " "))
	out, code := workerShell(root, title, script)
	clean := stripShellProvenance(out)
	if code == 255 {
		return clean, fmt.Errorf("remote workspace requires node-agent: %s", firstLine(clean, nil))
	}
	if code != 0 {
		return clean, fmt.Errorf("exit status %d", code)
	}
	return clean, nil
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

// ListGitBranches returns local and origin remote-tracking branches plus the
// checked-out branch.
//
// switchyard/* branches are the per-task worktrees and are hidden: they are
// machinery, not something to base new work on. Remote-tracking branches under
// refs/remotes/origin/* (such as origin/dev when only main is checked out
// locally) are included without the "origin/" prefix so the operator can switch
// to or base a worktree on them directly from Create Task.
func ListGitBranches(ws Workspace) (GitBranches, error) {
	out, err := gitInWorkspace(ws, "git: list branches", "for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes/origin")
	if err != nil {
		if strings.Contains(err.Error(), "node-agent") || strings.Contains(err.Error(), "workspace has no path") || strings.Contains(err.Error(), "invalid workspace path") {
			return GitBranches{}, err
		}
		return GitBranches{}, fmt.Errorf("git branch failed: %s", firstLine(out, err))
	}
	branches := []string{}
	seen := map[string]bool{}
	var remoteBranches []string
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "refs/heads/"):
			name := strings.TrimPrefix(line, "refs/heads/")
			if name != "" && !strings.HasPrefix(name, "switchyard/") && !seen[name] {
				seen[name] = true
				branches = append(branches, name)
			}
		case strings.HasPrefix(line, "refs/remotes/origin/"):
			name := strings.TrimPrefix(line, "refs/remotes/origin/")
			if name != "" && name != "HEAD" && !strings.HasPrefix(name, "switchyard/") {
				remoteBranches = append(remoteBranches, name)
			}
		}
	}
	for _, name := range remoteBranches {
		if !seen[name] {
			seen[name] = true
			branches = append(branches, name)
		}
	}
	// Detached HEAD reports the literal "HEAD"; that is not a branch name, so it
	// is reported as "no current branch" rather than offered as a choice.
	current, err := gitInWorkspace(ws, "git: current branch", "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || current == "HEAD" {
		current = ""
	}
	return GitBranches{Branches: branches, Current: current}, nil
}

// GitPull fast-forwards the checked-out branch.
func GitPull(ws Workspace) (string, error) {
	out, err := gitInWorkspace(ws, "git: pull", "pull", "--ff-only")
	if err != nil {
		if strings.Contains(err.Error(), "node-agent") || strings.Contains(err.Error(), "workspace has no path") || strings.Contains(err.Error(), "invalid workspace path") {
			return out, err
		}
		return out, fmt.Errorf("git pull failed: %s", firstLine(out, err))
	}
	return out, nil
}

// GitCheckout switches the workspace to another branch (local or origin/*).
//
// The checkout is deliberately not forced. A dirty tree must fail loudly rather
// than quietly carry uncommitted work onto another branch — the caller shows
// git's own refusal, which names the conflicting files.
func GitCheckout(ws Workspace, branch string) (string, error) {
	if _, _, err := workspaceRepoTarget(ws); err != nil {
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
	// instead of git's more confusing "pathspec did not match". If the branch
	// exists only on origin, create a local tracking branch for it.
	if out, err := gitInWorkspace(ws, "git: verify branch", "rev-parse", "--verify", "--quiet", "refs/heads/"+branch); err == nil && out != "" {
		out, err = gitInWorkspace(ws, "git: checkout", "checkout", branch)
		if err != nil {
			return out, fmt.Errorf("git checkout failed: %s", firstLine(out, err))
		}
		return out, nil
	}
	if out, err := gitInWorkspace(ws, "git: verify remote branch", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/"+branch); err == nil && out != "" {
		out, err = gitInWorkspace(ws, "git: checkout tracking", "checkout", "-b", branch, "--track", "origin/"+branch)
		if err != nil {
			return out, fmt.Errorf("git checkout failed: %s", firstLine(out, err))
		}
		return out, nil
	} else if err != nil && strings.Contains(err.Error(), "node-agent") {
		return "", err
	}
	return "", fmt.Errorf("unknown branch %q", branch)
}
