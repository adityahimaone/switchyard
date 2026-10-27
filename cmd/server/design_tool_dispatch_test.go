package main

// The design-tool switch, end to end: a card created with
// design_tool=pen_cli over the real HTTP API gets the
// title-derived design path, travels to the coding agent
// with the pen CLI mandate in its prompt, and is dispatched
// with the full design budget stamped on it. A plain card
// never mentions pen at all.

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func TestCreateTaskDesignToolDispatch(t *testing.T) {
	fake := startLoopFakeNode(t)
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	skillRoot := filepath.Join(home, "skills")
	t.Setenv("SWITCHYARD_SKILL_ROOTS", skillRoot)
	writeDesignTestSkills(t, skillRoot)
	t.Setenv("KANBAN_NODE_AGENT", fake.URL)
	t.Setenv("KANBAN_VERIFY_ENABLED", "0")
	t.Setenv("SWITCHYARD_DEV", "1")
	// The shared job budget and a deliberately small agentic
	// budget, so the design card's bump is observable: the
	// pen_cli card must leave with the full budget even though
	// it runs agentic.
	t.Setenv("KANBAN_NODE_AGENT_JOB_TIMEOUT", "1800")
	t.Setenv("KANBAN_NODE_AGENT_SHELL_AGENTIC_TIMEOUT", "300")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatalf("auth seed: %v", err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		t.Fatalf("attachments db: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: design-tool-test-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	api := httptest.NewServer(authHandler(mux))
	t.Cleanup(api.Close)
	cookie := loopLogin(t, api.URL)

	if res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": "designtool", "name": "DesignTool"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic("designtool"); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// A pen_cli card with no explicit design_source: the
	// title-derived path is the contract.
	body := map[string]any{
		"title":          "Design the onboarding canvas",
		"body":           "Welcome, create-habit, notification permission, first streak.",
		"executor":       "commandcode",
		"assignee":       "default",
		"execution_mode": "agentic",
		"workspace_path": "/Users/mac/loop-workspace",
		"workspace_kind": "dir",
		"isolation":      "workspace",
		"design_tool":    "pen_cli",
	}
	res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards/designtool/tasks", body)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards/designtool/tasks = %d, want 201", res.StatusCode)
	}
	var card kanban.Task
	if err := json.NewDecoder(res.Body).Decode(&card); err != nil {
		t.Fatal(err)
	}
	wantSource := kanban.DesignPathForTitle(card.Title)
	if card.DesignTool != "pen_cli" {
		t.Errorf("created card design_tool = %q, want pen_cli", card.DesignTool)
	}
	if card.DesignSource != wantSource {
		t.Errorf("created card design_source = %q, want the title-derived %q", card.DesignSource, wantSource)
	}
	wantExport := designExportPath(wantSource)

	dispatchPendingRemoteTasks()

	disp := fake.dispatchByTitle("Design the onboarding canvas")
	if disp == nil {
		t.Fatalf("the pen_cli card was never dispatched; %d dispatch(es) recorded", fake.dispatchCount())
	}
	for _, want := range []string{
		"--- pen.dev Design (pen CLI) ---",
		wantSource,
		wantExport,
		"pen --out",
		"--- End pen.dev Design ---",
	} {
		if !strings.Contains(disp.Message, want) {
			t.Errorf("dispatch prompt missing %q", want)
		}
	}
	// The three design skills ride the dispatch prompt, not the worker's
	// install. implement-brand-system must stay out until it is summoned.
	for _, want := range []string{
		"--- Design standards (auto-loaded skills) ---",
		"### Skill: sunnyside-brand-system",
		"### Skill: pen-dev",
		"### Skill: better-typography",
		"--- End design standards ---",
	} {
		if !strings.Contains(disp.Message, want) {
			t.Errorf("dispatch prompt missing design skill %q", want)
		}
	}
	if strings.Contains(disp.Message, "### Skill: implement-brand-system") {
		t.Error("implement-brand-system must not be auto-loaded on a design task")
	}
	// The design budget: agentic base would be 300s, but a
	// pen_cli card always carries the full shared timeout.
	if want := int(kanban.RemoteJobTimeout().Seconds()); disp.TimeoutS != want {
		t.Errorf("dispatch timeout_s = %d, want the full design budget %d", disp.TimeoutS, want)
	}

	// The card persists its switch for the next reader.
	loaded, err := kanban.GetTask("designtool", card.ID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.DesignTool != "pen_cli" {
		t.Errorf("persisted design_tool = %q, want pen_cli", loaded.DesignTool)
	}

	// The default create-task path is the direct pen CLI, not an agent. Its
	// command must carry the same brief; both paths share one pack builder.
	directBody := map[string]any{
		"title":          "Design the checkout canvas",
		"body":           "Cart summary, delivery slot, payment, confirmation.",
		"executor":       "shell",
		"assignee":       "default",
		"execution_mode": "direct",
		"workspace_path": "/Users/mac/loop-workspace",
		"workspace_kind": "dir",
		"isolation":      "workspace",
		"design_tool":    "pen_cli",
		"design_scope":   "design_only",
	}
	res = loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards/designtool/tasks", directBody)
	if res.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(res.Body)
		t.Fatalf("POST direct pen card = %d, want 201: %s", res.StatusCode, string(b))
	}
	dispatchPendingRemoteTasks()
	direct := fake.dispatchByTitle("Design the checkout canvas")
	if direct == nil {
		t.Fatalf("the direct pen card was never dispatched; %d dispatch(es) recorded", fake.dispatchCount())
	}
	for _, want := range []string{
		"--prompt-file \"$BRIEF\"",
		"--- Design standards (auto-loaded skills) ---",
		"### Skill: pen-dev",
		"design/design-the-checkout-canvas.pen",
	} {
		if !strings.Contains(direct.Command, want) {
			t.Errorf("direct pen command missing %q:\n%s", want, direct.Command)
		}
	}
	if !strings.Contains(direct.Command, "SWITCHYARD_DESIGN_BRIEF") {
		t.Errorf("direct pen command has no quoted brief heredoc:\n%s", direct.Command)
	}
	if !direct.NoRTK {
		t.Error("direct pen dispatch must set NoRTK; rtk mangles the heredoc command")
	}
	if strings.Contains(direct.Command, "PEN_AGENT_API_KEY") {
		t.Errorf("direct pen command must not embed an API key:\n%s", direct.Command)
	}
}

// TestDesignToolPlainCardUnaffected is the guard's other half:
// a card with no switch and no design words must not be told
// to design anything, and must not inherit a design path.
func TestDesignToolPlainCardUnaffected(t *testing.T) {
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
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: plain-test-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	api := httptest.NewServer(authHandler(mux))
	t.Cleanup(api.Close)
	cookie := loopLogin(t, api.URL)

	if res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": "plaintool", "name": "PlainTool"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic("plaintool"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards/plaintool/tasks",
		map[string]any{
			"title":          "Fix the streak counter",
			"body":           "Off by one when the day rolls over.",
			"executor":       "commandcode",
			"assignee":       "default",
			"workspace_path": "/Users/mac/loop-workspace",
			"workspace_kind": "dir",
			"isolation":      "workspace",
		})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards/plaintool/tasks = %d, want 201", res.StatusCode)
	}
	var card kanban.Task
	if err := json.NewDecoder(res.Body).Decode(&card); err != nil {
		t.Fatal(err)
	}
	if card.DesignTool != "" || card.DesignSource != "" {
		t.Errorf("plain card picked up design fields: tool=%q source=%q", card.DesignTool, card.DesignSource)
	}

	dispatchPendingRemoteTasks()

	disp := fake.dispatchByTitle("Fix the streak counter")
	if disp == nil {
		t.Fatalf("the plain card was never dispatched; %d dispatch(es) recorded", fake.dispatchCount())
	}
	for _, banned := range []string{"pen.dev", "pen --out", "Design (pen CLI)", "Design Reference"} {
		if strings.Contains(disp.Message, banned) {
			t.Errorf("a plain card's prompt must not mention %q", banned)
		}
	}
}

// writeDesignTestSkills installs the three auto skills in a temp root so the
// dispatch test proves the real prompt assembly without depending on whatever
// happens to be installed on the machine running the suite.
func writeDesignTestSkills(t *testing.T, root string) {
	t.Helper()
	for _, name := range kanban.DesignAutoSkills {
		dir := filepath.Join(root, name)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		body := "---\nname: " + name + "\ndescription: test design skill\n---\n\nGuidance for " + name + "."
		if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
