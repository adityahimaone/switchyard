package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// TestTaskLifecycleRerun3x verifies the complete end-to-end task cycle with 3 runs:
//  1. Create task -> Dispatched (Run 1) -> Completes -> Lands in "review"
//  2. Reviewer posts an observation note (intent: "comment") -> Verified: stays in "review", NOT requeued
//  3. Reviewer posts change request 1 (intent: "request_changes") -> Requeues to "todo" -> Dispatched (Run 2) -> Lands in "review"
//  4. Reviewer posts change request 2 (via /request-changes) -> Requeues to "todo" -> Dispatched (Run 3) -> Lands in "review"
//  5. Reviewer approves task (via /approve) -> Transitions to "done"
func TestTaskLifecycleRerun3x(t *testing.T) {
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

	// Model configuration for commandcode executor
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: test-rerun-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	server := httptest.NewServer(authHandler(mux))
	t.Cleanup(server.Close)
	cookie := loopLogin(t, server.URL)

	boardSlug := "rerun-board"
	if res := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": boardSlug, "name": "Rerun Test Board"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic(boardSlug); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// -------------------------------------------------------------
	// Turn 1: Create task and execute Initial Run (Run 1)
	// -------------------------------------------------------------
	createRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks", map[string]any{
		"title":          "Implement user profile settings",
		"body":           "Add profile form with name and bio fields.",
		"executor":       "commandcode",
		"assignee":       "default",
		"workspace_path": "/Users/mac/loop-workspace",
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
	if task.Status != "todo" {
		t.Fatalf("new task status = %q, want todo", task.Status)
	}

	// Dispatch Turn 1
	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 1 {
		t.Fatalf("after initial dispatch: recorded %d dispatches, want 1", count)
	}
	loaded, err := kanban.GetTask(boardSlug, task.ID)
	if err != nil {
		t.Fatalf("load task: %v", err)
	}
	if loaded.Status != "review" {
		t.Fatalf("after run 1: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Step 2: Post observation comment (intent: "comment")
	// Prove WS-2: regular comment does NOT requeue to todo
	// -------------------------------------------------------------
	commentRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", map[string]any{
		"author": "lead-reviewer",
		"body":   "Initial layout looks clean, reviewing code changes now.",
		"intent": "comment",
	})
	if commentRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /comments = %d, want 201", commentRes.StatusCode)
	}
	var comment1 kanban.TaskComment
	if err := json.NewDecoder(commentRes.Body).Decode(&comment1); err != nil {
		t.Fatal(err)
	}
	if comment1.Requeued {
		t.Errorf("comment with intent 'comment' was marked requeued, want false")
	}

	// Dispatcher pass should do nothing because card is still in review
	dispatchPendingRemoteTasks()
	if count := fake.dispatchCount(); count != 1 {
		t.Fatalf("plain comment triggered unexpected dispatch; total dispatches = %d, want 1", count)
	}
	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after plain comment: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Turn 2: Request Changes 1 (intent: "request_changes") -> Re-run 1 (Run 2)
	// -------------------------------------------------------------
	changeReqRes1 := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", map[string]any{
		"author":      "lead-reviewer",
		"body":        "Please add avatar upload support with file type validation.",
		"intent":      "request_changes",
		"file_path":   "web/src/features/profile/ProfileForm.tsx",
		"line_number": 35,
	})
	if changeReqRes1.StatusCode != http.StatusCreated {
		t.Fatalf("POST /comments with request_changes = %d, want 201", changeReqRes1.StatusCode)
	}
	var comment2 kanban.TaskComment
	if err := json.NewDecoder(changeReqRes1.Body).Decode(&comment2); err != nil {
		t.Fatal(err)
	}
	if !comment2.Requeued {
		t.Errorf("request_changes comment was not marked requeued, want true")
	}

	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "todo" {
		t.Fatalf("after request changes 1: status = %q, want todo", loaded.Status)
	}

	// Dispatch Turn 2 (Re-run 1)
	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 2 {
		t.Fatalf("after rerun 1: recorded %d dispatches, want 2", count)
	}
	dispatch2 := fake.dispatches[1]
	if !strings.Contains(dispatch2.Message, "avatar upload support") {
		t.Errorf("dispatch 2 prompt missing reviewer comment; prompt was:\n%s", dispatch2.Message)
	}

	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after run 2: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Turn 3: Request Changes 2 (via /request-changes endpoint) -> Re-run 2 (Run 3)
	// -------------------------------------------------------------
	changeReqRes2 := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/request-changes", map[string]any{
		"author":      "lead-reviewer",
		"body":        "Almost done! Please add client-side image compression before upload.",
		"file_path":   "web/src/features/profile/AvatarUpload.tsx",
		"line_number": 68,
	})
	if changeReqRes2.StatusCode != http.StatusOK {
		t.Fatalf("POST /request-changes = %d, want 200", changeReqRes2.StatusCode)
	}
	var comment3 kanban.TaskComment
	if err := json.NewDecoder(changeReqRes2.Body).Decode(&comment3); err != nil {
		t.Fatal(err)
	}
	if !comment3.Requeued {
		t.Errorf("request-changes endpoint did not mark requeued, want true")
	}

	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "todo" {
		t.Fatalf("after request changes 2: status = %q, want todo", loaded.Status)
	}

	// Dispatch Turn 3 (Re-run 2)
	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 3 {
		t.Fatalf("after rerun 2: recorded %d dispatches, want 3", count)
	}
	dispatch3 := fake.dispatches[2]
	if !strings.Contains(dispatch3.Message, "image compression") {
		t.Errorf("dispatch 3 prompt missing second feedback; prompt was:\n%s", dispatch3.Message)
	}

	loaded, _ = kanban.GetTask(boardSlug, task.ID)
	if loaded.Status != "review" {
		t.Fatalf("after run 3: status = %q, want review", loaded.Status)
	}

	// -------------------------------------------------------------
	// Final Approval: Reviewer approves task -> Done
	// -------------------------------------------------------------
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

	// Final verification of full 3-run cycle
	if count := fake.dispatchCount(); count != 3 {
		t.Fatalf("final total dispatches = %d, want exactly 3", count)
	}
}
