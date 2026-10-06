package main

// The entry point of the design loop, in one test: creating a
// card with a committed pen.dev design.
//
// Two cards are created over the real HTTP API, the way the
// board UI creates them — one carries a design_source pointing
// at a pen.dev mock, one does not. The real dispatcher then
// claims both and sends them to the fake node-agent, and the
// test asserts the contract the rest of the loop depends on:
// the designed card's prompt carries the committed mock as its
// Design Reference, and the plain card's prompt never mentions
// a design — pen.dev is invoked only when a design was
// committed for the card.
//
// The verify hook is disabled (KANBAN_VERIFY_ENABLED=0) to
// keep this the create → dispatch half of the loop; the full
// loop including the verify rung is TestVerifyLoopE2E.

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

// dispatchByTitle returns the dispatch recorded for one
// card. The dispatch's task_id is the run id, not the
// card's, so cards are told apart by title — the way
// the board tells them apart too.
func (f *loopFakeNode) dispatchByTitle(title string) *kanban.NodeDispatchRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.dispatches {
		if f.dispatches[i].Title == title {
			return &f.dispatches[i]
		}
	}
	return nil
}

// TestCreateTaskDesignSource proves the design loop's entry
// contract: a card created with design_source persists the
// committed pen.dev mock and travels to the coding agent with
// it in the prompt, while a card created without one never
// mentions a design at all.
func TestCreateTaskDesignSource(t *testing.T) {
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

	// The commandcode harness runs an agent, so the card's
	// assignee must name a profile with a model to run it
	// with. The default profile's config lives at the hermes
	// home root.
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: design-test-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// The API surface a board client uses — login, boards,
	// task creation — behind the real auth middleware.
	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	api := httptest.NewServer(authHandler(mux))
	t.Cleanup(api.Close)
	cookie := loopLogin(t, api.URL)

	// A board, then two cards in it: one to be built to a
	// pen.dev mock, one plain. A fresh board needs its schema
	// seeded before its first card — the import flow does this.
	if res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": "design", "name": "Design"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic("design"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	create := func(title string, extra map[string]any) kanban.Task {
		t.Helper()
		body := map[string]any{
			"title":          title,
			"body":           "Implement the sign-in card to the committed pen.dev mock.",
			"executor":       "commandcode",
			"assignee":       "default",
			"workspace_path": "/Users/mac/loop-workspace",
			"workspace_kind": "dir",
			"isolation":      "workspace",
		}
		for k, v := range extra {
			body[k] = v
		}
		res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards/design/tasks", body)
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("POST /api/boards/design/tasks = %d, want 201", res.StatusCode)
		}
		var card kanban.Task
		if err := json.NewDecoder(res.Body).Decode(&card); err != nil {
			t.Fatal(err)
		}
		if card.ID == "" {
			t.Fatal("the API returned no card id")
		}
		return card
	}

	designed := create("Sign-in card to the design mock", map[string]any{"design_source": "design/sign-in.pen"})
	if designed.DesignSource != "design/sign-in.pen" {
		t.Errorf("created card design_source = %q, want the committed mock", designed.DesignSource)
	}
	plain := create("Plain card with no design", nil)
	if plain.DesignSource != "" {
		t.Errorf("plain card design_source = %q, want empty", plain.DesignSource)
	}

	// The real dispatcher: claim both cards, dispatch both.
	dispatchPendingRemoteTasks()

	withDesign := fake.dispatchByTitle("Sign-in card to the design mock")
	if withDesign == nil {
		t.Fatalf("the designed card was never dispatched; %d dispatch(es) recorded", fake.dispatchCount())
	}
	if withDesign.Executor != "commandcode" {
		t.Errorf("executor = %q, want commandcode", withDesign.Executor)
	}
	for _, want := range []string{"--- Design Reference ---", "design/sign-in.pen", "--- End Design Reference ---"} {
		if !strings.Contains(withDesign.Message, want) {
			t.Errorf("dispatch prompt missing %q", want)
		}
	}

	withoutDesign := fake.dispatchByTitle("Plain card with no design")
	if withoutDesign == nil {
		t.Fatalf("the plain card was never dispatched; %d dispatch(es) recorded", fake.dispatchCount())
	}
	if strings.Contains(withoutDesign.Message, "Design Reference") {
		t.Error("a card with no design_source must not carry a design reference")
	}

	// The designed card completes and lands in review, the
	// state a reviewer opens it in.
	loaded, err := kanban.GetTask("design", designed.ID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.Status != "review" {
		t.Errorf("status = %q, want review", loaded.Status)
	}
}
