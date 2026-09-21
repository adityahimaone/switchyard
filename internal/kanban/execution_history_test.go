package kanban

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestClearExecutionHistoryPreservesTasksAndComments(t *testing.T) {
	slug := testBoard(t)
	db, err := sql.Open("sqlite", BoardDBPath(slug))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO tasks (id,title,status,created_at,result,last_failure_error) VALUES ('t-history','Keep task','review',1,'old result','old error'); INSERT INTO task_events (task_id,kind,payload,created_at) VALUES ('t-history','completed','{"output":"raw"}',2); INSERT INTO task_comments (task_id,author,body,created_at) VALUES ('t-history','user','keep comment',3)`); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(boardDir(slug), "logs", "t-history.log")
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(logPath, []byte("raw worker output\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := clearExecutionHistoryBoard(slug); err != nil {
		t.Fatal(err)
	}

	var result, failure string
	if err := db.QueryRow(`SELECT result,last_failure_error FROM tasks WHERE id='t-history'`).Scan(&result, &failure); err != nil {
		t.Fatal(err)
	}
	if result != "" || failure != "" {
		t.Fatalf("execution fields not cleared: result=%q failure=%q", result, failure)
	}
	var events, comments int
	_ = db.QueryRow(`SELECT COUNT(*) FROM task_events`).Scan(&events)
	_ = db.QueryRow(`SELECT COUNT(*) FROM task_comments`).Scan(&comments)
	if events != 0 || comments != 1 {
		t.Fatalf("history cleanup scope wrong: events=%d comments=%d", events, comments)
	}
	if _, err := os.Stat(logPath); !os.IsNotExist(err) {
		t.Fatalf("worker log still exists: %v", err)
	}
}

func TestWorkerProgressPayloadKeepsRawTextAndExecutor(t *testing.T) {
	slug := testBoard(t)
	if err := PersistWorkerLogEvent(slug, "t-worker", "shell", "stdout", "raw\noutput", 12); err != nil {
		t.Fatal(err)
	}
	events, err := TaskEvents(slug, "t-worker")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Kind != "worker_output" {
		t.Fatalf("worker events = %+v", events)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(events[0].Payload), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["executor"] != "shell" || payload["text"] != "raw\noutput" {
		t.Fatalf("raw worker payload lost fields: %s", events[0].Payload)
	}
}
