package kanban

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type ChatSession struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Agent           string   `json:"agent"`
	Profile         string   `json:"profile"`
	Workspace       string   `json:"workspace"`
	Model           string   `json:"model"`
	HermesSessionID string   `json:"hermes_session_id,omitempty"`
	CreatedAt       int64    `json:"created_at"`
	UpdatedAt       int64    `json:"updated_at"`
	Archived        bool     `json:"archived"`
	Pinned          bool     `json:"pinned"`
	ProjectID       string   `json:"project_id"`
	Tags            []string `json:"tags"`
}

type ChatMessage struct {
	ID          string       `json:"id"`
	SessionID   string       `json:"session_id"`
	Role        string       `json:"role"`
	Content     string       `json:"content"`
	CreatedAt   int64        `json:"created_at"`
	RunID       string       `json:"run_id,omitempty"`
	Attachments []Attachment `json:"attachments,omitempty"`
}

type ChatRun struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	MessageID string `json:"message_id"`
	Agent     string `json:"agent"`
	Profile   string `json:"profile"`
	Workspace string `json:"workspace"`
	Model     string `json:"model"`
	State     string `json:"state"`
	Prompt    string `json:"prompt"`
	Output    string `json:"output"`
	Error     string `json:"error"`
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at"`
}

type ChatRunEvent struct {
	ID        int64  `json:"id"`
	RunID     string `json:"run_id"`
	Kind      string `json:"kind"`
	Payload   string `json:"payload"`
	CreatedAt int64  `json:"created_at"`
}

// ChatLifecycleEvent is broadcast on the SSE hub whenever a chat run
// changes state, carrying enough identity for the UI to route it to the
// owning session and message without fetching.
type ChatLifecycleEvent struct {
	SessionID string `json:"session_id"`
	RunID     string `json:"run_id"`
	MessageID string `json:"message_id"`
	State     string `json:"state"`
}

func broadcastChatLifecycle(r *ChatRun) {
	if r == nil {
		return
	}
	broadcastEvent("chat_run_state", ChatLifecycleEvent{SessionID: r.SessionID, RunID: r.ID, MessageID: r.MessageID, State: r.State})
}

var validChatAgents = map[string]bool{"hermes": true}
var validChatStates = map[string]bool{"loading": true, "running": true, "done": true, "error": true, "cancelled": true}

func chatDBPath() string { return filepath.Join(hermesHome(), "kanban", "chat.db") }

func ensureChatDB() (*sql.DB, error) {
	p := chatDBPath()
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", p)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, agent TEXT NOT NULL DEFAULT 'hermes', profile TEXT NOT NULL DEFAULT 'default', workspace TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', hermes_session_id TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0)`,
		`ALTER TABLE chat_sessions ADD COLUMN hermes_session_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE chat_sessions ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS chat_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_projects_name_nocase ON chat_projects(name COLLATE NOCASE)`,
		`CREATE TABLE IF NOT EXISTS chat_session_tags (session_id TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(session_id, tag)) WITHOUT ROWID`,
		`CREATE TABLE IF NOT EXISTS chat_fork_links (fork_id TEXT PRIMARY KEY, source_session_id TEXT NOT NULL, source_message_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, run_id TEXT, FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE)`,
		`CREATE TABLE IF NOT EXISTS chat_runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, agent TEXT NOT NULL, profile TEXT NOT NULL, workspace TEXT NOT NULL, model TEXT NOT NULL, state TEXT NOT NULL, prompt TEXT NOT NULL, output TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, ended_at INTEGER, FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE)`,
		`CREATE TABLE IF NOT EXISTS chat_run_events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(run_id) REFERENCES chat_runs(id) ON DELETE CASCADE)`,
		`CREATE TABLE IF NOT EXISTS chat_confirmations (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, run_id TEXT NOT NULL, intent TEXT NOT NULL, prompt TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER, status TEXT NOT NULL DEFAULT 'pending')`,
		`CREATE INDEX IF NOT EXISTS idx_chat_confirmations_session ON chat_confirmations(session_id, status, expires_at)`,
		`CREATE TABLE IF NOT EXISTS jev_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'unknown', source TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', input_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0, success INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
		`ALTER TABLE jev_usage ADD COLUMN kind TEXT NOT NULL DEFAULT 'unknown'`,
		`CREATE INDEX IF NOT EXISTS idx_jev_usage_created ON jev_usage(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_runs_session ON chat_runs(session_id, started_at)`,
		`CREATE INDEX IF NOT EXISTS idx_chat_run_events_run ON chat_run_events(run_id, id)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
			db.Close()
			return nil, err
		}
	}
	return db, nil
}

func newChatID(prefix string) string {
	return fmt.Sprintf("%s_%08x", prefix, time.Now().UnixNano()&0xffffffff)
}

func CreateChatSession(title, agent, profile, workspace, model string) (*ChatSession, error) {
	if strings.TrimSpace(title) == "" {
		title = "New chat"
	}
	if agent == "" {
		agent = "hermes"
	}
	if !validChatAgents[agent] {
		return nil, fmt.Errorf("invalid agent %q", agent)
	}
	if strings.TrimSpace(profile) == "" {
		profile = "default"
	}
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	now := time.Now().Unix()
	s := &ChatSession{ID: newChatID("cs"), Title: strings.TrimSpace(title), Agent: agent, Profile: profile, Workspace: workspace, Model: model, CreatedAt: now, UpdatedAt: now}
	if _, err := db.Exec(`INSERT INTO chat_sessions (id,title,agent,profile,workspace,model,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, s.ID, s.Title, s.Agent, s.Profile, s.Workspace, s.Model, s.CreatedAt, s.UpdatedAt); err != nil {
		return nil, err
	}
	if err := replaceChatTags(db, s.ID, s.Title); err != nil {
		return nil, err
	}
	broadcastEvent("chat_session_created", map[string]any{"session_id": s.ID})
	return s, nil
}

func ListChatSessions(archived bool, filters ...string) ([]ChatSession, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	archivedValue := 0
	if archived {
		archivedValue = 1
	}
	q, args := `SELECT s.id,s.title,s.agent,s.profile,s.workspace,s.model,s.hermes_session_id,s.created_at,s.updated_at,s.archived,s.pinned,s.project_id,COALESCE((SELECT GROUP_CONCAT(tag, ',') FROM chat_session_tags WHERE session_id=s.id ORDER BY tag),'') FROM chat_sessions s WHERE s.archived=?`, []any{archivedValue}
	if len(filters) > 0 && strings.TrimSpace(filters[0]) != "" {
		q += ` AND (s.title LIKE ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM chat_messages m WHERE m.session_id=s.id AND m.content LIKE ? COLLATE NOCASE))`
		needle := "%" + strings.TrimSpace(filters[0]) + "%"
		args = append(args, needle, needle)
	}
	if len(filters) > 1 && filters[1] != "" {
		q += ` AND s.pinned=1`
	}
	if len(filters) > 2 && filters[2] != "" {
		q += ` AND s.project_id=?`
		args = append(args, filters[2])
	}
	if len(filters) > 3 && strings.TrimSpace(filters[3]) != "" {
		q += ` AND EXISTS (SELECT 1 FROM chat_session_tags t WHERE t.session_id=s.id AND t.tag=?)`
		args = append(args, strings.ToLower(strings.TrimSpace(filters[3])))
	}
	q += ` ORDER BY s.updated_at DESC, s.created_at DESC LIMIT 200`
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatSession
	for rows.Next() {
		var s ChatSession
		var archivedInt, pinnedInt int
		var tags string
		if err := rows.Scan(&s.ID, &s.Title, &s.Agent, &s.Profile, &s.Workspace, &s.Model, &s.HermesSessionID, &s.CreatedAt, &s.UpdatedAt, &archivedInt, &pinnedInt, &s.ProjectID, &tags); err != nil {
			return nil, err
		}
		s.Archived, s.Pinned = archivedInt != 0, pinnedInt != 0
		if tags != "" {
			s.Tags = strings.Split(tags, ",")
		} else {
			s.Tags = []string{}
		}
		out = append(out, s)
	}
	if out == nil {
		out = []ChatSession{}
	}
	return out, rows.Err()
}

func GetChatSession(id string) (*ChatSession, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var s ChatSession
	var archivedInt, pinnedInt int
	if err := db.QueryRow(`SELECT id,title,agent,profile,workspace,model,hermes_session_id,created_at,updated_at,archived,pinned,project_id FROM chat_sessions WHERE id=?`, id).Scan(&s.ID, &s.Title, &s.Agent, &s.Profile, &s.Workspace, &s.Model, &s.HermesSessionID, &s.CreatedAt, &s.UpdatedAt, &archivedInt, &pinnedInt, &s.ProjectID); err != nil {
		return nil, err
	}
	s.Archived, s.Pinned = archivedInt != 0, pinnedInt != 0
	s.Tags, err = chatTags(db, s.ID)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func UpdateChatSession(id string, title, agent, profile, workspace, model *string, extras ...any) (*ChatSession, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var cur ChatSession
	var archivedInt, pinnedInt int
	if err := db.QueryRow(`SELECT id,title,agent,profile,workspace,model,hermes_session_id,created_at,updated_at,archived,pinned,project_id FROM chat_sessions WHERE id=?`, id).Scan(&cur.ID, &cur.Title, &cur.Agent, &cur.Profile, &cur.Workspace, &cur.Model, &cur.HermesSessionID, &cur.CreatedAt, &cur.UpdatedAt, &archivedInt, &pinnedInt, &cur.ProjectID); err != nil {
		return nil, err
	}
	if title != nil {
		cur.Title = strings.TrimSpace(*title)
	}
	if agent != nil {
		if !validChatAgents[*agent] {
			return nil, fmt.Errorf("invalid agent %q", *agent)
		}
		cur.Agent = *agent
	}
	if profile != nil {
		cur.Profile = *profile
	}
	if workspace != nil {
		cur.Workspace = *workspace
	}
	if model != nil {
		cur.Model = *model
	}
	cur.Pinned = pinnedInt != 0
	for i, extra := range extras {
		switch v := extra.(type) {
		case *bool:
			if i == 0 && v != nil {
				cur.Pinned = *v
			}
		case *string:
			if i == 1 && v != nil {
				cur.ProjectID = *v
			}
		}
	}
	cur.UpdatedAt = time.Now().Unix()
	if err := replaceChatTags(db, cur.ID, cur.Title); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`UPDATE chat_sessions SET title=?,agent=?,profile=?,workspace=?,model=?,pinned=?,project_id=?,updated_at=? WHERE id=?`, cur.Title, cur.Agent, cur.Profile, cur.Workspace, cur.Model, cur.Pinned, cur.ProjectID, cur.UpdatedAt, cur.ID); err != nil {
		return nil, err
	}
	broadcastEvent("chat_session_updated", map[string]any{"session_id": cur.ID})
	return &cur, nil
}

func DeleteChatSession(id string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`DELETE FROM chat_run_events WHERE run_id IN (SELECT id FROM chat_runs WHERE session_id=?)`, id)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`DELETE FROM chat_runs WHERE session_id=?`, id); err != nil {
		return err
	}
	if _, err := db.Exec(`DELETE FROM chat_messages WHERE session_id=?`, id); err != nil {
		return err
	}
	result, err = db.Exec(`DELETE FROM chat_sessions WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	broadcastEvent("chat_session_deleted", map[string]any{"session_id": id})
	return nil
}

func ArchiveChatSession(id string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE chat_sessions SET archived=1, updated_at=? WHERE id=?`, time.Now().Unix(), id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	broadcastEvent("chat_session_archived", map[string]any{"session_id": id})
	return nil
}

func UnarchiveChatSession(id string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.Exec(`UPDATE chat_sessions SET archived=0 WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	broadcastEvent("chat_session_unarchived", map[string]any{"session_id": id})
	return nil
}

func CreateChatMessage(sessionID, role, content, runID string) (*ChatMessage, error) {
	if strings.TrimSpace(content) == "" {
		return nil, fmt.Errorf("content required")
	}
	if role != "user" && role != "assistant" && role != "system" {
		return nil, fmt.Errorf("invalid role %q", role)
	}
	if _, err := GetChatSession(sessionID); err != nil {
		return nil, err
	}
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	m := &ChatMessage{ID: newChatID("cm"), SessionID: sessionID, Role: role, Content: content, CreatedAt: time.Now().Unix(), RunID: runID}
	if _, err := db.Exec(`INSERT INTO chat_messages (id,session_id,role,content,created_at,run_id) VALUES (?,?,?,?,?,?)`, m.ID, m.SessionID, m.Role, m.Content, m.CreatedAt, m.RunID); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`UPDATE chat_sessions SET updated_at=? WHERE id=?`, m.CreatedAt, sessionID); err != nil {
		return nil, err
	}
	broadcastEvent("chat_message", map[string]any{"session_id": sessionID, "message_id": m.ID, "role": role})
	return m, nil
}

func ListChatMessages(sessionID string) ([]ChatMessage, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,session_id,role,content,created_at,COALESCE(run_id,'') FROM chat_messages WHERE session_id=? ORDER BY created_at ASC, id ASC LIMIT 500`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.CreatedAt, &m.RunID); err != nil {
			return nil, err
		}
		attachments, err := ListChatAttachments(m.ID)
		if err != nil {
			return nil, err
		}
		m.Attachments = attachments
		out = append(out, m)
	}
	if out == nil {
		out = []ChatMessage{}
	}
	return out, rows.Err()
}

func CreateChatRun(sessionID, messageID, agent, profile, workspace, model, prompt string) (*ChatRun, error) {
	if strings.TrimSpace(prompt) == "" {
		return nil, fmt.Errorf("prompt required")
	}
	if agent == "" {
		agent = "hermes"
	}
	if !validChatAgents[agent] {
		return nil, fmt.Errorf("invalid agent %q", agent)
	}
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	r := &ChatRun{ID: newChatID("cr"), SessionID: sessionID, MessageID: messageID, Agent: agent, Profile: profile, Workspace: workspace, Model: model, State: "loading", Prompt: prompt, StartedAt: time.Now().Unix()}
	if _, err := db.Exec(`INSERT INTO chat_runs (id,session_id,message_id,agent,profile,workspace,model,state,prompt,started_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, r.ID, r.SessionID, r.MessageID, r.Agent, r.Profile, r.Workspace, r.Model, r.State, r.Prompt, r.StartedAt); err != nil {
		return nil, err
	}
	_ = appendChatRunEventLocked(db, r.ID, "loading", `{"state":"loading"}`)
	broadcastChatLifecycle(r)
	broadcastEvent("chat_run", map[string]any{"run_id": r.ID, "session_id": sessionID, "message_id": r.MessageID, "state": r.State})
	return r, nil
}

func GetChatRun(id string) (*ChatRun, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var r ChatRun
	if err := db.QueryRow(`SELECT id,session_id,message_id,agent,profile,workspace,model,state,prompt,output,error,started_at,ended_at FROM chat_runs WHERE id=?`, id).Scan(&r.ID, &r.SessionID, &r.MessageID, &r.Agent, &r.Profile, &r.Workspace, &r.Model, &r.State, &r.Prompt, &r.Output, &r.Error, &r.StartedAt, &r.EndedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

func UpdateChatRunState(id, state, output, errMsg string) error {
	if !validChatStates[state] {
		return fmt.Errorf("invalid state %q", state)
	}
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	var ended *int64
	if state == "done" || state == "error" || state == "cancelled" {
		v := time.Now().Unix()
		ended = &v
	}
	if _, err := db.Exec(`UPDATE chat_runs SET state=?, output=?, error=?, ended_at=COALESCE(?, ended_at) WHERE id=?`, state, output, errMsg, ended, id); err != nil {
		return err
	}
	_ = appendChatRunEventLocked(db, id, state, fmt.Sprintf(`{"state":%q}`, state))
	updated, getErr := GetChatRun(id)
	if getErr == nil {
		broadcastChatLifecycle(updated)
		broadcastEvent("chat_run", map[string]any{"run_id": id, "session_id": updated.SessionID, "message_id": updated.MessageID, "state": state})
	}
	return nil
}

func AppendChatRunEvent(runID, kind, payload string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	return appendChatRunEventLocked(db, runID, kind, payload)
}

func appendChatRunEventLocked(db *sql.DB, runID, kind, payload string) error {
	if _, err := db.Exec(`INSERT INTO chat_run_events (run_id,kind,payload,created_at) VALUES (?,?,?,?)`, runID, kind, payload, time.Now().Unix()); err != nil {
		return err
	}
	var sessionID, messageID string
	_ = db.QueryRow(`SELECT session_id,message_id FROM chat_runs WHERE id=?`, runID).Scan(&sessionID, &messageID)
	broadcastEvent("chat_run_event", map[string]any{"run_id": runID, "session_id": sessionID, "message_id": messageID, "kind": kind, "payload": payload})
	return nil
}

func ListChatRunEvents(runID string) ([]ChatRunEvent, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,run_id,kind,payload,created_at FROM chat_run_events WHERE run_id=? ORDER BY id ASC LIMIT 500`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatRunEvent
	for rows.Next() {
		var e ChatRunEvent
		if err := rows.Scan(&e.ID, &e.RunID, &e.Kind, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	if out == nil {
		out = []ChatRunEvent{}
	}
	return out, rows.Err()
}

func chatTitleFromPrompt(prompt string) string {
	p := strings.TrimSpace(prompt)
	if p == "" {
		return "New chat"
	}
	p = strings.ReplaceAll(p, "\n", " ")
	p = strings.ReplaceAll(p, "\r", " ")
	p = strings.Join(strings.Fields(p), " ")
	runes := []rune(p)
	if len(runes) > 60 {
		return string(runes[:60]) + "\u2026"
	}
	return p
}

func AutoTitleChatSession(id, prompt string) error {
	cur, err := GetChatSession(id)
	if err != nil {
		return err
	}
	trimmed := strings.TrimSpace(cur.Title)
	if trimmed != "" && trimmed != "New chat" {
		return nil
	}
	next := chatTitleFromPrompt(prompt)
	if next == cur.Title || strings.TrimSpace(next) == "" {
		return nil
	}
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE chat_sessions SET title=?, updated_at=? WHERE id=?`, next, time.Now().Unix(), id); err != nil {
		return err
	}
	broadcastEvent("chat_session_updated", map[string]any{"session_id": id})
	return nil
}

func SetHermesSessionID(id, sessionID string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE chat_sessions SET hermes_session_id=?, updated_at=? WHERE id=?`, sessionID, time.Now().Unix(), id); err != nil {
		return err
	}
	broadcastEvent("chat_session_updated", map[string]any{"session_id": id})
	return nil
}

func ClearHermesSessionID(id string) error {
	return SetHermesSessionID(id, "")
}

func ActiveChatRun(sessionID string) (*ChatRun, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var r ChatRun
	err = db.QueryRow(`SELECT id,session_id,message_id,agent,profile,workspace,model,state,prompt,output,error,started_at,ended_at FROM chat_runs WHERE session_id=? AND state IN ('loading','running') ORDER BY started_at DESC LIMIT 1`, sessionID).Scan(&r.ID, &r.SessionID, &r.MessageID, &r.Agent, &r.Profile, &r.Workspace, &r.Model, &r.State, &r.Prompt, &r.Output, &r.Error, &r.StartedAt, &r.EndedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func ListActiveChatRuns() ([]ChatRun, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,session_id,message_id,agent,profile,workspace,model,state,prompt,output,error,started_at,ended_at FROM chat_runs WHERE state IN ('loading','running') ORDER BY started_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatRun
	for rows.Next() {
		var r ChatRun
		if err := rows.Scan(&r.ID, &r.SessionID, &r.MessageID, &r.Agent, &r.Profile, &r.Workspace, &r.Model, &r.State, &r.Prompt, &r.Output, &r.Error, &r.StartedAt, &r.EndedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	if out == nil {
		out = []ChatRun{}
	}
	return out, rows.Err()
}

func TouchChatSession(id string) {
	db, err := ensureChatDB()
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.Exec(`UPDATE chat_sessions SET updated_at=? WHERE id=?`, time.Now().Unix(), id)
}
