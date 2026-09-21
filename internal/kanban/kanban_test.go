package kanban

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// testBoard spins up a throwaway HERMES_HOME with a board whose schema
// mirrors hermes_cli/kanban_db.py (columns this package touches).
func testBoard(t *testing.T) string {
	t.Setenv("HERMES_HOME", t.TempDir())
	dir := boardDir("t1")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := `
CREATE TABLE tasks (
	id                   TEXT PRIMARY KEY,
	title                TEXT NOT NULL,
	body                 TEXT,
	assignee             TEXT,
	status               TEXT NOT NULL,
	priority             INTEGER DEFAULT 0,
	created_by           TEXT,
	created_at           INTEGER NOT NULL,
	started_at           INTEGER,
	completed_at         INTEGER,
	workspace_kind       TEXT NOT NULL DEFAULT 'scratch',
	workspace_transport  TEXT,
	workspace_ssh_target TEXT,
	workspace_path       TEXT,
	result               TEXT,
	consecutive_failures INTEGER NOT NULL DEFAULT 0,
	last_failure_error   TEXT
);
CREATE TABLE task_events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL,
	kind       TEXT NOT NULL,
	payload    TEXT,
	created_at INTEGER NOT NULL
);
CREATE TABLE task_comments (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL,
	author     TEXT NOT NULL,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL
);`
	if _, err := db.Exec(schema); err != nil {
		t.Fatal(err)
	}
	return "t1"
}

func TestCreateTaskDefaults(t *testing.T) {
	slug := testBoard(t)
	var task Task
	task.Title = "  hello  "
	if err := CreateTask(slug, &task); err != nil {
		t.Fatalf("create: %v", err)
	}
	if task.Status != "todo" {
		t.Errorf("default status = %q, want todo", task.Status)
	}
	if task.CreatedBy != "board-ui" {
		t.Errorf("created_by = %q, want board-ui", task.CreatedBy)
	}
	tasks, err := ListTasks(slug)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0].Title != "hello" {
		t.Fatalf("unexpected tasks: %+v", tasks)
	}
	if tasks[0].WorkspaceKind != "scratch" {
		t.Errorf("workspace_kind = %q, want schema default scratch", tasks[0].WorkspaceKind)
	}
}

func TestCreateShellTaskDefaultsToAgenticMode(t *testing.T) {
	slug := testBoard(t)
	task := &Task{Title: "shell", Executor: "shell", Body: "natural language"}
	if err := CreateTask(slug, task); err != nil {
		t.Fatalf("agentic shell rejected: %v", err)
	}
	if task.ExecutionMode != "agentic" || task.MaxIterations != 6 {
		t.Fatalf("unexpected shell defaults: mode=%q iterations=%d", task.ExecutionMode, task.MaxIterations)
	}
	if err := CreateTask(slug, &Task{Title: "direct shell", Executor: "shell", ExecutionMode: "direct", Body: "description"}); err == nil {
		t.Fatal("direct shell without command accepted")
	}
	if err := CreateTask(slug, &Task{Title: "shell", Executor: "shell", Body: "description", Command: "printf ok"}); err != nil {
		t.Fatalf("shell task with command rejected: %v", err)
	}
}

func TestCreateTaskRejectsInvalidStatus(t *testing.T) {
	slug := testBoard(t)
	for _, s := range []string{"running", "nonsense"} {
		var task Task
		task.Title = "x"
		task.Status = s
		if err := CreateTask(slug, &task); err == nil {
			t.Errorf("status %q accepted, want error", s)
		}
	}
	var empty Task
	if err := CreateTask(slug, &empty); err == nil {
		t.Error("empty title accepted, want error")
	}
}

func TestStatusTransition(t *testing.T) {
	slug := testBoard(t)
	var task Task
	task.Title = "flow"
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	id := task.ID

	// invalid target
	if err := StatusTransition(slug, id, "nope"); err == nil {
		t.Error("invalid status accepted")
	}
	// running is dispatcher-owned as a target
	if err := StatusTransition(slug, id, "running"); err == nil {
		t.Error("transition to running accepted, want error")
	}
	// happy path todo -> ready
	if err := StatusTransition(slug, id, "ready"); err != nil {
		t.Fatalf("todo->ready: %v", err)
	}
	// done sets completed_at
	if err := StatusTransition(slug, id, "done"); err != nil {
		t.Fatalf("ready->done: %v", err)
	}
	tasks, _ := ListTasks(slug)
	if tasks[0].Status != "done" || tasks[0].CompletedAt == nil {
		t.Fatalf("done not recorded: %+v", tasks[0])
	}

	// events trail: created + 2 status_changed
	events, err := TaskEvents(slug, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 {
		t.Fatalf("got %d events, want 3: %+v", len(events), events)
	}
	if events[0].Kind != "status_changed" { // DESC order
		t.Errorf("newest event kind = %q", events[0].Kind)
	}
}

func TestStatusTransitionRefusesRunningClaim(t *testing.T) {
	slug := testBoard(t)
	var task Task
	task.Title = "inflight"
	task.Status = "running"
	if err := CreateTask(slug, &task); err == nil {
		t.Fatal("create with running should fail; seed status manually instead")
	}
	// Seed a running row directly (dispatcher writes it, board never does).
	db, err := sql.Open("sqlite", BoardDBPath(slug))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO tasks (id, title, status, created_at, workspace_kind)
		VALUES ('t_run', 'inflight', 'running', strftime('%s','now'), 'scratch')`); err != nil {
		t.Fatal(err)
	}
	// board may only move running -> blocked/done/review
	for _, bad := range []string{"todo", "ready", "archived"} {
		if err := StatusTransition(slug, "t_run", bad); err == nil {
			t.Errorf("running -> %s accepted, want refusal", bad)
		}
	}
	for _, ok := range []string{"blocked", "done", "review"} {
		// use fresh running rows per allowed target
		var id string
		if err := db.QueryRow(`INSERT INTO tasks (id, title, status, created_at, workspace_kind)
			VALUES ('t_run_'||?, 'x', 'running', strftime('%s','now'), 'scratch') RETURNING id`, ok).Scan(&id); err != nil {
			t.Fatal(err)
		}
		if err := StatusTransition(slug, id, ok); err != nil {
			t.Errorf("running -> %s refused: %v", ok, err)
		}
	}
}

func TestArchiveTask(t *testing.T) {
	slug := testBoard(t)
	var task Task
	task.Title = "bye"
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	if err := ArchiveTask(slug, task.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}
	tasks, _ := ListTasks(slug)
	if tasks[0].Status != "archived" {
		t.Errorf("status = %q, want archived", tasks[0].Status)
	}
}

func TestBoardNotFound(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := ListTasks("missing"); err == nil {
		t.Error("missing board accepted")
	}
}

func TestProfileValidation(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// broken profile: provider "custom:host" (the exact historical failure)
	os.MkdirAll(filepath.Join(home, "profiles", "broken"), 0o755)
	os.WriteFile(filepath.Join(home, "profiles", "broken", "config.yaml"),
		[]byte("model:\n  default: codex\n  provider: custom:9router.example\n"), 0o644)
	// healthy profile
	os.MkdirAll(filepath.Join(home, "profiles", "healthy"), 0o755)
	os.WriteFile(filepath.Join(home, "profiles", "healthy", "config.yaml"),
		[]byte("model:\n  default: codex\n  provider: custom\n"), 0o644)

	profiles, err := ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]Profile{}
	for _, p := range profiles {
		byName[p.Name] = p
	}
	if p, ok := byName["broken"]; !ok || p.Valid {
		t.Errorf("broken profile should exist and be invalid, got %+v (found=%v)", p, ok)
	}
	if p, ok := byName["healthy"]; !ok || !p.Valid {
		t.Errorf("healthy profile should exist and be valid, got %+v (found=%v)", p, ok)
	}
	if p, ok := byName["default"]; !ok || !p.Valid {
		t.Errorf("implicit default should be valid, got %+v (found=%v)", p, ok)
	}
}

func TestAssignValidatesProfile(t *testing.T) {
	slug := testBoard(t)
	// testBoard sets HERMES_HOME to a tempdir with no profiles → every named
	// profile is unknown; only "" (unassign) passes.
	var task Task
	task.Title = "target"
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	if err := Assign(slug, task.ID, "ghost"); err == nil {
		t.Error("unknown profile accepted, want error")
	}
	if err := Assign(slug, task.ID, ""); err != nil {
		t.Errorf("unassign refused: %v", err)
	}
	tasks, _ := ListTasks(slug)
	if tasks[0].Assignee != "" {
		t.Errorf("assignee = %q, want empty", tasks[0].Assignee)
	}
	// valid named profile with a real config on disk
	home := hermesHome()
	os.MkdirAll(filepath.Join(home, "profiles", "good"), 0o755)
	os.WriteFile(filepath.Join(home, "profiles", "good", "config.yaml"),
		[]byte("model:\n  default: m\n  provider: custom\n"), 0o644)
	if err := Assign(slug, task.ID, "good"); err != nil {
		t.Errorf("valid profile refused: %v", err)
	}
	tasks, _ = ListTasks(slug)
	if tasks[0].Assignee != "good" {
		t.Errorf("assignee = %q, want good", tasks[0].Assignee)
	}
}
