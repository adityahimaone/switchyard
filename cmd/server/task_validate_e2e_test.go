package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// seedBoardWithTasks creates a board the validate endpoint can see, with one
// existing task so "dry run writes nothing" is a meaningful assertion.
func seedBoardWithTasks(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// The "default" board is special: its directory is hermesHome() itself, not
	// boards/<slug>, and its database is <hermesHome>/kanban.db.
	if err := kanban.EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("ensure schema: %v", err)
	}
	// Seed through the public API so the schema under test is the one
	// production uses, including the new columns.
	if err := kanban.CreateTask("default", &kanban.Task{
		Title:         "existing card",
		WorkspacePath: "/tmp",
		Paths:         []string{"src/existing/**"},
	}); err != nil {
		t.Fatalf("seed task: %v", err)
	}
	return home
}

func postValidate(t *testing.T, slug, body string) (int, struct {
	OK     bool           `json:"ok"`
	Issues []kanban.Issue `json:"issues"`
}) {
	t.Helper()
	mux := http.NewServeMux()
	registerBoardsRoutes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST",
		"/api/boards/"+slug+"/tasks/validate", strings.NewReader(body)))

	var out struct {
		OK     bool           `json:"ok"`
		Issues []kanban.Issue `json:"issues"`
	}
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("decode response: %v (body %s)", err, rec.Body.String())
		}
	}
	return rec.Code, out
}

// TestValidateEndpointWritesNothing is the point of a dry run: it must be
// impossible for it to create a card.
func TestValidateEndpointWritesNothing(t *testing.T) {
	seedBoardWithTasks(t)

	before, err := kanban.ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}

	code, body := postValidate(t, "default", `{"title":"a brand new card","paths":["src/auth/**"]}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if !body.OK {
		t.Fatalf("expected ok=true, got issues %+v", body.Issues)
	}

	after, err := kanban.ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) {
		t.Fatalf("dry run created a task: %d -> %d", len(before), len(after))
	}
}

func TestValidateEndpointReportsFieldIssues(t *testing.T) {
	seedBoardWithTasks(t)

	code, body := postValidate(t, "default", `{"title":"","paths":["/etc/passwd","../escape"]}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (validation issues are a 200 with ok=false)", code)
	}
	if body.OK {
		t.Fatal("expected ok=false")
	}
	// Both path problems plus the missing title should all be reported at once,
	// so the form can show everything rather than one error at a time.
	fields := map[string]bool{}
	for _, is := range body.Issues {
		fields[is.Field] = true
		if is.Code == "" || is.Message == "" {
			t.Errorf("issue missing code or message: %+v", is)
		}
	}
	for _, want := range []string{"title", "paths"} {
		if !fields[want] {
			t.Errorf("no issue reported for field %q; got %v", want, fields)
		}
	}
}

func TestValidateEndpointReportsMissingBoard(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	code, body := postValidate(t, "nope", `{"title":"valid title"}`)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if body.OK {
		t.Fatal("a missing board must not validate as ok")
	}
	found := false
	for _, is := range body.Issues {
		if is.Code == kanban.CodeWorkspaceMissing {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a %s issue, got %+v", kanban.CodeWorkspaceMissing, body.Issues)
	}
}

func TestValidateEndpointRejectsOversizedBody(t *testing.T) {
	seedBoardWithTasks(t)
	// A body past the 1 MiB cap must be refused, not silently decoded on a
	// valid JSON prefix.
	huge := `{"title":"x","body":"` + strings.Repeat("a", 2<<20) + `"}`
	code, _ := postValidate(t, "default", huge)
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for an oversized body", code)
	}
}

// TestCreateRejectsTheSameIssuesAsDryRun is the drift guard: whatever the dry
// run flags must also be refused by the real create, and nothing more.
func TestCreateRejectsTheSameIssuesAsDryRun(t *testing.T) {
	seedBoardWithTasks(t)

	bodies := []string{
		`{"title":""}`,
		`{"title":"ok","paths":["/absolute"]}`,
		`{"title":"ok","paths":["../up"]}`,
		`{"title":"ok","start_mode":"soon"}`,
	}
	for _, body := range bodies {
		_, res := postValidate(t, "default", body)
		if res.OK {
			t.Errorf("dry run accepted %s but it should not", body)
		}

		var tsk kanban.Task
		if err := json.Unmarshal([]byte(body), &tsk); err != nil {
			t.Fatal(err)
		}
		if err := kanban.CreateTask("default", &tsk); err == nil {
			t.Errorf("create accepted %s but the dry run flagged it", body)
		}
	}

	// Nothing should have been created by any of those attempts.
	tasks, err := kanban.ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected only the seeded task, got %d", len(tasks))
	}
}
