package kanban

import (
	"strings"
	"testing"
	"time"
)

// TestDesignVocabularyHit pins the words the design-tool guard
// treats as "this card is about a pen.dev design". Broad on
// purpose: a false positive costs a hint, a false negative
// costs a card that never learns it should design.
func TestDesignVocabularyHit(t *testing.T) {
	for _, hit := range []string{
		"Design the onboarding canvas in pen.dev",
		"make a mock of the home screen",
		"canvas for the settings flow",
		"export a screenshot of the dashboard",
		"redesign the login page",
		"the design/task-card.pen mock",
		"wireframe the new sidebar",
		"prototype the checkout flow",
		"visual polish for the streak ring",
	} {
		if !DesignVocabularyHit(hit) {
			t.Errorf("DesignVocabularyHit(%q) = false, want true", hit)
		}
	}
	for _, miss := range []string{
		"Fix the off-by-one in the streak counter",
		"Rename the webhook endpoint",
		"Bump the dependency to the latest patch",
		"Write tests for lib/store.ts",
		"Refactor the session middleware",
	} {
		if DesignVocabularyHit(miss) {
			t.Errorf("DesignVocabularyHit(%q) = true, want false", miss)
		}
	}
}

func TestDesignPathForTitle(t *testing.T) {
	cases := []struct{ title, want string }{
		{"Design the onboarding canvas", "design/design-the-onboarding-canvas.pen"},
		{"Onboarding flow!! (real)", "design/onboarding-flow-real.pen"},
		{"  Spaced   Out  Title  ", "design/spaced-out-title.pen"},
		{"", "design/design.pen"},
		{"***", "design/design.pen"},
	}
	for _, c := range cases {
		if got := DesignPathForTitle(c.title); got != c.want {
			t.Errorf("DesignPathForTitle(%q) = %q, want %q", c.title, got, c.want)
		}
	}
	// A title long enough to hit the cap truncates cleanly.
	long := strings.Repeat("a", 80)
	got := DesignPathForTitle(long)
	if slug := strings.TrimSuffix(strings.TrimPrefix(got, "design/"), ".pen"); len(slug) > 48 {
		t.Errorf("slug %q is %d chars, want at most 48", slug, len(slug))
	}
}

func TestTaskDesignWarnings(t *testing.T) {
	designCard := &Task{Title: "Design the home canvas", Body: "Mock it in pen.dev.", DesignTool: "pen_cli"}
	if hints := TaskDesignWarnings(designCard); len(hints) != 0 {
		t.Errorf("a design card with design words got %d hints, want 0: %v", len(hints), hints)
	}

	taggedButPlain := &Task{Title: "Fix the streak counter", Body: "Off by one.", DesignTool: "pen_cli"}
	hints := TaskDesignWarnings(taggedButPlain)
	if len(hints) != 1 || hints[0].Field != "design_tool" || hints[0].Code != CodeDesignHint {
		t.Fatalf("a pen_cli card with no design words got %v, want one design_tool hint", hints)
	}

	untaggedDesign := &Task{Title: "Design the home canvas", Body: "Mock the welcome screen."}
	hints = TaskDesignWarnings(untaggedDesign)
	if len(hints) != 1 || hints[0].Field != "design_tool" {
		t.Fatalf("a design card with no switch got %v, want one design_tool hint", hints)
	}

	// A card implementing a committed mock (design_source set) is
	// already declared — no hint for the missing switch.
	committed := &Task{Title: "Implement to the design mock", Body: "Match design/home.pen.", DesignSource: "design/home.pen"}
	if hints := TaskDesignWarnings(committed); len(hints) != 0 {
		t.Errorf("a card with a committed mock got %v, want no hints", hints)
	}

	plain := &Task{Title: "Fix the streak counter", Body: "Off by one."}
	if hints := TaskDesignWarnings(plain); len(hints) != 0 {
		t.Errorf("a plain card got %v, want no hints", hints)
	}
}

// TestCreateTaskDesignTool covers the switch at the door: it
// persists, a pen_cli card with no explicit source gets the
// title-derived default, an unknown tool is refused, and a
// plain card is untouched.
func TestCreateTaskDesignTool(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}

	if err := CreateTask("default", &Task{
		Title:      "Design the onboarding canvas",
		Body:       "Welcome, create-habit, notifications, first streak.",
		WorkspacePath: "/tmp",
		DesignTool: "pen_cli",
	}); err != nil {
		t.Fatalf("create pen_cli card: %v", err)
	}
	tasks, err := ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	var card *Task
	for i := range tasks {
		if tasks[i].Title == "Design the onboarding canvas" {
			card = &tasks[i]
		}
	}
	if card == nil {
		t.Fatal("the pen_cli card was not created")
	}
	if card.DesignTool != "pen_cli" {
		t.Errorf("design_tool = %q, want pen_cli", card.DesignTool)
	}
	if want := DesignPathForTitle(card.Title); card.DesignSource != want {
		t.Errorf("design_source = %q, want the title-derived %q", card.DesignSource, want)
	}

	// An explicit source wins over the derivation.
	if err := CreateTask("default", &Task{
		Title:         "Design the settings canvas",
		Body:          "Mock the settings screen.",
		WorkspacePath: "/tmp",
		DesignTool:    "pen_cli",
		DesignSource:  "design/settings.pen",
	}); err != nil {
		t.Fatalf("create with explicit source: %v", err)
	}
	tasks, _ = ListTasks("default")
	for _, tk := range tasks {
		if tk.Title == "Design the settings canvas" && tk.DesignSource != "design/settings.pen" {
			t.Errorf("explicit design_source = %q, want design/settings.pen", tk.DesignSource)
		}
	}

	if err := CreateTask("default", &Task{
		Title:         "Bad tool card",
		Body:          "Design something.",
		WorkspacePath: "/tmp",
		DesignTool:    "figma",
	}); err == nil {
		t.Error("an unknown design_tool was accepted, want rejection")
	}

	if err := CreateTask("default", &Task{
		Title:         "Plain card",
		Body:          "Fix the counter.",
		WorkspacePath: "/tmp",
	}); err != nil {
		t.Fatalf("plain card: %v", err)
	}
	tasks, _ = ListTasks("default")
	for _, tk := range tasks {
		if tk.Title == "Plain card" && (tk.DesignTool != "" || tk.DesignSource != "") {
			t.Errorf("plain card picked up design fields: %+v", tk)
		}
	}
}

// TestRemoteJobTimeoutForTask pins the budget rule: a pen_cli
// design card always gets the full shared job timeout, even in
// agentic mode, because it generates a mock and then implements
// to it — the longest job class there is.
func TestRemoteJobTimeoutForTask(t *testing.T) {
	t.Setenv("KANBAN_NODE_AGENT_JOB_TIMEOUT", "1800")
	t.Setenv("KANBAN_NODE_AGENT_SHELL_AGENTIC_TIMEOUT", "300")
	full := 1800 * time.Second

	if got := RemoteJobTimeoutForTask("direct", "pen_cli"); got != full {
		t.Errorf("direct+pen_cli = %v, want %v", got, full)
	}
	if got := RemoteJobTimeoutForTask("agentic", "pen_cli"); got != full {
		t.Errorf("agentic+pen_cli = %v, want the full design budget %v", got, full)
	}
	if got := RemoteJobTimeoutForTask("agentic", ""); got != 300*time.Second {
		t.Errorf("agentic plain = %v, want 300s", got)
	}
	if got := RemoteJobTimeoutForTask("direct", ""); got != full {
		t.Errorf("direct plain = %v, want %v", got, full)
	}
	if got := RemoteJobTimeoutForTask("agentic", "pencil_mcp"); got != 300*time.Second {
		t.Errorf("agentic+pencil_mcp = %v, want the agentic 300s (only the CLI generates)", got)
	}
}
