package kanban

import (
	"encoding/json"
	"testing"
)

func TestOMPSessionProofAcceptsOMPField(t *testing.T) {
	if !dshSessionProof.MatchString("provenance executor=omp omp_session_id=omp-9f4e") {
		t.Fatal("session proof did not match omp provenance")
	}
}

func TestOMPSessionColumnIsIsolatedFromOtherKinds(t *testing.T) {
	if got := harnessSessionColumn("omp"); got != "omp_session_id" {
		t.Fatalf("omp session column = %q, want omp_session_id", got)
	}
	if got := harnessSessionColumn("commandcode"); got != "commandcode_session_id" {
		t.Fatalf("commandcode session column = %q, want commandcode_session_id", got)
	}
	if got := harnessSessionColumn("dsh"); got != "dsh_session_id" {
		t.Fatalf("dsh session column = %q, want dsh_session_id", got)
	}
}

func TestOMPExecutorIsValid(t *testing.T) {
	if !ValidExecutors["omp"] {
		t.Fatal("omp must be a valid executor")
	}
	if !HarnessContinuityEnabled("omp") {
		t.Fatal("omp resumes sessions by id prefix and must carry a binding")
	}
	if harnessUsesWorkspaceIdentity("omp") {
		t.Fatal("omp resolves sessions by id prefix, not by workspace identity")
	}
}

// An omp id must never collide with the dsh or commandcode id for the same card.
func TestOMPDeterministicSessionIDSeparatesKinds(t *testing.T) {
	dshID := DeterministicHarnessSessionID("dsh", "board", "card-1")
	ccID := DeterministicHarnessSessionID("commandcode", "board", "card-1")
	ompID := DeterministicHarnessSessionID("omp", "board", "card-1")
	if ompID == dshID || ompID == ccID {
		t.Fatalf("omp id %q collides with another harness", ompID)
	}
	if got := DeterministicHarnessSessionID("omp", "board", "card-1"); got != ompID {
		t.Fatalf("id not stable: %q vs %q", got, ompID)
	}
}

// An omp request carries its own identity field and must not borrow dsh
// workspace identity, which omp has no concept of.
func TestApplyHarnessIdentityStampsOMPFields(t *testing.T) {
	req := NodeDispatchRequest{DSHWorkspaceID: "ws-1", DSHSessionID: "stale"}
	ApplyHarnessIdentity(&req, "omp", "omp-1")
	if req.HarnessKind != "omp" || req.OMPSessionID != "omp-1" {
		t.Fatalf("request = %+v, missing omp identity", req)
	}
	if req.DSHSessionID != "" || req.DSHWorkspaceID != "" {
		t.Fatalf("omp request leaked dsh workspace identity: %+v", req)
	}
	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"dsh_session_id", "dsh_workspace_id", "commandcode_session_id"} {
		if _, present := fields[key]; present {
			t.Fatalf("omp wire payload must omit %q: %s", key, raw)
		}
	}
	if fields["omp_session_id"] != "omp-1" {
		t.Fatalf("omp_session_id = %v, want omp-1", fields["omp_session_id"])
	}
}

// dsh keeps the legacy single-field path it has always used.
func TestApplyHarnessIdentityKeepsDSHFields(t *testing.T) {
	req := NodeDispatchRequest{}
	ApplyHarnessIdentity(&req, "dsh", "dsh-1")
	if req.HarnessKind != "dsh" || req.DSHSessionID != "dsh-1" {
		t.Fatalf("dsh request = %+v, want dsh identity on the dsh field", req)
	}
	if req.CommandCodeSessionID != "" || req.OMPSessionID != "" {
		t.Fatalf("dsh request leaked another harness session: %+v", req)
	}
}

func TestResolveOMPIdentityAcceptsSuccessWithSession(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp", SessionContinuation: true, OMPSessionID: "omp-1"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, OMPSessionID: "omp-1"})
	if err != nil || !identity.valid || identity.sessionID != "omp-1" {
		t.Fatalf("identity=%+v err=%v, want valid omp-1", identity, err)
	}
}

// A failed run may legitimately have no session (omp emits one only once the
// session resolves), so it must not block the card.
func TestResolveOMPIdentityToleratesMissingSessionOnFailure(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: false, Error: "boom", Output: "auth failure"})
	if err != nil || !identity.valid {
		t.Fatalf("failed run rejected: identity=%+v err=%v", identity, err)
	}
}

func TestResolveOMPIdentityRejectsSuccessWithoutSession(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp"}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, Output: "done"}); err == nil {
		t.Fatal("successful omp run without a session id must be rejected")
	}
}

func TestResolveOMPIdentityRejectsSessionMismatch(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp", SessionContinuation: true, OMPSessionID: "omp-1"}
	if _, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, OMPSessionID: "omp-2"}); err == nil {
		t.Fatal("a continuation that returned a different session must be rejected")
	}
}

// omp emits no turn sequence, so the dsh-only turn and workspace requirements
// must not reject an otherwise valid run.
func TestResolveOMPIdentitySkipsTurnCursor(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, OMPSessionID: "omp-1"})
	if err != nil {
		t.Fatalf("omp must not require last_turn_seq: %v", err)
	}
	if identity.workspaceID != "" {
		t.Fatalf("omp has no workspace identity, got %q", identity.workspaceID)
	}
}

// A session id in the text output is enough to prove identity when the worker
// omits the dedicated field.
func TestResolveOMPIdentityFallsBackToOutputProof(t *testing.T) {
	req := NodeDispatchRequest{Executor: "omp", HarnessKind: "omp"}
	identity, err := resolveDSHResultIdentity(req, NodeDispatchResult{Success: true, Output: "done\nomp_session_id: omp-abc123\n"})
	if err != nil || !identity.valid || identity.sessionID != "omp-abc123" {
		t.Fatalf("identity=%+v err=%v, want omp-abc123 from output proof", identity, err)
	}
}

func TestOMPHarnessBindingLifecycle(t *testing.T) {
	slug := testBoard(t)
	workspace := t.TempDir()
	task := Task{Title: "omp continuity", Status: "todo", Executor: "omp", WorkspacePath: workspace}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	db, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	binding, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "omp")
	if err != nil {
		t.Fatal(err)
	}
	if continuation {
		t.Fatal("a fresh omp card must not be reported as a continuation")
	}
	if binding.HarnessKind != "omp" {
		t.Fatalf("kind = %q, want omp", binding.HarnessKind)
	}
	want := DeterministicHarnessSessionID("omp", slug, task.ID)
	if binding.HarnessSessionID != want {
		t.Fatalf("session = %q, want %q", binding.HarnessSessionID, want)
	}

	commentID := int64(7)
	saveHarnessSessionIDFor(db, task.ID, "omp", want, "", &commentID, false, NodeDispatchResult{Success: true, OMPSessionID: want})

	var taskSessionID, kind string
	if err := db.QueryRow(`SELECT COALESCE(t.omp_session_id,''), COALESCE(b.harness_kind,'') FROM tasks t JOIN harness_bindings b ON b.card_id = t.id WHERE t.id=?`, task.ID).Scan(&taskSessionID, &kind); err != nil {
		t.Fatal(err)
	}
	if taskSessionID != want {
		t.Fatalf("omp session not mirrored to task: %q", taskSessionID)
	}
	if kind != "omp" {
		t.Fatalf("binding kind = %q, want omp", kind)
	}
	// The omp column must be the only one written.
	var dshCol, ccCol string
	if err := db.QueryRow(`SELECT COALESCE(dsh_session_id,''), COALESCE(commandcode_session_id,'') FROM tasks WHERE id=?`, task.ID).Scan(&dshCol, &ccCol); err != nil {
		t.Fatal(err)
	}
	if dshCol != "" || ccCol != "" {
		t.Fatalf("omp write leaked into another column: dsh=%q commandcode=%q", dshCol, ccCol)
	}

	after, continuation, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "omp")
	if err != nil {
		t.Fatal(err)
	}
	if !continuation {
		t.Fatalf("a completed omp card must resume: binding=%+v err=%v", after, err)
	}
	if after.LastTurnSeq != -1 {
		t.Fatalf("omp must leave the turn cursor unused, got %d", after.LastTurnSeq)
	}

	// A failed run must flip the binding to error so the next dispatch starts clean.
	saveHarnessSessionIDFor(db, task.ID, "omp", want, "", &commentID, true, NodeDispatchResult{Success: false, Error: "boom"})
	afterFailure, _, err := ResolveHarnessBindingFor(db, slug, task.ID, workspace, "omp")
	if err != nil {
		t.Fatal(err)
	}
	if afterFailure.Status != "error" {
		t.Fatalf("binding status = %q, want error after a failed run", afterFailure.Status)
	}
}
