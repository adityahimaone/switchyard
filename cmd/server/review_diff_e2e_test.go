package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// seedReviewTask writes a single review-status task row into a board DB that
// loadReviewTask can open. The transport is node-agent: the legacy 'ssh' lane
// was retired, and the review gate now rejects anything else. runGitFunc is
// swapped out below, so the test stays off the network.
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
		VALUES ('t_test', 'test', '', 'review', '/ws', 'node-agent', 'mac-tailscale', '')`)
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

// The review gate picks its shell dialect from the WORKER's OS, not the
// control plane's. A Mac or Linux worker must keep receiving the POSIX script
// byte-for-byte; a Windows worker must get the cmd dialect. This runs on every
// platform so a change to the selection logic cannot silently downgrade a Mac
// or VPS review to `cmd /c`.
func TestReviewWorkerDialectFollowsWorkspaceOS(t *testing.T) {
	tests := []struct {
		name         string
		workspace    string
		host         string
		wantWin      bool
		wantGitProbe string
	}{
		{"mac worker", "/Users/dev/app", "mac-tailscale", false, "git rev-parse --show-toplevel"},
		{"linux worker", "/home/dev/app", "linux-box", false, "git rev-parse --show-toplevel"},
		{"windows worker", `C:\Development\app`, "windows-tailscale", true, "git rev-parse --is-inside-work-tree"},
		// A Windows-looking path must win even when the host name does not
		// mention Windows; inferOS keys off the drive letter.
		{"windows path neutral host", `C:\app`, "build-box", true, "git rev-parse --is-inside-work-tree"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			task := &reviewTask{WorkspacePath: tc.workspace, SSHTarget: tc.host}
			if got := reviewIsWindowsWorker(task); got != tc.wantWin {
				t.Fatalf("reviewIsWindowsWorker = %v, want %v (path %q host %q)", got, tc.wantWin, tc.workspace, tc.host)
			}
			script := reviewScopeSetup + `git diff --quiet HEAD -- "$scope"`
			if tc.wantWin {
				script = reviewCleanWindows
			}
			if !strings.Contains(script, tc.wantGitProbe) {
				t.Errorf("script missing %q; got %q", tc.wantGitProbe, script)
			}
		})
	}
}

// The POSIX script is the production path for Mac and Linux workers, so it must
// keep its exact shape: a bash function, "$scope" quoting, and POSIX printf.
func TestReviewPOSIXScriptUnchanged(t *testing.T) {
	for _, want := range []string{
		`repo_root=$(git rev-parse --show-toplevel) || exit 2`,
		`untracked() {`,
		`printf '%s\n' "$f"`,
	} {
		if !strings.Contains(reviewScopeSetup, want) {
			t.Errorf("reviewScopeSetup lost POSIX fragment %q", want)
		}
	}
}
