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
