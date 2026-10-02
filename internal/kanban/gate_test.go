package kanban

import (
	"database/sql"
	"strings"
	"testing"
)

// gateBoard creates a board with one task for the gate tests.
func gateBoard(t *testing.T, task Task) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if task.Status == "" {
		task.Status = "review"
	}
	if err := CreateTask("default", &task); err != nil {
		t.Fatalf("create: %v", err)
	}
}

func gateDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// TestGateRequiresReview proves the gate only runs against a task that reached
// review. A gate on a running or queued task would be verifying nothing.
func TestGateRequiresReview(t *testing.T) {
	for _, status := range []string{"todo", "blocked", "done"} {
		t.Run(status, func(t *testing.T) {
			gateBoard(t, Task{ID: "t1", Title: "x", Status: status, GateCommand: "go test ./..."})
			db, err := openDB("default")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if _, err := BeginGate(db, "t1"); err == nil {
				t.Fatalf("BeginGate succeeded for a task in %s", status)
			}
		})
	}
	// 'running' cannot be created through the API — it is dispatcher-owned — so
	// it is set directly to prove the guard covers the state that matters most.
	t.Run("running", func(t *testing.T) {
		gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
		db, err := openDB("default")
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		if _, err := db.Exec(`UPDATE tasks SET status='running' WHERE id='t1'`); err != nil {
			t.Fatal(err)
		}
		if _, err := BeginGate(db, "t1"); err == nil {
			t.Fatal("BeginGate succeeded for a running task")
		}
	})
}

func TestBeginGateIsExclusive(t *testing.T) {
	gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	first, err := BeginGate(db, "t1")
	if err != nil {
		t.Fatalf("first BeginGate: %v", err)
	}
	if first == "" {
		t.Fatal("expected a generation id")
	}
	// A second concurrent gate must be refused, not allowed to race the first.
	second, err := BeginGate(db, "t1")
	if err == nil {
		t.Fatalf("a second gate was accepted while one was running (%q)", second)
	}
	if !strings.Contains(err.Error(), CodeGateRunning) {
		t.Fatalf("error = %v, want it to name %s", err, CodeGateRunning)
	}
}

// TestGateGenerationFence is the staleness guard: a result from a superseded run
// must not overwrite a newer verdict.
func TestGateGenerationFence(t *testing.T) {
	gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Simulate a stale run that is still in flight.
	runID, err := BeginGate(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	// A re-run supersedes it rather than waiting on a worker that may never
	// answer, and returns the generation it displaced.
	previous, err := SupersedeGate(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if previous != runID {
		t.Fatalf("SupersedeGate returned previous=%q, want the displaced %q", previous, runID)
	}
	var fresh string
	if err := db.QueryRow(`SELECT gate_run_id FROM tasks WHERE id='t1'`).Scan(&fresh); err != nil {
		t.Fatal(err)
	}
	if fresh == previous || fresh == "" {
		t.Fatalf("expected a new generation, got %q (previous %q)", fresh, previous)
	}

	// The displaced result must be discarded.
	if err := FinishGate(db, "t1", previous, true, "stale pass"); err != nil {
		t.Fatal(err)
	}
	status, output, err := GateResult("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if status != "running" {
		t.Fatalf("a stale gate result changed the status to %q", status)
	}
	if strings.Contains(output, "stale pass") {
		t.Fatalf("stale gate output was written: %q", output)
	}

	// The current generation still applies.
	if err := FinishGate(db, "t1", fresh, false, "real failure"); err != nil {
		t.Fatal(err)
	}
	status, output, _ = GateResult("default", "t1")
	if status != "failed" || !strings.Contains(output, "real failure") {
		t.Fatalf("current generation did not apply: status=%q output=%q", status, output)
	}
}

func TestFinishGateRecordsPassAndFail(t *testing.T) {
	cases := []struct {
		name   string
		passed bool
		want   string
	}{
		{"pass", true, "passed"},
		{"fail", false, "failed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
			db, err := openDB("default")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			runID, err := BeginGate(db, "t1")
			if err != nil {
				t.Fatal(err)
			}
			if err := FinishGate(db, "t1", runID, tc.passed, "output here"); err != nil {
				t.Fatal(err)
			}
			status, output, err := GateResult("default", "t1")
			if err != nil {
				t.Fatal(err)
			}
			if status != tc.want {
				t.Fatalf("status = %q, want %q", status, tc.want)
			}
			if output != "output here" {
				t.Fatalf("output = %q", output)
			}
			// The generation is cleared once consumed, so a replay cannot apply.
			if inflight, err := GateInFlight(db, "t1"); err != nil {
				t.Fatal(err)
			} else if inflight {
				t.Fatal("gate still reported as in flight after finishing")
			}
		})
	}
}

// TestGateOutputIsTailCapped proves a runaway test log cannot bloat the task
// row, and that the useful end is what survives.
func TestGateOutputIsTailCapped(t *testing.T) {
	gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	runID, err := BeginGate(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	huge := strings.Repeat("x", gateOutputTailBytes*2) + "THE ACTUAL FAILURE"
	if err := FinishGate(db, "t1", runID, false, huge); err != nil {
		t.Fatal(err)
	}
	_, output, err := GateResult("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if len(output) > gateOutputTailBytes+200 {
		t.Fatalf("gate output is %d bytes, want it capped near %d", len(output), gateOutputTailBytes)
	}
	// The tail is the part a developer needs.
	if !strings.Contains(output, "THE ACTUAL FAILURE") {
		t.Fatal("the tail of the gate output was lost; the failure is at the end")
	}
	if !strings.Contains(output, "truncated") {
		t.Fatal("a truncated output should say so, or it reads as complete")
	}
}

func TestRunGateCommandIgnoresEmptyCommand(t *testing.T) {
	gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "   "})
	if err := RunGateCommand("default", "t1", "/tmp", "x", "  "); err != nil {
		t.Fatalf("an empty gate command must be a no-op, got %v", err)
	}
	// Nothing should have been recorded.
	status, _, err := GateResult("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if status != "" {
		t.Fatalf("gate_status = %q, want untouched for a task with no gate", status)
	}
}

func TestGateInFlight(t *testing.T) {
	gateBoard(t, Task{ID: "t1", Title: "x", GateCommand: "go test ./..."})
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	inflight, err := GateInFlight(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if inflight {
		t.Fatal("a fresh task should have no gate in flight")
	}
	if _, err := BeginGate(db, "t1"); err != nil {
		t.Fatal(err)
	}
	inflight, err = GateInFlight(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	if !inflight {
		t.Fatal("expected a gate in flight after BeginGate")
	}
}

func TestLoadGateTask(t *testing.T) {
	// A local workspace, since a /Users path would be rejected as a remote path
	// that this host cannot dispatch.
	gateBoard(t, Task{ID: "t1", Title: "my gate", GateCommand: "go vet ./...", WorkspacePath: t.TempDir()})
	g, err := LoadGateTask("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if g.GateCommand != "go vet ./..." || g.Title != "my gate" || g.WorkspacePath == "" {
		t.Fatalf("LoadGateTask = %+v", g)
	}
	if _, err := LoadGateTask("default", "missing"); err == nil {
		t.Fatal("expected an error for a missing task")
	}
}
