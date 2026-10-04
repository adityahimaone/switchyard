package kanban

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"
)

// Path leases: mutual exclusion over declared edit scope.
//
// A task that has been claimed holds a lease on each of its declared globs. A
// second task whose globs could touch the same files cannot be claimed until the
// first one is done. The purpose is to stop two agents editing one directory at
// the same time and producing an interleaved diff that neither reviewer can
// read.
//
// Scope of the guarantee, stated plainly: a lease coordinates Switchyard tasks.
// It cannot stop an agent writing outside its declared globs, and it cannot stop
// the human editing files in the workspace. Containment proper is a git
// worktree per task, which is a separate piece of work.
//
// Leases are HELD while a task is running, blocked, or awaiting review. Review
// is the important one here: a Switchyard diff can sit for hours waiting for a
// human, and starting overlapping work in the meantime would corrupt the very
// diff under review.

// LeaseConflict reports that another task already holds an overlapping path.
// The dispatcher treats it as "not now", never as a failure, so the card stays
// claimable and is retried on a later poll.
type LeaseConflict struct {
	Glob   string
	HeldBy string
}

func (e *LeaseConflict) Error() string {
	return fmt.Sprintf("%s: %q is held by %s", CodeLeaseConflict, e.Glob, e.HeldBy)
}

// IsLeaseConflict reports whether err is a lease conflict, so callers can branch
// on the type rather than string-matching the message.
func IsLeaseConflict(err error) bool {
	_, ok := err.(*LeaseConflict)
	return ok
}

// Lease is one held path claim, as shown in the board header.
type Lease struct {
	Glob       string `json:"glob"`
	TaskID     string `json:"task_id"`
	Project    string `json:"project"`
	AcquiredAt int64  `json:"acquired_at"`
	// Title and Status are joined in for display, so the board header does not
	// have to fetch every task to label a chip.
	Title  string `json:"title,omitempty"`
	Status string `json:"status,omitempty"`
}

// leaseHoldingStatuses are the states in which a task keeps its leases.
//
// 'review' is the reason this list is not just 'running': a card sitting in
// review has uncommitted work that a second overlapping task would corrupt.
var leaseHoldingStatuses = map[string]bool{
	"running": true,
	"review":  true,
	"blocked": true,
}

// LeaseProjectFor returns the lease namespace for a workspace.
//
// The namespace is the repository, not the workspace record: two workspace
// entries pointing at one repo must contend for the same paths, or the same
// directory could be leased twice. The stable identity for a repo is its
// git common directory, which is what git worktrees of one repo share.
//
// That value is only obtainable by running git on the worker, which this package
// cannot do synchronously during a claim. So: use the cached RepoIdentity when
// the registry has one, and fall back to the workspace path otherwise.
//
// The fallback is a real limitation, not a detail. Two workspaces on the same
// repo but with different paths will not conflict until RepoIdentity is
// populated. It is logged at most once per process so the gap is visible without
// spamming every poll.
var warnedProjectFallback sync.Once

func LeaseProjectFor(ws Workspace) string {
	if id := normalizePath(ws.RepoIdentity); id != "" {
		return id
	}
	warnedProjectFallback.Do(func() {
		log.Printf("leases: no repo identity for workspace %q; scoping leases by path. "+
			"Two workspaces pointing at one repo will not conflict until RepoIdentity is set.",
			ws.ID)
	})
	return normalizePath(ws.Path)
}

// AcquireLeases claims globs for a task, or returns a *LeaseConflict.
//
// It must be called inside the claim transaction: the read of existing leases
// and the insert of new ones have to be atomic against a competing claim, or two
// tasks can both see a free path and both take it.
func AcquireLeases(tx *sql.Tx, project, taskID string, globs []string) error {
	if len(globs) == 0 {
		// A task with no declared scope imposes nothing and blocks nothing.
		return nil
	}
	// The same task re-acquiring its own paths is not a conflict: a retry after
	// a crash, or a re-claim, should be idempotent.
	rows, err := tx.Query(`SELECT glob, task_id FROM path_leases WHERE project=? AND task_id<>?`, project, taskID)
	if err != nil {
		return err
	}
	var held []string
	var owners []string
	for rows.Next() {
		var g, owner string
		if err := rows.Scan(&g, &owner); err != nil {
			rows.Close()
			return err
		}
		held = append(held, g)
		owners = append(owners, owner)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, g := range globs {
		if conflicted, ok := PathsOverlapAny([]string{g}, held); ok {
			return &LeaseConflict{Glob: conflicted, HeldBy: owners[indexOf(held, conflicted)]}
		}
	}

	// Cap the number of live leases. Unbounded growth would come from either a
	// bug or a long-lived board, and the table is swept on startup.
	var total int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM path_leases`).Scan(&total); err != nil {
		return err
	}
	if total+len(globs) > maxActiveLeases {
		return fmt.Errorf("lease_limit: %d leases requested with %d already held, maximum is %d",
			len(globs), total, maxActiveLeases)
	}

	now := time.Now().Unix()
	for _, g := range globs {
		if _, err := tx.Exec(
			`INSERT OR REPLACE INTO path_leases(glob, task_id, project, acquired_at) VALUES(?,?,?,?)`,
			normalizePath(g), taskID, project, now); err != nil {
			return err
		}
	}
	return nil
}

// ReleaseLeases drops every lease a task holds. Called when it leaves the
// holding states for any reason: done, retry, delete, or an explicit release.
func ReleaseLeases(tx *sql.Tx, taskID string) error {
	_, err := tx.Exec(`DELETE FROM path_leases WHERE task_id=?`, taskID)
	return err
}

// ActiveLeases lists leases for a project, joined with task state so the board
// header can label each chip. Leases whose owner has left the holding states
// are excluded, which keeps a crashed task from parking paths forever.
func ActiveLeases(db *sql.DB, project string) ([]Lease, error) {
	rows, err := db.Query(`SELECT l.glob, l.task_id, l.project, l.acquired_at,
		COALESCE(t.title,''), COALESCE(t.status,'')
		FROM path_leases l
		LEFT JOIN tasks t ON t.id = l.task_id
		WHERE l.project = ?
		  AND (t.status IS NULL OR t.status IN ('running','review','blocked'))
		ORDER BY l.acquired_at, l.task_id`, project)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Lease{}
	for rows.Next() {
		var l Lease
		if err := rows.Scan(&l.Glob, &l.TaskID, &l.Project, &l.AcquiredAt, &l.Title, &l.Status); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// AllActiveLeases lists every live lease across every project, which is what
// the board header shows.
func AllActiveLeases(db *sql.DB) ([]Lease, error) {
	rows, err := db.Query(`SELECT l.glob, l.task_id, l.project, l.acquired_at,
		COALESCE(t.title,''), COALESCE(t.status,'')
		FROM path_leases l
		LEFT JOIN tasks t ON t.id = l.task_id
		WHERE t.status IS NULL OR t.status IN ('running','review','blocked')
		ORDER BY l.project, l.acquired_at, l.task_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Lease{}
	for rows.Next() {
		var l Lease
		if err := rows.Scan(&l.Glob, &l.TaskID, &l.Project, &l.AcquiredAt, &l.Title, &l.Status); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ActiveLeasesBoard lists every live lease on a board, across all projects.
func ActiveLeasesBoard(slug string) ([]Lease, error) {
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	return AllActiveLeases(db)
}

// SweepOrphanLeases drops leases whose owning task no longer exists or is no
// longer in a holding state. It runs at startup because a crash between the
// claim and the release would otherwise park paths indefinitely.
func SweepOrphanLeases(db *sql.DB) (int, error) {
	res, err := db.Exec(`DELETE FROM path_leases
		WHERE task_id NOT IN (
			SELECT id FROM tasks WHERE status IN ('running','review','blocked')
		)`)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

func indexOf(haystack []string, needle string) int {
	for i, h := range haystack {
		if h == needle {
			return i
		}
	}
	return 0
}
