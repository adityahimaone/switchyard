package kanban

import (
	"database/sql"
	"strings"
	"testing"
)

// orchestratorBoard creates a board for the start/deps/retry tests.
func orchestratorBoard(t *testing.T, tasks ...Task) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	for _, task := range tasks {
		tsk := task
		if tsk.Status == "" {
			tsk.Status = "todo"
		}
		if err := CreateTask("default", &tsk); err != nil {
			t.Fatalf("create %q: %v", tsk.Title, err)
		}
	}
}

func TestStartTaskNowPokesWithoutClaiming(t *testing.T) {
	orchestratorBoard(t, Task{ID: "t1", Title: "one"})

	res, err := StartTaskNow("default", "t1")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if !res.Started || res.Status != "todo" {
		t.Fatalf("StartTaskNow = %+v, want started with the card still queued", res)
	}
	// The dispatcher owns claiming. A poke that claimed would
	// strand the card as running with no worker attached,
	// because only the dispatcher ever dispatches a claimed run.
	if got, err := TaskStatus("default", "t1"); err != nil {
		t.Fatal(err)
	} else if got != "todo" {
		t.Fatalf("persisted status = %q, want todo (the dispatcher's pass claims it)", got)
	}
}

func TestStartTaskNowDefersOnLeaseConflict(t *testing.T) {
	orchestratorBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/auth/token.rs"}},
	)
	// t1 holds the overlapping scope the way a dispatched run does;
	// a poke alone would not, because pokes never claim. The
	// project is the one StartTaskNow derives from the task's
	// workspace path, so the preflight reads the same lease
	// namespace the claim wrote.
	db := mustDB(t)
	project := LeaseProjectFor(Workspace{Path: "", Host: ""})
	if _, err := ClaimTaskRunGuarded(db, "t1", project); err != nil {
		t.Fatal(err)
	}
	res, err := StartTaskNow("default", "t2")
	if err != nil {
		t.Fatalf("a lease conflict must be a deferral, not an error: %v", err)
	}
	if res.Started {
		t.Fatal("t2 started despite holding an overlapping path")
	}
	if res.Rejected != CodeLeaseConflict {
		t.Fatalf("rejected code = %q, want %q", res.Rejected, CodeLeaseConflict)
	}
	// And it must still be queued, not consumed.
	if got, _ := TaskStatus("default", "t2"); got != "todo" {
		t.Fatalf("t2 status = %q, want it left queued at todo", got)
	}
}

func TestStartTaskNowDefersOnUnmetDependency(t *testing.T) {
	orchestratorBoard(t,
		Task{ID: "up", Title: "upstream", Status: "review"},
		Task{ID: "down", Title: "downstream", DependsOn: []string{"up"}},
	)
	res, err := StartTaskNow("default", "down")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if res.Started {
		t.Fatal("a dependent started while its dependency was only in review")
	}
	if res.Rejected != CodeDepsNotDone {
		t.Fatalf("rejected code = %q, want %q", res.Rejected, CodeDepsNotDone)
	}
}

func TestStartTaskNowOnMissingTask(t *testing.T) {
	orchestratorBoard(t, Task{ID: "t1", Title: "one"})
	if _, err := StartTaskNow("default", "nope"); err == nil {
		t.Fatal("expected a 404-mapped error for a missing task")
	}
}

func TestStartTaskNowOnAlreadyRunning(t *testing.T) {
	orchestratorBoard(t, Task{ID: "t1", Title: "one"})
	db := mustDB(t)
	project := LeaseProjectFor(Workspace{Path: "", Host: ""})
	if _, err := ClaimTaskRunGuarded(db, "t1", project); err != nil {
		t.Fatal(err)
	}
	res, err := StartTaskNow("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if res.Started {
		t.Fatal("a running task must not start twice")
	}
	if res.Rejected != CodeNotRetryable {
		t.Fatalf("rejected code = %q, want %q", res.Rejected, CodeNotRetryable)
	}
}

func TestCreateWithDependencies(t *testing.T) {
	orchestratorBoard(t, Task{ID: "up", Title: "upstream"})

	// The dependency is applied inside the create, so the card is born linked.
	if err := CreateTask("default", &Task{
		ID: "down", Title: "downstream", DependsOn: []string{"up"},
	}); err != nil {
		t.Fatalf("create with deps: %v", err)
	}
	deps, err := ListTaskDependencies("default", "down")
	if err != nil {
		t.Fatal(err)
	}
	if len(deps) != 1 || deps[0].DependsOnID != "up" {
		t.Fatalf("dependencies = %+v", deps)
	}
}

func TestCreateRejectsUnknownDependency(t *testing.T) {
	orchestratorBoard(t)
	err := CreateTask("default", &Task{ID: "down", Title: "downstream", DependsOn: []string{"ghost"}})
	if err == nil {
		t.Fatal("expected a create with an unknown dependency to fail")
	}
	// The whole create must roll back: no orphan card pointing at nothing.
	tasks, err := ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 0 {
		t.Fatalf("a rejected create left %d task(s) behind", len(tasks))
	}
}

func TestCreateRejectsSelfDependency(t *testing.T) {
	orchestratorBoard(t)
	if err := CreateTask("default", &Task{ID: "a", Title: "a", DependsOn: []string{"a"}}); err == nil {
		t.Fatal("a task must not be able to depend on itself")
	}
}

// TestDependencyCycleRejected covers A -> B -> A, which would leave both cards
// permanently unclaimable with nothing in the UI to explain it.
func TestDependencyCycleRejected(t *testing.T) {
	orchestratorBoard(t,
		Task{ID: "a", Title: "a"},
		Task{ID: "b", Title: "b"},
		Task{ID: "c", Title: "c"},
	)
	// a -> b, b -> c
	if err := AddTaskDependency("default", "a", "b"); err != nil {
		t.Fatal(err)
	}
	if err := AddTaskDependency("default", "b", "c"); err != nil {
		t.Fatal(err)
	}
	// c -> a closes the loop and must be refused.
	err := AddTaskDependency("default", "c", "a")
	if err == nil {
		t.Fatal("a dependency cycle was accepted")
	}
	if !strings.Contains(err.Error(), "indirectly") {
		t.Fatalf("cycle error = %v, want it to name the indirect cycle", err)
	}
	// A two-step cycle is refused too.
	if err := AddTaskDependency("default", "b", "a"); err == nil {
		t.Fatal("a direct two-step cycle was accepted")
	}
}

func TestAddDependencyIsIdempotent(t *testing.T) {
	orchestratorBoard(t,
		Task{ID: "a", Title: "a"},
		Task{ID: "b", Title: "b"},
	)
	if err := AddTaskDependency("default", "a", "b"); err != nil {
		t.Fatal(err)
	}
	// Re-adding is a no-op, not a constraint error the caller must interpret.
	if err := AddTaskDependency("default", "a", "b"); err != nil {
		t.Fatalf("re-adding the same dependency: %v", err)
	}
	deps, _ := ListTaskDependencies("default", "a")
	if len(deps) != 1 {
		t.Fatalf("expected 1 dependency, got %d", len(deps))
	}
}

func TestUnmetDependencies(t *testing.T) {
	orchestratorBoard(t,
		Task{ID: "up1", Title: "Upstream one", Status: "review"},
		Task{ID: "up2", Title: "Upstream two", Status: "done"},
		Task{ID: "down", Title: "downstream", DependsOn: []string{"up1", "up2"}},
	)
	unmet, err := UnmetDependencies(mustDB(t), "down")
	if err != nil {
		t.Fatal(err)
	}
	// Only the one that is not done, and with a title to show.
	if len(unmet) != 1 {
		t.Fatalf("unmet = %+v, want only the in-review dependency", unmet)
	}
	if unmet[0].ID != "up1" || unmet[0].Title != "Upstream one" {
		t.Fatalf("unmet[0] = %+v", unmet[0])
	}
}

func mustDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
