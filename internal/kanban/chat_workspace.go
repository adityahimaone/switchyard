package kanban

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

var canonicalChatRunKinds = map[string]bool{
	"spawned": true, "completed": true, "error": true, "cancelled": true,
	"tool": true, "reasoning": true, "approval": true, "clarify": true, "subagent": true,
}

func NormalizeChatRunKind(kind string) string {
	if canonicalChatRunKinds[kind] {
		return kind
	}
	return "unknown"
}

func chatTags(db *sql.DB, sessionID string) ([]string, error) {
	rows, err := db.Query(`SELECT tag FROM chat_session_tags WHERE session_id=? ORDER BY tag`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		out = append(out, tag)
	}
	if out == nil {
		out = []string{}
	}
	return out, rows.Err()
}

func ExtractChatTags(title string) []string {
	fields := strings.Fields(title)
	seen := map[string]bool{}
	var out []string
	for _, f := range fields {
		if strings.HasPrefix(f, "#") && len(f) > 1 {
			tag := strings.ToLower(f[1:])
			if !seen[tag] {
				seen[tag] = true
				out = append(out, tag)
			}
		}
	}
	return out
}

func replaceChatTags(db *sql.DB, sessionID, title string) error {
	if _, err := db.Exec(`DELETE FROM chat_session_tags WHERE session_id=?`, sessionID); err != nil {
		return err
	}
	return insertChatTags(db, sessionID, title)
}
func insertChatTags(db interface {
	Exec(string, ...any) (sql.Result, error)
}, sessionID, title string) error {
	for _, tag := range ExtractChatTags(title) {
		if _, err := db.Exec(`INSERT OR IGNORE INTO chat_session_tags (session_id, tag) VALUES (?,?)`, sessionID, tag); err != nil {
			return err
		}
	}
	return nil
}

type ChatProject struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Workspace   string `json:"workspace"`
	Executor    string `json:"executor"`
	Options     string `json:"options"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"created_at"`
}
type ChatExport struct {
	Session  ChatSession   `json:"session"`
	Messages []ChatMessage `json:"messages"`
}
type ChatForkLink struct {
	ForkID          string `json:"fork_id"`
	SourceMessageID string `json:"source_message_id"`
	CreatedAt       int64  `json:"created_at"`
}
type ChatLineageSource struct {
	SessionID string `json:"session_id"`
	MessageID string `json:"message_id"`
	CreatedAt int64  `json:"created_at"`
}
type ChatLineage struct {
	Forks  []ChatForkLink     `json:"forks"`
	Source *ChatLineageSource `json:"source"`
}

// projectExecutors is the closed set of chat executors a Project may bind to.
// hermes runs the local/remote Hermes chat path; dsh and commandcode are remote
// harness executors whose model is fixed by their own profile, so the UI hides
// model selection and offers their decision/mode knob instead.
var projectExecutors = map[string]bool{"hermes": true, "dsh": true, "commandcode": true}

// ValidateProjectWorkspace rejects any workspace not present in the shared
// ~/.hermes/workspaces.json registry, so a Project can only ever target a
// workspace the operator already onboarded.
func ValidateProjectWorkspace(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("workspace required")
	}
	list, err := ListWorkspaces()
	if err != nil {
		return err
	}
	for _, w := range list {
		if w.Path == path {
			return nil
		}
	}
	return fmt.Errorf("workspace %q is not registered", path)
}

func normalizeProjectExecutor(executor string) (string, error) {
	executor = strings.TrimSpace(executor)
	if executor == "" {
		return "hermes", nil
	}
	if !projectExecutors[executor] {
		return "", fmt.Errorf("unsupported executor %q", executor)
	}
	return executor, nil
}

func ListChatProjects() ([]ChatProject, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,name,color,workspace,executor,options,description,created_at FROM chat_projects ORDER BY name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ChatProject{}
	for rows.Next() {
		var p ChatProject
		if err = rows.Scan(&p.ID, &p.Name, &p.Color, &p.Workspace, &p.Executor, &p.Options, &p.Description, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func CreateChatProject(name, color, workspace, executor, options, description string) (*ChatProject, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	if err := ValidateProjectWorkspace(workspace); err != nil {
		return nil, err
	}
	executor, err := normalizeProjectExecutor(executor)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(options) == "" {
		options = "{}"
	}
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var exists int
	if err = db.QueryRow(`SELECT 1 FROM chat_projects WHERE name=? COLLATE NOCASE LIMIT 1`, name).Scan(&exists); err == nil {
		return nil, fmt.Errorf("project name already exists")
	} else if err != sql.ErrNoRows {
		return nil, err
	}
	p := &ChatProject{ID: newChatID("cp"), Name: name, Color: color, Workspace: strings.TrimSpace(workspace), Executor: executor, Options: options, Description: strings.TrimSpace(description), CreatedAt: time.Now().Unix()}
	if _, err = db.Exec(`INSERT INTO chat_projects(id,name,color,workspace,executor,options,description,created_at) VALUES(?,?,?,?,?,?,?,?)`, p.ID, p.Name, p.Color, p.Workspace, p.Executor, p.Options, p.Description, p.CreatedAt); err != nil {
		return nil, err
	}
	broadcastEvent("chat_project_created", map[string]any{"project_id": p.ID})
	return p, nil
}
func UpdateChatProject(id string, name, color, workspace, executor, options, description *string) (*ChatProject, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var p ChatProject
	if err = db.QueryRow(`SELECT id,name,color,workspace,executor,options,description,created_at FROM chat_projects WHERE id=?`, id).Scan(&p.ID, &p.Name, &p.Color, &p.Workspace, &p.Executor, &p.Options, &p.Description, &p.CreatedAt); err != nil {
		return nil, err
	}
	if name != nil {
		p.Name = strings.TrimSpace(*name)
		if p.Name == "" {
			return nil, fmt.Errorf("name required")
		}
		var exists int
		if err = db.QueryRow(`SELECT 1 FROM chat_projects WHERE name=? COLLATE NOCASE AND id<>? LIMIT 1`, p.Name, id).Scan(&exists); err == nil {
			return nil, fmt.Errorf("project name already exists")
		} else if err != sql.ErrNoRows {
			return nil, err
		}
	}
	if color != nil {
		p.Color = *color
	}
	if workspace != nil {
		if err := ValidateProjectWorkspace(*workspace); err != nil {
			return nil, err
		}
		p.Workspace = strings.TrimSpace(*workspace)
	}
	if executor != nil {
		ex, err := normalizeProjectExecutor(*executor)
		if err != nil {
			return nil, err
		}
		p.Executor = ex
	}
	if options != nil {
		if strings.TrimSpace(*options) == "" {
			p.Options = "{}"
		} else {
			p.Options = *options
		}
	}
	if description != nil {
		p.Description = strings.TrimSpace(*description)
	}
	if _, err = db.Exec(`UPDATE chat_projects SET name=?,color=?,workspace=?,executor=?,options=?,description=? WHERE id=?`, p.Name, p.Color, p.Workspace, p.Executor, p.Options, p.Description, id); err != nil {
		return nil, err
	}
	return &p, nil
}
func DeleteChatProject(id string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if _, err = tx.Exec(`UPDATE chat_sessions SET project_id='' WHERE project_id=?`, id); err == nil {
		res, e := tx.Exec(`DELETE FROM chat_projects WHERE id=?`, id)
		err = e
		if err == nil {
			n, _ := res.RowsAffected()
			if n == 0 {
				err = sql.ErrNoRows
			}
		}
	}
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
func copyChatSession(sourceID, upto string, fork bool) (*ChatSession, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var s ChatSession
	var a, p int
	if err = tx.QueryRow(`SELECT id,title,agent,profile,workspace,model,created_at,updated_at,archived,pinned,project_id FROM chat_sessions WHERE id=?`, sourceID).Scan(&s.ID, &s.Title, &s.Agent, &s.Profile, &s.Workspace, &s.Model, &s.CreatedAt, &s.UpdatedAt, &a, &p, &s.ProjectID); err != nil {
		return nil, err
	}
	id := newChatID("cs")
	now := time.Now().Unix()
	s.ID = id
	s.CreatedAt = now
	s.UpdatedAt = now
	s.Archived = false
	s.Pinned = false
	s.HermesSessionID = ""
	if _, err = tx.Exec(`INSERT INTO chat_sessions(id,title,agent,profile,workspace,model,created_at,updated_at,archived,pinned,project_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, s.ID, s.Title, s.Agent, s.Profile, s.Workspace, s.Model, now, now, 0, 0, s.ProjectID); err != nil {
		return nil, err
	}
	rows, err := tx.Query(`SELECT id,role,content,created_at FROM chat_messages WHERE session_id=? ORDER BY created_at,id`, sourceID)
	if err != nil {
		return nil, err
	}
	done := false
	for rows.Next() {
		var oldID, role, content string
		var created int64
		if err = rows.Scan(&oldID, &role, &content, &created); err != nil {
			rows.Close()
			return nil, err
		}
		if fork && oldID == upto {
			done = true
		}
		if _, err = tx.Exec(`INSERT INTO chat_messages(id,session_id,role,content,created_at,run_id) VALUES(?,?,?,?,?,NULL)`, newChatID("cm"), s.ID, role, content, created); err != nil {
			rows.Close()
			return nil, err
		}
		if done {
			break
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if fork && !done {
		return nil, sql.ErrNoRows
	}
	if err = insertChatTags(tx, s.ID, s.Title); err != nil {
		return nil, err
	}
	if fork {
		if _, err = tx.Exec(`INSERT INTO chat_fork_links(fork_id,source_session_id,source_message_id,created_at) VALUES(?,?,?,?)`, s.ID, sourceID, upto, now); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &s, nil
}
func DuplicateChatSession(id string) (*ChatSession, error) { return copyChatSession(id, "", false) }
func ForkChatSession(id, messageID string) (*ChatSession, error) {
	return copyChatSession(id, messageID, true)
}
func ExportChatSession(id string) (*ChatExport, error) {
	s, err := GetChatSession(id)
	if err != nil {
		return nil, err
	}
	s.HermesSessionID = ""
	s.ExecutorSessionID = ""
	m, err := ListChatMessages(id)
	if err != nil {
		return nil, err
	}
	for i := range m {
		m[i].ID = ""
		m[i].SessionID = ""
		m[i].RunID = ""
	}
	return &ChatExport{Session: *s, Messages: m}, nil
}
func ImportChatSession(in ChatExport) (*ChatSession, error) {
	if len(in.Messages) > 2000 {
		return nil, fmt.Errorf("too many messages")
	}
	s := in.Session
	if s.Agent != "" && !validChatAgents[s.Agent] {
		return nil, fmt.Errorf("invalid agent %q", s.Agent)
	}
	for _, m := range in.Messages {
		if m.Role != "user" && m.Role != "assistant" {
			return nil, fmt.Errorf("invalid role %q", m.Role)
		}
	}
	db, err := ensureChatDB()
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
	s.ID = newChatID("cs")
	s.HermesSessionID = ""
	s.CreatedAt = now
	s.UpdatedAt = now
	s.Archived = false
	s.Pinned = false
	if strings.TrimSpace(s.Title) == "" {
		s.Title = "New chat"
	}
	if s.Agent == "" {
		s.Agent = "hermes"
	}
	if s.Profile == "" {
		s.Profile = ActiveProfile()
	}
	if _, err = tx.Exec(`INSERT INTO chat_sessions(id,title,agent,profile,workspace,model,created_at,updated_at,archived,pinned,project_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, s.ID, s.Title, s.Agent, s.Profile, s.Workspace, s.Model, now, now, 0, 0, s.ProjectID); err != nil {
		return nil, err
	}
	for _, m := range in.Messages {
		if _, err = tx.Exec(`INSERT INTO chat_messages(id,session_id,role,content,created_at,run_id) VALUES(?,?,?,?,?,NULL)`, newChatID("cm"), s.ID, m.Role, m.Content, m.CreatedAt); err != nil {
			return nil, err
		}
	}
	if err = insertChatTags(tx, s.ID, s.Title); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &s, nil
}
func TranscriptChatSession(id string) (string, error) {
	s, err := GetChatSession(id)
	if err != nil {
		return "", err
	}
	m, err := ListChatMessages(id)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\nAgent: %s | Profile: %s | Model: %s\n\n", s.Title, s.Agent, s.Profile, s.Model)
	for _, x := range m {
		fmt.Fprintf(&b, "## %s\n\n%s\n\n", strings.Title(x.Role), x.Content)
	}
	return b.String(), nil
}
func ChatLineageForSession(id string) (*ChatLineage, error) {
	db, err := ensureChatDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	out := &ChatLineage{Forks: []ChatForkLink{}}
	rows, err := db.Query(`SELECT fork_id,source_message_id,created_at FROM chat_fork_links WHERE source_session_id=? ORDER BY created_at LIMIT 200`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var f ChatForkLink
		if err = rows.Scan(&f.ForkID, &f.SourceMessageID, &f.CreatedAt); err != nil {
			return nil, err
		}
		out.Forks = append(out.Forks, f)
	}
	var src ChatLineageSource
	if db.QueryRow(`SELECT source_session_id,source_message_id,created_at FROM chat_fork_links WHERE fork_id=?`, id).Scan(&src.SessionID, &src.MessageID, &src.CreatedAt) == nil {
		out.Source = &src
	}
	return out, rows.Err()
}
