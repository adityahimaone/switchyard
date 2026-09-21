package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ClearExecutionHistory removes execution traces, not task identity or collaboration data.
func ClearExecutionHistory() error {
	boards, err := ListBoards()
	if err != nil {
		return err
	}
	for _, board := range boards {
		if err := clearExecutionHistoryBoard(board.Slug); err != nil {
			return err
		}
	}
	return nil
}

func clearExecutionHistoryBoard(slug string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`DELETE FROM task_events WHERE task_id NOT IN (SELECT id FROM tasks WHERE status='running')`); err != nil {
		return fmt.Errorf("clear execution events for %s: %w", slug, err)
	}
	if _, err := db.Exec(`UPDATE tasks SET result='', last_failure_error='', started_at=NULL, completed_at=NULL WHERE status != 'running'`); err != nil {
		return fmt.Errorf("clear execution fields for %s: %w", slug, err)
	}
	if err := clearWorkerLogs(slug); err != nil {
		return err
	}
	return nil
}

// PersistWorkerLogEvent stores one worker output chunk as a queryable history
// event (raw text is always kept; compression happens at display time).
func PersistWorkerLogEvent(slug, taskID, executor, stream, text string, offset int64) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	return insertEvent(db, taskID, "worker_output", map[string]any{
		"executor": executor,
		"stream":   stream,
		"text":     text,
		"offset":   offset,
	})
}

func clearWorkerLogs(slug string) error {
	dir := filepath.Join(boardDir(slug), "logs")
	if slug == "default" {
		dir = filepath.Join(hermesHome(), "kanban", "logs")
	}
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".log") {
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}
