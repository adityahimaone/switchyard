package kanban

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNodeAgentHealthBroadcastsStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"nodes":[{"node_id":"mac-1","status":"online"}]}`))
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	ch := Hub.Subscribe()
	defer Hub.Unsubscribe(ch)
	status, err := NodeAgentHealth()
	if err != nil || status.Status != "up" {
		t.Fatalf("health = %+v, err = %v", status, err)
	}
	select {
	case event := <-ch:
		if event.Kind != "node_health" {
			t.Fatalf("event kind = %q, want node_health", event.Kind)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for node_health event")
	}
}

func TestNodeAgentHealthPreservesReportedStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"down","error":"no connected nodes"}`))
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	status, err := NodeAgentHealth()
	if err != nil || status.Status != "down" {
		t.Fatalf("health = %+v, err = %v; explicit agent status must be preserved", status, err)
	}
}

func TestNodeDispatchCarriesDSHContinuation(t *testing.T) {
	seq := int64(7)
	raw, err := json.Marshal(NodeDispatchRequest{
		TaskID: "task-1", Workspace: "/Users/example/repo", Executor: "dsh",
		DSHWorkspaceID: "workspace-abc", DSHSessionID: "session-abc", LastTurnSeq: &seq, SessionContinuation: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["dsh_workspace_id"] != "workspace-abc" || got["dsh_session_id"] != "session-abc" || got["last_turn_seq"] != float64(7) || got["session_continuation"] != true {
		t.Fatalf("request = %s, missing durable continuation identity", raw)
	}
}

func TestNodeDispatchOmitsDSHCursorForOtherExecutors(t *testing.T) {
	raw, err := json.Marshal(NodeDispatchRequest{TaskID: "task-1", Workspace: "/tmp/repo", Executor: "codex"})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if _, ok := got["last_turn_seq"]; ok {
		t.Fatalf("non-DSH request leaked cursor: %s", raw)
	}
}

func TestDSHSessionProofAcceptsOutputFormats(t *testing.T) {
	for _, output := range []string{
		`dsh_session_id=session-proof`,
		`session_id: session-colon`,
		`Session=session-equals`,
	} {
		if !dshSessionProof.MatchString(output) {
			t.Fatalf("session proof did not match %q", output)
		}
	}
}

func TestDispatchRemoteMapsWireRunToCardAndRequeuesLateComment(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "late review", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	binding, _, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	if err != nil || !claimed {
		db.Close()
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	baseline := binding.LastCommentID
	if _, err := AddComment(slug, task.ID, "reviewer", "arrived during run"); err != nil {
		db.Close()
		t.Fatal(err)
	}
	db.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/dispatch":
			_, _ = w.Write([]byte(`{"status":"accepted","node_id":"mac","transport":"http","delivery_id":"d1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/results/"+runID:
			_, _ = w.Write([]byte(`{"task_id":"` + runID + `","success":true,"output":"done","dsh_workspace_id":"workspace-1","dsh_session_id":"` + binding.HarnessSessionID + `","last_turn_seq":3}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	_, err = DispatchRemote(NodeDispatchRequest{
		TaskID: runID, CardID: task.ID, RunID: runID, Board: slug, Workspace: workspace, Executor: "dsh",
		DSHSessionID: binding.HarnessSessionID, LastCommentID: &baseline,
	}, 3*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if status, err := TaskStatus(slug, task.ID); err != nil || status != "todo" {
		t.Fatalf("status=%q err=%v, want todo for late comment", status, err)
	}
	db, err = openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var storedRunID string
	if err := db.QueryRow(`SELECT COALESCE(current_run_id,'') FROM tasks WHERE id=?`, task.ID).Scan(&storedRunID); err != nil || storedRunID != "" {
		t.Fatalf("run ownership not cleared: id=%q err=%v", storedRunID, err)
	}
	got, continuation, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil || !continuation || got.HarnessWorkspaceID != "workspace-1" || got.LastCommentID != baseline {
		t.Fatalf("binding=%+v continuation=%t err=%v", got, continuation, err)
	}
}

func TestDispatchRemoteRejectsMismatchedWireResult(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "stale result", Status: "todo", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	db.Close()
	if err != nil || !claimed {
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"status":"accepted","node_id":"mac","transport":"http","delivery_id":"d1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"task_id":"old-run","success":true,"output":"stale"}`))
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	if _, err := DispatchRemote(NodeDispatchRequest{TaskID: runID, CardID: task.ID, RunID: runID, Board: slug, Workspace: workspace, Executor: "codex"}, 1500*time.Millisecond); err == nil {
		t.Fatal("mismatched wire result accepted")
	}
	if status, err := TaskStatus(slug, task.ID); err != nil || status != "blocked" {
		t.Fatalf("status=%q err=%v, want blocked timeout", status, err)
	}
}

func TestResolveHarnessBindingCreatesThenReusesDeterministicSession(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "session continuity", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	first, existed, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath)
	if err != nil {
		t.Fatal(err)
	}
	if existed {
		t.Fatal("new binding reported as existing")
	}
	want := DeterministicDSHSessionID(slug, task.ID)
	if first.HarnessSessionID != want {
		t.Fatalf("session id = %q, want %q", first.HarnessSessionID, want)
	}
	var taskSessionID string
	if err := db.QueryRow(`SELECT COALESCE(dsh_session_id,'') FROM tasks WHERE id=?`, task.ID).Scan(&taskSessionID); err != nil {
		t.Fatal(err)
	}
	if taskSessionID != "" {
		t.Fatalf("pending deterministic session leaked into legacy task field: %q", taskSessionID)
	}

	second, continuation, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath)
	if err != nil {
		t.Fatal(err)
	}
	if continuation || second.HarnessSessionID != first.HarnessSessionID {
		t.Fatalf("pending binding must idempotently adopt: first=%+v second=%+v continuation=%t", first, second, continuation)
	}

	seq := int64(12)
	saveDSHSessionID(db, task.ID, first.HarnessSessionID, "workspace-1", nil, false, NodeDispatchResult{Success: true, DSHSessionID: first.HarnessSessionID, DSHWorkspaceID: "workspace-1", LastTurnSeq: &seq})
	third, continuation, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath)
	if err != nil {
		t.Fatal(err)
	}
	if !continuation || third.HarnessSessionID != first.HarnessSessionID || third.HarnessWorkspaceID != "workspace-1" || third.LastTurnSeq != seq {
		t.Fatalf("completed binding not reused: first=%+v third=%+v continuation=%t", first, third, continuation)
	}
	if err := db.QueryRow(`SELECT COALESCE(dsh_session_id,'') FROM tasks WHERE id=?`, task.ID).Scan(&taskSessionID); err != nil || taskSessionID != first.HarnessSessionID {
		t.Fatalf("completed session not mirrored to task: id=%q err=%v", taskSessionID, err)
	}

	commentID := int64(9)
	older := int64(4)
	saveDSHSessionID(db, task.ID, first.HarnessSessionID, "workspace-1", &commentID, true, NodeDispatchResult{Success: true, DSHSessionID: first.HarnessSessionID, DSHWorkspaceID: "workspace-1", LastTurnSeq: &older})
	if got, _, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath); err != nil || got.LastTurnSeq != seq || got.LastCommentID != commentID {
		t.Fatalf("cursors wrong: binding=%+v err=%v", got, err)
	}
	newerCommentID := int64(11)
	saveDSHSessionID(db, task.ID, first.HarnessSessionID, "workspace-1", &newerCommentID, true, NodeDispatchResult{Success: false})
	if got, _, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath); err != nil || got.LastCommentID != commentID {
		t.Fatalf("failed turn acknowledged comment: binding=%+v err=%v", got, err)
	}

	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM harness_bindings WHERE card_id=?`, task.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("binding rows = %d, want 1", count)
	}
}

func TestResolveHarnessBindingAdoptsLegacySession(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "legacy session", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE tasks SET dsh_session_id='legacy-session' WHERE id=?`, task.ID); err != nil {
		t.Fatal(err)
	}

	binding, continuation, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		t.Fatal(err)
	}
	if continuation || binding.HarnessSessionID != "legacy-session" || binding.Status != "idle" {
		t.Fatalf("legacy session without workspace proof resumed: binding=%+v continuation=%t", binding, continuation)
	}
}

func TestContinuationFailureKeepsKnownSession(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "failed continuation", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	binding, _, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		t.Fatal(err)
	}
	seq := int64(1)
	saveDSHSessionID(db, task.ID, binding.HarnessSessionID, "workspace-1", nil, false, NodeDispatchResult{Success: true, DSHSessionID: binding.HarnessSessionID, DSHWorkspaceID: "workspace-1", LastTurnSeq: &seq})
	saveDSHSessionID(db, task.ID, binding.HarnessSessionID, "workspace-1", nil, true, NodeDispatchResult{Success: false, Error: "turn failed"})

	got, continuation, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		t.Fatal(err)
	}
	if !continuation || got.HarnessSessionID != binding.HarnessSessionID || got.Status != "error" {
		t.Fatalf("failed continuation lost session: binding=%+v continuation=%t", got, continuation)
	}
}

func TestFinalizeRemoteResultRejectsStaleRunBeforeBindingWrite(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "stale owner", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	binding, _, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		t.Fatal(err)
	}
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	if err != nil || !claimed {
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	if _, err := db.Exec(`UPDATE tasks SET current_run_id='new-owner' WHERE id=?`, task.ID); err != nil {
		t.Fatal(err)
	}
	seq := int64(4)
	result := NodeDispatchResult{Success: true, Output: "stale", DSHSessionID: binding.HarnessSessionID, DSHWorkspaceID: "workspace-1", LastTurnSeq: &seq}
	identity, err := resolveDSHResultIdentity(NodeDispatchRequest{DSHSessionID: binding.HarnessSessionID}, result)
	if err != nil {
		t.Fatal(err)
	}
	finalized, err := finalizeRemoteResult(db, NodeDispatchRequest{RunID: runID, Executor: "dsh"}, task.ID, "completed", result, identity)
	if err != nil || finalized {
		t.Fatalf("finalized=%t err=%v, want stale result ignored", finalized, err)
	}
	got, _, err := ResolveHarnessBinding(db, slug, task.ID, workspace)
	if err != nil {
		t.Fatal(err)
	}
	if got.HarnessWorkspaceID != "" || got.LastTurnSeq != -1 || got.Status != "active" {
		t.Fatalf("stale result changed binding: %+v", got)
	}
}

func TestFinalizeRemoteResultAndCommentAlwaysLeaveTodo(t *testing.T) {
	for i := 0; i < 10; i++ {
		slug := testBoard(t)
		task := Task{Title: "result comment race", Status: "todo"}
		if err := CreateTask(slug, &task); err != nil {
			t.Fatal(err)
		}
		db, err := openDB(slug)
		if err != nil {
			t.Fatal(err)
		}
		runID, claimed, err := ClaimTaskRun(db, task.ID)
		if err != nil || !claimed {
			db.Close()
			t.Fatalf("claim: claimed=%t err=%v", claimed, err)
		}
		baseline := int64(0)
		start := make(chan struct{})
		errCh := make(chan error, 2)
		go func() {
			<-start
			_, err := AddComment(slug, task.ID, "reviewer", "race feedback")
			errCh <- err
		}()
		go func() {
			<-start
			_, err := finalizeRemoteResult(db, NodeDispatchRequest{RunID: runID, LastCommentID: &baseline}, task.ID, "completed", NodeDispatchResult{Success: true, Output: "done"}, dshResultIdentity{valid: true})
			errCh <- err
		}()
		close(start)
		for range 2 {
			if err := <-errCh; err != nil {
				db.Close()
				t.Fatal(err)
			}
		}
		db.Close()
		if status, err := TaskStatus(slug, task.ID); err != nil || status != "todo" {
			t.Fatalf("iteration=%d status=%q err=%v, want todo", i, status, err)
		}
	}
}

func TestFinalizeRemoteTimeoutRequeuesLateComment(t *testing.T) {
	slug := testBoard(t)
	task := Task{Title: "timeout feedback", Status: "todo"}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	if err != nil || !claimed {
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	baseline := int64(0)
	if _, err := AddComment(slug, task.ID, "reviewer", "feedback before timeout"); err != nil {
		t.Fatal(err)
	}
	finalized, err := finalizeRemoteTimeout(db, NodeDispatchRequest{RunID: runID, LastCommentID: &baseline}, task.ID)
	if err != nil || !finalized {
		t.Fatalf("finalized=%t err=%v", finalized, err)
	}
	if status, err := TaskStatus(slug, task.ID); err != nil || status != "todo" {
		t.Fatalf("status=%q err=%v, want todo", status, err)
	}
}

func TestResolveDSHResultIdentityRejectsMismatches(t *testing.T) {
	req := NodeDispatchRequest{DSHSessionID: "session-expected", DSHWorkspaceID: "workspace-expected"}
	for name, result := range map[string]NodeDispatchResult{
		"session":   {Success: true, DSHSessionID: "session-other", DSHWorkspaceID: "workspace-expected"},
		"workspace": {Success: true, DSHSessionID: "session-expected", DSHWorkspaceID: "workspace-other"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := resolveDSHResultIdentity(req, result); err == nil {
				t.Fatal("mismatched worker identity accepted")
			}
		})
	}
}

func TestResolveHarnessBindingRejectsWorkspaceChange(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "fixed workspace", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", BoardDBPath(slug))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, _, err := ResolveHarnessBinding(db, slug, task.ID, task.WorkspacePath); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ResolveHarnessBinding(db, slug, task.ID, t.TempDir()); err == nil {
		t.Fatal("workspace change accepted for existing binding")
	}
}
