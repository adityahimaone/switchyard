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

// TaskQuery controls server-side filtering/pagination.
type TaskQuery struct {
	Status     string
	Assignee   string
	Q          string
	Unassigned bool
	Limit      int
	Offset     int
}

func ensureImportSchema(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT,
		status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT,
		created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER,
		workspace_kind TEXT NOT NULL DEFAULT 'scratch', workspace_transport TEXT,
		workspace_ssh_target TEXT, workspace_path TEXT, result TEXT,
		consecutive_failures INTEGER NOT NULL DEFAULT 0, last_failure_error TEXT
	);
	CREATE TABLE IF NOT EXISTS task_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL,
		payload TEXT, created_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS task_comments (
		id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL,
		body TEXT NOT NULL, created_at INTEGER NOT NULL
	);`)
	return err
}

func ensurePositionColumn(db *sql.DB) error {
	if _, err := db.Exec(`ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0`); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return err
	}
	return nil
}

func taskSelectCols() string {
	// Keep column order synced with ListTasks scan.
	return `id, title, COALESCE(body,''), status, priority, COALESCE(assignee,''), COALESCE(executor,'auto'), COALESCE(command,''),
	        COALESCE(execution_mode,'direct'), COALESCE(max_iterations,1),
	        workspace_kind, COALESCE(workspace_path,''), COALESCE(result,''),
	        COALESCE(created_by,''), created_at, started_at, completed_at,
	        consecutive_failures, COALESCE(last_failure_error,''), COALESCE(execution_meta,'')`
}

func scanTask(rows *sql.Rows) (Task, error) {
	var t Task
	var started, completed sql.NullInt64
	if err := rows.Scan(&t.ID, &t.Title, &t.Body, &t.Status, &t.Priority, &t.Assignee, &t.Executor, &t.Command, &t.ExecutionMode, &t.MaxIterations,
		&t.WorkspaceKind, &t.WorkspacePath, &t.Result, &t.CreatedBy, &t.CreatedAt,
		&started, &completed, &t.Failures, &t.LastError, &t.ExecutionMeta); err != nil {
		return t, err
	}
	if started.Valid {
		v := started.Int64
		t.StartedAt = &v
	}
	if completed.Valid {
		v := completed.Int64
		t.CompletedAt = &v
	}
	return t, nil
}

// ListTasksQuery returns filtered tasks with total count (before pagination).
func ListTasksQuery(slug string, q TaskQuery) ([]Task, int, error) {
	if q.Unassigned && q.Assignee != "" {
		return nil, 0, fmt.Errorf("assignee and unassigned are mutually exclusive")
	}
	if q.Status != "" && !ValidStatuses[q.Status] {
		return nil, 0, fmt.Errorf("invalid status %q", q.Status)
	}
	if q.Limit < 0 || q.Offset < 0 {
		return nil, 0, fmt.Errorf("limit/offset must be >= 0")
	}
	db, err := openDB(slug)
	if err != nil {
		return nil, 0, err
	}
	defer db.Close()

	where := []string{"1=1"}
	args := []any{}
	if q.Status != "" {
		where = append(where, "status = ?")
		args = append(args, q.Status)
	}
	if q.Unassigned {
		where = append(where, "COALESCE(assignee,'') = ''")
	} else if q.Assignee != "" {
		where = append(where, "assignee = ?")
		args = append(args, q.Assignee)
	}
	if strings.TrimSpace(q.Q) != "" {
		needle := "%" + strings.TrimSpace(q.Q) + "%"
		where = append(where, "(title LIKE ? COLLATE NOCASE OR COALESCE(body,'') LIKE ? COLLATE NOCASE OR id LIKE ? COLLATE NOCASE OR COALESCE(result,'') LIKE ? COLLATE NOCASE)")
		args = append(args, needle, needle, needle, needle)
	}
	w := strings.Join(where, " AND ")
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM tasks WHERE %s`, w)
	var total int
	if err := db.QueryRow(countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	order := `ORDER BY COALESCE(position,0) ASC, priority DESC, created_at DESC, id ASC`
	sel := fmt.Sprintf(`SELECT %s FROM tasks WHERE %s %s`, taskSelectCols(), w, order)
	if q.Limit > 0 {
		sel += fmt.Sprintf(` LIMIT %d`, q.Limit)
		if q.Offset > 0 {
			sel += fmt.Sprintf(` OFFSET %d`, q.Offset)
		}
	} else if q.Offset > 0 {
		// Explicit offset with no limit still applies.
		sel += fmt.Sprintf(` LIMIT -1 OFFSET %d`, q.Offset)
	}
	rows, err := db.Query(sel, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}

// ReorderTasks persists a new global order. Partial order keeps remaining tasks
// in their current position order.
func ReorderTasks(slug string, order []string) error {
	if len(order) == 0 {
		return fmt.Errorf("order must not be empty")
	}
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	// Validate every id exists, and collect missing.
	existing := map[string]int{}
	rows, err := db.Query(`SELECT id, COALESCE(position,0), created_at FROM tasks ORDER BY COALESCE(position,0) ASC, created_at ASC, id ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var all []struct {
		id  string
		pos int
		at  int64
	}
	for rows.Next() {
		var id string
		var pos int
		var at int64
		if err := rows.Scan(&id, &pos, &at); err != nil {
			return err
		}
		existing[id] = pos
		all = append(all, struct {
			id  string
			pos int
			at  int64
		}{id, pos, at})
	}
	for _, id := range order {
		if _, ok := existing[id]; !ok {
			return fmt.Errorf("unknown task %q", id)
		}
	}
	seen := map[string]bool{}
	ordered := []string{}
	for _, id := range order {
		if seen[id] {
			continue
		}
		seen[id] = true
		ordered = append(ordered, id)
	}
	// Append remaining by old position order.
	for _, r := range all {
		if !seen[r.id] {
			ordered = append(ordered, r.id)
		}
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ordered {
		if _, err := tx.Exec(`UPDATE tasks SET position = ? WHERE id = ?`, i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// BulkTransition moves multiple tasks to the same target status.
// Returns slices of moved ids and skipped ids (not found or guard-refused).
func BulkTransition(slug string, ids []string, to string) ([]string, []string, error) {
	if len(ids) == 0 {
		return nil, nil, fmt.Errorf("ids must not be empty")
	}
	if !ValidStatuses[to] {
		return nil, nil, fmt.Errorf("invalid status %q", to)
	}
	if to == "running" {
		return nil, nil, fmt.Errorf("status 'running' is dispatcher-owned")
	}
	db, err := openDB(slug)
	if err != nil {
		return nil, nil, err
	}
	defer db.Close()
	var moved, skipped []string
	// Keep DB work minimal and reuse StatusTransition per row only via raw SQL
	// so we can batch without re-opening DB. Mimic StatusTransition guards:
	// - task must exist
	// - if current == "running" only blocked/done/review allowed
	now := time.Now().Unix()
	for _, id := range ids {
		var cur string
		if err := db.QueryRow(`SELECT status FROM tasks WHERE id=?`, id).Scan(&cur); err != nil {
			skipped = append(skipped, id)
			continue
		}
		if cur == "running" && to != "blocked" && to != "done" && to != "review" {
			skipped = append(skipped, id)
			continue
		}
		var completed any
		if to == "done" || to == "archived" {
			completed = now
		}
		if _, err := db.Exec(`UPDATE tasks SET status=?, completed_at=COALESCE(?, completed_at) WHERE id=?`, to, completed, id); err != nil {
			skipped = append(skipped, id)
			continue
		}
		_ = insertEvent(db, id, "status_changed", map[string]any{"source": "board-ui-bulk", "from": cur, "to": to})
		moved = append(moved, id)
	}
	if len(moved) > 0 {
		broadcastEvent("task_updated", map[string]any{"board": slug, "count": len(moved)})
	}
	return moved, skipped, nil
}

// BulkAssign applies existing profile validation and running-task guard to each id.
func BulkAssign(slug string, ids []string, profile string) error {
	if len(ids) == 0 {
		return fmt.Errorf("ids must not be empty")
	}
	for _, id := range ids {
		if err := Assign(slug, id, profile); err != nil {
			return fmt.Errorf("assign %s: %w", id, err)
		}
	}
	return nil
}

// BoardSnapshot is the portable board export shape.
type BoardSnapshot struct {
	Board    Board            `json:"board"`
	Tasks    []Task           `json:"tasks"`
	Events   []TaskEvent      `json:"events"`
	Comments []TaskComment    `json:"comments"`
	Bindings []HarnessBinding `json:"harness_bindings,omitempty"`
}

func slugValid(s string) bool {
	if strings.TrimSpace(s) == "" {
		return false
	}
	return !strings.ContainsAny(s, " /\\")
}

// ExportBoard dumps board.json + tasks + all events/comments.
func ExportBoard(slug string) (*BoardSnapshot, error) {
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	boards, err := ListBoards()
	if err != nil {
		return nil, err
	}
	var b Board
	found := false
	for _, x := range boards {
		if x.Slug == slug {
			b = x
			found = true
			break
		}
	}
	if !found {
		// Fallback: at least return slug if ListBoards missed (e.g. legacy default without board.json).
		b = Board{Slug: slug}
		if raw, err := os.ReadFile(filepath.Join(boardDir(slug), "board.json")); err == nil {
			_ = json.Unmarshal(raw, &b)
		}
	}
	tasks, err := ListTasks(slug)
	if err != nil {
		return nil, err
	}
	// Gather events/comments for every task (limit already handled by Export size; no truncation here).
	events := []TaskEvent{}
	comments := []TaskComment{}
	for _, t := range tasks {
		evs, err := TaskEvents(slug, t.ID)
		if err != nil {
			return nil, err
		}
		events = append(events, evs...)
		cs, err := ListComments(slug, t.ID)
		if err != nil {
			return nil, err
		}
		comments = append(comments, cs...)
	}
	sort.Slice(events, func(i, j int) bool { return events[i].ID < events[j].ID })
	sort.Slice(comments, func(i, j int) bool { return comments[i].ID < comments[j].ID })
	bindings := []HarnessBinding{}
	rows, err := db.Query(`SELECT card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status FROM harness_bindings ORDER BY card_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var binding HarnessBinding
		if err := rows.Scan(&binding.CardID, &binding.WorkspacePath, &binding.HarnessWorkspaceID, &binding.HarnessSessionID, &binding.LastTurnSeq, &binding.LastCommentID, &binding.Status); err != nil {
			return nil, err
		}
		bindings = append(bindings, binding)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &BoardSnapshot{Board: b, Tasks: tasks, Events: events, Comments: comments, Bindings: bindings}, nil
}

// ImportBoard restores a snapshot. Creates board.json if missing, then
// inserts tasks row-by-row with payload/event replay. Returns (created, ids, err).
func ImportBoard(snap *BoardSnapshot) (bool, []string, error) {
	if snap == nil {
		return false, nil, fmt.Errorf("snapshot required")
	}
	slug := strings.ToLower(strings.TrimSpace(snap.Board.Slug))
	if !slugValid(slug) {
		return false, nil, fmt.Errorf("invalid slug %q", snap.Board.Slug)
	}
	if snap.Board.Slug != "" && snap.Board.Slug != slug {
		// normalize: caller may have passed display slug vs stored.
		snap.Board.Slug = slug
	}
	// Validate tasks and session bindings before touching disk.
	tasksByID := make(map[string]Task, len(snap.Tasks))
	for _, t := range snap.Tasks {
		if strings.TrimSpace(t.ID) == "" {
			return false, nil, fmt.Errorf("task id required (title=%q)", t.Title)
		}
		if strings.TrimSpace(t.Title) == "" {
			return false, nil, fmt.Errorf("title required (id=%q)", t.ID)
		}
		if !ValidStatuses[t.Status] {
			return false, nil, fmt.Errorf("invalid status %q for task %q", t.Status, t.ID)
		}
		if t.Status == "running" {
			return false, nil, fmt.Errorf("task %q has dispatcher-owned status running", t.ID)
		}
		tasksByID[t.ID] = t
	}
	maxCommentID := make(map[string]int64)
	for _, comment := range snap.Comments {
		if comment.ID > maxCommentID[comment.TaskID] {
			maxCommentID[comment.TaskID] = comment.ID
		}
	}
	for _, binding := range snap.Bindings {
		task, ok := tasksByID[binding.CardID]
		if !ok {
			return false, nil, fmt.Errorf("harness binding references unknown card %q", binding.CardID)
		}
		if binding.WorkspacePath == "" || filepath.Clean(binding.WorkspacePath) != filepath.Clean(task.WorkspacePath) {
			return false, nil, fmt.Errorf("harness binding workspace mismatch for card %q", binding.CardID)
		}
		if binding.HarnessSessionID == "" || binding.LastTurnSeq < -1 || binding.LastCommentID < 0 || binding.LastCommentID > maxCommentID[binding.CardID] {
			return false, nil, fmt.Errorf("invalid harness binding cursors for card %q", binding.CardID)
		}
		switch binding.Status {
		case "active", "idle", "error":
		default:
			return false, nil, fmt.Errorf("invalid harness binding status %q for card %q", binding.Status, binding.CardID)
		}
	}
	dir := filepath.Dir(BoardDBPath(slug))
	created := false
	if _, err := os.Stat(filepath.Join(dir, "board.json")); err != nil {
		if snap.Board.Name == "" {
			snap.Board.Name = slug
		}
		if _, err := CreateBoard(slug, snap.Board.Name, snap.Board.Icon, snap.Board.Color); err != nil {
			return false, nil, err
		}
		created = true
	}
	if _, err := os.Stat(BoardDBPath(slug)); os.IsNotExist(err) {
		if err := os.MkdirAll(filepath.Dir(BoardDBPath(slug)), 0o755); err != nil {
			return created, nil, err
		}
		seedDB, err := sql.Open("sqlite", BoardDBPath(slug))
		if err != nil {
			return created, nil, err
		}
		if err := ensureImportSchema(seedDB); err != nil {
			seedDB.Close()
			return created, nil, err
		}
		seedDB.Close()
	}
	db, err := openDB(slug)
	if err != nil {
		return created, nil, err
	}
	defer db.Close()
	ids := []string{}
	for _, t := range snap.Tasks {
		// Ensure position column exists for snap containing it.
		_ = ensurePositionColumn(db)
		// Upsert by id. Keep created_by/created_at from snap when present.
		var exists int
		if err := db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=?`, t.ID).Scan(&exists); err != nil {
			return created, nil, err
		}
		if exists == 0 {
			if t.CreatedAt == 0 {
				t.CreatedAt = time.Now().Unix()
			}
			if t.CreatedBy == "" {
				t.CreatedBy = "board-import"
			}
			if t.WorkspaceKind == "" {
				t.WorkspaceKind = "scratch"
			}
			if t.Executor == "" {
				t.Executor = "auto"
			}
			_, err = db.Exec(`INSERT INTO tasks (id, title, body, status, priority, assignee, executor, command, execution_mode, max_iterations, workspace_kind, workspace_path, created_by, created_at, started_at, completed_at, consecutive_failures, last_failure_error)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				t.ID, t.Title, t.Body, t.Status, t.Priority, t.Assignee, t.Executor, t.Command, t.ExecutionMode, t.MaxIterations, t.WorkspaceKind, t.WorkspacePath, t.CreatedBy, t.CreatedAt, t.StartedAt, t.CompletedAt, t.Failures, t.LastError)
			if err != nil {
				return created, nil, err
			}
		} else {
			// Overwrite main fields; keep identity.
			if _, err := db.Exec(`UPDATE tasks SET title=?, body=?, status=?, priority=?, assignee=?, executor=?, command=?, execution_mode=?, max_iterations=?, workspace_kind=?, workspace_path=?, result=?, created_by=?, created_at=?, started_at=?, completed_at=?, consecutive_failures=?, last_failure_error=? WHERE id=?`,
				t.Title, t.Body, t.Status, t.Priority, t.Assignee, t.Executor, t.Command, t.ExecutionMode, t.MaxIterations, t.WorkspaceKind, t.WorkspacePath, t.Result, t.CreatedBy, t.CreatedAt, t.StartedAt, t.CompletedAt, t.Failures, t.LastError, t.ID); err != nil {
				return created, nil, err
			}
		}
		ids = append(ids, t.ID)
	}
	// Replay events/comments if board was just created (or even if it existed — append only dedup by id fails on seq).
	// Detect payload column name.
	payloadCol := "payload"
	if cols, err := db.Query(`PRAGMA table_info(task_events)`); err == nil {
		for cols.Next() {
			var cid int
			var cname, ctype string
			var nn int
			var dflt any
			var pk int
			_ = cols.Scan(&cid, &cname, &ctype, &nn, &dflt, &pk)
			if cname == "payload_json" {
				payloadCol = "payload_json"
			}
		}
		cols.Close()
	}
	// Only insert events for tasks in this snapshot, and only if not already present by task_id+kind+payload combo is too slow — just check if any events exist under those task_ids.
	// Simple: if a task's latest event id from snap is beyond current max, insert snap events for that task.
	for _, ev := range snap.Events {
		var cnt int
		_ = db.QueryRow(`SELECT COUNT(*) FROM task_events WHERE id=?`, ev.ID).Scan(&cnt)
		if cnt > 0 {
			continue
		}
		q := fmt.Sprintf(`INSERT INTO task_events (id, task_id, kind, %s, created_at) VALUES (?,?,?,?,?)`, payloadCol)
		_, _ = db.Exec(q, ev.ID, ev.TaskID, ev.Kind, ev.Payload, ev.CreatedAt)
	}
	for _, c := range snap.Comments {
		var cnt int
		_ = db.QueryRow(`SELECT COUNT(*) FROM task_comments WHERE id=?`, c.ID).Scan(&cnt)
		if cnt > 0 {
			continue
		}
		if _, err := db.Exec(`INSERT INTO task_comments (id, task_id, author, body, created_at) VALUES (?,?,?,?,?)`, c.ID, c.TaskID, c.Author, c.Body, c.CreatedAt); err != nil {
			return created, nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, binding := range snap.Bindings {
		result, err := db.Exec(`INSERT INTO harness_bindings (card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(card_id) DO NOTHING`, binding.CardID, binding.WorkspacePath, binding.HarnessWorkspaceID, binding.HarnessSessionID, binding.LastTurnSeq, binding.LastCommentID, binding.Status, now, now)
		if err != nil {
			return created, nil, err
		}
		if inserted, _ := result.RowsAffected(); inserted == 1 {
			_, _ = db.Exec(`UPDATE tasks SET dsh_session_id=? WHERE id=?`, binding.HarnessSessionID, binding.CardID)
		}
	}
	return created, ids, nil
}
