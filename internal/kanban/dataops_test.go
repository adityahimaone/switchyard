package kanban

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestListTasksQueryDefaults(t *testing.T) {
	slug := testBoard(t)
	for i := 0; i < 5; i++ {
		var task Task
		task.Title = fmt.Sprintf("task %d", i)
		task.Priority = i
		if err := CreateTask(slug, &task); err != nil {
			t.Fatal(err)
		}
	}

	// no query = legacy full list (every task, ordered as before)
	all, total, err := ListTasksQuery(slug, TaskQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if total != 5 || len(all) != 5 {
		t.Fatalf("legacy list: got %d rows total=%d, want 5/5", len(all), total)
	}

	// limit only
	page, total, err := ListTasksQuery(slug, TaskQuery{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if total != 5 {
		t.Fatalf("total = %d, want 5 (total counts all matches)", total)
	}
	if len(page) != 2 {
		t.Fatalf("page len = %d, want 2", len(page))
	}
	if page[0].ID != all[0].ID || page[1].ID != all[1].ID {
		t.Fatal("page must be prefix of full order")
	}

	// limit + offset
	page2, _, err := ListTasksQuery(slug, TaskQuery{Limit: 2, Offset: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 2 || page2[0].ID != all[2].ID {
		t.Fatalf("offset page wrong: %+v", page2)
	}
}

func TestListTasksQueryFilters(t *testing.T) {
	slug := testBoard(t)
	var a, b Task
	a.Title = "alpha fix login"
	a.Status = "todo"
	a.Assignee = "codex"
	b.Title = "beta refactor"
	b.Status = "ready"
	if err := CreateTask(slug, &a); err != nil {
		t.Fatal(err)
	}
	if err := CreateTask(slug, &b); err != nil {
		t.Fatal(err)
	}

	if _, n, err := ListTasksQuery(slug, TaskQuery{Status: "todo"}); err != nil || n != 1 {
		t.Fatalf("status filter: n=%d err=%v, want 1", n, err)
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Status: "running"}); err != nil || n != 0 {
		t.Fatalf("status filter running: n=%d err=%v, want 0", n, err)
	}
	if _, _, err := ListTasksQuery(slug, TaskQuery{Status: "bogus"}); err == nil {
		t.Fatal("bogus status accepted, want error")
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Assignee: "codex"}); err != nil || n != 1 {
		t.Fatalf("assignee filter: n=%d err=%v, want 1", n, err)
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Assignee: "ghost"}); err != nil || n != 0 {
		t.Fatalf("assignee ghost: n=%d err=%v, want 0", n, err)
	}
	// q matches title OR body OR id OR result
	if _, n, err := ListTasksQuery(slug, TaskQuery{Q: "LOGIN"}); err != nil || n != 1 {
		t.Fatalf("q case-insensitive: n=%d err=%v, want 1", n, err)
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Q: a.ID}); err != nil || n != 1 {
		t.Fatalf("q by id: n=%d err=%v, want 1", n, err)
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Q: "zzz-no-match"}); err != nil || n != 0 {
		t.Fatalf("q no match: n=%d err=%v, want 0", n, err)
	}
	// combined
	_, n, err := ListTasksQuery(slug, TaskQuery{Status: "todo", Assignee: "codex", Q: "alpha"})
	if err != nil || n != 1 {
		t.Fatalf("combined: n=%d err=%v, want 1", n, err)
	}
	_, n, err = ListTasksQuery(slug, TaskQuery{Status: "ready", Q: "alpha"})
	if err != nil || n != 0 {
		t.Fatalf("combined mismatch: n=%d err=%v, want 0", n, err)
	}
}

func TestListTasksQueryUnassigned(t *testing.T) {
	slug := testBoard(t)
	var a, b Task
	a.Title = "assigned"
	a.Assignee = "codex"
	b.Title = "free"
	if err := CreateTask(slug, &a); err != nil {
		t.Fatal(err)
	}
	if err := CreateTask(slug, &b); err != nil {
		t.Fatal(err)
	}
	if _, n, err := ListTasksQuery(slug, TaskQuery{Unassigned: true}); err != nil || n != 1 {
		t.Fatalf("unassigned filter: n=%d err=%v, want 1", n, err)
	}
}

func TestReorderTasks(t *testing.T) {
	slug := testBoard(t)
	ids := []string{}
	for i := 0; i < 3; i++ {
		var task Task
		task.Title = fmt.Sprintf("r%d", i)
		if err := CreateTask(slug, &task); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, task.ID)
	}
	// reverse order
	rev := []string{ids[2], ids[0], ids[1]}
	if err := ReorderTasks(slug, rev); err != nil {
		t.Fatalf("reorder: %v", err)
	}
	tasks, err := ListTasks(slug)
	if err != nil {
		t.Fatal(err)
	}
	if tasks[0].ID != rev[0] || tasks[1].ID != rev[1] || tasks[2].ID != rev[2] {
		t.Fatalf("order not applied: %v,%v,%v", tasks[0].ID, tasks[1].ID, tasks[2].ID)
	}
	// unknown id rejected
	if err := ReorderTasks(slug, []string{"t_missing"}); err == nil {
		t.Fatal("reorder with unknown id accepted, want error")
	}
	// partial order keeps rest stable at end (by old position then created)
	if err := ReorderTasks(slug, []string{ids[1]}); err != nil {
		t.Fatalf("partial reorder: %v", err)
	}
	tasks, _ = ListTasks(slug)
	if tasks[0].ID != ids[1] {
		t.Fatalf("partial reorder head = %s, want %s", tasks[0].ID, ids[1])
	}
}

func TestBulkArchiveAndMove(t *testing.T) {
	slug := testBoard(t)
	ids := []string{}
	for i := 0; i < 3; i++ {
		var task Task
		task.Title = fmt.Sprintf("b%d", i)
		if err := CreateTask(slug, &task); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, task.ID)
	}

	moved, skipped, err := BulkTransition(slug, ids, "ready")
	if err != nil {
		t.Fatalf("bulk move: %v", err)
	}
	if len(moved) != 3 || len(skipped) != 0 {
		t.Fatalf("bulk move: moved=%v skipped=%v", moved, skipped)
	}
	tasks, _ := ListTasks(slug)
	for _, tk := range tasks {
		if tk.Status != "ready" {
			t.Fatalf("task %s not moved: %s", tk.ID, tk.Status)
		}
	}

	// archive subset (one id bogus -> skipped, not fatal)
	arch, skipped, err := BulkTransition(slug, []string{ids[0], "t_bogus"}, "archived")
	if err != nil {
		t.Fatalf("bulk archive: %v", err)
	}
	if len(arch) != 1 || arch[0] != ids[0] {
		t.Fatalf("archived = %v, want [%s]", arch, ids[0])
	}
	if len(skipped) != 1 || skipped[0] != "t_bogus" {
		t.Fatalf("skipped = %v, want [t_bogus]", skipped)
	}

	// invalid target rejected outright
	if _, _, err := BulkTransition(slug, ids, "running"); err == nil {
		t.Fatal("bulk to running accepted, want error")
	}
	if _, _, err := BulkTransition(slug, ids, "nonsense"); err == nil {
		t.Fatal("bulk to nonsense accepted, want error")
	}
	// empty ids rejected
	if _, _, err := BulkTransition(slug, nil, "todo"); err == nil {
		t.Fatal("bulk with no ids accepted, want error")
	}
}

func TestExportImportRoundTrip(t *testing.T) {
	t.Setenv("HERMES_HOME", filepath.Join(t.TempDir()))
	// Use a slug that forces BoardDBPath to go through boards/<slug> so
	// export/import can be exercised against the stable non-default layout.
	slug := "t1"
	dir := filepath.Join(hermesHome(), "kanban", "boards", slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "kanban.db"))
	if err != nil {
		t.Fatal(err)
	}
	schema := `
CREATE TABLE tasks (
	id                   TEXT PRIMARY KEY,
	title                TEXT NOT NULL,
	body                 TEXT,
	assignee             TEXT,
	status               TEXT NOT NULL,
	priority             INTEGER DEFAULT 0,
	created_by           TEXT,
	created_at           INTEGER NOT NULL,
	started_at           INTEGER,
	completed_at         INTEGER,
	workspace_kind       TEXT NOT NULL DEFAULT 'scratch',
	workspace_transport  TEXT,
	workspace_ssh_target TEXT,
	workspace_path       TEXT,
	result               TEXT,
	consecutive_failures INTEGER NOT NULL DEFAULT 0,
	last_failure_error   TEXT
);
CREATE TABLE task_events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL,
	kind       TEXT NOT NULL,
	payload    TEXT,
	created_at INTEGER NOT NULL
);
CREATE TABLE task_comments (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    TEXT NOT NULL,
	author     TEXT NOT NULL,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL
);`
	if _, err := db.Exec(schema); err != nil {
		t.Fatal(err)
	}
	db.Close()
	_ = os.WriteFile(filepath.Join(dir, "board.json"), []byte(`{"slug":"t1","name":"t1","icon":"🗂","color":"#10e0dd"}`), 0o644)
	workspace := filepath.Join(dir, "workspace")
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		t.Fatal(err)
	}
	var a, b Task
	a.Title = "one"
	a.Body = "body one"
	a.Status = "todo"
	a.Priority = 2
	a.Executor = "dsh"
	a.WorkspacePath = workspace
	b.Title = "two"
	if err := CreateTask(slug, &a); err != nil {
		t.Fatal(err)
	}
	if err := CreateTask(slug, &b); err != nil {
		t.Fatal(err)
	}
	if err := StatusTransition(slug, b.ID, "done"); err != nil {
		t.Fatal(err)
	}
	comment, err := AddComment(slug, a.ID, "tester", "hello comment")
	if err != nil {
		t.Fatal(err)
	}
	bindingDB, err := openDB(slug)
	if err != nil {
		t.Fatal(err)
	}
	binding, _, err := ResolveHarnessBinding(bindingDB, slug, a.ID, a.WorkspacePath)
	if err != nil {
		bindingDB.Close()
		t.Fatal(err)
	}
	seq := int64(17)
	saveDSHSessionID(bindingDB, a.ID, binding.HarnessSessionID, "workspace-roundtrip", &comment.ID, false, NodeDispatchResult{Success: true, DSHSessionID: binding.HarnessSessionID, DSHWorkspaceID: "workspace-roundtrip", LastTurnSeq: &seq})
	bindingDB.Close()

	snap, err := ExportBoard(slug)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if snap.Board.Slug != slug {
		t.Fatalf("snap board slug = %q", snap.Board.Slug)
	}
	if len(snap.Tasks) != 2 || len(snap.Events) == 0 || len(snap.Comments) != 1 || len(snap.Bindings) != 1 {
		t.Fatalf("snapshot incomplete: tasks=%d events=%d comments=%d bindings=%d", len(snap.Tasks), len(snap.Events), len(snap.Comments), len(snap.Bindings))
	}
	if snap.Tasks[0].ID == "" || snap.Tasks[0].Title == "" {
		t.Fatalf("task fields lost: %+v", snap.Tasks[0])
	}

	// import into a fresh board (new HERMES_HOME so board dir is empty)
	t.Setenv("HERMES_HOME", t.TempDir())
	created, importedTasks, err := ImportBoard(snap)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if !created {
		t.Fatal("board should be created on import into empty home")
	}
	if len(importedTasks) != 2 {
		t.Fatalf("imported %d tasks, want 2", len(importedTasks))
	}
	got, err := ListTasks(snap.Board.Slug)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]Task{}
	for _, tk := range got {
		byID[tk.ID] = tk
	}
	for _, want := range snap.Tasks {
		g, ok := byID[want.ID]
		if !ok {
			t.Fatalf("task %s missing after import", want.ID)
		}
		if g.Title != want.Title || g.Status != want.Status || g.Priority != want.Priority || g.Body != want.Body {
			t.Fatalf("task %s mismatch: got %+v want %+v", want.ID, g, want)
		}
	}
	events, err := TaskEvents(snap.Board.Slug, snap.Tasks[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) == 0 {
		t.Fatal("events not restored")
	}
	comments, err := ListComments(snap.Board.Slug, snap.Tasks[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(comments) != 1 || comments[0].Body != "hello comment" {
		t.Fatalf("comments not restored: %+v", comments)
	}
	importedDB, err := openDB(snap.Board.Slug)
	if err != nil {
		t.Fatal(err)
	}
	defer importedDB.Close()
	var restored HarnessBinding
	if err := importedDB.QueryRow(`SELECT card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status FROM harness_bindings WHERE card_id=?`, a.ID).
		Scan(&restored.CardID, &restored.WorkspacePath, &restored.HarnessWorkspaceID, &restored.HarnessSessionID, &restored.LastTurnSeq, &restored.LastCommentID, &restored.Status); err != nil {
		t.Fatal(err)
	}
	if restored.HarnessWorkspaceID != "workspace-roundtrip" || restored.LastTurnSeq != seq || restored.LastCommentID != comment.ID || restored.HarnessSessionID == "" {
		t.Fatalf("binding not restored: %+v", restored)
	}
}

func TestImportBoardRejectsInvalid(t *testing.T) {
	slug := testBoard(t)
	snap, err := ExportBoard(slug)
	if err != nil {
		t.Fatal(err)
	}
	snap.Board.Slug = "bad slug!"
	if _, _, err := ImportBoard(snap); err == nil {
		t.Fatal("import with invalid slug accepted")
	}
	snap.Board.Slug = "okslug"
	snap.Tasks = []Task{{ID: "t_x", Title: "x", Status: "running", CreatedAt: 1}}
	if _, _, err := ImportBoard(snap); err == nil {
		t.Fatal("import with running task accepted, want error (dispatcher-owned)")
	}
	snap.Tasks = []Task{{ID: "", Title: "x", Status: "todo", CreatedAt: 1}}
	if _, _, err := ImportBoard(snap); err == nil {
		t.Fatal("import with missing task id accepted")
	}
	snap.Tasks = []Task{{ID: "t_y", Title: "", Status: "todo", CreatedAt: 1}}
	if _, _, err := ImportBoard(snap); err == nil {
		t.Fatal("import with missing title accepted")
	}
	snap.Tasks = []Task{{ID: "t_z", Title: "x", Status: "nonsense", CreatedAt: 1}}
	if _, _, err := ImportBoard(snap); err == nil {
		t.Fatal("import with invalid status accepted")
	}
}
