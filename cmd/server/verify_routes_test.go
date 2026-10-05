package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// verifyTaskRow creates a migrated board with one task in review, so the verify
// columns exist and the approve veto queries them for real rather than failing
// open on a missing column.
func verifyTaskRow(t *testing.T) {
	t.Helper()
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := kanban.EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := kanban.CreateTask("default", &kanban.Task{
		ID: "t_appr", Title: "test", Status: "review",
		WorkspacePath: t.TempDir(), Executor: "shell", Command: "true",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	// A real directory: CreateTask refuses a workspace_path that does not exist
	// on this host. Approve additionally requires a node-agent transport, since
	// a local workspace never reaches review.
	if _, err := verifyDBFor(t).Exec(
		`UPDATE tasks SET workspace_transport='node-agent' WHERE id='t_appr'`); err != nil {
		t.Fatal(err)
	}
}

func approveWith(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/approve", handleTaskApprove)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST",
		"/api/boards/default/tasks/t_appr/approve", strings.NewReader(body)))
	return rec
}

// verifyDBFor opens the board database for a direct column write, which is how
// a test sets a verdict without a live worker to produce one.
func verifyDBFor(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath("default")+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// TestApproveVetoesAFailedVerify is the core guarantee of the loop: a UI change
// whose verification failed cannot reach done without a deliberate override.
func TestApproveVetoesAFailedVerify(t *testing.T) {
	verifyTaskRow(t)
	// Set a failed verdict directly: running a real one needs a worker.
	if _, err := verifyDBFor(t).Exec(
		`UPDATE tasks SET verify_status='failed', verify_output='3 visual tests failed' WHERE id='t_appr'`); err != nil {
		t.Fatal(err)
	}
	rec := approveWith(t, `{"action":"done"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("approve of a failed verify returned %d, want 409", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "verification failed") {
		t.Fatalf("the refusal did not explain itself: %s", rec.Body.String())
	}
}

// TestApproveForceRecordsTheOverride proves the escape hatch is deliberate and
// auditable rather than a bypass.
func TestApproveForceRecordsTheOverride(t *testing.T) {
	verifyTaskRow(t)
	if _, err := verifyDBFor(t).Exec(
		`UPDATE tasks SET verify_status='failed', verify_output='boom' WHERE id='t_appr'`); err != nil {
		t.Fatal(err)
	}
	rec := approveWith(t, `{"action":"done","force":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("a forced approve returned %d, want 200: %s", rec.Code, rec.Body.String())
	}
	events, err := kanban.TaskEvents("default", "t_appr")
	if err != nil {
		t.Fatalf("events: %v", err)
	}
	found := false
	for _, e := range events {
		if e.Kind == "verify_overridden" {
			found = true
		}
	}
	if !found {
		t.Fatal("a forced approve past a red verify left no verify_overridden event")
	}
}

// TestApproveAllowsUnverifiedAndSkipped pins the two degraded states as
// approvable. Vetoing them would mean a node without a browser could never
// approve anything, which is not what "visibly degraded" should mean.
func TestApproveAllowsUnverifiedAndSkipped(t *testing.T) {
	for _, status := range []string{"", "skipped", "unavailable", "passed", "running"} {
		t.Run("status="+status, func(t *testing.T) {
			verifyTaskRow(t)
			if _, err := verifyDBFor(t).Exec(
				`UPDATE tasks SET verify_status=? WHERE id='t_appr'`, status); err != nil {
				t.Fatal(err)
			}
			rec := approveWith(t, `{"action":"done"}`)
			if rec.Code != http.StatusOK {
				t.Fatalf("verify_status %q blocked approve: %d %s", status, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestVerifyFieldsRouteRejectsBadInput(t *testing.T) {
	verifyTaskRow(t)
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/boards/{slug}/tasks/{id}/fields", handleTaskFields)

	call := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("PATCH",
			"/api/boards/default/tasks/t_appr/fields", strings.NewReader(body)))
		return rec
	}

	if rec := call(`{"verify_profile":"ui"}`); rec.Code != http.StatusOK {
		t.Fatalf("a valid profile returned %d: %s", rec.Code, rec.Body.String())
	}
	if rec := call(`{"verify_profile":"nonsense"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an invalid profile returned %d, want 400", rec.Code)
	}
	// A generic PATCH must not be able to reach a dispatcher-owned column.
	if rec := call(`{"status":"done"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an unknown field returned %d, want 400", rec.Code)
	}
	if rec := call(`{"design_source":"../escape.pen"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an escaping design source returned %d, want 400", rec.Code)
	}
	if rec := call(`{}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("an empty patch returned %d, want 400", rec.Code)
	}
}

// TestVerifyFieldsRouteClearsTheVerdict proves the UI cannot leave a red result
// on a card whose requirement was just lowered.
func TestVerifyFieldsRouteClearsTheVerdict(t *testing.T) {
	verifyTaskRow(t)
	if _, err := verifyDBFor(t).Exec(
		`UPDATE tasks SET verify_status='failed', verify_output='boom', verify_profile_effective='ui'
		WHERE id='t_appr'`); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/boards/{slug}/tasks/{id}/fields", handleTaskFields)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("PATCH",
		"/api/boards/default/tasks/t_appr/fields", strings.NewReader(`{"verify_profile":"none"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("patch returned %d: %s", rec.Code, rec.Body.String())
	}
	state, err := kanban.VerifyState("default", "t_appr")
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != "" || state.Output != "" || state.ProfileEffective != "" {
		t.Fatalf("the old verdict survived the edit: %+v", state)
	}
}

func TestVerifyRouteReportsTheVerdict(t *testing.T) {
	verifyTaskRow(t)
	if _, err := verifyDBFor(t).Exec(
		`UPDATE tasks SET verify_profile='', verify_profile_effective='ui',
			verify_status='passed', verify_output='ok' WHERE id='t_appr'`); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/verify", handleTaskVerify)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET",
		"/api/boards/default/tasks/t_appr/verify", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET verify returned %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		ProfileEffective string     `json:"profile_effective"`
		Status           string     `json:"status"`
		Ladder           []string   `json:"ladder"`
		Attachments      []struct{} `json:"attachments"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ProfileEffective != "ui" || body.Status != "passed" {
		t.Fatalf("unexpected payload: %+v", body)
	}
	// A card with no evidence must return [], not null — the review UI maps over
	// this and a null would put a branch in the render path.
	if !strings.Contains(rec.Body.String(), `"attachments":[]`) {
		t.Fatalf("attachments was not an empty list: %s", rec.Body.String())
	}
	if len(body.Ladder) != 4 {
		t.Fatalf("ladder = %v, want four rungs", body.Ladder)
	}
}
