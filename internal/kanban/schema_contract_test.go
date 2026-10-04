package kanban

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeSchemaFixture builds a board whose tasks table is as close to the real
// Hermes schema as a test needs: every column the server depends on, plus extra
// columns it does not, which is what a real Hermes board looks like.
func writeSchemaFixture(t *testing.T, home string, tasksDDL string) {
	t.Helper()
	dir := filepath.Join(home, "kanban", "boards", "fixture")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "board.json"),
		[]byte(`{"slug":"fixture","name":"Fixture"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(tasksDDL); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE task_events (
		id INTEGER PRIMARY KEY, task_id TEXT, kind TEXT, payload TEXT, created_at INTEGER)`); err != nil {
		t.Fatal(err)
	}
}

// hermesTasksDDL is the subset of the real Hermes schema the contract depends
// on. Columns the server never touches are omitted; ones it does not know about
// are included, because tolerating additions is part of the contract.
const hermesTasksDDL = `CREATE TABLE tasks (
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
	workspace_path       TEXT,
	branch_name          TEXT,
	project_id           TEXT,
	claim_lock           TEXT,
	claim_expires        INTEGER,
	tenant               TEXT,
	result               TEXT,
	idempotency_key      TEXT,
	consecutive_failures INTEGER NOT NULL DEFAULT 0,
	worker_pid           INTEGER,
	last_failure_error   TEXT,
	max_runtime_seconds  INTEGER,
	last_heartbeat_at    INTEGER,
	current_run_id       INTEGER,
	workflow_template_id TEXT,
	-- a column this server has never heard of, added by a newer Hermes
	some_future_column   TEXT
)`

func TestSchemaContractAcceptsHermesShape(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	writeSchemaFixture(t, home, hermesTasksDDL)

	report, err := CheckBoardSchema("fixture")
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.OK() {
		t.Fatalf("a real-shaped Hermes schema was rejected: %s", report)
	}
}

// TestSchemaContractDetectsRenamedColumn is the reason this file exists: when
// Hermes renames a column the server uses, the failure must be reported at
// startup rather than as a 500 when someone opens the board.
func TestSchemaContractDetectsRenamedColumn(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// A future Hermes that renamed consecutive_failures.
	renamed := strings.Replace(hermesTasksDDL,
		"consecutive_failures INTEGER NOT NULL DEFAULT 0",
		"failure_count INTEGER NOT NULL DEFAULT 0", 1)
	writeSchemaFixture(t, home, renamed)

	report, err := CheckBoardSchema("fixture")
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if report.OK() {
		t.Fatal("a renamed column was not detected")
	}
	if got := report.MissingColumns["tasks"]; len(got) != 1 || got[0] != "consecutive_failures" {
		t.Fatalf("MissingColumns[tasks] = %v, want [consecutive_failures]", got)
	}
	if !strings.Contains(report.String(), "consecutive_failures") {
		t.Fatalf("report does not name the column: %s", report)
	}
}

func TestSchemaContractDetectsDroppedTable(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// No task_events table at all.
	dir := filepath.Join(home, "kanban", "boards", "fixture")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "board.json"),
		[]byte(`{"slug":"fixture","name":"Fixture"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(hermesTasksDDL); err != nil {
		t.Fatal(err)
	}
	db.Close()

	report, err := CheckBoardSchema("fixture")
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if report.OK() {
		t.Fatal("a missing table was not detected")
	}
	found := false
	for _, tbl := range report.MissingTables {
		if tbl == "task_events" {
			found = true
		}
	}
	if !found {
		t.Fatalf("MissingTables = %v, want it to include task_events", report.MissingTables)
	}
}

// TestSchemaContractAppliesOwnMigrations proves the check does not fail a board
// that predates the columns Switchyard itself added. Without this, every board
// created before the executor/transport columns would be reported incompatible.
func TestSchemaContractAppliesOwnMigrations(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// A minimal board: only the original Hermes columns, none of the ones this
	// server introduced.
	writeSchemaFixture(t, home, `CREATE TABLE tasks (
		id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
		status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT,
		created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
		workspace_kind TEXT NOT NULL DEFAULT 'scratch', workspace_path TEXT,
		result TEXT, consecutive_failures INTEGER NOT NULL DEFAULT 0,
		last_failure_error TEXT, current_run_id INTEGER)`)

	report, err := CheckBoardSchema("fixture")
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if !report.OK() {
		t.Fatalf("a board missing only this server's own columns was rejected: %s", report)
	}
	// And the columns are genuinely there afterwards.
	db, err := sql.Open("sqlite", filepath.Join(home, "kanban", "boards", "fixture", "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cols, err := tableColumns(db, "tasks")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"executor", "workspace_transport", "position"} {
		if !cols[want] {
			t.Errorf("column %q was not created by the check", want)
		}
	}
}

func TestSchemaReportString(t *testing.T) {
	if got := (SchemaReport{Board: "x"}).String(); got != "ok" {
		t.Errorf("empty report = %q, want ok", got)
	}
	r := SchemaReport{
		Board:          "x",
		MissingTables:  []string{"task_events"},
		MissingColumns: map[string][]string{"tasks": {"result", "status"}},
	}
	got := r.String()
	for _, want := range []string{"task_events", "result", "status"} {
		if !strings.Contains(got, want) {
			t.Errorf("report %q does not mention %q", got, want)
		}
	}
}

// TestRequiredSchemaCoversQueriedColumns is a guard on the contract itself: it
// fails if a column the server genuinely requires is not listed. The list is
// maintained by hand, so this documents the intent and makes an omission a
// deliberate act rather than an accident.
func TestRequiredSchemaCoversQueriedColumns(t *testing.T) {
	// Columns that appear in queries in this package. A column absent from
	// requiredSchema means a Hermes change to it would go undetected.
	queried := []string{
		"id", "title", "body", "status", "priority", "assignee", "created_by",
		"created_at", "completed_at", "started_at", "workspace_kind",
		"workspace_path", "result", "consecutive_failures", "last_failure_error",
		"current_run_id",
	}
	have := map[string]bool{}
	for _, c := range requiredSchema["tasks"] {
		have[c] = true
	}
	for _, c := range queried {
		if !have[c] {
			t.Errorf("requiredSchema[\"tasks\"] is missing %q, which the server queries", c)
		}
	}
	if len(requiredSchema["task_events"]) == 0 {
		t.Error("requiredSchema[\"task_events\"] is empty")
	}
}
