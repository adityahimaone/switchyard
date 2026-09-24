package kanban

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunTaskQueuesExplicitRun(t *testing.T) {
	slug := testBoard(t)
	task := Task{Title: "run me", Assignee: "default"}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	got, err := RunTask(slug, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "ready" || got.Failures != 0 {
		t.Fatalf("queued task = %+v", got)
	}
	events, err := TaskEvents(slug, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if events[0].Kind != "run_requested" {
		t.Fatalf("newest event = %q", events[0].Kind)
	}
}

func TestGroupTaskRunsByAttemptBoundaries(t *testing.T) {
	events := []TaskEvent{
		{ID: 1, TaskID: "t", Kind: "created", CreatedAt: 1},
		{ID: 2, TaskID: "t", Kind: "claimed", CreatedAt: 2},
		{ID: 3, TaskID: "t", Kind: "status_changed", Payload: `{"to":"blocked"}`, CreatedAt: 3},
		{ID: 4, TaskID: "t", Kind: "retry", CreatedAt: 4},
		{ID: 5, TaskID: "t", Kind: "spawned", CreatedAt: 5},
		{ID: 6, TaskID: "t", Kind: "completed", CreatedAt: 6},
	}
	got := GroupTaskRuns(events)
	if len(got) != 3 || got[0].Index != 1 || got[2].Index != 3 {
		t.Fatalf("runs = %+v", got)
	}
	if got[0].Outcome != "blocked" || got[1].Outcome != "running" || got[2].Outcome != "completed" {
		t.Fatalf("outcomes = %+v", got)
	}
	if len(got[0].Events) != 2 || got[0].StartedAt != 2 || got[0].EndedAt != 3 {
		t.Fatalf("first run = %+v", got[0])
	}
}

func TestGroupTaskRunsSplitsRemoteDispatch(t *testing.T) {
	// DSH continuation: each remote_dispatch -> new run. Regression for
	// t_e52df8a2 where run 2 (session continuation) merged into run 1 and
	// the second answer disappeared from the run list.
	events := []TaskEvent{
		{ID: 1, TaskID: "t", Kind: "created", CreatedAt: 1},
		{ID: 2, TaskID: "t", Kind: "remote_dispatched", Payload: `{"node_id":"mac","run_id":"run_1"}`, CreatedAt: 2},
		{ID: 3, TaskID: "t", Kind: "worker_output", Payload: `{"executor":"dsh"}`, CreatedAt: 3},
		{ID: 4, TaskID: "t", Kind: "completed", Payload: `{"executor":"dsh"}`, CreatedAt: 4},
		{ID: 5, TaskID: "t", Kind: "remote_dispatched", Payload: `{"node_id":"mac","run_id":"run_2","session_continuation":true}`, CreatedAt: 5},
		{ID: 6, TaskID: "t", Kind: "worker_output", Payload: `{"executor":"dsh"}`, CreatedAt: 6},
		{ID: 7, TaskID: "t", Kind: "completed", Payload: `{"executor":"dsh"}`, CreatedAt: 7},
	}
	got := GroupTaskRuns(events)
	if len(got) != 2 {
		t.Fatalf("runs = %+v", got)
	}
	if got[0].Outcome != "completed" || got[1].Outcome != "completed" {
		t.Fatalf("outcomes = %+v", got)
	}
	if len(got[0].Events) != 3 || len(got[1].Events) != 3 {
		t.Fatalf("event split = %+v", got)
	}
}

func TestUsageFromJSONFindsNestedTokenUsage(t *testing.T) {
	got, ok := usageFromJSON(`{"type":"status","usage":{"inputTokens":12,"outputTokens":8,"totalTokens":20,"cacheReadTokens":3}}`)
	if !ok || got.InputTokens != 12 || got.OutputTokens != 8 || got.TotalTokens != 20 || got.CacheReadTokens != 3 {
		t.Fatalf("usage = %+v, ok=%v", got, ok)
	}
	got, ok = usageFromJSON(`{"type":"status","usage":{"inputTokens":12}}
{"type":"status","usage":{"outputTokens":8}}`)
	if !ok || got.InputTokens != 12 || got.OutputTokens != 8 {
		t.Fatalf("stream usage = %+v, ok=%v", got, ok)
	}
}

func TestTaskDependenciesValidateAndList(t *testing.T) {
	slug := testBoard(t)
	a, b := Task{Title: "a"}, Task{Title: "b"}
	if err := CreateTask(slug, &a); err != nil {
		t.Fatal(err)
	}
	if err := CreateTask(slug, &b); err != nil {
		t.Fatal(err)
	}
	if err := AddTaskDependency(slug, a.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	deps, err := ListTaskDependencies(slug, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(deps) != 1 || deps[0].DependsOnID != b.ID {
		t.Fatalf("deps = %+v", deps)
	}
	if err := AddTaskDependency(slug, a.ID, a.ID); err == nil {
		t.Fatal("self dependency accepted")
	}
	if err := AddTaskDependency(slug, a.ID, "missing"); err == nil {
		t.Fatal("missing dependency accepted")
	}
	if err := RemoveTaskDependency(slug, a.ID, b.ID); err != nil {
		t.Fatal(err)
	}
	deps, _ = ListTaskDependencies(slug, a.ID)
	if len(deps) != 0 {
		t.Fatalf("deps after delete = %+v", deps)
	}
}

func TestBoardArchivePreservesMetadataAndRestores(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := CreateBoard("arch", "Archive me", "box", "#abc"); err != nil {
		t.Fatal(err)
	}
	metaPath := filepath.Join(boardDir("arch"), "board.json")
	raw, _ := os.ReadFile(metaPath)
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		t.Fatal(err)
	}
	meta["description"] = "keep me"
	raw, _ = json.Marshal(meta)
	if err := os.WriteFile(metaPath, raw, 0644); err != nil {
		t.Fatal(err)
	}
	if err := SetBoardArchived("arch", true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatal(err)
	}
	var after map[string]any
	raw, _ = os.ReadFile(metaPath)
	if err := json.Unmarshal(raw, &after); err != nil {
		t.Fatal(err)
	}
	if after["archived"] != true || after["description"] != "keep me" {
		t.Fatalf("metadata = %+v", after)
	}
	boards, err := ListBoards()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, b := range boards {
		if b.Slug == "arch" {
			found = true
		}
	}
	if !found {
		t.Fatal("archived board missing from management list")
	}
	if err := SetBoardArchived("arch", false); err != nil {
		t.Fatal(err)
	}
	boards, err = ListBoards()
	if err != nil {
		t.Fatal(err)
	}
	found = false
	for _, b := range boards {
		if b.Slug == "arch" {
			found = true
		}
	}
	if !found {
		t.Fatal("restored board missing")
	}
}
