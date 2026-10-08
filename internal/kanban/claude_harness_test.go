package kanban

import (
	"database/sql"
	"encoding/json"
	"testing"
)

func TestClaudeHarnessContinuityAndSessionColumn(t *testing.T) {
	if !HarnessContinuityEnabled("claude") {
		t.Fatal("Claude must persist a per-card session")
	}
	if got := harnessSessionColumn("claude"); got != "claude_session_id" {
		t.Fatalf("session column = %q", got)
	}
	if harnessUsesWorkspaceIdentity("claude") {
		t.Fatal("Claude sessions resolve by session id, not workspace identity")
	}
}

func TestApplyClaudeIdentityStampsOnlyClaudeFields(t *testing.T) {
	req := NodeDispatchRequest{DSHSessionID: "old-dsh", DSHWorkspaceID: "old-workspace"}
	ApplyHarnessIdentity(&req, "claude", "claude-session")
	if req.HarnessKind != "claude" || req.ClaudeSessionID != "claude-session" {
		t.Fatalf("Claude identity not stamped: %+v", req)
	}
	if req.DSHSessionID != "" || req.DSHWorkspaceID != "" || req.CommandCodeSessionID != "" || req.OMPSessionID != "" {
		t.Fatalf("Claude dispatch leaked another harness identity: %+v", req)
	}
	wire, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(wire, &fields); err != nil {
		t.Fatal(err)
	}
	if fields["claude_session_id"] != "claude-session" {
		t.Fatalf("serialized request = %s", wire)
	}
	for _, key := range []string{"dsh_session_id", "dsh_workspace_id", "commandcode_session_id", "omp_session_id"} {
		if _, exists := fields[key]; exists {
			t.Fatalf("serialized Claude request leaked %s: %s", key, wire)
		}
	}
}

func TestResolveClaudeIdentityRequiresItsOwnSessionField(t *testing.T) {
	req := NodeDispatchRequest{Executor: "claude", HarnessKind: "claude", ClaudeSessionID: "session-1", SessionContinuation: true}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, ClaudeSessionID: "session-1"})
	if err != nil || !identity.valid || identity.sessionID != "session-1" {
		t.Fatalf("identity=%+v err=%v", identity, err)
	}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, SessionID: "session-1"}); err == nil {
		t.Fatal("generic session_id must not substitute for Claude's dedicated field")
	}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, ClaudeSessionID: "different"}); err == nil {
		t.Fatal("mismatched Claude session must be rejected")
	}
	failed, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: false, Error: "authentication failed"})
	if err != nil || !failed.valid || failed.sessionID != "session-1" {
		t.Fatalf("failed run without session should keep dispatched identity: %+v err=%v", failed, err)
	}
}

func TestClaudeBindingRoundTripUsesClaudeTaskColumn(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "Claude continuity", Status: "todo", Executor: "claude", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	binding, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "claude")
	if err != nil || continuation {
		t.Fatalf("fresh Claude binding=%+v continuation=%t err=%v", binding, continuation, err)
	}
	if binding.HarnessKind != "claude" || binding.HarnessSessionID != DeterministicHarnessSessionID("claude", slug, task.ID) {
		t.Fatalf("unexpected initial binding: %+v", binding)
	}
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	if err != nil || !claimed {
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	result := NodeDispatchResult{TaskID: runID, Success: true, Output: "ok", ClaudeSessionID: "claude-session-real"}
	req := NodeDispatchRequest{Executor: "claude", HarnessKind: "claude", CardID: task.ID, TaskID: runID, RunID: runID}
	identity, err := resolveDSHResultIdentity(req, result)
	if err != nil {
		t.Fatal(err)
	}
	finalized, err := finalizeRemoteResult(db, req, task.ID, "completed", result, identity)
	if err != nil || !finalized {
		t.Fatalf("finalized=%t err=%v", finalized, err)
	}
	var claudeSession, dshSession, commandCodeSession, ompSession, kind string
	if err := db.QueryRow(`SELECT COALESCE(t.claude_session_id,''), COALESCE(t.dsh_session_id,''), COALESCE(t.commandcode_session_id,''), COALESCE(t.omp_session_id,''), b.harness_kind FROM tasks t JOIN harness_bindings b ON b.card_id=t.id WHERE t.id=?`, task.ID).Scan(&claudeSession, &dshSession, &commandCodeSession, &ompSession, &kind); err != nil {
		t.Fatal(err)
	}
	if claudeSession != "claude-session-real" || dshSession != "" || commandCodeSession != "" || ompSession != "" || kind != "claude" {
		t.Fatalf("session columns claude=%q dsh=%q commandcode=%q omp=%q kind=%q", claudeSession, dshSession, commandCodeSession, ompSession, kind)
	}
	resumed, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "claude")
	if err != nil || !continuation || resumed.HarnessSessionID != "claude-session-real" {
		t.Fatalf("resumed binding=%+v continuation=%t err=%v", resumed, continuation, err)
	}
}

func TestClaudeBoardSnapshotPreservesHarnessKindAndSessionColumn(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	slug := "claude-snapshot"
	if err := EnsureImportSchemaPublic(slug); err != nil {
		t.Fatal(err)
	}
	workspace := t.TempDir()
	task := Task{ID: "task-claude", Title: "Claude snapshot", Status: "review", Executor: "claude", WorkspacePath: workspace, WorkspaceKind: "dir"}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	binding := HarnessBinding{CardID: task.ID, WorkspacePath: task.WorkspacePath, HarnessKind: "claude", HarnessSessionID: "claude-snapshot-session", LastTurnSeq: -1, LastCommentID: 0, Status: "idle"}
	if _, err := db.Exec(`INSERT INTO harness_bindings (card_id,workspace_path,harness_workspace_id,harness_session_id,last_turn_seq,last_comment_id,status,created_at,updated_at,harness_kind) VALUES (?,?, '', ?, -1, 0, 'idle', 'now', 'now', 'claude')`, binding.CardID, binding.WorkspacePath, binding.HarnessSessionID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE tasks SET claude_session_id=? WHERE id=?`, binding.HarnessSessionID, task.ID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	db.Close()

	snapshot, err := ExportBoard(slug)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Bindings) != 1 || snapshot.Bindings[0].HarnessKind != "claude" {
		t.Fatalf("exported bindings=%+v", snapshot.Bindings)
	}
	if len(snapshot.Tasks) != 1 || snapshot.Tasks[0].ClaudeSessionID != binding.HarnessSessionID {
		t.Fatalf("exported task session = %+v", snapshot.Tasks)
	}

	snapCopy := *snapshot
	snapCopy.Board.Slug = "claude-snapshot-copy"
	for i := range snapCopy.Tasks {
		snapCopy.Tasks[i].ID = "copy-" + snapCopy.Tasks[i].ID
	}
	for i := range snapCopy.Bindings {
		snapCopy.Bindings[i].CardID = "copy-" + snapCopy.Bindings[i].CardID
	}
	if _, _, err := ImportBoard(&snapCopy); err != nil {
		t.Fatal(err)
	}
	copyDB, err := openDB("claude-snapshot-copy")
	if err != nil {
		t.Fatal(err)
	}
	defer copyDB.Close()
	var claudeSession, dshSession, kind string
	if err := copyDB.QueryRow(`SELECT COALESCE(t.claude_session_id,''), COALESCE(t.dsh_session_id,''), b.harness_kind FROM tasks t JOIN harness_bindings b ON b.card_id=t.id WHERE t.id=?`, "copy-task-claude").Scan(&claudeSession, &dshSession, &kind); err != nil {
		t.Fatal(err)
	}
	if claudeSession != binding.HarnessSessionID || dshSession != "" || kind != "claude" {
		t.Fatalf("imported claude=%q dsh=%q kind=%q", claudeSession, dshSession, kind)
	}
}

var _ *sql.DB
