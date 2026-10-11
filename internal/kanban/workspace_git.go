package kanban

import (
	"fmt"
	"os/exec"
	"strings"
)

// ListGitBranches returns the local branches for a workspace.
//
// Remote workspaces are not supported: the branch list is only useful when
// the repo is on the same machine as the server, because the UI needs it
// before the task is dispatched.
func ListGitBranches(ws Workspace) ([]string, error) {
	resolved, err := ResolveWorkspaceFile(ws, "")
	if err != nil {
		return nil, err
	}
	if resolved.Transport != "local" {
		return nil, fmt.Errorf("remote workspace requires node-agent")
	}
	repo := resolved.LocalPath
	out, err := exec.Command("git", "-C", repo, "branch", "--format=%(refname:short)").Output()
	if err != nil {
		return nil, fmt.Errorf("git branch failed: %w", err)
	}
	var branches []string
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "switchyard/") {
			branches = append(branches, line)
		}
	}
	return branches, nil
}

// GitPull runs `git pull` in a workspace and returns the output.
//
// Like ListGitBranches, this only works for local workspaces.
func GitPull(ws Workspace) (string, error) {
	resolved, err := ResolveWorkspaceFile(ws, "")
	if err != nil {
		return "", err
	}
	if resolved.Transport != "local" {
		return "", fmt.Errorf("remote workspace requires node-agent")
	}
	repo := resolved.LocalPath
	out, err := exec.Command("git", "-C", repo, "pull", "--ff-only").CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git pull failed: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}
