package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

func TestClaudeDispatchBindsAndResumesReturnedSession(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	slug := "claude-dispatch"
	if err := kanban.EnsureImportSchemaPublic(slug); err != nil {
		t.Fatal(err)
	}
	workspace := t.TempDir()
	task := kanban.Task{Title: "Claude continuation", Body: "Update the task and report the result.", Status: "todo", Executor: "claude", WorkspacePath: workspace}
	if err := kanban.CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}

	var calls int
	var currentRunID string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/dispatch":
			var request kanban.NodeDispatchRequest
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Errorf("decode dispatch: %v", err)
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			calls++
			currentRunID = request.TaskID
			if request.Executor != "claude" || request.HarnessKind != "claude" {
				t.Errorf("executor/harness = %q/%q", request.Executor, request.HarnessKind)
			}
			if calls == 1 && (request.ClaudeSessionID != "" || request.SessionContinuation) {
				t.Errorf("first run must omit the unbound session: %+v", request)
			}
			if calls == 2 && (request.ClaudeSessionID != "claude-returned-session" || !request.SessionContinuation) {
				t.Errorf("second run must resume the returned id: %+v", request)
			}
			_, _ = w.Write([]byte(`{"status":"accepted","node_id":"mac","transport":"http","delivery_id":"d1"}`))
		case r.Method == http.MethodGet && currentRunID != "" && r.URL.Path == "/api/results/"+currentRunID:
			_, _ = w.Write([]byte(`{"task_id":"` + currentRunID + `","success":true,"output":"provenance executor=claude claude_session_id=claude-returned-session\n{\"type\":\"result\",\"session_id\":\"claude-returned-session\",\"result\":\"done\"}","claude_session_id":"claude-returned-session"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	dispatch := func(continuation bool) {
		db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		binding, resumed, err := kanban.ResolveHarnessBindingFor(db, slug, task.ID, workspace, "claude")
		if err != nil || resumed != continuation {
			t.Fatalf("binding=%+v continuation=%t err=%v", binding, resumed, err)
		}
		runID, claimed, err := kanban.ClaimTaskRun(db, task.ID)
		if err != nil || !claimed {
			t.Fatalf("claim: claimed=%t err=%v", claimed, err)
		}
		commentCursor := binding.LastCommentID
		req := kanban.NodeDispatchRequest{TaskID: runID, CardID: task.ID, RunID: runID, Board: slug, Workspace: workspace, Executor: "claude", HarnessKind: "claude", ClaudeSessionID: dispatchHarnessSessionID(binding, continuation), SessionContinuation: continuation, LastTurnSeq: &binding.LastTurnSeq, LastCommentID: &commentCursor}
		kanban.ApplyHarnessIdentity(&req, "claude", req.ClaudeSessionID)
		if _, err := kanban.DispatchRemote(req, 3*time.Second); err != nil {
			t.Fatal(err)
		}
	}

	dispatch(false)
	var claudeID, dshID, status string
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COALESCE(claude_session_id,''), COALESCE(dsh_session_id,''), status FROM tasks WHERE id=?`, task.ID).Scan(&claudeID, &dshID, &status); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if claudeID != "claude-returned-session" || dshID != "" || status != "review" {
		db.Close()
		t.Fatalf("first result claude=%q dsh=%q status=%q", claudeID, dshID, status)
	}
	db.Close()
	if err := kanban.StatusTransition(slug, task.ID, "todo"); err != nil {
		t.Fatal(err)
	}
	dispatch(true)
	if calls != 2 {
		t.Fatalf("dispatch calls = %d, want 2", calls)
	}
}
