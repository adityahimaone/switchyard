package main

// The board list must stay small. One real card carries a 2.5 MB agent result;
// before this, GET /tasks shipped every task's full output and the board could
// not paint until megabytes arrived.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func TestBoardListTruncatesResultAndDetailReturnsIt(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := kanban.EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	huge := strings.Repeat("agent output line\n", 120_000) // ~2 MB
	task := &kanban.Task{
		Title:         "Big result",
		Body:          "produce a lot",
		WorkspacePath: "/tmp",
		Result:        huge,
	}
	if err := kanban.CreateTask("default", task); err != nil {
		t.Fatalf("create: %v", err)
	}
	// CreateTask does not write `result` — that is the executor's column. Use
	// the import path (the same one a board restore uses) to put the payload
	// on the row without standing up a worker.
	if _, _, err := kanban.ImportBoard(&kanban.BoardSnapshot{
		Board: kanban.Board{Slug: "default", Name: "Default"},
		Tasks: []kanban.Task{{
			ID: task.ID, Title: task.Title, Body: task.Body,
			Status: "done", WorkspacePath: "/tmp", Result: huge,
		}},
	}); err != nil {
		t.Fatalf("seed result: %v", err)
	}

	mux := http.NewServeMux()
	registerBoardsRoutes(mux)

	// List: preview only, and the flag says so.
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, httptest.NewRequest(http.MethodGet, "/api/boards/default/tasks", nil))
	if listRec.Code != http.StatusOK {
		t.Fatalf("list: HTTP %d: %s", listRec.Code, listRec.Body.String())
	}
	if n := listRec.Body.Len(); n > 200_000 {
		t.Errorf("list payload is %d bytes; the preview cap is not applied", n)
	}
	var listed []kanban.Task
	if err := json.Unmarshal(listRec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listed) != 1 {
		t.Fatalf("listed %d tasks, want 1", len(listed))
	}
	got := listed[0]
	if !got.ResultTruncated {
		t.Error("result_truncated is false on a 2 MB result")
	}
	if len(got.Result) > kanban.TaskListResultPreview {
		t.Errorf("result preview is %d bytes, cap is %d", len(got.Result), kanban.TaskListResultPreview)
	}
	if len(got.Result) == 0 {
		t.Error("the preview is empty; the card would show no output at all")
	}
	// Truncation must not split a rune.
	if strings.ContainsRune(got.Result, '\uFFFD') {
		t.Error("preview contains a replacement rune — the cut split a multi-byte character")
	}

	// Detail: the full text, unchanged.
	detailRec := httptest.NewRecorder()
	mux.ServeHTTP(detailRec, httptest.NewRequest(http.MethodGet, "/api/boards/default/tasks/"+task.ID, nil))
	if detailRec.Code != http.StatusOK {
		t.Fatalf("detail: HTTP %d: %s", detailRec.Code, detailRec.Body.String())
	}
	var full kanban.Task
	if err := json.Unmarshal(detailRec.Body.Bytes(), &full); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if len(full.Result) != len(huge) {
		t.Errorf("detail result is %d bytes, want the full %d", len(full.Result), len(huge))
	}
	if full.ResultTruncated {
		t.Error("detail result reported as truncated")
	}
}

func TestGetTaskMissingIs404(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := kanban.EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	mux := http.NewServeMux()
	registerBoardsRoutes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/boards/default/tasks/t_missing", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("HTTP %d, want 404: %s", rec.Code, rec.Body.String())
	}
}
