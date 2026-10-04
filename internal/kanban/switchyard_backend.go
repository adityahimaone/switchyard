package kanban

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type TaskRunUsage struct {
	InputTokens     int64 `json:"inputTokens"`
	OutputTokens    int64 `json:"outputTokens"`
	TotalTokens     int64 `json:"totalTokens"`
	CacheReadTokens int64 `json:"cacheReadTokens"`
}

type TaskRun struct {
	Index     int          `json:"index"`
	StartedAt int64        `json:"started_at"`
	EndedAt   int64        `json:"ended_at"`
	Outcome   string       `json:"outcome"`
	Usage     TaskRunUsage `json:"usage"`
	Events    []TaskEvent  `json:"events"`
}

func usageFromJSON(raw string) (TaskRunUsage, bool) {
	values := []any{}
	var value any
	if json.Unmarshal([]byte(raw), &value) == nil {
		values = append(values, value)
	} else {
		for _, line := range strings.Split(raw, "\n") {
			var item any
			if json.Unmarshal([]byte(strings.TrimSpace(line)), &item) == nil {
				values = append(values, item)
			}
		}
		if len(values) == 0 {
			for pos := 0; pos < len(raw); pos++ {
				if raw[pos] != '{' && raw[pos] != '[' {
					continue
				}
				dec := json.NewDecoder(strings.NewReader(raw[pos:]))
				var item any
				if dec.Decode(&item) != nil {
					continue
				}
				values = append(values, item)
				if consumed := int(dec.InputOffset()); consumed > 0 {
					pos += consumed - 1
				}
			}
		}
	}
	if len(values) == 0 {
		return TaskRunUsage{}, false
	}
	var walk func(any) (TaskRunUsage, bool)
	walk = func(v any) (TaskRunUsage, bool) {
		if obj, ok := v.(map[string]any); ok {
			u := TaskRunUsage{}
			found := false
			for key, value := range obj {
				if n, ok := value.(float64); ok {
					switch key {
					case "inputTokens", "input_tokens":
						u.InputTokens = int64(n)
						found = true
					case "outputTokens", "output_tokens":
						u.OutputTokens = int64(n)
						found = true
					case "totalTokens", "total_tokens":
						u.TotalTokens = int64(n)
						found = true
					case "cacheReadTokens", "cache_read_tokens":
						u.CacheReadTokens = int64(n)
						found = true
					}
				}
				if child, ok := walk(value); ok {
					u.InputTokens += child.InputTokens
					u.OutputTokens += child.OutputTokens
					u.TotalTokens += child.TotalTokens
					u.CacheReadTokens += child.CacheReadTokens
					found = true
				}
			}
			return u, found
		}
		if list, ok := v.([]any); ok {
			u := TaskRunUsage{}
			found := false
			for _, child := range list {
				if next, ok := walk(child); ok {
					u.InputTokens += next.InputTokens
					u.OutputTokens += next.OutputTokens
					u.TotalTokens += next.TotalTokens
					u.CacheReadTokens += next.CacheReadTokens
					found = true
				}
			}
			return u, found
		}
		return TaskRunUsage{}, false
	}
	total := TaskRunUsage{}
	found := false
	for _, item := range values {
		if usage, ok := walk(item); ok {
			total.InputTokens += usage.InputTokens
			total.OutputTokens += usage.OutputTokens
			total.TotalTokens += usage.TotalTokens
			total.CacheReadTokens += usage.CacheReadTokens
			found = true
		}
	}
	if found && total.TotalTokens == 0 {
		total.TotalTokens = total.InputTokens + total.OutputTokens
	}
	return total, found
}

type TaskDependency struct {
	TaskID      string `json:"task_id"`
	DependsOnID string `json:"depends_on_id"`
	CreatedAt   int64  `json:"created_at"`
}

func RunTask(slug, taskID string) (Task, error) {
	db, err := openDB(slug)
	if err != nil {
		return Task{}, err
	}
	defer db.Close()
	var status, assignee string
	if err := db.QueryRow(`SELECT status, COALESCE(assignee,'') FROM tasks WHERE id=?`, taskID).Scan(&status, &assignee); err == sql.ErrNoRows {
		return Task{}, &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	} else if err != nil {
		return Task{}, err
	}
	if strings.TrimSpace(assignee) == "" {
		return Task{}, &RunControlError{Code: 400, Err: fmt.Errorf("task must have an assignee before running")}
	}
	if status == "running" {
		return Task{}, &RunControlError{Code: 409, Err: fmt.Errorf("task is already running")}
	}
	if status == "archived" {
		return Task{}, &RunControlError{Code: 409, Err: fmt.Errorf("task is archived; clone instead")}
	}
	if _, err := db.Exec(`UPDATE tasks SET status='ready', completed_at=NULL, consecutive_failures=0 WHERE id=?`, taskID); err != nil {
		return Task{}, err
	}
	if err := insertEvent(db, taskID, "run_requested", map[string]any{"source": "board-ui"}); err != nil {
		return Task{}, err
	}
	broadcastEvent("status_changed", map[string]any{"board": slug, "task_id": taskID, "from": status, "to": "ready"})
	return taskByID(db, taskID)
}

func GroupRuns(events []TaskEvent) []TaskRun {
	return groupRuns(events)
}

func GroupTaskRuns(events []TaskEvent) []TaskRun { return groupRuns(events) }

func groupRuns(events []TaskEvent) []TaskRun {
	out := []TaskRun{}
	starts := map[string]bool{"claimed": true, "spawned": true, "retry": true, "run_started": true, "run_requested": true, "retry_requested": true, "remote_dispatched": true}
	for _, ev := range events {
		if starts[ev.Kind] || len(out) == 0 && ev.Kind != "created" {
			out = append(out, TaskRun{Index: len(out) + 1, StartedAt: ev.CreatedAt})
		}
		if len(out) == 0 {
			continue
		}
		r := &out[len(out)-1]
		r.Events = append(r.Events, ev)
		if usage, ok := usageFromJSON(ev.Payload); ok {
			r.Usage.InputTokens += usage.InputTokens
			r.Usage.OutputTokens += usage.OutputTokens
			r.Usage.TotalTokens += usage.TotalTokens
			r.Usage.CacheReadTokens += usage.CacheReadTokens
		}
		if r.StartedAt == 0 {
			r.StartedAt = ev.CreatedAt
		}
		if ev.CreatedAt > r.EndedAt {
			r.EndedAt = ev.CreatedAt
		}
		if ev.Kind == "completed" {
			r.Outcome = "completed"
		}
		var p struct {
			To     string `json:"to"`
			Status string `json:"status"`
		}
		if json.Unmarshal([]byte(ev.Payload), &p) == nil {
			if p.To != "" && (p.To == "blocked" || p.To == "done" || p.To == "review" || p.To == "archived") {
				r.Outcome = p.To
			}
		}
	}
	for i := range out {
		if out[i].Outcome == "" {
			out[i].Outcome = "running"
		}
	}
	return out
}

func ensureDependencies(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS task_dependencies (task_id TEXT NOT NULL, depends_on_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(task_id, depends_on_id))`)
	return err
}

// ensureDependenciesTx is the transactional form, for the create path that
// applies dependencies inside the same transaction as the task row.
func ensureDependenciesTx(tx *sql.Tx) error {
	_, err := tx.Exec(`CREATE TABLE IF NOT EXISTS task_dependencies (task_id TEXT NOT NULL, depends_on_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(task_id, depends_on_id))`)
	return err
}

// AddTaskDependenciesDB links several dependencies inside the caller's
// transaction.
//
// The *sql.DB variants exist because the slug-based functions open their own
// connection, which cannot participate in the claim transaction. Adding a
// dependency from inside that transaction is the only way to keep "task queued
// with its dependencies" a single atomic step.
//
// It also enforces the cycle check, which the single-dependency path predates:
// A -> B -> A would make both tasks permanently unclaimable, with nothing in
// the UI to explain why.
func AddTaskDependenciesDB(tx *sql.Tx, taskID string, dependsOn []string) error {
	if len(dependsOn) == 0 {
		return nil
	}
	seen := map[string]bool{}
	for _, id := range dependsOn {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if id == taskID {
			return &DependencyIssue{Code: CodeBadRequest, Message: "a task cannot depend on itself"}
		}
		if seen[id] {
			continue
		}
		seen[id] = true

		var n int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=?`, id).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return &DependencyIssue{Code: CodeBadRequest, Message: fmt.Sprintf("task not found: %s", id)}
		}
		// Cycle check, which the original single-dependency path lacked: A -> B -> A
		// would leave both tasks permanently unclaimable with nothing to explain it.
		cyclic, err := wouldCreateCycle(tx, taskID, id)
		if err != nil {
			return err
		}
		if cyclic {
			return &DependencyIssue{
				Code:    CodeBadRequest,
				Message: fmt.Sprintf("%s already depends on %s, directly or indirectly", id, taskID),
			}
		}
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO task_dependencies(task_id,depends_on_id,created_at) VALUES(?,?,?)`,
			taskID, id, time.Now().Unix()); err != nil {
			return err
		}
	}
	return nil
}

// wouldCreateCycle reports whether adding taskID -> dependsOnID would close a
// loop, by walking the new dependency's own dependency chain and looking for
// taskID.
//
// The walk is depth-bounded and cycle-guarded: the stored graph should be acyclic
// by construction, but a database edited by hand or imported from elsewhere may
// already contain a loop, and this must terminate on it rather than hang.
func wouldCreateCycle(q queryer, taskID, dependsOnID string) (bool, error) {
	const maxDepth = 64
	visited := map[string]bool{taskID: true}
	frontier := []string{dependsOnID}
	for depth := 0; depth < maxDepth && len(frontier) > 0; depth++ {
		var next []string
		for _, cur := range frontier {
			if cur == taskID {
				return true, nil
			}
			if visited[cur] {
				continue
			}
			visited[cur] = true
			rows, err := q.Query(`SELECT depends_on_id FROM task_dependencies WHERE task_id=?`, cur)
			if err != nil {
				return false, err
			}
			for rows.Next() {
				var dep string
				if err := rows.Scan(&dep); err != nil {
					rows.Close()
					return false, err
				}
				next = append(next, dep)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return false, err
			}
		}
		frontier = next
	}
	// A chain deeper than the bound is treated as cyclic rather than allowed:
	// refusing to add the edge is safe, and accepting one that loops would wedge
	// the tasks involved.
	return len(frontier) > 0, nil
}

// queryer is the part of *sql.DB and *sql.Tx the cycle walk needs, so the same
// traversal serves both the transactional and the standalone add path.
type queryer interface {
	Query(query string, args ...any) (*sql.Rows, error)
}

// DependencyIssue is a dependency problem the caller can surface to a client.
type DependencyIssue struct {
	Code    string
	Message string
}

func (e *DependencyIssue) Error() string { return e.Code + ": " + e.Message }

// UnmetDependencies returns the dependencies of a task that are not yet done,
// with their titles so the UI can say "waits for OAuth module" rather than
// "waits for t_a1b2c3".
func UnmetDependencies(db *sql.DB, taskID string) ([]DependencyRef, error) {
	rows, err := db.Query(`SELECT d.depends_on_id, COALESCE(t.title,''), COALESCE(t.status,'')
		FROM task_dependencies d
		LEFT JOIN tasks t ON t.id = d.depends_on_id
		WHERE d.task_id = ? AND COALESCE(t.status,'') <> 'done'
		ORDER BY d.created_at, d.depends_on_id`, taskID)
	if err != nil {
		if isNoSuchTable(err) {
			return nil, nil
		}
		return nil, err
	}
	defer rows.Close()
	out := []DependencyRef{}
	for rows.Next() {
		var ref DependencyRef
		if err := rows.Scan(&ref.ID, &ref.Title, &ref.Status); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

// DependencyRef identifies a dependency for display.
type DependencyRef struct {
	ID     string `json:"id"`
	Title  string `json:"title,omitempty"`
	Status string `json:"status,omitempty"`
}

func AddTaskDependency(slug, taskID, dependsOnID string) error {
	if taskID == dependsOnID {
		return fmt.Errorf("task cannot depend on itself")
	}
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := ensureDependencies(db); err != nil {
		return err
	}
	var n int
	for _, id := range []string{taskID, dependsOnID} {
		if err := db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=?`, id).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("task not found: %s", id)
		}
	}
	// Cycle check, which this path originally lacked: A -> B -> A leaves both
	// tasks permanently unclaimable with nothing in the UI to explain it.
	cyclic, err := wouldCreateCycle(db, taskID, dependsOnID)
	if err != nil {
		return err
	}
	if cyclic {
		return &DependencyIssue{
			Code:    CodeBadRequest,
			Message: fmt.Sprintf("%s already depends on %s, directly or indirectly", dependsOnID, taskID),
		}
	}
	// INSERT OR IGNORE, so re-adding an existing edge is a no-op rather than a
	// constraint error the caller has to interpret.
	_, err = db.Exec(`INSERT OR IGNORE INTO task_dependencies(task_id,depends_on_id,created_at) VALUES(?,?,?)`, taskID, dependsOnID, time.Now().Unix())
	return err
}
func ListTaskDependencies(slug, taskID string) ([]TaskDependency, error) {
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	if err := ensureDependencies(db); err != nil {
		return nil, err
	}
	rows, err := db.Query(`SELECT task_id,depends_on_id,created_at FROM task_dependencies WHERE task_id=? ORDER BY created_at,depends_on_id`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TaskDependency{}
	for rows.Next() {
		var d TaskDependency
		if err := rows.Scan(&d.TaskID, &d.DependsOnID, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func RemoveTaskDependency(slug, taskID, dependsOnID string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := ensureDependencies(db); err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM task_dependencies WHERE task_id=? AND depends_on_id=?`, taskID, dependsOnID)
	return err
}

func SetBoardArchived(slug string, archived bool) error {
	path := filepath.Join(boardDir(slug), "board.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("board %q not found", slug)
	}
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		return err
	}
	meta["archived"] = archived
	out, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), 0644)
}
