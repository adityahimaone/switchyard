package main

import (
	"database/sql"
	"log"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// StartRemoteDispatcher polls all boards every 30s for todo tasks with
// workspace_transport='ssh' and dispatches them via node-agent instead of
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
		rows, err := db.Query(`SELECT id, title, COALESCE(body,''), workspace_path, COALESCE(executor,'auto'), COALESCE(command,'') FROM tasks WHERE status='todo' AND workspace_transport='ssh' LIMIT 5`)
		if err != nil {
			db.Close()
			continue
		}
		type row struct{ id, title, body, ws, executor, command string }
		var pending []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.title, &r.body, &r.ws, &r.executor, &r.command); err == nil && r.ws != "" {
				pending = append(pending, r)
			}
		}
		rows.Close()
		db.Close()

		for _, r := range pending {
			msg := r.body
			if msg == "" {
				msg = r.title
			}
			command := r.command
			if r.executor == "shell" && command == "" {
				log.Printf("remote-dispatcher: %s blocked: shell executor requires command", r.id)
				continue
			}
			req := kanban.NodeDispatchRequest{
				TaskID:    r.id,
				Title:     r.title,
				Board:     b.Slug,
				Message:   msg,
				Workspace: r.ws,
				Executor:  r.executor,
				Command:   command,
			}
			log.Printf("remote-dispatcher: dispatching %s (%s) via node-agent", r.id, b.Slug)
			_, err := kanban.DispatchRemote(req, 25*time.Minute)
			if err != nil {
				log.Printf("remote-dispatcher: %s failed: %v", r.id, err)
			} else {
				log.Printf("remote-dispatcher: %s completed", r.id)
			}
		}
	}
}
