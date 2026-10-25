package kanban

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Canvas Studio.
//
// A canvas session is a brainstorming workspace built with the create-canvas
// skill inside a real workspace on a worker. The agent edits source (never a
// runtime editor), and the board shows the result through a tunnelled dev
// server. Every mitigation lives in this file or canvas_proxy.go:
//
//   - Isolation: one git worktree + branch per session (reusing the task
//     worktree machinery), so the main checkout is never edited.
//   - Path guard: after each agent turn, any change outside the canvas allow
//     list is reverted and reported; allowed changes are committed on the
//     session branch.
//   - Resource limits: max concurrent dev servers, a fixed remote port range,
//     idle auto-stop, and a free-disk check before a worktree is created.
//   - No secrets: nothing from .env is copied; node_modules is symlinked.
//   - Promotion to production only through a normal, unstarted card.

const (
	CanvasMaxRunning   = 3
	CanvasIdleStop     = 20 * time.Minute
	CanvasPortStart    = 4300
	CanvasPortEnd      = 4399
	CanvasMinFreeKB    = 1 << 20 // 1 GiB
	CanvasMaxTurns     = 40
	canvasBranchPrefix = "canvas-"
)

// CanvasSession is one brainstorm workspace.
type CanvasSession struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	WorkspaceID   string `json:"workspace_id"`
	WorkspacePath string `json:"workspace_path"`
	Host          string `json:"host"`
	WorktreePath  string `json:"worktree_path"`
	Branch        string `json:"branch"`
	Port          int    `json:"port"`
	Framework     string `json:"framework,omitempty"`
	Status        string `json:"status"` // ready|working|error|discarded
	Server        string `json:"server"` // stopped|running
	Executor      string `json:"executor"`
	Model         string `json:"model"`
	DialKit       bool   `json:"dialkit"`
	Turns         int    `json:"turns"`
	LastError     string `json:"last_error,omitempty"`
	ParentID      string `json:"parent_id,omitempty"`
	CreatedAt     int64  `json:"created_at"`
	LastActiveAt  int64  `json:"last_active_at"`
	ViewURL       string `json:"view_url,omitempty"` // filled by the HTTP layer
}

// CanvasMessage is one entry of a session's brainstorm transcript.
type CanvasMessage struct {
	ID        int64  `json:"id"`
	SessionID string `json:"session_id"`
	Role      string `json:"role"` // user|assistant|system
	Content   string `json:"content"`
	CreatedAt int64  `json:"created_at"`
}

func canvasDBPath() string { return filepath.Join(hermesHome(), "kanban", "canvas.db") }

func openCanvasDB() (*sql.DB, error) {
	p := canvasDBPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", p))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS canvas_sessions (
			id TEXT PRIMARY KEY, title TEXT NOT NULL, workspace_id TEXT NOT NULL DEFAULT '',
			workspace_path TEXT NOT NULL, host TEXT NOT NULL DEFAULT '', worktree_path TEXT NOT NULL,
			branch TEXT NOT NULL, port INTEGER NOT NULL DEFAULT 0, framework TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'ready', server TEXT NOT NULL DEFAULT 'stopped',
			executor TEXT NOT NULL DEFAULT 'dsh', model TEXT NOT NULL DEFAULT '',
			dialkit INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0,
			last_error TEXT NOT NULL DEFAULT '', parent_id TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS canvas_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
			content TEXT NOT NULL, created_at INTEGER NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS idx_canvas_messages_session ON canvas_messages(session_id, id)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			db.Close()
			return nil, err
		}
	}
	return db, nil
}

const canvasCols = `id,title,workspace_id,workspace_path,host,worktree_path,branch,port,framework,status,server,executor,model,dialkit,turns,last_error,parent_id,created_at,last_active_at`

type rowScanner interface{ Scan(dest ...any) error }

func scanCanvas(r rowScanner) (*CanvasSession, error) {
	var s CanvasSession
	var dk int
	if err := r.Scan(&s.ID, &s.Title, &s.WorkspaceID, &s.WorkspacePath, &s.Host, &s.WorktreePath, &s.Branch, &s.Port,
		&s.Framework, &s.Status, &s.Server, &s.Executor, &s.Model, &dk, &s.Turns, &s.LastError, &s.ParentID,
		&s.CreatedAt, &s.LastActiveAt); err != nil {
		return nil, err
	}
	s.DialKit = dk == 1
	return &s, nil
}

// ListCanvasSessions returns live (non-discarded) sessions, newest first.
func ListCanvasSessions() ([]CanvasSession, error) {
	db, err := openCanvasDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT ` + canvasCols + ` FROM canvas_sessions WHERE status != 'discarded' ORDER BY last_active_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CanvasSession{}
	for rows.Next() {
		s, err := scanCanvas(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

// GetCanvasSession loads one session.
func GetCanvasSession(id string) (*CanvasSession, error) {
	db, err := openCanvasDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	return scanCanvas(db.QueryRow(`SELECT `+canvasCols+` FROM canvas_sessions WHERE id=?`, id))
}

func canvasUpdate(id string, set string, args ...any) error {
	db, err := openCanvasDB()
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`UPDATE canvas_sessions SET `+set+` WHERE id=?`, append(args, id)...)
	return err
}

// CanvasMessages returns the transcript in order.
func CanvasMessages(id string) ([]CanvasMessage, error) {
	db, err := openCanvasDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id,session_id,role,content,created_at FROM canvas_messages WHERE session_id=? ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CanvasMessage{}
	for rows.Next() {
		var m CanvasMessage
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func addCanvasMessage(id, role, content string) {
	db, err := openCanvasDB()
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.Exec(`INSERT INTO canvas_messages(session_id,role,content,created_at) VALUES(?,?,?,?)`,
		id, role, truncateWorktreeOutput(content), time.Now().Unix())
}

func newCanvasID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "cv_" + hex.EncodeToString(b)
}

// ---- pure helpers (unit-tested) ------------------------------------------

// canvasAllowedPrefixes are the only locations an agent turn may change. The
// Next.js route has to live under app/ or pages/, so those canvas-named
// subtrees are allowed; everything else in the repo is production code.
var canvasAllowedPrefixes = []string{
	"canvas/", "src/canvas/", "app/canvas/", "src/app/canvas/", "pages/canvas", "src/pages/canvas",
}

var canvasDialKitFiles = map[string]bool{
	"package.json": true, "package-lock.json": true, "pnpm-lock.yaml": true,
	"yarn.lock": true, "bun.lock": true, "bun.lockb": true,
}

// canvasIgnoredPrefixes are build artefacts and the symlinked dependency tree;
// they are never source changes and must not be reverted by the guard.
var canvasIgnoredPrefixes = []string{"node_modules", ".next", ".turbo", ".vite", ".cache", "dist"}

// CanvasPathAllowed reports whether a repo-relative path may be changed by a
// canvas turn.
func CanvasPathAllowed(rel string, dialkit bool) bool {
	rel = strings.TrimPrefix(path.Clean(filepath.ToSlash(strings.TrimSpace(rel))), "./")
	if rel == "" || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "/") {
		return false
	}
	for _, p := range canvasIgnoredPrefixes {
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	for _, p := range canvasAllowedPrefixes {
		if strings.HasPrefix(rel, p) {
			return true
		}
	}
	return dialkit && canvasDialKitFiles[rel]
}

func stripPorcelainProvenance(raw string) string {
	if !strings.Contains(raw, "provenance executor=") && !strings.Contains(raw, "EXECUTOR_PROOF=") {
		return raw
	}
	lines := strings.Split(raw, "\n")
	var kept []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "provenance executor=") || strings.HasPrefix(trimmed, "EXECUTOR_PROOF=") {
			continue
		}
		kept = append(kept, line)
	}
	return strings.Join(kept, "\n")
}

// ParsePorcelainZ extracts paths from `git status --porcelain -z -uall`.
// Rename/copy entries carry a second NUL-separated path, which is included.
// Any node-agent provenance lines prepended/appended to workerShell output
// are stripped first so they are never mistaken for file entries.
func ParsePorcelainZ(out string) []string {
	out = stripPorcelainProvenance(out)
	parts := strings.Split(out, "\x00")
	var paths []string
	for i := 0; i < len(parts); i++ {
		e := strings.TrimLeft(parts[i], "\r\n")
		if len(e) < 4 || e[2] != ' ' {
			continue
		}
		paths = append(paths, e[3:])
		if e[0] == 'R' || e[0] == 'C' || e[1] == 'R' || e[1] == 'C' {
			i++
			if i < len(parts) && parts[i] != "" {
				paths = append(paths, strings.TrimLeft(parts[i], "\r\n"))
			}
		}
	}
	return paths
}

// CanvasViolations filters changed paths down to those outside the allow list.
func CanvasViolations(changed []string, dialkit bool) []string {
	var bad []string
	for _, p := range changed {
		if !CanvasPathAllowed(p, dialkit) {
			bad = append(bad, p)
		}
	}
	return bad
}

// AllocCanvasPort picks the lowest free remote port in the canvas range.
func AllocCanvasPort(used map[int]bool) (int, error) {
	for p := CanvasPortStart; p <= CanvasPortEnd; p++ {
		if !used[p] {
			return p, nil
		}
	}
	return 0, fmt.Errorf("no free canvas port in %d-%d", CanvasPortStart, CanvasPortEnd)
}

// CanvasMandate renders the instruction an agent turn receives.
func CanvasMandate(s *CanvasSession, userMsg string) string {
	var b strings.Builder
	b.WriteString("Use the /create-canvas skill. You are working in an isolated git worktree for a CANVAS (brainstorm) session, not production.\n\n")
	b.WriteString("HARD RULES (a guard reverts violations automatically):\n")
	b.WriteString("- Only create or edit files under canvas/, src/canvas/, app/canvas/, src/app/canvas/, pages/canvas*, or src/pages/canvas*.\n")
	b.WriteString("- Do NOT modify production components, routes, styles, configs, or dependencies. Reuse production components through their public APIs only.\n")
	b.WriteString("- Use synthetic data and mock providers; never real requests, personal data, or credentials. If safe isolation is unclear, stop and ask.\n")
	b.WriteString("- Do not start dev servers or open browsers; the board manages the server.\n")
	b.WriteString("- Keep the canvas route at /canvas (Next.js) or canvas/index.html (Vite). Update the existing canvas for follow-ups; preserve names, IDs and positions.\n")
	if s.DialKit {
		b.WriteString("- DialKit is enabled: add dialkit (https://www.dialkit.dev/) as a dependency if the project is React, and bind its panels to registry item props so components can be tuned live. Only package.json and the lockfile may change for this.\n")
	} else {
		b.WriteString("- DialKit is disabled for this session; do not add dependencies.\n")
	}
	b.WriteString("\nSession: " + s.Title + "\nBranch: " + s.Branch + "\n\nRequest:\n" + strings.TrimSpace(userMsg) + "\n")
	return b.String()
}

// canvasPlan derives the worktree location for a session.
func canvasPlan(repo, id string) WorktreePlan { return PlanWorktree(repo, canvasBranchPrefix+id) }

// canvasWorkerPath validates that a workspace path is something the POSIX
// worker scripts can drive. Windows workers are refused up front rather than
// failing halfway through a worktree add.
func canvasWorkerPath(ws *Workspace) error {
	p := strings.TrimSpace(ws.Path)
	if p == "" {
		return fmt.Errorf("workspace has no path")
	}
	if strings.EqualFold(ws.OS, "windows") || strings.Contains(p, `\`) || (len(p) > 1 && p[1] == ':') {
		return fmt.Errorf("canvas sessions are not supported on Windows workspaces yet (POSIX shell required)")
	}
	return nil
}

// ---- lifecycle ------------------------------------------------------------

func canvasDevScript(s *CanvasSession, base string) string {
	pidf := fmt.Sprintf("/tmp/sw-canvas-%s.pid", s.ID)
	logf := fmt.Sprintf("/tmp/sw-canvas-%s.log", s.ID)
	return fmt.Sprintf(`cd %[1]s || exit 4
PIDF=%[2]s; LOG=%[3]s; PORT=%[4]d
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then echo running; exit 0; fi
[ -f package.json ] || { echo "no package.json in worktree"; exit 2; }
if [ -d %[5]s/node_modules ] && [ ! -L node_modules ]; then rm -rf node_modules && ln -s %[5]s/node_modules node_modules; fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"
if grep -q '"next"' package.json; then FW=next; CMD="npx --no-install next dev --webpack -p $PORT -H 127.0.0.1"
elif grep -q '"vite"' package.json; then FW=vite; CMD="npx --no-install vite --port $PORT --host 127.0.0.1 --strictPort --base %[6]s"
else echo "unsupported framework (need next or vite)"; exit 3; fi
nohup sh -c "$CMD" >"$LOG" 2>&1 &
echo $! > "$PIDF"
echo "started $FW"`,
		shellQuotePath(s.WorktreePath), shellQuotePath(pidf), shellQuotePath(logf), s.Port,
		shellQuotePath(s.WorkspacePath), shellQuotePath(base))
}

func canvasStopScript(id string) string {
	pidf := shellQuotePath(fmt.Sprintf("/tmp/sw-canvas-%s.pid", id))
	return fmt.Sprintf(`if [ -f %[1]s ]; then P=$(cat %[1]s); pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null; rm -f %[1]s; fi; echo stopped`, pidf)
}

func canvasGuardScript(s *CanvasSession) string {
	return fmt.Sprintf("cd %s && git status --porcelain -z -uall", shellQuotePath(s.WorktreePath))
}

func canvasRevertScript(s *CanvasSession, paths []string) string {
	q := make([]string, 0, len(paths))
	for _, p := range paths {
		q = append(q, shellQuotePath(p))
	}
	list := strings.Join(q, " ")
	return fmt.Sprintf("cd %s && git restore --staged --worktree -- %s 2>/dev/null; git clean -fdq -- %s 2>/dev/null; true",
		shellQuotePath(s.WorktreePath), list, list)
}

func canvasCommitScript(s *CanvasSession) string {
	add := "canvas src/canvas app/canvas src/app/canvas pages/canvas pages/canvas.tsx pages/canvas.jsx src/pages/canvas src/pages/canvas.tsx src/pages/canvas.jsx"
	if s.DialKit {
		add += " package.json package-lock.json pnpm-lock.yaml yarn.lock bun.lock"
	}
	return fmt.Sprintf(`cd %s && for p in %s; do [ -e "$p" ] && git add -A -- "$p"; done; git diff --cached --quiet || git -c user.name=Canvas -c user.email=canvas@switchyard.local commit -q -m %s`,
		shellQuotePath(s.WorktreePath), add, shellQuotePath("canvas: "+s.Title))
}

// CreateCanvasSession creates the worktree and the session row.
func CreateCanvasSession(wsRef, title, executor, model string, dialkit bool, parent *CanvasSession) (*CanvasSession, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("title required")
	}
	ws, err := FindWorkspace(wsRef)
	if err != nil {
		return nil, err
	}
	if err := canvasWorkerPath(ws); err != nil {
		return nil, err
	}
	if executor == "" {
		executor = "dsh"
	}
	id := newCanvasID()
	plan := canvasPlan(ws.Path, id)
	if parent != nil {
		plan.BaseBranch = parent.Branch
	}

	if out, code := workerShell(ws.Path, "canvas: disk", fmt.Sprintf("cd %s && df -Pk . | awk 'NR==2{print $4}'", shellQuotePath(ws.Path))); code == 0 {
		if kb, perr := strconv.ParseInt(strings.TrimSpace(out), 10, 64); perr == nil && kb < CanvasMinFreeKB {
			return nil, fmt.Errorf("refusing to create a worktree: only %d MB free on the worker (need %d MB)", kb/1024, CanvasMinFreeKB/1024)
		}
	}
	if out, code := workerShell(ws.Path, "canvas: git", fmt.Sprintf("cd %s && git rev-parse --is-inside-work-tree", shellQuotePath(ws.Path))); code != 0 || !strings.Contains(out, "true") {
		return nil, fmt.Errorf("workspace is not a git repository: %s", truncateWorktreeOutput(out))
	}
	_, _ = workerShell(ws.Path, "canvas: exclude", ensureWorktreeIgnoredScript(ws.Path))
	if out, code := workerShell(ws.Path, "canvas: worktree", gitWorktreeAddScript(plan)); code != 0 {
		return nil, fmt.Errorf("git worktree add failed: %s", truncateWorktreeOutput(out))
	}
	_, _ = workerShell(plan.Path, "canvas: link-deps", fmt.Sprintf(`cd %[1]s && if [ -d %[2]s/node_modules ] && [ ! -L node_modules ]; then rm -rf node_modules && ln -s %[2]s/node_modules node_modules; fi`, shellQuotePath(plan.Path), shellQuotePath(ws.Path)))
	_, _ = workerShell(plan.Path, "canvas: scaffold-page", fmt.Sprintf(`cd %[1]s && if [ -d app ] && [ ! -f app/canvas/page.tsx ] && [ ! -f app/canvas/page.jsx ]; then mkdir -p app/canvas && printf "'use client'\nimport React from 'react'\nexport default function CanvasPage() {\n  return (\n    <div style={{minHeight:'100vh',padding:'2rem',background:'#0f1115',color:'#e6edf3',fontFamily:'sans-serif'}}>\n      <h1 style={{fontSize:'1.25rem',fontWeight:600,marginBottom:'0.5rem'}}>Canvas: %%s</h1>\n      <p style={{color:'#8b949e',fontSize:'0.875rem'}}>Waiting for canvas explorations...</p>\n    </div>\n  )\n}\n" %s > app/canvas/page.tsx && git add app/canvas/page.tsx && git -c user.name=Canvas -c user.email=canvas@switchyard.local commit -m "scaffold: canvas entry page"; fi`, shellQuotePath(plan.Path), shellQuotePath(title)))
	now := time.Now().Unix()
	s := &CanvasSession{
		ID: id, Title: title, WorkspaceID: ws.ID, WorkspacePath: ws.Path, Host: ws.Host,
		WorktreePath: plan.Path, Branch: plan.Branch, Status: "ready", Server: "stopped",
		Executor: executor, Model: model, DialKit: dialkit, CreatedAt: now, LastActiveAt: now,
	}
	if parent != nil {
		s.ParentID = parent.ID
	}
	db, err := openCanvasDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	dk := 0
	if dialkit {
		dk = 1
	}
	if _, err := db.Exec(`INSERT INTO canvas_sessions(`+canvasCols+`) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		s.ID, s.Title, s.WorkspaceID, s.WorkspacePath, s.Host, s.WorktreePath, s.Branch, 0, "", s.Status, s.Server,
		s.Executor, s.Model, dk, 0, "", s.ParentID, now, now); err != nil {
		_, _ = workerShell(ws.Path, "canvas: rollback", gitWorktreeRemoveScript(plan))
		return nil, err
	}
	return s, nil
}

// SendCanvasMessage records the user turn and runs the agent asynchronously.
func SendCanvasMessage(id, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("message required")
	}
	s, err := GetCanvasSession(id)
	if err != nil {
		return err
	}
	if s.Status == "discarded" {
		return fmt.Errorf("session was discarded")
	}
	if s.Turns >= CanvasMaxTurns {
		return fmt.Errorf("turn cap reached (%d); fork the session to continue", CanvasMaxTurns)
	}
	db, err := openCanvasDB()
	if err != nil {
		return err
	}
	res, err := db.Exec(`UPDATE canvas_sessions SET status='working', last_error='', last_active_at=? WHERE id=? AND status IN ('ready','error')`, time.Now().Unix(), id)
	db.Close()
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return fmt.Errorf("session is busy")
	}
	addCanvasMessage(id, "user", text)
	go runCanvasTurn(*s, text)
	return nil
}

func runCanvasTurn(s CanvasSession, text string) {
	turn := s.Turns + 1
	res, err := DispatchRemoteRaw(NodeDispatchRequest{
		TaskID:      fmt.Sprintf("canvas-%s-%d", s.ID, turn),
		Title:       "canvas: " + s.Title,
		Workspace:   s.WorktreePath,
		Message:     CanvasMandate(&s, text),
		Executor:    s.Executor,
		HarnessKind: s.Executor,
		Model:       s.Model,
		TimeoutS:    int((20 * time.Minute).Seconds()),
	}, 22*time.Minute)

	reply, failure := "", ""
	switch {
	case err != nil:
		failure = err.Error()
	case res == nil:
		failure = "agent returned no result"
	default:
		reply = res.Output
		if !res.Success {
			failure = res.Error
			if failure == "" {
				failure = "agent turn failed"
			}
		}
	}
	if strings.TrimSpace(reply) != "" {
		addCanvasMessage(s.ID, "assistant", reply)
	}

	// Path guard: revert anything outside the allow list, then commit the rest.
	if out, code := workerShell(s.WorktreePath, "canvas: guard", canvasGuardScript(&s)); code == 0 {
		if bad := CanvasViolations(ParsePorcelainZ(out), s.DialKit); len(bad) > 0 {
			_, _ = workerShell(s.WorktreePath, "canvas: revert", canvasRevertScript(&s, bad))
			addCanvasMessage(s.ID, "system", "Path guard reverted changes outside the canvas allow list:\n"+strings.Join(bad, "\n"))
			if failure == "" {
				failure = fmt.Sprintf("path guard reverted %d file(s) outside canvas/", len(bad))
			}
		}
	}
	_, _ = workerShell(s.WorktreePath, "canvas: commit", canvasCommitScript(&s))

	status := "ready"
	if failure != "" {
		status = "error"
	}
	_ = canvasUpdate(s.ID, `status=?, last_error=?, turns=turns+1, last_active_at=?`, status, trimErrStr(failure), time.Now().Unix())
}

// StartCanvasServer starts the dev server for a session.
func StartCanvasServer(id string) (*CanvasSession, error) {
	s, err := GetCanvasSession(id)
	if err != nil {
		return nil, err
	}
	if s.Status == "discarded" {
		return nil, fmt.Errorf("session was discarded")
	}
	all, err := ListCanvasSessions()
	if err != nil {
		return nil, err
	}
	used, running := map[int]bool{}, 0
	for _, o := range all {
		if o.Port > 0 {
			used[o.Port] = true
		}
		if o.Server == "running" && o.ID != id {
			running++
		}
	}
	if running >= CanvasMaxRunning {
		return nil, fmt.Errorf("max %d canvas dev servers running; stop one first", CanvasMaxRunning)
	}
	if s.Port == 0 {
		if s.Port, err = AllocCanvasPort(used); err != nil {
			return nil, err
		}
	}
	base := CanvasViewBase(s.ID)
	out, code := workerShell(s.WorktreePath, "canvas: start", canvasDevScript(s, base))
	if code != 0 {
		return nil, fmt.Errorf("dev server did not start: %s", truncateWorktreeOutput(out))
	}
	fw := ""
	if strings.Contains(out, "started next") {
		fw = "next"
	} else if strings.Contains(out, "started vite") {
		fw = "vite"
	}
	if fw == "" {
		fw = s.Framework
	}
	if err := canvasUpdate(id, `port=?, framework=?, server='running', last_active_at=?`, s.Port, fw, time.Now().Unix()); err != nil {
		return nil, err
	}
	return GetCanvasSession(id)
}

// StopCanvasServer stops the dev server and drops the tunnel.
func StopCanvasServer(id string) error {
	s, err := GetCanvasSession(id)
	if err != nil {
		return err
	}
	_, _ = workerShell(s.WorktreePath, "canvas: stop", canvasStopScript(id))
	closeCanvasTunnel(id)
	return canvasUpdate(id, `server='stopped'`)
}

// DiscardCanvasSession stops everything and removes the worktree and branch.
func DiscardCanvasSession(id string) error {
	s, err := GetCanvasSession(id)
	if err != nil {
		return err
	}
	_ = StopCanvasServer(id)
	plan := canvasPlan(s.WorkspacePath, id)
	_, _ = workerShell(s.WorkspacePath, "canvas: discard", gitWorktreeRemoveScript(plan))
	return canvasUpdate(id, `status='discarded', server='stopped'`)
}

// ForkCanvasSession commits the parent's work and branches a new session.
func ForkCanvasSession(id, title string) (*CanvasSession, error) {
	p, err := GetCanvasSession(id)
	if err != nil {
		return nil, err
	}
	if p.Status == "working" {
		return nil, fmt.Errorf("session is busy")
	}
	_, _ = workerShell(p.WorktreePath, "canvas: commit", canvasCommitScript(p))
	if strings.TrimSpace(title) == "" {
		title = p.Title + " (variation)"
	}
	return CreateCanvasSession(p.WorkspaceID, title, p.Executor, p.Model, p.DialKit, p)
}

// PromoteCanvasSession turns a session into an unstarted triage card. It never
// dispatches anything: implementing the canvas in production is a separate,
// reviewed card.
func PromoteCanvasSession(id, board string) (string, error) {
	s, err := GetCanvasSession(id)
	if err != nil {
		return "", err
	}
	msgs, _ := CanvasMessages(id)
	summary := ""
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" {
			summary = msgs[i].Content
			break
		}
	}
	body := fmt.Sprintf("Implement the approved canvas \"%s\" in production.\n\nCanvas branch: %s\nCanvas worktree: %s\nSource: canvas/ (and app/canvas or src/canvas)\n\nLatest canvas summary:\n%s",
		s.Title, s.Branch, s.WorktreePath, truncateWorktreeOutput(summary))
	t := &Task{
		Title:         "Implement canvas: " + s.Title,
		Body:          body,
		Status:        "triage",
		WorkspacePath: s.WorkspacePath,
	}
	if err := CreateTask(board, t); err != nil {
		return "", err
	}
	return t.ID, nil
}

// ReapIdleCanvasServers stops dev servers idle longer than CanvasIdleStop.
func ReapIdleCanvasServers(now time.Time) {
	all, err := ListCanvasSessions()
	if err != nil {
		return
	}
	for _, s := range all {
		if s.Server == "running" && now.Sub(time.Unix(s.LastActiveAt, 0)) > CanvasIdleStop {
			_ = StopCanvasServer(s.ID)
		}
	}
}

var (
	canvasTouchMu sync.Mutex
	canvasTouched = map[string]time.Time{}
)

// TouchCanvasSession records activity so the idle reaper keeps a viewed canvas
// alive. It is throttled because the proxy calls it on every asset request.
func TouchCanvasSession(id string) {
	canvasTouchMu.Lock()
	last := canvasTouched[id]
	if time.Since(last) < 30*time.Second {
		canvasTouchMu.Unlock()
		return
	}
	canvasTouched[id] = time.Now()
	canvasTouchMu.Unlock()
	_ = canvasUpdate(id, `last_active_at=?`, time.Now().Unix())
}

// GetCanvasFiles packages and returns all canvas source files from the session's worktree.
func GetCanvasFiles(id string) (map[string]string, error) {
	s, err := GetCanvasSession(id)
	if err != nil {
		return nil, err
	}
	// Tar up canvas/ app/canvas/ src/canvas/
	script := fmt.Sprintf(`cd %s && tar -czf - $(for d in canvas app/canvas src/canvas; do [ -d "$d" ] && echo "$d"; done) 2>/dev/null | base64`, shellQuotePath(s.WorktreePath))
	out, code := workerShell(s.WorktreePath, "canvas: get-files", script)
	if code != 0 {
		return nil, fmt.Errorf("read canvas files: %s", truncateWorktreeOutput(out))
	}
	raw := stripShellProvenance(out)
	raw = strings.ReplaceAll(raw, "\n", "")
	raw = strings.ReplaceAll(raw, "\r", "")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return map[string]string{}, nil
	}
	tarGz, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("decode tar.gz: %w", err)
	}
	gzr, err := gzip.NewReader(bytes.NewReader(tarGz))
	if err != nil {
		return nil, fmt.Errorf("gzip reader: %w", err)
	}
	defer gzr.Close()
	tr := tar.NewReader(gzr)
	files := make(map[string]string)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		content, err := io.ReadAll(io.LimitReader(tr, 4<<20))
		if err != nil {
			return nil, err
		}
		files[filepath.ToSlash(hdr.Name)] = string(content)
	}
	return files, nil
}

// SaveCanvasFiles writes updated files back to the session's worktree and commits them.
func SaveCanvasFiles(id string, files map[string]string) error {
	s, err := GetCanvasSession(id)
	if err != nil {
		return err
	}
	for rel := range files {
		if !CanvasPathAllowed(rel, s.DialKit) {
			return fmt.Errorf("path not allowed: %s", rel)
		}
	}
	for rel, content := range files {
		dir := path.Dir(rel)
		script := fmt.Sprintf(`cd %s && mkdir -p %s && cat << 'EOF_SW_CANVAS' > %s
%s
EOF_SW_CANVAS
git add -A -- %s
`, shellQuotePath(s.WorktreePath), shellQuotePath(dir), shellQuotePath(rel), content, shellQuotePath(rel))
		out, code := workerShell(s.WorktreePath, "canvas: save-file", script)
		if code != 0 {
			return fmt.Errorf("save file %s: %s", rel, truncateWorktreeOutput(out))
		}
	}
	commitScript := fmt.Sprintf(`cd %s && git diff --cached --quiet || git -c user.name=Canvas -c user.email=canvas@switchyard.local commit -m "canvas: sync dialkit tweaks"`, shellQuotePath(s.WorktreePath))
	_, _ = workerShell(s.WorktreePath, "canvas: commit-save", commitScript)
	return canvasUpdate(id, `last_active_at=?`, time.Now().Unix())
}
