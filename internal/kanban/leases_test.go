package kanban

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"
)

// leaseBoard creates a board with the given tasks, each with declared paths.
func leaseBoard(t *testing.T, tasks ...Task) {
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

func leaseDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func setStatus(t *testing.T, db *sql.DB, id, status string) {
	t.Helper()
	if _, err := db.Exec(`UPDATE tasks SET status=? WHERE id=?`, status, id); err != nil {
		t.Fatal(err)
	}
}

func countLeases(t *testing.T, db *sql.DB) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM path_leases`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestLeaseProjectFor(t *testing.T) {
	cases := []struct {
		name string
		ws   Workspace
		want string
	}{
		{"repo identity wins", Workspace{ID: "a", Path: "/Users/me/app", RepoIdentity: "/Users/me/app/.git"}, "/Users/me/app/.git"},
		{"falls back to path", Workspace{ID: "a", Path: "/Users/me/app"}, "/Users/me/app"},
		{"normalizes the fallback", Workspace{ID: "a", Path: "/Users/me/app/"}, "/Users/me/app"},
		{"windows path", Workspace{ID: "a", Path: `C:\Development\app`}, "C:/Development/app"},
		{"blank identity is ignored", Workspace{ID: "a", Path: "/x", RepoIdentity: "   "}, "/x"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := LeaseProjectFor(tc.ws); got != tc.want {
				t.Fatalf("LeaseProjectFor = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestClaimAcquiresLeases(t *testing.T) {
	leaseBoard(t, Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}})
	db := leaseDB(t)

	res, err := ClaimTaskRunGuarded(db, "t1", "proj")
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if !res.Claimed {
		t.Fatal("expected the task to be claimed")
	}
	if res.RunID == "" {
		t.Fatal("expected a run id")
	}
	if n := countLeases(t, db); n != 1 {
		t.Fatalf("expected 1 lease, got %d", n)
	}

	leases, err := AllActiveLeases(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(leases) != 1 || leases[0].TaskID != "t1" || leases[0].Glob != "src/auth/**" {
		t.Fatalf("unexpected leases: %+v", leases)
	}
	// The display fields are joined in, so the header needs no extra fetch.
	if leases[0].Title != "one" || leases[0].Status != "running" {
		t.Fatalf("lease display fields = %+v", leases[0])
	}
}

func TestClaimRejectsOverlappingPaths(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/auth/token.rs"}},
	)
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatalf("first claim: %v", err)
	}
	res, err := ClaimTaskRunGuarded(db, "t2", "proj")
	if err == nil {
		t.Fatal("expected a rejection for the overlapping task")
	}
	if !IsRejection(err) {
		t.Fatalf("error %v is not a rejection; a lease conflict must not count as a failure", err)
	}
	rej, ok := err.(*ClaimRejection)
	if !ok || rej.Code != CodeLeaseConflict {
		t.Fatalf("rejection = %v, want code %s", err, CodeLeaseConflict)
	}
	if res.Claimed {
		t.Fatal("a rejected task must not be marked claimed")
	}
	// The rejected task must still be claimable, i.e. left in its queue state.
	var status string
	if err := db.QueryRow(`SELECT status FROM tasks WHERE id='t2'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "todo" {
		t.Fatalf("t2 status = %q, want it left claimable at todo", status)
	}
	// And no partial lease should have been written for it.
	var leases int
	if err := db.QueryRow(`SELECT COUNT(*) FROM path_leases WHERE task_id='t2'`).Scan(&leases); err != nil {
		t.Fatal(err)
	}
	if leases != 0 {
		t.Fatalf("t2 holds %d leases after a rejected claim", leases)
	}
}

func TestClaimAllowsNonOverlappingPaths(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/api/**"}},
	)
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// Sibling directories are independent work and must both run.
	res, err := ClaimTaskRunGuarded(db, "t2", "proj")
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	if !res.Claimed {
		t.Fatal("a non-overlapping task must be claimable while another runs")
	}
	if n := countLeases(t, db); n != 2 {
		t.Fatalf("expected 2 leases, got %d", n)
	}
}

// TestClaimIsProjectScoped: the same globs in a different repository are
// different files and must not contend.
func TestClaimIsProjectScoped(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/auth/**"}},
	)
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "repo-a"); err != nil {
		t.Fatal(err)
	}
	res, err := ClaimTaskRunGuarded(db, "t2", "repo-b")
	if err != nil {
		t.Fatalf("a different repo must not conflict: %v", err)
	}
	if !res.Claimed {
		t.Fatal("expected the second repo's task to be claimed")
	}
}

// TestConcurrentClaimExactlyOneWins is the test the plan calls for explicitly.
// Two tasks declare overlapping paths and race; exactly one may proceed.
func TestConcurrentClaimExactlyOneWins(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/auth/**"}},
	)
	db := leaseDB(t)

	const rounds = 12
	for i := 0; i < rounds; i++ {
		// Reset so each round is a genuine race rather than a settled state.
		if _, err := db.Exec(`DELETE FROM path_leases`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`UPDATE tasks SET status='todo', current_run_id=NULL`); err != nil {
			t.Fatal(err)
		}

		var wg sync.WaitGroup
		results := make([]ClaimResult, 2)
		errs := make([]error, 2)
		start := make(chan struct{})
		for idx, id := range []string{"t1", "t2"} {
			wg.Add(1)
			go func(idx int, id string) {
				defer wg.Done()
				<-start // release both goroutines together
				results[idx], errs[idx] = ClaimTaskRunGuarded(db, id, "proj")
			}(idx, id)
		}
		close(start)
		wg.Wait()

		won := 0
		for idx := range results {
			switch {
			case errs[idx] != nil:
				// A rejection is the expected outcome for the loser.
				if !IsRejection(errs[idx]) {
					t.Fatalf("round %d: task %d got a real error: %v", i, idx, errs[idx])
				}
			case results[idx].Claimed:
				won++
			}
		}
		if won != 1 {
			t.Fatalf("round %d: %d tasks were claimed, want exactly 1", i, won)
		}
		// Whatever happened, the lease table must reflect a single owner.
		var owners int
		if err := db.QueryRow(`SELECT COUNT(DISTINCT task_id) FROM path_leases`).Scan(&owners); err != nil {
			t.Fatal(err)
		}
		if owners != 1 {
			t.Fatalf("round %d: %d distinct lease owners, want 1", i, owners)
		}
	}
}

func TestClaimRejectsUnmetDependency(t *testing.T) {
	leaseBoard(t,
		Task{ID: "up", Title: "upstream", Status: "review"},
		Task{ID: "down", Title: "downstream"},
	)
	db := leaseDB(t)
	if err := AddTaskDependency("default", "down", "up"); err != nil {
		t.Fatal(err)
	}

	// An upstream that is only in review has uncommitted work, so the dependent
	// must wait for done.
	_, err := ClaimTaskRunGuarded(db, "down", "proj")
	if !IsRejection(err) {
		t.Fatalf("error = %v, want a deps_not_done rejection", err)
	}
	if rej := err.(*ClaimRejection); rej.Code != CodeDepsNotDone {
		t.Fatalf("rejection code = %q, want %q", rej.Code, CodeDepsNotDone)
	}

	// Once the upstream is done, the dependent proceeds.
	setStatus(t, db, "up", "done")
	res, err := ClaimTaskRunGuarded(db, "down", "proj")
	if err != nil {
		t.Fatalf("claim after dependency satisfied: %v", err)
	}
	if !res.Claimed {
		t.Fatal("expected the dependent to be claimable once its dependency is done")
	}
}

func TestClaimWithoutPathsTakesNoLease(t *testing.T) {
	leaseBoard(t, Task{ID: "t1", Title: "no scope"})
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	if n := countLeases(t, db); n != 0 {
		t.Fatalf("a task with no declared paths took %d leases", n)
	}
	// And it must not block anyone else.
	if err := CreateTask("default", &Task{ID: "t2", Title: "other"}); err != nil {
		t.Fatal(err)
	}
	res, err := ClaimTaskRunGuarded(db, "t2", "proj")
	if err != nil || !res.Claimed {
		t.Fatalf("second claim = %+v err=%v, want claimed", res, err)
	}
}

func TestClaimIsIdempotentForSameTask(t *testing.T) {
	leaseBoard(t, Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}})
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// A re-claim sees status=running and does nothing, rather than reporting a
	// conflict against itself.
	res, err := ClaimTaskRunGuarded(db, "t1", "proj")
	if err != nil {
		t.Fatalf("re-claim: %v", err)
	}
	if res.Claimed {
		t.Fatal("a running task must not be claimed twice")
	}
	if n := countLeases(t, db); n != 1 {
		t.Fatalf("expected exactly 1 lease after a re-claim, got %d", n)
	}
}

func TestReleaseLeasesFreesThePath(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/auth/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/auth/**"}},
	)
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	if err := ReleaseTaskLeases(db, "t1"); err != nil {
		t.Fatal(err)
	}
	res, err := ClaimTaskRunGuarded(db, "t2", "proj")
	if err != nil {
		t.Fatalf("claim after release: %v", err)
	}
	if !res.Claimed {
		t.Fatal("releasing a lease must make the path claimable again")
	}
}

func TestSweepOrphanLeases(t *testing.T) {
	leaseBoard(t,
		Task{ID: "t1", Title: "one", Paths: []string{"src/a/**"}},
		Task{ID: "t2", Title: "two", Paths: []string{"src/b/**"}},
	)
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// Insert a lease owned by a task that does not exist, as a crash between
	// claim and release would leave behind.
	if _, err := db.Exec(`INSERT INTO path_leases(glob,task_id,project,acquired_at) VALUES('src/ghost/**','ghost','proj',0)`); err != nil {
		t.Fatal(err)
	}
	if n := countLeases(t, db); n != 2 {
		t.Fatalf("expected 2 leases before the sweep, got %d", n)
	}

	swept, err := SweepOrphanLeases(db)
	if err != nil {
		t.Fatal(err)
	}
	if swept != 1 {
		t.Fatalf("swept %d, want 1", swept)
	}
	// The live task's lease must survive.
	if n := countLeases(t, db); n != 1 {
		t.Fatalf("expected 1 lease after the sweep, got %d", n)
	}
	leases, err := AllActiveLeases(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(leases) != 1 || leases[0].TaskID != "t1" {
		t.Fatalf("surviving lease = %+v", leases)
	}
}

func TestSweepDropsLeasesForFinishedTasks(t *testing.T) {
	leaseBoard(t, Task{ID: "t1", Title: "one", Paths: []string{"src/a/**"}})
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// A done task must not keep its paths reserved.
	setStatus(t, db, "t1", "done")
	swept, err := SweepOrphanLeases(db)
	if err != nil {
		t.Fatal(err)
	}
	if swept != 1 {
		t.Fatalf("swept %d, want 1", swept)
	}
}

func TestActiveLeasesHidesLeavesOfHoldingStates(t *testing.T) {
	leaseBoard(t, Task{ID: "t1", Title: "one", Paths: []string{"src/a/**"}})
	db := leaseDB(t)

	if _, err := ClaimTaskRunGuarded(db, "t1", "proj"); err != nil {
		t.Fatal(err)
	}
	// All three holding states must keep the lease visible.
	for _, status := range []string{"running", "review", "blocked"} {
		setStatus(t, db, "t1", status)
		leases, err := AllActiveLeases(db)
		if err != nil {
			t.Fatal(err)
		}
		if len(leases) != 1 {
			t.Fatalf("status %s: expected the lease to be held, got %+v", status, leases)
		}
	}
	// Leaving them must not.
	for _, status := range []string{"done", "todo", "archived"} {
		setStatus(t, db, "t1", status)
		leases, err := AllActiveLeases(db)
		if err != nil {
			t.Fatal(err)
		}
		if len(leases) != 0 {
			t.Fatalf("status %s: expected no lease, got %+v", status, leases)
		}
	}
}

func TestLeaseConflictErrorMessage(t *testing.T) {
	err := &LeaseConflict{Glob: "src/auth/**", HeldBy: "t_abc"}
	want := `lease_conflict: "src/auth/**" is held by t_abc`
	if err.Error() != want {
		t.Fatalf("Error() = %q, want %q", err.Error(), want)
	}
	if !IsLeaseConflict(err) {
		t.Fatal("IsLeaseConflict must recognise a *LeaseConflict")
	}
	if IsLeaseConflict(fmt.Errorf("some other error")) {
		t.Fatal("IsLeaseConflict must not match an unrelated error")
	}
}
