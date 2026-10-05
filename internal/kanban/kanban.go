package kanban

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// Valid statuses (mirror hermes kanban_db.py VALID_STATUSES).
var ValidStatuses = map[string]bool{
	"triage": true, "todo": true, "scheduled": true, "ready": true, "running": true,
	"blocked": true, "review": true, "done": true, "archived": true,
}

var ValidExecutors = map[string]bool{
	"auto": true, "hermes": true, "codex": true, "commandcode": true, "dsh": true, "omp": true, "shell": true,
}

const maxTaskIterations = 24

// Columns the dispatcher owns — board UI must never write these.
var dispatcherOwned = []string{"claim_lock", "consecutive_failures", "worker_pid", "current_run_id", "last_heartbeat_at"}

type Board struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Icon           string `json:"icon"`
	Color          string `json:"color"`
	DefaultWorkdir string `json:"default_workdir"`
}

type Task struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Body          string `json:"body"`
	Status        string `json:"status"`
	Priority      int    `json:"priority"`
	Assignee      string `json:"assignee"`
	Executor      string `json:"executor"`
	Command       string `json:"command,omitempty"`
	ExecutionMode string `json:"execution_mode,omitempty"`
	MaxIterations int    `json:"max_iterations,omitempty"`
	WorkspaceKind string `json:"workspace_kind"`
	WorkspacePath string `json:"workspace_path"`
	Result        string `json:"result"`
	CreatedBy     string `json:"created_by"`
	CreatedAt     int64  `json:"created_at"`
	StartedAt     *int64 `json:"started_at"`
	CompletedAt   *int64 `json:"completed_at"`
	Failures      int    `json:"consecutive_failures"`
	LastError     string `json:"last_failure_error"`
	ExecutionMeta string `json:"execution_meta,omitempty"`
	// Declared edit scope as globs relative to WorkspacePath. Used to detect
	// two tasks that would edit the same files. Advisory for review, enforced
	// for scheduling by the claim transaction.
	Paths []string `json:"paths,omitempty"`
	// DependsOn lists task ids that must reach done before this one is
	// claimable. Applied after the row is written, since a dependency can only
	// reference a task that already exists.
	DependsOn []string `json:"depends_on,omitempty"`
	// Quality gate run on the worker after a successful executor run.
	GateCommand string `json:"gate_command,omitempty"`
	GateStatus  string `json:"gate_status,omitempty"` // "", running, passed, failed
	GateOutput  string `json:"gate_output,omitempty"`
	// Verification profile: which ladder rung this task must pass before a
	// human may approve it. "" means auto — routed from the diff the reviewer
	// is about to see, and recorded in VerifyProfileEffective once decided.
	// An explicit value always wins over routing.
	VerifyProfile string `json:"verify_profile,omitempty"`
	// VerifyProfileEffective is what routing actually chose. Kept separate from
	// VerifyProfile so an unset card still shows its verdict in the UI, and so
	// "the hook silently failed" stays distinguishable from "nothing ran".
	VerifyProfileEffective string `json:"verify_profile_effective,omitempty"`
	VerifyStatus           string `json:"verify_status,omitempty"` // "", skipped, running, passed, failed, unavailable
	VerifyOutput           string `json:"verify_output,omitempty"`
	// DesignSource names a committed .pen file the task must implement verbatim.
	// Empty for the overwhelming majority of cards, and then pen is never
	// invoked and no agent-day is spent.
	DesignSource string `json:"design_source,omitempty"`
	// manual: wait for the dispatcher poll. now: claim on create.
	StartMode string `json:"start_mode,omitempty"`
	// Retry counter. Attempt 1 is the original run.
	Attempt int `json:"attempt,omitempty"`
	// "workspace" runs in the shared checkout; "worktree" runs in a dedicated
	// git worktree on its own branch. Set at create time, not by the user
	// mid-flight, because switching would strand whatever is already on disk.
	Isolation string `json:"isolation,omitempty"`
	// The branch and worktree path created for this task. Empty for a
	// workspace-isolated task.
	Branch       string `json:"branch,omitempty"`
	WorktreePath string `json:"worktree_path,omitempty"`
}

type TaskEvent struct {
	ID        int64  `json:"id"`
	TaskID    string `json:"task_id"`
	Kind      string `json:"kind"`
	Payload   string `json:"payload"`
	CreatedAt int64  `json:"created_at"`
}

func hermesHome() string {
	if h := os.Getenv("HERMES_HOME"); h != "" {
		return h
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".hermes")
}

func HermesHome() string { return hermesHome() }

func boardDir(slug string) string {
	if slug == "default" {
		return filepath.Join(hermesHome())
	}
	return filepath.Join(hermesHome(), "kanban", "boards", slug)
}

func BoardDBPath(slug string) string { return filepath.Join(boardDir(slug), "kanban.db") }

// Workspace lives in ~/.hermes/workspaces.json (shared with hermes CLI /
// node-agent). Extra on-disk keys (luvus_workspace_id, remote, ...) are
// preserved by workspace.go's merge on save. Runtime-only fields are
// populated by PingWorkspace/ListWorkspaces only.
type Workspace struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Path            string         `json:"path"`
	Host            string         `json:"host"`
	OS              string         `json:"os,omitempty"`
	Kind            string         `json:"kind"`
	Note            string         `json:"note,omitempty"`
	Apps            []string       `json:"apps,omitempty"`
	CodeGraphApps   []CodeGraphApp `json:"codegraph_apps,omitempty"`
	CodeGraphHidden []string       `json:"codegraph_hidden,omitempty"`
	Status          string         `json:"status,omitempty"`
	StatusMsg       string         `json:"status_message,omitempty"`
	PingMs          *float64       `json:"ping_ms,omitempty"`
	// RepoIdentity is the workspace's stable repository identity, normally the
	// git common directory. It is the namespace path leases are scoped to, so
	// two workspace entries pointing at one repo contend for the same files.
	// Empty means "not resolved yet", and leases fall back to the path.
	RepoIdentity string `json:"repo_identity,omitempty"`
}

type Profile struct {
	Name      string `json:"name"`
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	Active    bool   `json:"active"`
	Valid     bool   `json:"valid"`
	AvatarURL string `json:"avatar_url,omitempty"`
	BaseURL   string `json:"base_url,omitempty"`
}

func openDB(slug string) (*sql.DB, error) {
	path := BoardDBPath(slug)
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("board %q not found: %w", slug, err)
	}
	// WAL + busy_timeout so hermes CLI and this server can share the file.
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // serialize writers; SQLite single-writer anyway
	if err := ensureTaskExecutionColumns(db); err != nil {
		db.Close()
		return nil, err
	}
	if err := ensurePositionColumn(db); err != nil {
		db.Close()
		return nil, err
	}
	if err := ensureHarnessBindingsSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	if err := ensurePathLeasesSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// ensurePathLeasesSchema creates the table backing declared edit scope.
//
// Leases are keyed by (glob, task_id) so one task can hold several, and carry a
// project column because the lease namespace is the repository rather than the
// workspace entry: two workspace records pointing at one repo must contend for
// the same paths.
func ensurePathLeasesSchema(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS path_leases (
		glob        TEXT NOT NULL,
		task_id     TEXT NOT NULL,
		project     TEXT NOT NULL,
		acquired_at INTEGER NOT NULL,
		PRIMARY KEY (glob, task_id)
	); CREATE INDEX IF NOT EXISTS idx_path_leases_project ON path_leases(project)`)
	return err
}

// MigrateBoardSchemaPublic applies the additive schema migrations to a board
// and returns how many orphan leases it swept.
//
// The dispatcher calls this before querying, because a query naming a column
// that does not exist yet fails outright, and the dispatch loop would otherwise
// skip the board in silence — a board that quietly stops dispatching is far
// worse than a logged error.
func MigrateBoardSchemaPublic(slug string) (int, error) {
	db, err := openDB(slug)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	return SweepOrphanLeases(db)
}

// ensureTaskExecutionColumns keeps boards created by older Hermes versions usable.
// These fields are additive and let the board select a concrete worker executor.
func ensureHarnessBindingsSchema(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS harness_bindings (
		card_id TEXT PRIMARY KEY,
		workspace_path TEXT NOT NULL,
		harness_workspace_id TEXT NOT NULL,
		harness_session_id TEXT NOT NULL,
		last_turn_seq INTEGER NOT NULL DEFAULT -1,
		last_comment_id INTEGER NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'active',
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_harness_bindings_session ON harness_bindings(harness_session_id);`); err != nil {
		return err
	}
	if _, err := db.Exec(`ALTER TABLE harness_bindings ADD COLUMN last_comment_id INTEGER NOT NULL DEFAULT 0`); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return err
	}
	// harness_kind keeps one card from confusing a dsh binding with a commandcode
	// one. It defaults to dsh so every pre-existing row stays valid with no backfill.
	if _, err := db.Exec(`ALTER TABLE harness_bindings ADD COLUMN harness_kind TEXT NOT NULL DEFAULT 'dsh'`); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return err
	}
	return nil
}

func ensureTaskExecutionColumns(db *sql.DB) error {
	for _, stmt := range []string{
		`ALTER TABLE tasks ADD COLUMN executor TEXT NOT NULL DEFAULT 'auto'`,
		`ALTER TABLE tasks ADD COLUMN command TEXT`,
		`ALTER TABLE tasks ADD COLUMN resolved_executor TEXT`,
		`ALTER TABLE tasks ADD COLUMN execution_meta TEXT`,
		`ALTER TABLE tasks ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'direct'`,
		`ALTER TABLE tasks ADD COLUMN max_iterations INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE tasks ADD COLUMN dsh_session_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN commandcode_session_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN omp_session_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN current_run_id TEXT`,
		// Routing columns the dispatcher and flow view read. Boards created by an
		// older Hermes lack them, and without these every task insert fails on
		// "no such column", which blocks board writes entirely.
		`ALTER TABLE tasks ADD COLUMN workspace_transport TEXT`,
		`ALTER TABLE tasks ADD COLUMN workspace_ssh_target TEXT`,
		// The SHA the review gate produced, recorded so an approve that
		// committed but failed to update the status can be recognised on retry.
		`ALTER TABLE tasks ADD COLUMN last_approve_commit TEXT`,
		// Declared edit scope, stored as a JSON array. Overlap between two
		// tasks' globs is decided in Go (pathscope.go), never in SQL.
		`ALTER TABLE tasks ADD COLUMN paths TEXT NOT NULL DEFAULT '[]'`,
		// Quality gate: a command run on the worker after a successful
		// executor run, before a human may approve. gate_run_id fences a late
		// result from a superseded run.
		`ALTER TABLE tasks ADD COLUMN gate_command TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN gate_status TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN gate_output TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN gate_run_id TEXT`,
		// Verification gate: which quality ladder rung this task must pass,
		// run on the worker after the executor succeeds, alongside the gate.
		// verify_run_id fences a late result from a superseded run, exactly as
		// gate_run_id does — the two are separate columns so a verify run and a
		// gate run can be in flight on the same task without colliding.
		//
		// verify_profile is what was asked for ("" = auto). verify_profile_effective
		// is what routing chose, kept apart so an auto-routed card still shows a
		// verdict and "nothing ran" stays distinguishable from "the hook failed".
		`ALTER TABLE tasks ADD COLUMN verify_profile TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN verify_profile_effective TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN verify_status TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN verify_output TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN verify_run_id TEXT`,
		// A committed .pen design this task implements verbatim. Empty for
		// every card that is not a design task.
		`ALTER TABLE tasks ADD COLUMN design_source TEXT NOT NULL DEFAULT ''`,
		// manual = wait for the dispatcher poll; now = claim on create.
		`ALTER TABLE tasks ADD COLUMN start_mode TEXT NOT NULL DEFAULT 'manual'`,
		// Incremented by retry. Attempt 1 is the original run.
		`ALTER TABLE tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1`,
		// Isolation mode and the worktree a task was given.
		//
		// 'workspace' (the default) runs the task in the shared checkout, which
		// is what every existing card does. 'worktree' runs it in a dedicated git
		// worktree under <repo>/.switchyard/<task-id> on its own branch, so two
		// tasks cannot interleave edits and the diff belongs to one task.
		`ALTER TABLE tasks ADD COLUMN isolation TEXT NOT NULL DEFAULT 'workspace'`,
		`ALTER TABLE tasks ADD COLUMN branch TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE tasks ADD COLUMN worktree_path TEXT NOT NULL DEFAULT ''`,
	} {
		if _, err := db.Exec(stmt); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			return err
		}
	}
	return nil
}

// ListBoards scans ~/.hermes/kanban/boards/*/board.json (+ legacy default kanban.db).
func ListBoards() ([]Board, error) {
	out := []Board{}
	root := filepath.Join(hermesHome(), "kanban", "boards")
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			metaPath := filepath.Join(root, e.Name(), "board.json")
			raw, err := os.ReadFile(metaPath)
			if err != nil {
				continue
			}
			var b Board
			if err := json.Unmarshal(raw, &b); err != nil {
				continue
			}
			out = append(out, b)
		}
	}
	// legacy default board — skip if a boards/default/board.json already provided it
	seen := map[string]bool{}
	for _, b := range out {
		seen[b.Slug] = true
	}
	if !seen["default"] {
		if _, err := os.Stat(filepath.Join(hermesHome(), "kanban.db")); err == nil {
			out = append(out, Board{Slug: "default", Name: "Default", Icon: "default"})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out, nil
}

type boardMeta struct {
	Archived bool `json:"archived"`
}

func (b Board) ArchivedSkip() bool {
	raw, err := os.ReadFile(filepath.Join(boardDir(b.Slug), "board.json"))
	if err != nil {
		return false
	}
	var m boardMeta
	if json.Unmarshal(raw, &m) == nil {
		return m.Archived
	}
	return false
}

func ListTasks(slug string) ([]Task, error) {
	out, _, err := ListTasksQuery(slug, TaskQuery{})
	return out, err
}

func CreateTask(slug string, t *Task) error {
	if strings.TrimSpace(t.Title) == "" {
		return fmt.Errorf("title required")
	}
	// Field caps, path scoping and control-character checks run before anything
	// is written, so a rejected task leaves no row behind. The same function
	// backs POST /tasks/validate, which is what keeps the dry run honest.
	if err := ValidateNewTaskError(t); err != nil {
		return err
	}
	if t.Status == "" {
		t.Status = "todo"
	}
	if !ValidStatuses[t.Status] {
		return fmt.Errorf("invalid status %q", t.Status)
	}
	if t.Status == "running" {
		return fmt.Errorf("status 'running' is dispatcher-owned; use todo/ready/triage")
	}
	if t.ID == "" {
		t.ID = newTaskID()
	}
	if t.CreatedBy == "" {
		t.CreatedBy = "board-ui"
	}
	if strings.TrimSpace(t.Executor) == "" {
		t.Executor = "auto"
	}
	if !ValidExecutors[t.Executor] {
		return fmt.Errorf("invalid executor %q", t.Executor)
	}
	if t.Executor == "shell" && strings.TrimSpace(t.ExecutionMode) == "" {
		t.ExecutionMode = "agentic"
	}
	if t.ExecutionMode == "" {
		t.ExecutionMode = "direct"
	}
	if t.ExecutionMode != "direct" && t.ExecutionMode != "agentic" {
		return fmt.Errorf("invalid execution mode %q", t.ExecutionMode)
	}
	if t.MaxIterations <= 0 {
		t.MaxIterations = 6
	}
	if t.MaxIterations > maxTaskIterations {
		return fmt.Errorf("max iterations cannot exceed %d", maxTaskIterations)
	}
	if t.Executor == "shell" && t.ExecutionMode == "direct" && strings.TrimSpace(t.Command) == "" {
		return fmt.Errorf("shell executor requires command")
	}
	if t.WorkspaceKind == "" {
		t.WorkspaceKind = "dir"
	}
	// Explicit workspace_path selected (existing behavior: dir workspace). Only
	// board tasks without a path fall back to a managed scratch dir.
	if t.WorkspacePath == "" {
		t.WorkspaceKind = "scratch"
	}
	// Fail closed for remote paths: hermes dispatcher on this VPS runs `mkdir`
	// on workspace_path locally. A Mac path like /Users/... does not exist here
	// and `mkdir /Users` fails with Permission denied (t_0b6b086c, t_03ede921).
	// The canonical stores for remote workspaces live in workspaces.json +
	// board.json default_workdir (both may point at /Users/...). Until the
	// dispatcher speaks SSH/node-agent, remote workspaces must be refused at
	// creation so the card never enters the respawn loop.
	transport, target, _ := transportForPath(t.WorkspacePath)
	if t.WorkspacePath != "" {
		if err := validateWorkspacePath(t.WorkspacePath); err != nil {
			return err
		}
	}
	t.Title = strings.TrimSpace(t.Title)
	t.CreatedAt = time.Now().Unix()
	// Normalize the new fields once, here, so what lands in the row is exactly
	// what the lease and gate logic will later read back.
	t.Paths = PathsParse(PathsJSON(t.Paths))
	if t.StartMode == "" {
		t.StartMode = "manual"
	}
	if t.Attempt < 1 {
		// Attempt 1 is the original run; a create is always attempt 1, so a
		// client-supplied higher number is not honoured here.
		t.Attempt = 1
	}
	if t.Isolation == "" {
		t.Isolation = "workspace"
	}
	// The branch and worktree path are derived at dispatch, once the task has
	// been claimed. A create must not be able to point itself at an arbitrary
	// path on a worker.
	t.Branch = ""
	t.WorktreePath = ""
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()

	// The row and its dependencies are written in one transaction. Doing the
	// INSERT first and the dependencies second would leave an orphan card
	// pointing at a task that does not exist whenever a dependency is rejected.
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec(`INSERT INTO tasks (id, title, body, status, priority, assignee, executor, command, execution_mode, max_iterations, workspace_kind, workspace_path, workspace_transport, workspace_ssh_target, created_by, created_at, paths, gate_command, start_mode, attempt, isolation, verify_profile, design_source)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.ID, t.Title, t.Body, t.Status, t.Priority, t.Assignee, t.Executor, t.Command, t.ExecutionMode, t.MaxIterations, t.WorkspaceKind, t.WorkspacePath, transport, target, t.CreatedBy, t.CreatedAt, PathsJSON(t.Paths), t.GateCommand, t.StartMode, t.Attempt, t.Isolation,
		// verify_profile_effective/verify_status are intentionally not inserted:
		// they are decided by routing after the run, not by the author of the card.
		t.VerifyProfile, t.DesignSource); err != nil {
		return err
	}
	if len(t.DependsOn) > 0 {
		if err := ensureDependenciesTx(tx); err != nil {
			return err
		}
		if err := AddTaskDependenciesDB(tx, t.ID, t.DependsOn); err != nil {
			return err
		}
		if err := insertEventTx(tx, t.ID, "dependencies_added",
			map[string]any{"source": "board-ui", "depends_on": t.DependsOn}); err != nil {
			return err
		}
	}
	if err := insertEventTx(tx, t.ID, "created", map[string]any{"source": "board-ui", "status": t.Status}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	broadcastEvent("task_created", map[string]any{"board": slug, "task_id": t.ID, "status": t.Status})
	return nil
}

// StatusTransition moves a task between board-managed statuses. Refuses to touch
// dispatcher-owned fields or an in-flight running task's claims.
// TaskStatus returns the current status of a task (or "" on miss).
func TaskStatus(slug, taskID string) (string, error) {
	db, err := openDB(slug)
	if err != nil {
		return "", err
	}
	defer db.Close()
	var cur string
	if err := db.QueryRow(`SELECT status FROM tasks WHERE id=?`, taskID).Scan(&cur); err != nil {
		return "", err
	}
	return cur, nil
}

func StatusTransition(slug, taskID, to string) error {
	if !ValidStatuses[to] {
		return fmt.Errorf("invalid status %q", to)
	}
	if to == "running" {
		return fmt.Errorf("status 'running' is dispatcher-owned")
	}
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	var current string
	if err := db.QueryRow(`SELECT status FROM tasks WHERE id=?`, taskID).Scan(&current); err != nil {
		return fmt.Errorf("task not found: %w", err)
	}
	if current == "running" && to != "blocked" && to != "done" && to != "review" {
		return fmt.Errorf("task is running (dispatcher-owned); allowed: blocked/done/review")
	}
	now := time.Now().Unix()
	var completed any
	if to == "done" || to == "archived" {
		completed = now
	}
	if _, err := db.Exec(`UPDATE tasks SET status=?, completed_at=COALESCE(?, completed_at) WHERE id=?`, to, completed, taskID); err != nil {
		return err
	}
	if err := insertEvent(db, taskID, "status_changed", map[string]any{"source": "board-ui", "from": current, "to": to}); err != nil {
		return err
	}
	broadcastEvent("status_changed", map[string]any{"task_id": taskID, "from": current, "to": to})
	return nil
}

func ArchiveTask(slug, taskID string) error { return StatusTransition(slug, taskID, "archived") }

// ForceStopTask releases a running task when no in-process cancel handle exists,
// such as a node-agent dispatch. Worker late results cannot revive blocked.
func ForceStopTask(slug, taskID string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	now := time.Now().Unix()
	res, err := db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, claim_lock=NULL,
		claim_expires=NULL, worker_pid=NULL, current_run_id=NULL,
		last_heartbeat_at=NULL, last_failure_error='force-stopped by user'
		WHERE id=? AND status='running'`, now, taskID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return fmt.Errorf("task is no longer running")
	}
	if err := insertEvent(db, taskID, "stopped", map[string]any{"source": "board-ui", "reason": "force-stopped by user"}); err != nil {
		return err
	}
	broadcastEvent("status_changed", map[string]any{"task_id": taskID, "to": "blocked"})
	return nil
}

func TaskEvents(slug, taskID string) ([]TaskEvent, error) {
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	// payload column is `payload` on this host, `payload_json` on newer hermes — probe.
	payloadCol := "payload"
	if rows2, err2 := db.Query(`PRAGMA table_info(task_events)`); err2 == nil {
		for rows2.Next() {
			var cid int
			var cname, ctype string
			var nn int
			var dflt any
			var pk int
			_ = rows2.Scan(&cid, &cname, &ctype, &nn, &dflt, &pk)
			if cname == "payload_json" {
				payloadCol = "payload_json"
			}
		}
		rows2.Close()
	}
	q := fmt.Sprintf(`SELECT id, task_id, kind, COALESCE(%s,''), created_at FROM task_events WHERE task_id=? ORDER BY id DESC LIMIT 100`, payloadCol)
	rows, err := db.Query(q, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TaskEvent{}
	for rows.Next() {
		var e TaskEvent
		if err := rows.Scan(&e.ID, &e.TaskID, &e.Kind, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func insertEvent(db *sql.DB, taskID, kind string, payload any) error {
	raw, _ := json.Marshal(payload)
	// hermes schema stores json payload in payload_json (newer) or payload (older)
	cols, err := db.Query(`PRAGMA table_info(task_events)`)
	if err != nil {
		return err
	}
	defer cols.Close()
	name := "payload"
	hasTS := false
	for cols.Next() {
		var cid int
		var cname, ctype string
		var notNull int
		var dflt any
		var pk int
		if err := cols.Scan(&cid, &cname, &ctype, &notNull, &dflt, &pk); err != nil {
			continue
		}
		if cname == "payload_json" {
			name = "payload_json"
		}
		if cname == "created_at" {
			hasTS = true
		}
	}
	if hasTS {
		q := fmt.Sprintf(`INSERT INTO task_events (task_id, kind, %s, created_at) VALUES (?,?,?,?)`, name)
		_, err = db.Exec(q, taskID, kind, string(raw), time.Now().Unix())
		return err
	}
	q := fmt.Sprintf(`INSERT INTO task_events (task_id, kind, %s) VALUES (?,?,?)`, name)
	_, err = db.Exec(q, taskID, kind, string(raw))
	return err
}

func newTaskID() string {
	b := time.Now().UnixNano()
	return fmt.Sprintf("t_%08x", b&0xffffffff)
}

// ListProfiles enumerates agent profiles: ~/.hermes/profiles/*/config.yaml plus
// the implicit "default" profile. Model name is parsed out of config.yaml.
// Valid marks whether the worker CLI would actually start with this profile —
// an unrecognized provider (e.g. "custom:host.name" typo) means every spawned
// task crashes with "Unknown provider" (protocol_violation loop).
// ProfileModel returns model bound to Switchyard profile. DSH receives this
// exact ID, keeping profile/model switching 1:1 across both apps.
func ProfileModel(name string) (string, error) {
	p, err := GetProfile(name)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(p.Model) == "" {
		return "", fmt.Errorf("profile %q has no model", name)
	}
	return p.Model, nil
}

func ListProfiles() ([]Profile, error) {
	out := []Profile{}
	active := ActiveProfile()
	root := filepath.Join(hermesHome(), "profiles")
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			p := Profile{Name: e.Name()}
			p.Active = e.Name() == active
			raw, err := os.ReadFile(filepath.Join(root, e.Name(), "config.yaml"))
			if err == nil {
				p.Model, p.Provider, p.BaseURL = parseModelYAML(string(raw))
			}
			p.Valid = profileValid(p.Provider)
			if hasAvatar(e.Name()) {
				p.AvatarURL = "/api/profiles/" + e.Name() + "/avatar"
			} else {
				p.AvatarURL = ProfileAvatarURL(e.Name())
			}
			out = append(out, p)
		}
	}
	// implicit default profile — read model from the top-level config
	def := Profile{Name: "default", Active: active == "default"}
	if raw, err := os.ReadFile(filepath.Join(hermesHome(), "config.yaml")); err == nil {
		def.Model, def.Provider, def.BaseURL = parseModelYAML(string(raw))
	}
	def.Valid = profileValid(def.Provider)
	if hasAvatar("default") {
		def.AvatarURL = "/api/profiles/default/avatar"
	} else {
		def.AvatarURL = ProfileAvatarURL("default")
	}
	out = append(out, def)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// profileValid mirrors hermes_cli provider registry: "custom" (base_url keyed),
// "auto", and the builtin names are accepted; anything else fails at worker
// startup with "Unknown provider".
func profileValid(provider string) bool {
	switch strings.TrimSpace(provider) {
	case "", "auto", "custom", "anthropic", "openai", "openrouter", "google", "groq", "deepseek", "mistral", "xai", "ollama":
		return true
	}
	return false
}

// parseModelYAML is a deliberately tiny `model: {default, provider}` reader —
// enough for the picker without a YAML dependency.
func parseModelYAML(src string) (model, provider, baseURL string) {
	inModel := false
	for _, line := range strings.Split(src, "\n") {
		trimmed := strings.TrimRight(line, " 	\r")
		switch {
		case strings.HasPrefix(trimmed, "model:"):
			inModel = true
		case inModel && strings.HasPrefix(trimmed, "  "):
			k, v, ok := strings.Cut(strings.TrimSpace(trimmed), ":")
			if !ok {
				continue
			}
			v = strings.Trim(strings.TrimSpace(v), `'"`)
			switch k {
			case "default":
				if model == "" {
					model = v
				}
			case "provider":
				if provider == "" {
					provider = v
				}
			case "base_url":
				if baseURL == "" {
					baseURL = v
				}
			}
		case inModel && !strings.HasPrefix(trimmed, " "):
			inModel = false
		}
	}
	return model, provider, baseURL
}

// Assign sets a task's assignee (agent profile). Refuses running tasks —
// the dispatcher owns claims on in-flight work — and profiles whose config
// would crash the worker at startup (invalid provider).
func Assign(slug, taskID, profile string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	var current string
	if err := db.QueryRow(`SELECT status FROM tasks WHERE id=?`, taskID).Scan(&current); err != nil {
		return fmt.Errorf("task not found: %w", err)
	}
	if current == "running" {
		return fmt.Errorf("task is running (dispatcher-owned); reclaim before reassigning")
	}
	profile = strings.TrimSpace(profile)
	if profile != "" {
		profiles, err := ListProfiles()
		if err != nil {
			return err
		}
		found := false
		for _, p := range profiles {
			if p.Name == profile {
				found = true
				if !p.Valid {
					return fmt.Errorf("profile %q has invalid provider %q — worker would crash (Unknown provider); fix the profile config first", p.Name, p.Provider)
				}
				break
			}
		}
		if !found {
			return fmt.Errorf("unknown profile %q", profile)
		}
	}
	if _, err := db.Exec(`UPDATE tasks SET assignee=? WHERE id=?`, profile, taskID); err != nil {
		return err
	}
	return insertEvent(db, taskID, "assigned", map[string]any{"source": "board-ui", "assignee": profile})
}

var _ = dispatcherOwned
