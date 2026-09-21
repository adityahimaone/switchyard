package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// StartRemoteDispatcher polls all boards every 30s for todo tasks with
// workspace_transport='node-agent' and dispatches them via node-agent instead of
// letting the Hermes Python dispatcher try (and fail) to spawn locally.
func StartRemoteDispatcher() {
	go func() {
		for {
			time.Sleep(30 * time.Second)
			dispatchPendingRemoteTasks()
		}
	}()
	log.Println("remote-dispatcher: started (poll 30s)")
}

func dispatchPendingRemoteTasks() {
	boards, err := kanban.ListBoards()
	if err != nil {
		return
	}
	for _, b := range boards {
		dbPath := kanban.BoardDBPath(b.Slug)
		db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
		if err != nil {
			continue
		}
		rows, err := db.Query(`SELECT id, title, COALESCE(body,''), COALESCE(result,''), COALESCE(last_failure_error,''), workspace_path, COALESCE(executor,'auto'), COALESCE(command,''), COALESCE(execution_mode,'direct'), COALESCE(max_iterations,1) FROM tasks WHERE status IN ('todo','ready') AND workspace_transport='node-agent' LIMIT 5`)
		if err != nil {
			db.Close()
			continue
		}
		type row struct {
			id, title, body, result, lastError, ws, executor, command, executionMode string
			maxIterations                                                            int
		}
		var pending []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.title, &r.body, &r.result, &r.lastError, &r.ws, &r.executor, &r.command, &r.executionMode, &r.maxIterations); err == nil && r.ws != "" {
				pending = append(pending, r)
			}
		}
		rows.Close()

		for _, r := range pending {
			msg := r.body
			if msg == "" {
				msg = r.title
			}
			if r.result != "" && (strings.HasPrefix(r.lastError, "node_agent_job_timeout:") || strings.HasPrefix(r.lastError, "dispatch_wait_timeout:")) {
				_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status IN ('todo','ready')`, time.Now().Unix(), "repeated timeout on continuation — needs a fresh single-shot run", r.id)
				continue
			}
			if r.result != "" {
				previous := r.result
				if len(previous) > 800 {
					previous = previous[:800] + "\n... [truncated]"
				}
				msg = fmt.Sprintf("[CONTINUATION] This task was requeued after review feedback.\n\n--- Previous Result ---\n%s\n--- End Previous Result ---\n\nContinue from the existing workspace and apply the user's feedback:\n\n%s", previous, msg)
			}
			if cr, _ := db.Query(`SELECT author, body FROM task_comments WHERE task_id=? ORDER BY id DESC LIMIT 5`, r.id); cr != nil {
				var recent []string
				for cr.Next() {
					var author, body string
					if err := cr.Scan(&author, &body); err == nil {
						recent = append(recent, fmt.Sprintf("@%s: %s", author, body))
					}
				}
				cr.Close()
				for i, j := 0, len(recent)-1; i < j; i, j = i+1, j-1 {
					recent[i], recent[j] = recent[j], recent[i]
				}
				if len(recent) > 0 {
					msg += "\n\n--- Recent Comments ---\n" + strings.Join(recent, "\n")
				}
			}
			command := r.command
			if r.executor == "shell" && r.executionMode != "agentic" && command == "" {
				log.Printf("remote-dispatcher: %s blocked: shell executor requires command", r.id)
				continue
			}
			identity := kanban.IdentifyTask(context.Background(), r.title, r.body)
			msg = kanban.PrepareTaskExecutionMessage(r.id, msg, identity)
			_ = kanban.PersistTaskIdentity(db, r.id, identity)
			req := kanban.NodeDispatchRequest{
				TaskID:        r.id,
				Title:         r.title,
				Board:         b.Slug,
				Message:       msg,
				Workspace:     r.ws,
				Executor:      r.executor,
				Command:       command,
				ExecutionMode: r.executionMode,
				MaxIterations: r.maxIterations,
				Acceptance:    strings.TrimSpace(r.title + "\n" + r.body),
			}
			log.Printf("remote-dispatcher: dispatching %s (%s) via node-agent", r.id, b.Slug)
			_, err := kanban.DispatchRemote(req, kanban.RemoteDispatchWaitFor(r.executionMode))
			if err != nil {
				log.Printf("remote-dispatcher: %s failed: %v", r.id, err)
			} else {
				log.Printf("remote-dispatcher: %s completed", r.id)
			}
		}
		db.Close()
	}
}
