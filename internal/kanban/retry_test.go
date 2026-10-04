package kanban

import (
	"strings"
	"testing"
)

func retryBoard(t *testing.T, tasks ...Task) {
	t.Helper()
	orchestratorBoard(t, tasks...)
}

func eventPayloads(t *testing.T, taskID string) []string {
	t.Helper()
	db := mustDB(t)
	rows, err := db.Query(`SELECT payload FROM task_events WHERE task_id=? ORDER BY id`, taskID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	return out
}

// TestRetryIncrementsAttempt proves a retry is a new attempt, not a reset, and
// that the previous outcome is archived rather than discarded.
func TestRetryIncrementsAttempt(t *testing.T) {
	retryBoard(t, Task{ID: "t1", Title: "one", Status: "blocked"})
	db := mustDB(t)
	if _, err := db.Exec(`UPDATE tasks SET result='previous output', last_failure_error='it broke', attempt=1 WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}

	task, err := RetryTask("default", "t1")
	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if task.Attempt != 2 {
		t.Fatalf("attempt = %d, want 2", task.Attempt)
	}
	if task.Status != "todo" {
		t.Fatalf("status = %q, want todo", task.Status)
	}
	// The previous result is deliberately kept: it is the evidence for why a
	// retry was needed.
	if task.Result != "previous output" {
		t.Fatalf("result = %q, want the previous attempt preserved", task.Result)
	}

	// And the history records it.
	var archived bool
	for _, p := range eventPayloads(t, "t1") {
		if strings.Contains(p, "attempt_archived") ||
			(strings.Contains(p, "previous_result") && strings.Contains(p, "previous output")) {
			archived = true
		}
	}
	if !archived {
		t.Fatal("no attempt_archived event carrying the previous result")
	}
}

func TestRetryClearsStaleGateVerdict(t *testing.T) {
	retryBoard(t, Task{ID: "t1", Title: "one", Status: "review", GateCommand: "go test ./..."})
	db := mustDB(t)
	if _, err := db.Exec(`UPDATE tasks SET gate_status='failed', gate_output='tests broke' WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}

	if _, err := RetryTask("default", "t1"); err != nil {
		t.Fatal(err)
	}
	// A stale "failed" would block the new attempt's approve.
	status, output, err := GateResult("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if status != "" || output != "" {
		t.Fatalf("gate verdict survived the retry: status=%q output=%q", status, output)
	}
}

func TestRetryReleasesLeases(t *testing.T) {
	retryBoard(t, Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}})
	db := mustDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// Hold it in review, where leases are kept.
	if _, err := db.Exec(`UPDATE tasks SET status='review' WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}
	if n := countLeases(t, db); n != 1 {
		t.Fatalf("expected 1 lease while in review, got %d", n)
	}

	if _, err := RetryTask("default", "t1"); err != nil {
		t.Fatal(err)
	}
	// A requeued card must be able to claim its paths again, so the old lease
	// has to go.
	if n := countLeases(t, db); n != 0 {
		t.Fatalf("retry left %d lease(s) behind", n)
	}
}

func TestRetryRejectsRunningAndArchived(t *testing.T) {
	retryBoard(t, Task{ID: "run", Title: "one"}, Task{ID: "arc", Title: "two"})
	db := mustDB(t)
	if _, err := db.Exec(`UPDATE tasks SET status='running' WHERE id='run'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE tasks SET status='archived' WHERE id='arc'`); err != nil {
		t.Fatal(err)
	}
	if _, err := RetryTask("default", "run"); err == nil {
		t.Fatal("a running task must not be retried")
	}
	if _, err := RetryTask("default", "arc"); err == nil {
		t.Fatal("an archived task must not be retried")
	}
	if _, err := RetryTask("default", "ghost"); err == nil {
		t.Fatal("a missing task must not be retried")
	}
}

// TestRetryRejectedWhenDependentStarted covers the ordering hazard: a dependent
// that already ran was built on the attempt being replaced.
func TestRetryRejectedWhenDependentStarted(t *testing.T) {
	retryBoard(t,
		Task{ID: "up", Title: "upstream", Status: "review"},
		Task{ID: "down", Title: "downstream", DependsOn: []string{"up"}},
	)
	db := mustDB(t)
	// The dependent has moved past the queue, so it consumed the attempt.
	if _, err := db.Exec(`UPDATE tasks SET status='review' WHERE id='down'`); err != nil {
		t.Fatal(err)
	}

	_, err := RetryTask("default", "up")
	if err == nil {
		t.Fatal("retry was allowed after a dependent had started")
	}
	if !strings.Contains(err.Error(), CodeDependentStarted) {
		t.Fatalf("error = %v, want it to name %s", err, CodeDependentStarted)
	}
	// And the upstream must be untouched.
	if got, _ := TaskStatus("default", "up"); got != "review" {
		t.Fatalf("upstream status = %q, want it left at review", got)
	}
}

// TestRetryAllowedWhenDependentStillQueued is the other side: a dependent that
// has not consumed anything does not block the retry.
func TestRetryAllowedWhenDependentStillQueued(t *testing.T) {
	retryBoard(t,
		Task{ID: "up", Title: "upstream", Status: "blocked"},
		Task{ID: "down", Title: "downstream", DependsOn: []string{"up"}},
	)
	if _, err := RetryTask("default", "up"); err != nil {
		t.Fatalf("a queued dependent must not block a retry: %v", err)
	}
}

// TestRetryAtomicOnDependentStarted proves a refused retry writes nothing: the
// attempt counter must not advance and no history must be appended. If the
// counter and the dependent check were separate statements, a card refused for
// dependent_started would silently consume an attempt.
func TestRetryAtomicOnDependentStarted(t *testing.T) {
	retryBoard(t,
		Task{ID: "up", Title: "upstream", Status: "review"},
		Task{ID: "down", Title: "downstream", DependsOn: []string{"up"}},
	)
	db := mustDB(t)
	// Seed a mid-flight attempt, since a fresh card is always attempt 1.
	if _, err := db.Exec(`UPDATE tasks SET attempt=3 WHERE id='up'`); err != nil {
		t.Fatal(err)
	}
	// The dependent has consumed the attempt, so the retry must be refused.
	if _, err := db.Exec(`UPDATE tasks SET status='review' WHERE id='down'`); err != nil {
		t.Fatal(err)
	}
	eventsBefore := len(eventPayloads(t, "up"))
	var attemptBefore int
	if err := db.QueryRow(`SELECT attempt FROM tasks WHERE id='up'`).Scan(&attemptBefore); err != nil {
		t.Fatal(err)
	}
	if attemptBefore != 3 {
		t.Fatalf("setup: attempt = %d, want 3", attemptBefore)
	}

	if _, err := RetryTask("default", "up"); err == nil {
		t.Fatal("expected the retry to be refused")
	}

	var attemptAfter int
	if err := db.QueryRow(`SELECT attempt FROM tasks WHERE id='up'`).Scan(&attemptAfter); err != nil {
		t.Fatal(err)
	}
	if attemptAfter != attemptBefore {
		t.Fatalf("a refused retry advanced the attempt counter %d -> %d", attemptBefore, attemptAfter)
	}
	if after := len(eventPayloads(t, "up")); after != eventsBefore {
		t.Fatalf("a refused retry appended %d event(s)", after-eventsBefore)
	}
	if got, _ := TaskStatus("default", "up"); got != "review" {
		t.Fatalf("status = %q, want it left at review", got)
	}
}
