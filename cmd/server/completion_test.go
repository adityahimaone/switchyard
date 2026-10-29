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

const completionGitFixture = `@@BRANCH
feature/x
@@HEAD
abcdef0123456789
@@SHORT
abcdef0
@@SUBJECT
feat(board): show completion data
@@AUTHOR
Adit
@@AT
1793194247
@@STAT
3 42 7
@@UPSTREAM
origin/feature/x
@@AHEAD
0
@@BEHIND
2
@@DIRTY
1
@@FILES
web/src/a.tsx
web/src/b.tsx

internal/c.go
@@END
`

func TestParseCompletionGit(t *testing.T) {
	g := parseCompletionGit(completionGitFixture)
	if !g.Available || g.Branch != "feature/x" || g.Short != "abcdef0" || g.Head != "abcdef0123456789" {
		t.Fatalf("branch/head parsed wrong: %+v", g)
	}
	if g.Files != 3 || g.Insertions != 42 || g.Deletions != 7 {
		t.Fatalf("stat parsed wrong: %+v", g)
	}
	if g.Ahead != 0 || g.Behind != 2 || g.Dirty != 1 || g.Upstream != "origin/feature/x" {
		t.Fatalf("push state parsed wrong: %+v", g)
	}
	if len(g.FileList) != 3 || g.FileList[2] != "internal/c.go" {
		t.Fatalf("file list wrong: %v", g.FileList)
	}
	if g.CommittedAt != 1793194247 {
		t.Fatalf("committed_at = %d", g.CommittedAt)
	}
}

func TestParseCompletionGitWithoutRepo(t *testing.T) {
	g := parseCompletionGit("@@BRANCH\n@@HEAD\n@@END\n")
	if g.Available || g.Reason == "" {
		t.Fatalf("expected unavailable with reason, got %+v", g)
	}
}

func TestTaskCompletionHandler(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	db, err := sql.Open("sqlite", filepath.Join(home, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE tasks (
		id TEXT PRIMARY KEY, title TEXT, body TEXT, status TEXT,
		workspace_path TEXT, workspace_transport TEXT, workspace_ssh_target TEXT,
		result TEXT, model TEXT, executor TEXT, execution_mode TEXT, attempt INTEGER,
		started_at INTEGER, completed_at INTEGER, last_approve_commit TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO tasks VALUES ('t_done','done card','','done','/ws','node-agent','mac-tailscale','',
		'dsh-model','dsh','agentic',2,1000,1125,'deadbeef')`); err != nil {
		t.Fatal(err)
	}
	db.Close()

	logPath := filepath.Join(home, "kanban", "logs")
	if err := os.MkdirAll(logPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(logPath, "t_done.log"), []byte("worker output\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	prev := runGitFunc
	runGitFunc = func(t2 *reviewTask, args string) (string, int) { return completionGitFixture, 0 }
	defer func() { runGitFunc = prev }()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/completion", handleTaskCompletion)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/boards/default/tasks/t_done/completion", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
	var got CompletionData
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.DurationSecs != 125 || got.Model != "dsh-model" || got.Executor != "dsh" || got.Attempt != 2 {
		t.Fatalf("execution summary wrong: %+v", got)
	}
	if got.ApproveCommit != "deadbeef" {
		t.Fatalf("approve commit = %q", got.ApproveCommit)
	}
	if !got.Log.Available || got.Log.Bytes != int64(len("worker output\n")) || got.Log.Path != filepath.Join(logPath, "t_done.log") {
		t.Fatalf("log info wrong: %+v", got.Log)
	}
	if !got.Git.Available || got.Git.Files != 3 {
		t.Fatalf("git info wrong: %+v", got.Git)
	}
}
