package kanban

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

// seedLegacyTransportBoard writes a board containing a mix of transports, in
// the shape a real database has after years of the old SSH lane.
func seedLegacyTransportBoard(t *testing.T, home string) {
	t.Helper()
	dir := filepath.Join(home, "kanban", "boards", "legacy")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// ListBoards reads board.json to discover a board.
	if err := os.WriteFile(filepath.Join(dir, "board.json"),
		[]byte(`{"slug":"legacy","name":"Legacy"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY, title TEXT, body TEXT, status TEXT,
		workspace_path TEXT, workspace_transport TEXT, workspace_ssh_target TEXT,
		result TEXT)`); err != nil {
		t.Fatal(err)
	}
	rows := []struct{ id, status, transport, path, target string }{
		// The dangerous case: a card in review on ssh. Approve is the only way
		// out of review, so leaving it on ssh would strand it forever.
		{"t_review", "review", "ssh", "/Users/me/saas", "mac-tailscale"},
		{"t_review_sub", "review", "ssh", "/Users/me/saas/gadjian", "mac-tailscale"},
		{"t_todo", "todo", "ssh", "/Users/me/saas", "mac-tailscale"},
		{"t_done", "done", "ssh", "/Users/me/saas", "mac-tailscale"},
		// Already migrated; must be left exactly as-is.
		{"t_nodeagent", "review", "node-agent", "/Users/me/saas", "mac-tailscale"},
		// Local tasks have no transport and are dispatched locally.
		{"t_local", "done", "", "/home/me/app", ""},
	}
	for _, r := range rows {
		// Column order matters: the INSERT names the columns explicitly, so a
		// mismatch here would silently write a path into the transport column
		// and the migration would correctly find nothing to do.
		if _, err := db.Exec(`INSERT OR REPLACE INTO tasks
			(id, title, body, status, workspace_path, workspace_transport, workspace_ssh_target, result)
			VALUES (?, 'x', '', ?, ?, ?, ?, '')`, r.id, r.status, r.path, r.transport, r.target); err != nil {
			t.Fatal(err)
		}
	}
}

// assertSeedWroteColumns guards the fixture itself: a mis-ordered INSERT would
// make the migration tests pass for the wrong reason (nothing to migrate).
func assertSeedWroteColumns(t *testing.T, home string) {
	t.Helper()
	transport, target, _ := readTransport(t, home, "t_review")
	if transport != "ssh" {
		t.Fatalf("fixture broken: t_review transport = %q, want \"ssh\"", transport)
	}
	if target != "mac-tailscale" {
		t.Fatalf("fixture broken: t_review target = %q, want \"mac-tailscale\"", target)
	}
}

func readTransport(t *testing.T, home, id string) (transport, target, status string) {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(home, "kanban", "boards", "legacy", "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var tr, tg, st sql.NullString
	if err := db.QueryRow(`SELECT workspace_transport, workspace_ssh_target, status FROM tasks WHERE id=?`, id).
		Scan(&tr, &tg, &st); err != nil {
		t.Fatal(err)
	}
	return tr.String, tg.String, st.String
}

func TestMigrateRetiredTransportRewritesSSH(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedLegacyTransportBoard(t, home)
	assertSeedWroteColumns(t, home)

	n, err := MigrateRetiredTransport(TransportForExistingPath)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Three ssh rows: review, review-sub, todo, done = 4 actually.
	if n != 4 {
		t.Fatalf("migrated %d, want 4", n)
	}

	// The stranded review cards are the point of the migration.
	for _, id := range []string{"t_review", "t_review_sub"} {
		transport, target, status := readTransport(t, home, id)
		if transport != "node-agent" {
			t.Errorf("%s transport = %q, want node-agent", id, transport)
		}
		if target != "mac-tailscale" {
			t.Errorf("%s target = %q, want the preserved mac-tailscale", id, target)
		}
		// Status must be untouched: this is a transport rewrite, not a state change.
		if status != "review" {
			t.Errorf("%s status = %q, want review unchanged", id, status)
		}
	}

	// An already-migrated row is left alone.
	transport, target, _ := readTransport(t, home, "t_nodeagent")
	if transport != "node-agent" || target != "mac-tailscale" {
		t.Errorf("t_nodeagent = (%q,%q), want untouched", transport, target)
	}
	// A local task keeps no transport.
	transport, _, _ = readTransport(t, home, "t_local")
	if transport != "" {
		t.Errorf("t_local transport = %q, want empty", transport)
	}
}

func TestMigrateRetiredTransportIsIdempotent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedLegacyTransportBoard(t, home)
	assertSeedWroteColumns(t, home)

	first, err := MigrateRetiredTransport(TransportForExistingPath)
	if err != nil {
		t.Fatal(err)
	}
	second, err := MigrateRetiredTransport(TransportForExistingPath)
	if err != nil {
		t.Fatal(err)
	}
	if first == 0 {
		t.Fatal("first migration did nothing")
	}
	if second != 0 {
		t.Fatalf("second migration rewrote %d rows; it must be a no-op", second)
	}
	if n, err := LegacyTransportTaskCount(); err != nil {
		t.Fatal(err)
	} else if n != 0 {
		t.Fatalf("%d tasks still carry the retired transport", n)
	}
}

func TestMigrateRetiredTransportWithNoLegacyRows(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedLegacyTransportBoard(t, home)
	assertSeedWroteColumns(t, home)
	if _, err := MigrateRetiredTransport(TransportForExistingPath); err != nil {
		t.Fatal(err)
	}
	// A board in the already-migrated state must not error or report work.
	n, err := MigrateRetiredTransport(TransportForExistingPath)
	if err != nil {
		t.Fatalf("migration on a clean board: %v", err)
	}
	if n != 0 {
		t.Fatalf("clean board reported %d migrations", n)
	}
}

func TestLegacyTransportTaskCountSeesLegacyRows(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedLegacyTransportBoard(t, home)
	assertSeedWroteColumns(t, home)
	n, err := LegacyTransportTaskCount()
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 {
		t.Fatalf("counted %d legacy rows, want 4", n)
	}
}

// TestMigrateRetiredTransportKeepsExistingTarget proves an existing target is
// not overwritten. Re-resolving could move a card to a different worker, which
// would silently run the review gate somewhere else.
func TestMigrateRetiredTransportKeepsExistingTarget(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedLegacyTransportBoard(t, home)
	assertSeedWroteColumns(t, home)

	db, err := sql.Open("sqlite", filepath.Join(home, "kanban", "boards", "legacy", "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE tasks SET workspace_ssh_target='windows-tailscale' WHERE id='t_review'`); err != nil {
		t.Fatal(err)
	}
	db.Close()

	if _, err := MigrateRetiredTransport(TransportForExistingPath); err != nil {
		t.Fatal(err)
	}
	_, target, _ := readTransport(t, home, "t_review")
	if target != "windows-tailscale" {
		t.Fatalf("target = %q, want the stored windows-tailscale to be preserved", target)
	}
}

func TestTransportForExistingPath(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	cases := []struct {
		name, path, existing, wantTransport, wantTarget string
	}{
		{
			name: "mac path with no target resolves via registry",
			path: "/Users/me/project", existing: "",
			// No registry in a bare temp home, but the /Users/ prefix forces
			// node-agent rather than a local dispatch that cannot work.
			wantTransport: "node-agent", wantTarget: "mac-tailscale",
		},
		{
			name: "existing target wins over resolution",
			path: "/Users/me/project", existing: "custom-node",
			wantTransport: "node-agent", wantTarget: "custom-node",
		},
		{
			name: "windows path resolves to the windows node",
			path: `C:\Development\app`, existing: "",
			wantTransport: "node-agent", wantTarget: "windows-tailscale",
		},
		{
			name: "local path with no target stays local",
			path: "/home/me/app", existing: "",
			wantTransport: "", wantTarget: "",
		},
		{
			name: "local path with a stale target keeps the target",
			path: "/home/me/app", existing: "mac-tailscale",
			wantTransport: "node-agent", wantTarget: "mac-tailscale",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			transport, target := TransportForExistingPath(tc.path, tc.existing)
			if transport != tc.wantTransport || target != tc.wantTarget {
				t.Fatalf("got (%q,%q) want (%q,%q)", transport, target, tc.wantTransport, tc.wantTarget)
			}
		})
	}
}
