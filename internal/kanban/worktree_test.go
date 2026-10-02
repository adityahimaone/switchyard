package kanban

import (
	"strings"
	"testing"
	"time"
)

func TestPlanWorktree(t *testing.T) {
	p := PlanWorktree("/Users/me/saas", "t_123")
	if p.Repo != "/Users/me/saas" {
		t.Errorf("Repo = %q", p.Repo)
	}
	// The worktree lives inside the repo, so node-agent's segment-aware
	// workspace prefix match routes it to the same node as the repo itself.
	if p.Path != "/Users/me/saas/.switchyard/t_123" {
		t.Errorf("Path = %q", p.Path)
	}
	// The branch is namespaced so it is visibly ours and cannot collide with a
	// human's branch names.
	if p.Branch != "switchyard/t_123" {
		t.Errorf("Branch = %q", p.Branch)
	}
	// A trailing slash on the repo must not produce a doubled separator.
	if got := PlanWorktree("/Users/me/saas/", "t_1").Path; got != "/Users/me/saas/.switchyard/t_1" {
		t.Errorf("trailing slash produced %q", got)
	}
}

func TestWorktreeWorkspace(t *testing.T) {
	// With a worktree, work happens there.
	if got := WorktreeWorkspace("/Users/me/saas", "/Users/me/saas/.switchyard/t_1"); got != "/Users/me/saas/.switchyard/t_1" {
		t.Errorf("got %q, want the worktree", got)
	}
	// Without one, it happens in the shared checkout — the behaviour every
	// existing card relies on.
	if got := WorktreeWorkspace("/Users/me/saas", ""); got != "/Users/me/saas" {
		t.Errorf("got %q, want the shared workspace", got)
	}
	// Whitespace-only is treated as absent, so a half-written column does not
	// send work to a directory named "".
	if got := WorktreeWorkspace("/Users/me/saas", "   "); got != "/Users/me/saas" {
		t.Errorf("got %q, want the shared workspace", got)
	}
}

func TestShellQuotePath(t *testing.T) {
	cases := map[string]string{
		"/Users/me/saas":           `'/Users/me/saas'`,
		"/Users/me/my repo":        `'/Users/me/my repo'`,
		"/Users/me/it's":           `'/Users/me/it'\''s'`,
		"/Users/me/$(whoami)":      `'/Users/me/$(whoami)'`,
		"/Users/me/repo; rm -rf /": `'/Users/me/repo; rm -rf /'`,
	}
	for in, want := range cases {
		if got := shellQuotePath(in); got != want {
			t.Errorf("shellQuotePath(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestGitWorktreeAddScriptIsQuoted proves a hostile repo path cannot escape the
// command. The repo comes from the workspace registry, which is operator JSON,
// but the same class of bug the review gate's shellQuote fix addressed applies.
func TestGitWorktreeAddScriptIsQuoted(t *testing.T) {
	script := gitWorktreeAddScript(PlanWorktree("/Users/me/repo; touch pwned", "t_1"))
	if strings.Contains(script, "/Users/me/repo; touch pwned") && !strings.Contains(script, `'/Users/me/repo; touch pwned'`) {
		t.Fatalf("repo path is not quoted: %s", script)
	}
	// The dangerous form would be the path outside quotes.
	bad := "mkdir -p /Users/me/repo; touch pwned"
	if strings.Contains(script, bad) {
		t.Fatalf("script contains an unquoted path fragment: %s", script)
	}
	// It must still be a coherent sequence.
	for _, want := range []string{"mkdir -p", "git worktree add", "--quiet", "-b"} {
		if !strings.Contains(script, want) {
			t.Errorf("script is missing %q: %s", want, script)
		}
	}
}

func TestEnsureWorktreeIgnoredScriptUsesLocalExclude(t *testing.T) {
	script := ensureWorktreeIgnoredScript("/Users/me/saas")
	// .git/info/exclude is machine-local, so the exclusion needs no commit and
	// does not dirty the repo's tracked .gitignore.
	if !strings.Contains(script, ".git/info/exclude") {
		t.Fatalf("script does not target the local exclude file: %s", script)
	}
	if !strings.Contains(script, worktreeDirName) {
		t.Fatalf("script does not mention %s: %s", worktreeDirName, script)
	}
	// The repo path must be quoted here too.
	if !strings.Contains(script, `'/Users/me/saas'`) {
		t.Fatalf("repo path is not quoted: %s", script)
	}
}

const sampleWorktreeList = `worktree /Users/me/saas
HEAD abc123
branch refs/heads/main

worktree /Users/me/saas/.switchyard/t_1
HEAD def456
branch refs/heads/switchyard/t_1

worktree /Users/me/saas/.switchyard/t_2
HEAD 789abc
branch refs/heads/switchyard/t_2
`

func TestWorktreeExists(t *testing.T) {
	if !WorktreeExists(sampleWorktreeList, "/Users/me/saas/.switchyard/t_1") {
		t.Error("t_1 should be found in the list")
	}
	if WorktreeExists(sampleWorktreeList, "/Users/me/saas/.switchyard/t_9") {
		t.Error("t_9 is not in the list but was reported as present")
	}
	// git lists the main checkout too, and that IS a valid registration — the
	// point is only that PlanWorktree never produces the repo root as a target.
	if !WorktreeExists(sampleWorktreeList, "/Users/me/saas") {
		t.Error("the main checkout is a registered worktree entry and should be found")
	}
	if got := PlanWorktree("/Users/me/saas", "t_1").Path; got == "/Users/me/saas" {
		t.Error("a task worktree must never resolve to the repo root")
	}
	// A trailing separator is the same path.
	if !WorktreeExists(sampleWorktreeList, "/Users/me/saas/.switchyard/t_1/") {
		t.Error("a trailing slash should still match")
	}
	if WorktreeExists("", "/x") {
		t.Error("empty output should report nothing present")
	}
}

func TestBranchOnWorktree(t *testing.T) {
	cases := map[string]string{
		"/Users/me/saas/.switchyard/t_1": "refs/heads/switchyard/t_1",
		"/Users/me/saas/.switchyard/t_2": "refs/heads/switchyard/t_2",
		"/Users/me/saas":                 "refs/heads/main",
		"/users/me/saas/.switchyard/t_1": "", // case differs: not the same path
		"/nowhere":                       "",
	}
	for path, want := range cases {
		if got := BranchOnWorktree(sampleWorktreeList, path); got != want {
			t.Errorf("BranchOnWorktree(%q) = %q, want %q", path, got, want)
		}
	}
}

func TestIsWorktreeIsolation(t *testing.T) {
	if !IsWorktreeIsolation("worktree") {
		t.Error("worktree should be recognised")
	}
	// Surrounding whitespace is trimmed, so a value that round-tripped through
	// a text field is still understood.
	if !IsWorktreeIsolation(" worktree ") {
		t.Error("a padded value should still be recognised")
	}
	for _, v := range []string{"", "workspace", "WORKTREE", "worktree-2", "gitworktree"} {
		if IsWorktreeIsolation(v) {
			t.Errorf("%q should not be treated as worktree isolation", v)
		}
	}
}

func TestWorktreeDueForRemoval(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name        string
		completedAt time.Time
		want        bool
	}{
		{"never completed", time.Time{}, false},
		{"just finished", now.Add(-time.Hour), false},
		{"recent", now.Add(-24 * time.Hour), false},
		{"past the grace period", now.Add(-worktreeGracePeriod - time.Hour), true},
		{"long past it", now.Add(-30 * 24 * time.Hour), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := WorktreeDueForRemoval(tc.completedAt, now); got != tc.want {
				t.Fatalf("WorktreeDueForRemoval = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestTruncateWorktreeOutput(t *testing.T) {
	short := "fatal: not a git repository"
	if got := truncateWorktreeOutput(short); got != short {
		t.Errorf("short output was altered: %q", got)
	}
	long := strings.Repeat("x", 2000)
	got := truncateWorktreeOutput(long)
	if len(got) > 900 {
		t.Errorf("truncated output is %d bytes, want it bounded", len(got))
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("a truncated message should be marked as such: %q", got[len(got)-10:])
	}
}
