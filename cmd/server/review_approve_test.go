package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// approveTaskRow inserts a review-status task and returns the board dir.
func approveTaskRow(t *testing.T, status string) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(home, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY, title TEXT, body TEXT, status TEXT,
		workspace_path TEXT, workspace_transport TEXT, workspace_ssh_target TEXT,
		result TEXT, completed_at INTEGER, last_approve_commit TEXT)`); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT OR REPLACE INTO tasks
		(id, title, body, status, workspace_path, workspace_transport, workspace_ssh_target, result, completed_at, last_approve_commit)
		VALUES ('t_appr', 'test', '', ?, '/ws', 'node-agent', 'mac-tailscale', '', NULL, NULL)`, status)
	if err != nil {
		t.Fatal(err)
	}
	return home
}

func approveRequest(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/approve", handleTaskApprove)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST",
		"/api/boards/default/tasks/t_appr/approve", strings.NewReader(body)))
	return rec
}

// stubGit installs a runGitFunc that answers the diff/clean probes and then
// fails the commit with the given output, simulating "the commit already landed
// on a previous attempt".
//
// The match is on what follows reviewScopeSetup, because that prefix is
// prepended to every script and would otherwise swallow the commit branch.
func stubGit(t *testing.T, commitOut string, commitCode int, calls *int32) {
	t.Helper()
	orig := runGitFunc
	t.Cleanup(func() { runGitFunc = orig })
	var mu sync.Mutex
	runGitFunc = func(_ *reviewTask, script string) (string, int) {
		mu.Lock()
		defer mu.Unlock()
		if calls != nil {
			*calls++
		}
		// The body after the shared scope preamble identifies the command.
		body := strings.TrimPrefix(script, reviewScopeSetup)
		switch {
		case strings.Contains(body, "git commit"):
			return commitOut, commitCode
		case strings.Contains(body, "rev-parse HEAD"):
			return "abc123def456\n", 0
		case strings.Contains(body, "diff --quiet"):
			// code 1 = "has changes", so review proceeds to commit.
			return "", 1
		case strings.Contains(body, "--name-only"):
			return "main.go\n", 0
		default:
			return "", 0
		}
	}
}

func readTaskStatus(t *testing.T, home string) (status string, completedAt sql.NullInt64, commit sql.NullString) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(home, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.QueryRow(`SELECT status, completed_at, last_approve_commit FROM tasks WHERE id='t_appr'`).
		Scan(&status, &completedAt, &commit); err != nil {
		t.Fatal(err)
	}
	return
}

// TestApproveNothingToCommitIsTreatedAsSuccess is the core R1 regression.
//
// The commit lands, then the status write fails. A retry used to hit "nothing
// to commit" and return 500 forever, leaving the card stuck in review. It must
// now complete the transition and answer 200.
func TestApproveNothingToCommitIsTreatedAsSuccess(t *testing.T) {
	home := approveTaskRow(t, "review")
	stubGit(t, "nothing to commit, working tree clean", 1, nil)

	rec := approveRequest(t, `{"action":"commit"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	status, completedAt, _ := readTaskStatus(t, home)
	if status != "done" {
		t.Fatalf("task status = %q, want done", status)
	}
	if !completedAt.Valid || completedAt.Int64 == 0 {
		t.Fatal("completed_at was not stamped")
	}
}

// TestApproveRepeatedIsIdempotent proves a second approve of an already-done
// card is a no-op 200 rather than a 400, so a double-click or a retried request
// cannot wedge the UI.
func TestApproveRepeatedIsIdempotent(t *testing.T) {
	home := approveTaskRow(t, "done")
	stubGit(t, "", 0, nil)

	rec := approveRequest(t, `{"action":"commit"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "done" {
		t.Fatalf("status field = %q", body.Status)
	}
	status, _, _ := readTaskStatus(t, home)
	if status != "done" {
		t.Fatalf("task status = %q, want done", status)
	}
}

// TestApproveConcurrentCallsRunGitOnce proves the per-task lock serialises
// approvals: without it, two racing requests both observe a dirty workspace and
// both run git commit, and the second one's failure would look like corruption.
func TestApproveConcurrentCallsRunGitOnce(t *testing.T) {
	home := approveTaskRow(t, "review")

	var mu sync.Mutex
	commits := 0
	orig := runGitFunc
	t.Cleanup(func() { runGitFunc = orig })
	runGitFunc = func(_ *reviewTask, script string) (string, int) {
		mu.Lock()
		defer mu.Unlock()
		body := strings.TrimPrefix(script, reviewScopeSetup)
		switch {
		case strings.Contains(body, "git commit"):
			commits++
			return "committed", 0
		case strings.Contains(body, "rev-parse HEAD"):
			return "deadbeef\n", 0
		case strings.Contains(body, "diff --quiet"):
			return "", 1
		case strings.Contains(body, "--name-only"):
			return "main.go\n", 0
		default:
			return "", 0
		}
	}

	var wg sync.WaitGroup
	codes := make([]int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = approveRequest(t, `{"action":"commit"}`).Code
		}(i)
	}
	wg.Wait()

	mu.Lock()
	got := commits
	mu.Unlock()
	// One caller commits and flips the status; the other observes done and
	// short-circuits, so git commit must run exactly once.
	if got != 1 {
		t.Fatalf("git commit ran %d times, want exactly 1", got)
	}
	status, _, commit := readTaskStatus(t, home)
	if status != "done" {
		t.Fatalf("status = %q, want done", status)
	}
	if !commit.Valid || commit.String != "deadbeef" {
		t.Fatalf("last_approve_commit = %v, want deadbeef", commit.String)
	}
	for i, c := range codes {
		if c != http.StatusOK {
			t.Errorf("caller %d got %d, want 200", i, c)
		}
	}
}

func TestIsNothingToCommit(t *testing.T) {
	positives := []string{
		"nothing to commit, working tree clean",
		"nothing added to commit but untracked files present",
		"No changes added to commit",
		"NOTHING TO COMMIT",
	}
	for _, p := range positives {
		if !isNothingToCommit(p) {
			t.Errorf("isNothingToCommit(%q) = false, want true", p)
		}
	}
	// A real failure must not be mistaken for an already-applied commit.
	negatives := []string{
		"fatal: not a git repository",
		"permission denied",
		"error: failed to push some refs",
		"fatal: unable to access",
	}
	for _, n := range negatives {
		if isNothingToCommit(n) {
			t.Errorf("isNothingToCommit(%q) = true, want false", n)
		}
	}
}

func TestApproveRejectsBadAction(t *testing.T) {
	approveTaskRow(t, "review")
	rec := approveRequest(t, `{"action":"destroy"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
