package kanban

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// TaskComment mirrors a row in task_comments.
type TaskComment struct {
	ID        int64  `json:"id"`
	TaskID    string `json:"task_id"`
	Author    string `json:"author"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"created_at"`
	Requeued  bool   `json:"requeued"`
}

// ListComments returns a task's comments, oldest first.
func ListComments(slug, taskID string) ([]TaskComment, error) {
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(
		`SELECT id, task_id, author, body, created_at FROM task_comments WHERE task_id = ? ORDER BY id ASC`,
		taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TaskComment{}
	for rows.Next() {
		var c TaskComment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.Author, &c.Body, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AddComment inserts a comment (author "board-ui" by default), emits the
// same "commented" event hermes writes, and notifies the assignee when the
// comment @mentions a profile name.
func AddComment(slug, taskID, author, body string) (*TaskComment, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("comment body is required")
	}
	if author == "" {
		author = "board-ui"
	}
	db, err := openDB(slug)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var status, assignee string
	if err := db.QueryRow(`SELECT status, COALESCE(assignee,'') FROM tasks WHERE id=?`, taskID).Scan(&status, &assignee); err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}
	now := time.Now().Unix()
	res, err := db.Exec(
		`INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?,?,?,?)`,
		taskID, author, body, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	// same event shape hermes emits: {"author": ..., "len": N}
	payload, _ := json.Marshal(map[string]any{"author": author, "len": len(body)})
	if _, err := db.Exec(
		`INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?,?,?,?)`,
		taskID, "commented", string(payload), now); err != nil {
		return nil, err
	}
	// Any review or blocked comment is an explicit change request. A done task
	// stays mention-gated so unrelated notes do not reopen completed work.
	mentioned := assignee != "" && strings.Contains(body, "@"+assignee)
	requeued := false
	if status == "review" || status == "blocked" || (status == "done" && mentioned) {
		if _, err := db.Exec(`UPDATE tasks SET status='todo', completed_at=NULL WHERE id=?`, taskID); err == nil {
			ev, _ := json.Marshal(map[string]any{"from": status, "to": "todo", "source": "board-ui-comment"})
			_, _ = db.Exec(`INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?,?,?,?)`,
				taskID, "status_changed", string(ev), now)
			requeued = true
		}
	}
	broadcastEvent("commented", map[string]any{"board": slug, "task_id": taskID, "author": author})
	return &TaskComment{ID: id, TaskID: taskID, Author: author, Body: body, CreatedAt: now, Requeued: requeued}, nil
}
