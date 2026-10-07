package kanban

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// The claim transaction.
//
// Claiming a task is where declared scope and declared dependencies turn into
// real scheduling constraints, so all of it happens inside one transaction:
//
//	read status -> check dependencies -> acquire leases -> mark running
//
// Claiming is serialized in practice, and the transaction is what makes the
// sequence atomic against that: the dispatcher loop is the only path that
// claims with dependencies and leases (an explicit start only wakes it) and
// it claims one card at a time, while every openDB handle funnels its
// transactions through a single pooled connection (SetMaxOpenConns(1)),
// which fences a claim against a lease release or a retry committing at
// the same time.

// ClaimRejection is a claim that was refused for a reason the dispatcher should
// treat as "not yet" rather than "failed": the task is fine, its turn has not
// come. The dispatcher leaves it claimable and does not count a retry.
type ClaimRejection struct {
	Code string
	Err  error
}

func (e *ClaimRejection) Error() string { return e.Code + ": " + e.Err.Error() }

func (e *ClaimRejection) Unwrap() error { return e.Err }

// IsRejection reports whether err is a "not yet" refusal rather than a fault.
func IsRejection(err error) bool {
	_, ok := err.(*ClaimRejection)
	return ok
}

// ClaimResult is the outcome of a claim attempt.
type ClaimResult struct {
	RunID   string
	Claimed bool
}

// ClaimTaskRunGuarded claims a task for execution, enforcing declared
// dependencies and acquiring its path leases atomically.
//
// It returns a *ClaimRejection when the task is well-formed but not its turn
// (dependencies unmet, or another task holds an overlapping path). That is not
// an error condition: the caller should leave the task alone and try again on a
// later poll. A genuine fault is returned as a plain error.
func ClaimTaskRunGuarded(db *sql.DB, taskID, project string) (ClaimResult, error) {
	if err := ensureTaskExecutionColumns(db); err != nil {
		return ClaimResult{}, err
	}

	tx, err := db.Begin()
	if err != nil {
		return ClaimResult{}, err
	}
	// Rollback is a no-op after a successful Commit.
	defer tx.Rollback()

	var status, pathsJSON string
	err = tx.QueryRow(`SELECT status, COALESCE(paths,'[]') FROM tasks WHERE id=?`, taskID).
		Scan(&status, &pathsJSON)
	if err == sql.ErrNoRows {
		return ClaimResult{}, &ClaimRejection{Code: CodeBadRequest, Err: fmt.Errorf("task %s not found", taskID)}
	}
	if err != nil {
		return ClaimResult{}, err
	}
	if status != "todo" && status != "ready" {
		// Already running, done, or in review. Another claimer won.
		return ClaimResult{}, nil
	}

	// Dependencies must be finished, not merely reviewed: a dependent that
	// built on a card still sitting in review would be building on uncommitted
	// work.
	pending, err := pendingDependencies(tx, taskID)
	if err != nil {
		return ClaimResult{}, err
	}
	if len(pending) > 0 {
		return ClaimResult{}, &ClaimRejection{
			Code: CodeDepsNotDone,
			Err:  fmt.Errorf("waiting for %v", pending),
		}
	}

	// Leases, scoped to the repository rather than the workspace record.
	globs := PathsParse(pathsJSON)
	if err := AcquireLeases(tx, project, taskID, globs); err != nil {
		if IsLeaseConflict(err) {
			return ClaimResult{}, &ClaimRejection{Code: CodeLeaseConflict, Err: err}
		}
		return ClaimResult{}, err
	}

	runID := fmt.Sprintf("run_%x", time.Now().UnixNano())
	res, err := tx.Exec(`UPDATE tasks SET status='running', started_at=?, completed_at=NULL, current_run_id=?
		WHERE id=? AND status IN ('todo','ready')`,
		time.Now().Unix(), runID, taskID)
	if err != nil {
		return ClaimResult{}, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return ClaimResult{}, err
	}
	if affected != 1 {
		// The status guard lost a race with another writer. Roll back so the
		// leases just taken are released with the rest of the transaction.
		return ClaimResult{}, nil
	}

	if err := tx.Commit(); err != nil {
		return ClaimResult{}, err
	}
	return ClaimResult{RunID: runID, Claimed: true}, nil
}

// pendingDependencies returns the ids of dependencies that are not yet done.
func pendingDependencies(tx *sql.Tx, taskID string) ([]string, error) {
	rows, err := tx.Query(`SELECT d.depends_on_id, COALESCE(t.status,'')
		FROM task_dependencies d
		LEFT JOIN tasks t ON t.id = d.depends_on_id
		WHERE d.task_id = ?`, taskID)
	if err != nil {
		// A board that predates the dependency table simply has no
		// dependencies, which is the same as all of them being satisfied.
		if isNoSuchTable(err) {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()
	var pending []string
	for rows.Next() {
		var id, status string
		if err := rows.Scan(&id, &status); err != nil {
			return nil, err
		}
		if status != "done" {
			pending = append(pending, id)
		}
	}
	return pending, rows.Err()
}

// ReleaseTaskLeases drops a task's leases outside a claim transaction, for the
// paths where there is nothing to commit — an explicit release, or a task being
// archived.
func ReleaseTaskLeases(db *sql.DB, taskID string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := ReleaseLeases(tx, taskID); err != nil {
		return err
	}
	return tx.Commit()
}

// isNoSuchTable reports whether err is SQLite's missing-table error. Boards
// created before a table existed must degrade to "feature unavailable", not
// fail the operation that happened to touch them.
func isNoSuchTable(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "no such table")
}
