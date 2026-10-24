package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// TestVisualFixtureLifecycleRerun3x tests the complete real-world task rerun cycle
// directly against the "visual-fixture" board slug:
//  1. Create task on "visual-fixture" board -> Initial Run (Run 1) -> Lands in "review"
//  2. Reviewer posts observation note (intent: "comment") -> Verified: stays in "review"
//  3. Reviewer posts change request 1 (intent: "request_changes") -> Requeues to "todo" -> Dispatched (Run 2) -> Lands in "review"
//  4. Reviewer posts change request 2 (via /request-changes with file_path & line_number) -> Requeues to "todo" -> Dispatched (Run 3) -> Lands in "review"
//  5. Reviewer resolves comments and approves -> Moves to "done"
func TestVisualFixtureLifecycleRerun3x(t *testing.T) {
	fake := startLoopFakeNode(t)
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("KANBAN_NODE_AGENT", fake.URL)
	t.Setenv("KANBAN_VERIFY_ENABLED", "0")
	t.Setenv("SWITCHYARD_DEV", "1")

	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatalf("auth seed: %v", err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		t.Fatalf("attachments db: %v", err)
	}

	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: deepseek-v4.1-flash\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	server := httptest.NewServer(authHandler(mux))
	t.Cleanup(server.Close)
	cookie := loopLogin(t, server.URL)

	boardSlug := "visual-fixture"
	if res := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": boardSlug, "name": "Visual fixture"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic(boardSlug); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// -------------------------------------------------------------
	// Cycle 1: Create task on visual-fixture and execute Run 1
	// -------------------------------------------------------------
	createRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks", map[string]any{
		"title":          "Fixture: Habit Streak Visual & WCAG AA Contrast Polish",
		"body":           "Audit habit streak pills and verify WCAG AA compliance across light and dark themes.",
		"executor":       "commandcode",
		"assignee":       "default",
		"workspace_path": "/Users/adityahimawan/Development/habbit-tracking-next",
		"workspace_kind": "dir",
		"isolation":      "workspace",
	})
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /tasks on visual-fixture = %d, want 201", createRes.StatusCode)
	}
	var task kanban.Task
	if err := json.NewDecoder(createRes.Body).Decode(&task); err != nil {
		t.Fatal(err)
	}
	if task.Status != "todo" {
		t.Fatalf("new task status = %q, want todo", task.Status)
	}

	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 1 {
		t.Fatalf("after initial dispatch: recorded %d dispatches, want 1", count)
	}
	loaded, err := kanban.GetTask(boardSlug, task.ID)
	if err != nil {
		t.Fatalf("load task: %v", err)
	}
	if loaded.Status != "review" {
		t.Fatalf("after run 1: status = %q, want review, last_error = %q", loaded.Status, loaded.LastError)
	}

	// -------------------------------------------------------------
	// Step 2: Post observation comment (intent: "comment") -> Stays in review
	// -------------------------------------------------------------
	commentRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", map[string]any{
		"author": "lead-reviewer",
		"body":   "Visual snapshot looks clean on initial inspection.",
		"intent": "comment",
	})
	if commentRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /comments = %d, want 201", commentRes.StatusCode)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after observation note: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Cycle 2: Request Changes 1 (intent: "request_changes") -> Re-run 1 (Run 2)
	// -------------------------------------------------------------
	changeReqRes1 := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", map[string]any{
		"author": "design-reviewer",
		"body":   "Streak pill border opacity is too faint in light mode (under 12%). Please darken to AA contrast.",
		"intent": "request_changes",
	})
	if changeReqRes1.StatusCode != http.StatusCreated {
		t.Fatalf("POST /comments (request_changes) = %d, want 201", changeReqRes1.StatusCode)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "todo" {
		t.Fatalf("after change request 1: status = %q, want todo", loaded.Status)
	}

	// Verify 1 unresolved comment
	db, err := sql.Open("sqlite", kanban.BoardDBPath(boardSlug))
	if err != nil {
		t.Fatalf("open board db: %v", err)
	}
	unresolved, err := kanban.UnresolvedTaskComments(db, task.ID)
	db.Close()
	if err != nil {
		t.Fatalf("unresolved comments: %v", err)
	}
	if len(unresolved) != 2 {
		t.Fatalf("expected 2 unresolved comments (1 note + 1 change request), got %d", len(unresolved))
	}
	if unresolved[1].Intent != "request_changes" {
		t.Fatalf("expected second comment to have intent 'request_changes', got %q", unresolved[1].Intent)
	}

	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 2 {
		t.Fatalf("after rerun 1: recorded %d dispatches, want 2", count)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after rerun 1 completion: status = %q, want review", loaded.Status)
	}

	// Verify feedback was passed in prompt for rerun 1
	dispatch2 := fake.dispatches[1]
	if !strings.Contains(dispatch2.Message, "Streak pill border opacity is too faint") {
		t.Errorf("rerun 1 prompt missing unresolved reviewer feedback")
	}

	// -------------------------------------------------------------
	// Cycle 3: Request Changes 2 (via /request-changes) -> Re-run 2 (Run 3)
	// -------------------------------------------------------------
	changeReqRes2 := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/request-changes", map[string]any{
		"author":      "qa-engineer",
		"body":        "Tighten flame icon padding to 6px and add focus-visible ring.",
		"file_path":   "web/src/components/streak.tsx",
		"line_number": 42,
	})
	if changeReqRes2.StatusCode != http.StatusOK {
		t.Fatalf("POST /request-changes = %d, want 200", changeReqRes2.StatusCode)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "todo" {
		t.Fatalf("after change request 2: status = %q, want todo", loaded.Status)
	}

	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 3 {
		t.Fatalf("after rerun 2: recorded %d dispatches, want 3", count)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after rerun 2 completion: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Cycle 4: Resolve Comments and Approve Task -> "done"
	// -------------------------------------------------------------
	commentsRes := loopAPI(t, server.URL, cookie, http.MethodGet, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", nil)
	if commentsRes.StatusCode != http.StatusOK {
		t.Fatalf("GET /comments = %d, want 200", commentsRes.StatusCode)
	}
	var comments []kanban.TaskComment
	if err := json.NewDecoder(commentsRes.Body).Decode(&comments); err != nil {
		t.Fatal(err)
	}
	for _, c := range comments {
		if !c.Resolved && c.Intent == "request_changes" {
			resolveRes := loopAPI(t, server.URL, cookie, http.MethodPost, fmt.Sprintf("/api/boards/%s/tasks/%s/comments/%d/resolve", boardSlug, task.ID, c.ID), nil)
			if resolveRes.StatusCode != http.StatusOK {
				t.Fatalf("POST /resolve = %d, want 200", resolveRes.StatusCode)
			}
		}
	}

	approveRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/approve", map[string]any{
		"action": "done",
	})
	if approveRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /approve = %d, want 200", approveRes.StatusCode)
	}

	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "done" {
		t.Fatalf("after approval: status = %q, want done", loaded.Status)
	}
}

// TestVisualFixtureColdRerunContextPack proves WS-3 on the "visual-fixture" board:
// when a non-continuation executor (e.g. shell / cold rerun) is requeued after feedback,
// it receives the structured Task Context Pack with diff stat, previous result summary,
// and unresolved review comments with file:line anchors.
func TestVisualFixtureColdRerunContextPack(t *testing.T) {
	fake := startLoopFakeNode(t)
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("KANBAN_NODE_AGENT", fake.URL)
	t.Setenv("KANBAN_VERIFY_ENABLED", "0")
	t.Setenv("SWITCHYARD_DEV", "1")

	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatalf("auth seed: %v", err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		t.Fatalf("attachments db: %v", err)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	server := httptest.NewServer(authHandler(mux))
	t.Cleanup(server.Close)
	cookie := loopLogin(t, server.URL)

	boardSlug := "visual-fixture"
	if res := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": boardSlug, "name": "Visual fixture"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic(boardSlug); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// Create task on visual-fixture with shell executor (cold non-continuation)
	createRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks", map[string]any{
		"title":          "Fixture: Optimize Asset Bundling",
		"body":           "Audit static chunks in build output and reduce bundle size.",
		"executor":       "shell",
		"assignee":       "default",
		"workspace_path": "/Users/adityahimawan/Development/habbit-tracking-next",
		"workspace_kind": "dir",
		"isolation":      "workspace",
	})
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /tasks = %d, want 201", createRes.StatusCode)
	}
	var task kanban.Task
	if err := json.NewDecoder(createRes.Body).Decode(&task); err != nil {
		t.Fatal(err)
	}

	// Run 1: initial dispatch
	dispatchPendingRemoteTasks()
	loaded, err := kanban.GetTask(boardSlug, task.ID)
	if err != nil || loaded.Status != "review" {
		t.Fatalf("after run 1: status = %q, want review, err=%v", loaded.Status, err)
	}

	// Request changes with line anchor
	changeRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/request-changes", map[string]any{
		"author":      "lead-architect",
		"body":        "Tree-shake lucide-react imports to reduce vendor chunk by 40KB.",
		"file_path":   "web/src/components/icons.ts",
		"line_number": 15,
	})
	if changeRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /request-changes = %d, want 200", changeRes.StatusCode)
	}

	// Run 2: Cold re-run pass
	dispatchPendingRemoteTasks()
	if count := fake.dispatchCount(); count != 2 {
		t.Fatalf("after cold rerun: dispatches = %d, want 2", count)
	}

	dispatch2 := fake.dispatches[1]
	// Assert structured context pack is assembled in prompt
	if !strings.Contains(dispatch2.Message, "[CONTINUATION — STRUCTURED CONTEXT PACK]") {
		t.Errorf("cold rerun prompt missing [CONTINUATION — STRUCTURED CONTEXT PACK] header; got:\n%s", dispatch2.Message)
	}
	if !strings.Contains(dispatch2.Message, "Tree-shake lucide-react imports") {
		t.Errorf("cold rerun prompt missing reviewer comment; got:\n%s", dispatch2.Message)
	}
	if !strings.Contains(dispatch2.Message, "[web/src/components/icons.ts:15]") {
		t.Errorf("cold rerun prompt missing file:line anchor [web/src/components/icons.ts:15]; got:\n%s", dispatch2.Message)
	}
}
