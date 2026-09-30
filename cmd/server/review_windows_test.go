//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The review gate builds git scripts that run on the WORKER, not on the control
// plane. node-agent executes a Windows shell task as `cmd /c <one argv string>`
// (see node-agent cmd/agent/main.go), which constrains these scripts in two ways
// the POSIX path never sees:
//
//   - Go quotes that single argv element, so a double quote arrives as \" and
//     breaks cmd's own parsing.
//   - cmd expands %VAR% while PARSING a line, so a variable assigned earlier on
//     the same single line still reads back empty (no /v:on delayed expansion).
//
// These run the real script through the real shell so a regression in either
// rule fails here instead of silently emptying a review card in production.
//
// Build-tagged to Windows so the helpers below never enter the POSIX test build.
func TestReviewWindowsScriptsRunUnderCmd(t *testing.T) {
	repo := tempGitRepo(t)

	diffOut, code := runCmdScript(repo, reviewScopeSetupWindows+
		` & echo __STAT__ & git diff --stat HEAD -- .`+
		` & echo __NAMES__ & git diff --name-only HEAD -- . & git ls-files --others --exclude-standard -- .`+
		` & echo __CLEAN__ & (git diff --quiet HEAD -- . && git ls-files --others --exclude-standard -- . | findstr . >nul && (echo 1) || (echo 0))`+
		` & echo __DIFF__ & git diff HEAD -- .`)
	if code != 0 {
		t.Fatalf("diff script exit = %d, want 0; output:\n%s", code, diffOut)
	}
	snap := parseReviewSnapshot(reviewSnapshotBody(diffOut))
	if got := snap.names; !contains(got, "untracked.txt") || !contains(got, "tracked.txt") {
		t.Errorf("names = %q, want both tracked.txt and untracked.txt", got)
	}
	if snap.clean {
		t.Error("clean = true, want false: repo has a modification and an untracked file")
	}
	if !strings.Contains(snap.diff, "tracked.txt") {
		t.Errorf("diff body missing the tracked modification:\n%s", snap.diff)
	}

	// A dirty repo must report "has changes" (1), never "clean" (0).
	if _, code := runCmdScript(repo, reviewCleanWindows); code != 1 {
		t.Errorf("reviewCleanWindows exit = %d, want 1 on a dirty repo", code)
	}

	// A clean repo must report 0, or approve would skip the commit entirely.
	// Remove both sources of dirt: the uncommitted edit (restore) and the
	// untracked file (delete).
	if out, err := exec.Command("git", "-C", repo, "checkout", "--", "tracked.txt").CombinedOutput(); err != nil {
		t.Fatalf("git checkout: %v\n%s", err, out)
	}
	if err := os.Remove(filepath.Join(repo, "untracked.txt")); err != nil {
		t.Fatal(err)
	}
	if _, code := runCmdScript(repo, reviewCleanWindows); code != 0 {
		t.Errorf("reviewCleanWindows exit = %d, want 0 on a clean repo", code)
	}

	// Outside a repo the guard must fail loudly (2) rather than report a clean
	// workspace, which would silently drop the commit step.
	if _, code := runCmdScript(t.TempDir(), reviewCleanWindows); code != 2 {
		t.Errorf("guard exit = %d, want 2 outside a git work tree", code)
	}
}

// runCmdScript invokes script exactly as node-agent's Windows worker does:
// exec("cmd", "/c", script) with dir as the working directory.
func runCmdScript(dir, script string) (string, int) {
	cmd := exec.Command("cmd", "/c", script)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err == nil {
		return string(out), 0
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return string(out), ee.ExitCode()
	}
	return string(out) + err.Error(), -1
}

// tempGitRepo builds a throwaway repo with one committed file plus one
// uncommitted edit, so both the tracked and untracked review paths are live.
// Identity and config are pinned inside the temp dir so the test never reads
// the developer's real ~/.gitconfig.
func tempGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"HOME="+dir,
			"GIT_CONFIG_GLOBAL="+filepath.Join(dir, "gitconfig"),
			"GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@example.com",
			"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run("init", "-q")
	write("tracked.txt", "one\n")
	write("untracked.txt", "new\n")
	run("add", "tracked.txt")
	run("commit", "-q", "-m", "base")
	write("tracked.txt", "one\ntwo\n")
	return dir
}

func contains(hay []string, needle string) bool {
	for _, h := range hay {
		if h == needle {
			return true
		}
	}
	return false
}
