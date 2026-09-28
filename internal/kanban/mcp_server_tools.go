package kanban

import (
	"fmt"
	"io/fs"
)

// GetTask returns a single task by id. The underlying taskByID is unexported
// and takes a live *sql.DB, so MCP-facing callers get a thin wrapper that
// reuses the public query path (the same pattern chat_routing.go uses to look
// up a task by id fragment).
func GetTask(slug, taskID string) (*Task, error) {
	if taskID == "" {
		return nil, fmt.Errorf("task id required")
	}
	tasks, _, err := ListTasksQuery(slug, TaskQuery{Q: taskID, Limit: 5})
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		if tasks[i].ID == taskID {
			return &tasks[i], nil
		}
	}
	// Fall back to a full listing: the LIKE search may not match an id that
	// happens to be a substring of a title.
	if all, err := ListTasks(slug); err == nil {
		for i := range all {
			if all[i].ID == taskID {
				return &all[i], nil
			}
		}
	}
	return nil, fmt.Errorf("task %q: %w", taskID, fs.ErrNotExist)
}
