package main

import (
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

// TestHabitTrackingDesignReviewerPersonaFlow validates the end-to-end persona review lifecycle
// for habit-tracking-next:
//  1. Create task with summoned tokens ($apple-design, $emil-design-eng, @components/header.tsx)
//  2. Dispatch Run 1 -> Lands in "review"
//  3. Summon "design-reviewer" persona -> Post change request with Emil Kowalski before/after table
//     anchored to components/header.tsx:28 -> Task requeues to "todo"
//  4. Dispatch Run 2 -> Verify structured continuation context contains design-reviewer comments
//  5. Resolve change request -> Approve task to "done"
func TestHabitTrackingDesignReviewerPersonaFlow(t *testing.T) {
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

	boardSlug := "habit-tracking"
	if res := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": boardSlug, "name": "Habit Tracking"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic(boardSlug); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// -------------------------------------------------------------
	// Step 1: Create task with summoned skills and file references
	// -------------------------------------------------------------
	createRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks", map[string]any{
		"title": "Habit Tracking: Header Proportion & Screen Real Estate Polish",
		"body": `Review header width and height proportion against design/redesign-habit-tracker.pen.
Summoned context:
$apple-design $emil-design-eng
@components/header.tsx:28
@components/mobile-layout.tsx:25

The header currently feels disproportionately wide and tall compared to the 240px bottom dock.
Optimize header optical weight and reduce vertical spacing footprint.`,
		"executor":       "commandcode",
		"assignee":       "default",
		"workspace_path": "/Users/adityahimawan/Development/habbit-tracking-next",
		"workspace_kind": "dir",
		"isolation":      "workspace",
	})
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /tasks on habit-tracking = %d, want 201", createRes.StatusCode)
	}
	var task kanban.Task
	if err := json.NewDecoder(createRes.Body).Decode(&task); err != nil {
		t.Fatal(err)
	}
	if task.Status != "todo" {
		t.Fatalf("new task status = %q, want todo", task.Status)
	}

	// Dispatch initial run
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
	// Step 2: Design Reviewer Persona posts Change Request
	// -------------------------------------------------------------
	designReviewContent := `### Design Review: Header Width & Screen Real Estate Polish
Reviewer Persona: **Design Reviewer** (Skills: $apple-design, $emil-design-eng, $animate)

The floating header at the top currently spans 440px max width and 92px height, requiring 124px top padding on the page. In contrast, the bottom dock is a nimble 240px pill. This creates an optically top-heavy composition that squanders prime viewport space before the daily habits even start.

| Before | After | Why |
| --- | --- | --- |
| ` + "`h-[92px]`" + ` | ` + "`h-[64px]`" + ` | Content is only ~40px high; 92px wastes 36px vertical real estate |
| ` + "`max-w-[440px]`" + ` | ` + "`max-w-[390px]`" + ` | Balances closer with the 240px dock instead of dominating the screen |
| ` + "`pt-[124px]` in layout" + ` | ` + "`pt-[92px]` in layout" + ` | Pulls habit content up so the primary focal point is immediately visible |

Please apply this refinement to components/header.tsx and components/mobile-layout.tsx.`

	crRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/comments", map[string]any{
		"body":        designReviewContent,
		"intent":      "request_changes",
		"author":      "design-reviewer",
		"file_path":   "components/header.tsx",
		"line_number": 28,
	})
	if crRes.StatusCode != http.StatusCreated {
		t.Fatalf("POST /comments change request = %d, want 201", crRes.StatusCode)
	}

	// Verify task requeued to "todo"
	loaded, err = kanban.GetTask(boardSlug, task.ID)
	if err != nil {
		t.Fatalf("load task: %v", err)
	}
	if loaded.Status != "todo" {
		t.Fatalf("after design-reviewer change request: status = %q, want todo", loaded.Status)
	}

	// -------------------------------------------------------------
	// Step 3: Dispatch Run 2 and verify structured continuation context pack
	// -------------------------------------------------------------
	dispatchPendingRemoteTasks()

	if count := fake.dispatchCount(); count != 2 {
		t.Fatalf("after second dispatch: recorded %d dispatches, want 2", count)
	}

	lastPrompt := fake.dispatches[1].Message
	if !strings.Contains(lastPrompt, "[Switchyard review comment") {
		t.Errorf("prompt missing review comment header; got:\n%s", lastPrompt)
	}
	if !strings.Contains(lastPrompt, "Reviewer: design-reviewer") {
		t.Errorf("prompt missing design-reviewer author; got:\n%s", lastPrompt)
	}
	if !strings.Contains(lastPrompt, "Anchor: [components/header.tsx:28]") {
		t.Errorf("prompt missing file anchor [components/header.tsx:28]; got:\n%s", lastPrompt)
	}
	if !strings.Contains(lastPrompt, "Design Review: Header Width & Screen Real Estate Polish") {
		t.Errorf("prompt missing review content; got:\n%s", lastPrompt)
	}

	loaded, err = kanban.GetTask(boardSlug, task.ID)
	if err != nil {
		t.Fatalf("load task: %v", err)
	}
	if loaded.Status != "review" {
		t.Fatalf("after run 2: status = %q, want review, last_error = %q", loaded.Status, loaded.LastError)
	}

	// -------------------------------------------------------------
	// Step 4: Resolve comment and approve task to done
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
				t.Fatalf("POST /comments/resolve = %d, want 200", resolveRes.StatusCode)
			}
		}
	}

	approveRes := loopAPI(t, server.URL, cookie, http.MethodPost, "/api/boards/"+boardSlug+"/tasks/"+task.ID+"/approve", map[string]any{
		"action": "done",
	})
	if approveRes.StatusCode != http.StatusOK {
		t.Fatalf("POST /tasks/approve = %d, want 200", approveRes.StatusCode)
	}

	loaded, err = kanban.GetTask(boardSlug, task.ID)
	if err != nil {
		t.Fatalf("load task: %v", err)
	}
	if loaded.Status != "done" {
		t.Fatalf("final task status = %q, want done", loaded.Status)
	}
}
