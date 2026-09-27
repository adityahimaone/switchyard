package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// seedReviewTask writes a single review-status task row into a board DB that
// loadReviewTask can open. transport "ssh" keeps the test off the network —
// runGitFunc is swapped out below.
func seedReviewTask(t *testing.T, home string) {
	t.Helper()
	// boardDir("default") is hermesHome() itself, not a boards/<slug> subdir.
	boardDir := home
	if err := os.MkdirAll(boardDir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(boardDir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY, title TEXT, body TEXT, status TEXT,
		workspace_path TEXT, workspace_transport TEXT, workspace_ssh_target TEXT,
		result TEXT)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT OR REPLACE INTO tasks
		(id, title, body, status, workspace_path, workspace_transport, workspace_ssh_target, result)
		VALUES ('t_test', 'test', '', 'review', '/ws', 'ssh', 'mac-tailscale', '')`)
	if err != nil {
		t.Fatal(err)
	}
}

func reviewDiffRecorder(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/diff", handleTaskDiff)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/boards/default/tasks/t_test/diff", nil))
	return rec
}

// Regression: a misrouted node-agent dispatch returned only an error string.
// handleTaskDiff used to answer 200 with files: [] and clean: false, so the
// review card rendered as an empty checklist instead of surfacing the failure.
func TestHandleTaskDiffSurfacesTransportFailure(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedReviewTask(t, os.Getenv("HERMES_HOME"))

	orig := runGitFunc
	t.Cleanup(func() { runGitFunc = orig })
	runGitFunc = func(*reviewTask, string) (string, int) {
		return "workspace not found: /Users/x/habbit-tracking-next", 255
	}

	rec := reviewDiffRecorder(t)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 (got body %s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error == "" {
		t.Fatal("expected an error message in the response body")
	}
}

// A real snapshot must still return 200 with the file list intact.
func TestHandleTaskDiffReturnsSnapshot(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedReviewTask(t, os.Getenv("HERMES_HOME"))

	orig := runGitFunc
	t.Cleanup(func() { runGitFunc = orig })
	runGitFunc = func(*reviewTask, string) (string, int) {
		return "__STAT__\n1 file changed\n__NAMES__\npackage-lock.json\n__CLEAN__\n0\n__DIFF__\ndiff --git a/package-lock.json b/package-lock.json\n+x\n", 0
	}

	rec := reviewDiffRecorder(t)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Files []string `json:"files"`
		Clean bool     `json:"clean"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Files) != 1 || body.Files[0] != "package-lock.json" {
		t.Fatalf("files = %v, want [package-lock.json]", body.Files)
	}
	if body.Clean {
		t.Fatal("clean should be false when there are changed files")
	}
}
