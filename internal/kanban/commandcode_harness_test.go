package kanban

import (
	"encoding/json"
	"testing"
)

func TestHarnessContinuityEnabled(t *testing.T) {
	for _, executor := range []string{"dsh", "commandcode"} {
		if !HarnessContinuityEnabled(executor) {
			t.Fatalf("%q should carry durable session identity", executor)
		}
	}
	for _, executor := range []string{"codex", "shell", "hermes", "auto", ""} {
		if HarnessContinuityEnabled(executor) {
			t.Fatalf("%q is stateless and must not carry a binding or cursor", executor)
		}
	}
}

// A commandcode id must never collide with the dsh id for the same card, and the
// historical dsh placeholder string must stay byte-identical for existing boards.
func TestDeterministicHarnessSessionIDSeparatesKinds(t *testing.T) {
	dshID := DeterministicHarnessSessionID("dsh", "board", "card-1")
	ccID := DeterministicHarnessSessionID("commandcode", "board", "card-1")
	if dshID == ccID {
		t.Fatalf("commandcode id %q collides with dsh id", ccID)
	}
	if got := DeterministicHarnessSessionID("commandcode", "board", "card-1"); got != ccID {
		t.Fatalf("id not stable: %q vs %q", got, ccID)
	}
	// The dsh placeholder string must stay byte-identical so existing boards and
	// their exported bindings keep resolving the same session.
	if got, want := DeterministicDSHSessionID("board", "card-1"), "switchyard-card-7c2553029444b348"; got != want {
		t.Fatalf("dsh placeholder changed: got %q, want %q", got, want)
	}
}

func TestNodeDispatchCarriesCommandCodeContinuation(t *testing.T) {
	seq := int64(4)
	raw, err := json.Marshal(NodeDispatchRequest{
		TaskID: "task-1", Workspace: "/Users/example/repo", Executor: "commandcode", HarnessKind: "commandcode",
		CommandCodeSessionID: "cc-session-abc", LastCommentID: &seq, SessionContinuation: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["harness_kind"] != "commandcode" || got["commandcode_session_id"] != "cc-session-abc" || got["session_continuation"] != true {
		t.Fatalf("request = %s, missing commandcode continuation identity", raw)
	}
	// commandcode has no dsh workspace identity and must not borrow dsh fields.
	if _, leaked := got["dsh_session_id"]; leaked {
		t.Fatalf("commandcode request leaked a dsh field: %s", raw)
	}
}

func TestSessionProofAcceptsCommandCodeField(t *testing.T) {
	if !dshSessionProof.MatchString("provenance executor=commandcode commandcode_session_id=cc-9f4e") {
		t.Fatal("session proof did not match commandcode provenance")
	}
}

func TestResolveCommandCodeIdentityAcceptsSuccessWithSession(t *testing.T) {
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode", SessionContinuation: true, CommandCodeSessionID: "cc-1"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, CommandCodeSessionID: "cc-1"})
	if err != nil || !identity.valid || identity.sessionID != "cc-1" {
		t.Fatalf("identity=%+v err=%v, want valid cc-1", identity, err)
	}
}

// The CLI documents sessionId as optional on failure, so a failed run without one
// must still resolve instead of blocking the card.
func TestResolveCommandCodeIdentityToleratesMissingSessionOnFailure(t *testing.T) {
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: false, Error: "boom", Output: "auth failure"})
	if err != nil || !identity.valid {
		t.Fatalf("failed run rejected: identity=%+v err=%v", identity, err)
	}
}

func TestResolveCommandCodeIdentityRejectsSuccessWithoutSession(t *testing.T) {
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode"}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, Output: "done"}); err == nil {
		t.Fatal("successful commandcode run without a session id must be rejected")
	}
}

func TestResolveCommandCodeIdentityRejectsSessionMismatch(t *testing.T) {
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode", SessionContinuation: true, CommandCodeSessionID: "cc-1"}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, CommandCodeSessionID: "cc-2"}); err == nil {
		t.Fatal("a continuation that returned a different session must be rejected")
	}
}

// commandcode emits no turn sequence, so the dsh-only turn and workspace
// requirements must not reject an otherwise valid run.
func TestResolveCommandCodeIdentitySkipsTurnCursor(t *testing.T) {
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, CommandCodeSessionID: "cc-1"})
	if err != nil {
		t.Fatalf("commandcode must not require last_turn_seq: %v", err)
	}
	if identity.workspaceID != "" {
		t.Fatalf("commandcode has no workspace identity, got %q", identity.workspaceID)
	}
}

// Regression: the dsh turn-cursor fence must survive the split.
func TestResolveDSHIdentityStillEnforcesTurnCursor(t *testing.T) {
	cursor := int64(5)
	req := NodeDispatchRequest{Executor: "dsh", HarnessKind: "dsh", DSHWorkspaceID: "ws-1", LastTurnSeq: &cursor}
	stale := int64(5)
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, DSHSessionID: "s1", DSHWorkspaceID: "ws-1", LastTurnSeq: &stale}); err == nil {
		t.Fatal("dsh stale turn sequence must stay rejected")
	}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, DSHSessionID: "s1", DSHWorkspaceID: "ws-1"}); err == nil {
		t.Fatal("dsh run without a turn sequence must stay rejected")
	}
}

func TestCommandCodeBindingRoundTripPersistsSessionAndKind(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "commandcode continuity", Status: "todo", Executor: "commandcode", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	binding, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "commandcode")
	if err != nil {
		t.Fatal(err)
	}
	if continuation {
		t.Fatal("fresh commandcode card reported as a continuation")
	}
	if binding.HarnessKind != "commandcode" {
		t.Fatalf("kind = %q, want commandcode", binding.HarnessKind)
	}
	want := DeterministicHarnessSessionID("commandcode", slug, task.ID)
	if binding.HarnessSessionID != want {
		t.Fatalf("session = %q, want %q", binding.HarnessSessionID, want)
	}

	// A first run sends an empty session id so the worker mints a real one;
	// a continuation sends the id this binding now owns.
	// (The wire-side rule is asserted in cmd/server/commandcode_harness_test.go.)

	commentID := int64(3)
	saveHarnessSessionIDFor(db, task.ID, "commandcode", want, "", &commentID, false, NodeDispatchResult{Success: true, CommandCodeSessionID: want})

	var taskSessionID, kind string
	if err := db.QueryRow(`SELECT COALESCE(t.commandcode_session_id,''), COALESCE(b.harness_kind,'') FROM tasks t JOIN harness_bindings b ON b.card_id = t.id WHERE t.id=?`, task.ID).Scan(&taskSessionID, &kind); err != nil {
		t.Fatal(err)
	}
	if taskSessionID != want {
		t.Fatalf("commandcode session not mirrored to task: %q", taskSessionID)
	}
	if kind != "commandcode" {
		t.Fatalf("binding kind = %q, want commandcode", kind)
	}

	after, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "commandcode")
	if err != nil || !continuation {
		t.Fatalf("completed commandcode card must resume: binding=%+v continuation=%t err=%v", after, continuation, err)
	}
	if after.LastCommentID != commentID {
		t.Fatalf("comment cursor = %d, want %d", after.LastCommentID, commentID)
	}
	if after.LastTurnSeq != -1 {
		t.Fatalf("commandcode must keep the turn cursor unused, got %d", after.LastTurnSeq)
	}

	// A failed turn must not acknowledge the comment, so it replays next round.
	saveHarnessSessionIDFor(db, task.ID, "commandcode", want, "", &commentID, true, NodeDispatchResult{Success: false, Error: "boom"})
	afterFailure, _, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "commandcode")
	if err != nil {
		t.Fatal(err)
	}
	if afterFailure.LastCommentID != commentID {
		t.Fatalf("failed turn moved the comment cursor to %d", afterFailure.LastCommentID)
	}
	if afterFailure.Status != "error" {
		t.Fatalf("failed turn status = %q, want error", afterFailure.Status)
	}
}

// Regression: a dsh card must keep using the dsh column and legacy id.
func TestDSHBindingKeepsLegacySessionColumn(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "dsh continuity", Status: "todo", Executor: "dsh", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	binding, _, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "dsh")
	if err != nil {
		t.Fatal(err)
	}
	if binding.HarnessSessionID != DeterministicDSHSessionID(slug, task.ID) {
		t.Fatalf("dsh placeholder changed: %q", binding.HarnessSessionID)
	}
	dshSeq := int64(1)
	saveHarnessSessionIDFor(db, task.ID, "dsh", "s-1", "ws-1", nil, false, NodeDispatchResult{Success: true, DSHSessionID: "s-1", DSHWorkspaceID: "ws-1", LastTurnSeq: &dshSeq})
	var dshCol, ccCol string
	if err := db.QueryRow(`SELECT COALESCE(dsh_session_id,''), COALESCE(commandcode_session_id,'') FROM tasks WHERE id=?`, task.ID).Scan(&dshCol, &ccCol); err != nil {
		t.Fatal(err)
	}
	if dshCol != "s-1" || ccCol != "" {
		t.Fatalf("dsh write leaked: dsh=%q commandcode=%q", dshCol, ccCol)
	}
}

// A late result from a superseded run must be discarded by the run-ownership
// fence alone, since commandcode carries no turn cursor.
func TestFinalizeRejectsStaleCommandCodeResultByRunID(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "stale cc", Status: "todo", Executor: "commandcode", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, _, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "commandcode"); err != nil {
		t.Fatal(err)
	}
	runID, claimed, err := ClaimTaskRun(db, task.ID)
	if err != nil || !claimed {
		t.Fatalf("claim: claimed=%t err=%v", claimed, err)
	}
	req := NodeDispatchRequest{Executor: "commandcode", HarnessKind: "commandcode", RunID: runID, CardID: task.ID}
	identity, _ := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, CommandCodeSessionID: "cc-1"})
	applied, err := finalizeRemoteResult(db, req, task.ID, "completed", NodeDispatchResult{Success: true, Output: "ok", CommandCodeSessionID: "cc-1"}, identity)
	if err != nil || !applied {
		t.Fatalf("current run should finalize: applied=%t err=%v", applied, err)
	}

	// Replay the same payload under a stale run id. commandcode carries no turn
	// cursor, so the run-ownership fence is the only thing that can reject it.
	req.RunID = "run_stale"
	applied, err = finalizeRemoteResult(db, req, task.ID, "completed", NodeDispatchResult{Success: true, Output: "late", CommandCodeSessionID: "cc-2"}, identity)
	if err != nil || applied {
		t.Fatalf("stale run must be rejected: applied=%t err=%v", applied, err)
	}

	// The rejected replay must not have rewritten the stored answer.
	var storedResult string
	if err := db.QueryRow(`SELECT COALESCE(result,'') FROM tasks WHERE id=?`, task.ID).Scan(&storedResult); err != nil {
		t.Fatal(err)
	}
	if storedResult != "ok" {
		t.Fatalf("stale result overwrote the current one: %q", storedResult)
	}
}
