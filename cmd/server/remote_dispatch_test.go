package main

import (
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func TestAppendDesignReference(t *testing.T) {
	tests := []struct {
		name         string
		msg          string
		designSource string
		wantSubstr   []string
		wantAbsent   string
	}{
		{
			name:         "no design source leaves the prompt untouched",
			msg:          "implement the button",
			designSource: "",
			wantAbsent:   "Design Reference",
		},
		{
			name:         "blank design source is treated as none",
			msg:          "implement the button",
			designSource: "   ",
			wantAbsent:   "Design Reference",
		},
		{
			name:         "a design source names the committed mock",
			msg:          "implement the button",
			designSource: "design/board.pen",
			wantSubstr:   []string{"--- Design Reference ---", "design/board.pen", "--- End Design Reference ---"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := appendDesignReference(tt.msg, tt.designSource)
			for _, want := range tt.wantSubstr {
				if !strings.Contains(got, want) {
					t.Errorf("prompt missing %q:\n%s", want, got)
				}
			}
			if tt.wantAbsent != "" && strings.Contains(got, tt.wantAbsent) {
				t.Errorf("prompt should not mention %q:\n%s", tt.wantAbsent, got)
			}
			if !strings.Contains(got, tt.msg) {
				t.Errorf("prompt lost the original message:\n%s", got)
			}
		})
	}
}

func TestAppendDesignMandateDesignOnly(t *testing.T) {
	prompt := appendDesignMandate("Build a contact card", "pen_cli", "design/contact.pen", "Contact Card", "design_only", "gemini", "gemini-3.6-flash")
	if !strings.Contains(prompt, "--- pen.dev Design (pen CLI) ---") {
		t.Errorf("missing Design header in prompt:\n%s", prompt)
	}
	if !strings.Contains(prompt, "CRITICAL: This card is strictly DESIGN ONLY") {
		t.Errorf("missing critical design only instruction in prompt:\n%s", prompt)
	}
	if !strings.Contains(prompt, "pen --out design/contact.pen") {
		t.Errorf("missing pen CLI command in prompt:\n%s", prompt)
	}
	if !strings.Contains(prompt, "--agent gemini --model gemini-3.6-flash") {
		t.Errorf("missing agent and model flags in prompt:\n%s", prompt)
	}
	if strings.Contains(prompt, "implement this card to the committed design") {
		t.Errorf("design_only prompt must NOT tell agent to implement code")
	}

	// Test Design & Code
	codePrompt := appendDesignMandate("Build a contact card", "pen_cli", "design/contact.pen", "Contact Card", "design_and_code", "claude", "")
	if !strings.Contains(codePrompt, "--- pen.dev Design (pen CLI) ---") {
		t.Errorf("missing Design header in prompt:\n%s", codePrompt)
	}
	if !strings.Contains(codePrompt, "then implement this card to the committed design") {
		t.Errorf("design_and_code must contain implementation instruction:\n%s", codePrompt)
	}
}

func TestBuildDirectPenCommand(t *testing.T) {
	cmd := buildDirectPenCommand("design/hero.pen", "Hero Section", "Create a modern 3D hero", "claude", "claude-sonnet-5")
	if !strings.Contains(cmd, "pen --out \"design/hero.pen\"") {
		t.Errorf("command missing output path:\n%s", cmd)
	}
	if !strings.Contains(cmd, "--export \"design/exports/hero.png\"") {
		t.Errorf("command missing export path:\n%s", cmd)
	}
	if !strings.Contains(cmd, "--agent \"claude\"") {
		t.Errorf("command missing agent:\n%s", cmd)
	}
	if !strings.Contains(cmd, "--model claude-sonnet-5") {
		t.Errorf("command missing model:\n%s", cmd)
	}

	// In pen CLI 0.3.13+, deepseek is natively supported:
	dsCmd := buildDirectPenCommand("design/hero.pen", "Hero Section", "Create a modern 3D hero", "deepseek", "deepseek-flash")
	if !strings.Contains(dsCmd, "--agent \"deepseek\"") {
		t.Errorf("command should use native deepseek for deepseek agent:\n%s", dsCmd)
	}
	if !strings.Contains(dsCmd, "--model deepseek-flash") {
		t.Errorf("command should pass deepseek-flash model:\n%s", dsCmd)
	}

	// Unknown third-party agent fallback to pen.dev
	fallbackCmd := buildDirectPenCommand("design/hero.pen", "Hero Section", "Create a modern 3D hero", "unknown_agent", "custom-model")
	if !strings.Contains(fallbackCmd, "--agent \"pen.dev\"") {
		t.Errorf("fallback command should use pen.dev for unknown agent:\n%s", fallbackCmd)
	}
}

// TestDispatchSelectionOrdersPriorityAndSkipsBlocked covers the
// starvation the old query had: five dependency-blocked cards ahead
// of free ones in the table, plus an urgent free card. A bare
// `LIMIT 5` returned only the blocked five on every tick and the
// urgent card was never considered. The selection must exclude the
// blocked cards and lead with the urgent one.
func TestDispatchSelectionOrdersPriorityAndSkipsBlocked(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := kanban.EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}

	tasks := []kanban.Task{{ID: "upstream", Title: "upstream", Status: "review"}}
	for i := 0; i < 5; i++ {
		tasks = append(tasks, kanban.Task{
			ID: fmt.Sprintf("blocked%d", i), Title: fmt.Sprintf("blocked %d", i),
			DependsOn: []string{"upstream"},
		})
	}
	tasks = append(tasks,
		kanban.Task{ID: "free0", Title: "free zero"},
		kanban.Task{ID: "free1", Title: "free one"},
		kanban.Task{ID: "free2", Title: "free two"},
		kanban.Task{ID: "urgent", Title: "urgent", Priority: 10},
	)
	for i := range tasks {
		if tasks[i].Status == "" {
			tasks[i].Status = "todo"
		}
		if err := kanban.CreateTask("default", &tasks[i]); err != nil {
			t.Fatalf("create %q: %v", tasks[i].Title, err)
		}
	}

	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath("default")+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// Point every card at a node-agent workspace: the selection only
	// considers cards the remote dispatcher can pick up. Distinct
	// created_at stamps make the FIFO order deterministic (CreateTask
	// stamps whole seconds).
	if _, err := db.Exec(`UPDATE tasks SET workspace_transport='node-agent', workspace_path='/tmp/ws'`); err != nil {
		t.Fatal(err)
	}
	stamps := map[string]int64{"free0": 1000, "free1": 1001, "free2": 1002, "urgent": 2000}
	for id, at := range stamps {
		if _, err := db.Exec(`UPDATE tasks SET created_at=? WHERE id=?`, at, id); err != nil {
			t.Fatal(err)
		}
	}

	got, err := pendingDispatchCandidates(db)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, c := range got {
		ids = append(ids, c.id)
	}
	want := []string{"urgent", "free0", "free1", "free2"}
	if !reflect.DeepEqual(ids, want) {
		t.Fatalf("selection = %v, want %v (urgent first, then free cards oldest-first, none blocked)", ids, want)
	}
}
