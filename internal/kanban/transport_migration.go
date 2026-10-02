package kanban

import (
	"fmt"
	"log"
	"strings"
)

// The legacy SSH transport is retired.
//
// History: tasks once carried workspace_transport='ssh', meaning the control
// plane shelled out to `ssh <host>` for diff and approve. The node-agent
// transport replaced it, and by the time this migration was written even
// ssh-transported tasks already *executed* over node-agent — only the review
// gate still used SSH. So 'ssh' was a routing label with no runtime behind it,
// and new tasks could not be created with it (transport is derived from the
// workspace path, which resolves to node-agent for every remote path).
//
// The remaining reason to migrate rather than ignore: a card parked in `review`
// with transport='ssh' can only leave that column through approve, and approve
// is about to stop accepting 'ssh'. Left alone, those cards would be stranded in
// review forever. So they are rewritten in place.
const retiredTransport = "ssh"

// MigrateRetiredTransport rewrites workspace_transport='ssh' to 'node-agent',
// preserving the ssh target as the node-agent target.
//
// It is safe to run on every startup: it is idempotent, it only touches rows
// whose transport is the retired value, and it never changes task status. A
// board with no legacy rows is left untouched.
//
// targetFor is injected rather than calling transportForPath directly so the
// migration can be tested without a workspace registry, and so the target
// resolution stays in one place.
func MigrateRetiredTransport(targetFor func(workspacePath, existingTarget string) (string, string)) (int, error) {
	boards, err := ListBoards()
	if err != nil {
		return 0, err
	}
	total := 0
	for _, b := range boards {
		n, err := migrateBoardRetiredTransport(b.Slug, targetFor)
		if err != nil {
			// One unreadable board must not stop the others from migrating.
			log.Printf("transport-migration: board %s: %v", b.Slug, err)
			continue
		}
		if n > 0 {
			log.Printf("transport-migration: board %s: rewrote %d task(s) from ssh to node-agent", b.Slug, n)
		}
		total += n
	}
	return total, nil
}

func migrateBoardRetiredTransport(slug string, targetFor func(string, string) (string, string)) (int, error) {
	db, err := openDB(slug)
	if err != nil {
		return 0, err
	}
	defer db.Close()

	rows, err := db.Query(`SELECT id, COALESCE(workspace_path,''), COALESCE(workspace_ssh_target,''), COALESCE(status,'')
		FROM tasks WHERE workspace_transport = ?`, retiredTransport)
	if err != nil {
		// A board whose schema predates the transport column has nothing to
		// migrate; that is not a failure.
		if strings.Contains(strings.ToLower(err.Error()), "no such column") {
			return 0, nil
		}
		return 0, err
	}
	type legacy struct{ id, path, target, status string }
	var pending []legacy
	for rows.Next() {
		var l legacy
		if err := rows.Scan(&l.id, &l.path, &l.target, &l.status); err != nil {
			continue
		}
		pending = append(pending, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	migrated := 0
	for _, l := range pending {
		// The stored target is the node-agent target, not an SSH alias, so it
		// is carried over unchanged. transportForPath only fills a gap when the
		// column is empty.
		transport, target := targetFor(l.path, l.target)
		if transport != "node-agent" {
			// A local path: there is no transport to migrate to, and leaving it
			// alone is correct — it is dispatched locally, not remotely.
			continue
		}
		if _, err := db.Exec(
			`UPDATE tasks SET workspace_transport='node-agent', workspace_ssh_target=? WHERE id=? AND workspace_transport=?`,
			target, l.id, retiredTransport); err != nil {
			return migrated, fmt.Errorf("task %s: %w", l.id, err)
		}
		migrated++
	}
	return migrated, nil
}

// LegacyTransportTaskCount reports how many tasks still carry the retired
// transport. It exists so a test or a health check can assert the migration ran,
// and so an operator can confirm before deleting the migration.
func LegacyTransportTaskCount() (int, error) {
	boards, err := ListBoards()
	if err != nil {
		return 0, err
	}
	total := 0
	for _, b := range boards {
		db, err := openDB(b.Slug)
		if err != nil {
			continue
		}
		var n int
		err = db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE workspace_transport = ?`, retiredTransport).Scan(&n)
		db.Close()
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "no such column") {
				continue
			}
			continue
		}
		total += n
	}
	return total, nil
}
