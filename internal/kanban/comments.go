package kanban

import (
	"database/sql"
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

func TaskCommentsAfter(db *sql.DB, taskID string, afterID int64) ([]TaskComment, error) {
	rows, err := db.Query(`SELECT id, task_id, author, body, created_at FROM task_comments WHERE task_id=? AND id>? ORDER BY id ASC`, taskID, afterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := []TaskComment{}
	for rows.Next() {
		var c TaskComment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.Author, &c.Body, &c.CreatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

// FocusedGitReviewPrompt compacts read-only Git inspection comments.
// ok=false keeps normal review feedback on existing continuation flow.
func FocusedGitReviewPrompt(raw string) (string, bool) {
	text := strings.ToLower(strings.TrimSpace(raw))
	if text == "" || (!strings.Contains(text, "git") && !strings.Contains(text, "branch")) {
		return "", false
	}
	var steps []string
	if strings.Contains(text, "main") && (strings.Contains(text, "branch") || strings.Contains(text, "checkout") || strings.Contains(text, "switch")) {
		steps = append(steps, "Switch to main branch.")
	}
	if strings.Contains(text, "git pull") || strings.Contains(text, "pull latest") {
		steps = append(steps, "Pull latest changes.")
	}
	if strings.Contains(text, "git log") || strings.Contains(text, "last 5 commit") || strings.Contains(text, "5 last commit") {
		steps = append(steps, "Show last 5 commits.")
	}
	if len(steps) == 0 {
		return "", false
	}
	var body strings.Builder
	body.WriteString("[SWITCHYARD FOCUSED GIT REVIEW]\n")
	for i, step := range steps {
		fmt.Fprintf(&body, "%d. %s\n", i+1, step)
	}
	body.WriteString("Do not modify files.\nReturn command output only.")
	return body.String(), true
}

func RenderReviewComments(taskID, cardTitle string, comments []TaskComment) string {
	var body strings.Builder
	label := "comment"
	if len(comments) != 1 {
		label = "comments"
	}
	fmt.Fprintf(&body, "[Switchyard review %s — task %s, card %q]\n", label, taskID, cardTitle)
	for i, comment := range comments {
		if i > 0 {
			body.WriteString("\n")
		}
		fmt.Fprintf(&body, "Reviewer: %s\nComment:\n%s\n", comment.Author, comment.Body)
	}
	body.WriteString("\nPlease address this on top of the existing session state; do not restart the task from scratch.")
	return body.String()
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
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := time.Now().Unix()
	res, err := tx.Exec(`INSERT INTO task_comments (task_id, author, body, created_at) SELECT id, ?, ?, ? FROM tasks WHERE id=?`, author, body, now, taskID)
	if err != nil {
		return nil, err
	}
	inserted, err := res.RowsAffected()
	if err != nil || inserted != 1 {
		return nil, fmt.Errorf("task not found: %s", taskID)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	var status, assignee string
	if err := tx.QueryRow(`SELECT status, COALESCE(assignee,'') FROM tasks WHERE id=?`, taskID).Scan(&status, &assignee); err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]any{"author": author, "len": len(body)})
	if _, err := tx.Exec(`INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?,?,?,?)`, taskID, "commented", string(payload), now); err != nil {
		return nil, err
	}

	mentioned := assignee != "" && strings.Contains(body, "@"+assignee)
	requeued := false
	if status == "review" || status == "blocked" || (status == "done" && mentioned) {
		updated, err := tx.Exec(`UPDATE tasks SET status='todo', completed_at=NULL WHERE id=? AND status=?`, taskID, status)
		if err != nil {
			return nil, err
		}
		requeuedRows, err := updated.RowsAffected()
		if err != nil {
			return nil, err
		}
		requeued = requeuedRows == 1
		if requeued {
			ev, _ := json.Marshal(map[string]any{"from": status, "to": "todo", "source": "board-ui-comment"})
			if _, err := tx.Exec(`INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?,?,?,?)`, taskID, "status_changed", string(ev), now); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	broadcastEvent("commented", map[string]any{"board": slug, "task_id": taskID, "author": author})
	return &TaskComment{ID: id, TaskID: taskID, Author: author, Body: body, CreatedAt: now, Requeued: requeued}, nil
}
