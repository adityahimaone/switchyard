package kanban

import (
	"bytes"
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// nodeAgent dispatches remote-workspace tasks through the node-agent server
// (~/apps/node-agent, pm2 :8788). The agent on each host long-polls
// /api/nodes/{id}/poll, runs the prompt (hermes chat or shell) in the
// workspace, and posts a result. This is the permanent fix for remote paths:
// the VPS hermes dispatcher can only mkdir/chdir LOCALLY, so /Users/...
// workspaces must never reach it — they route here instead.

func nodeAgentBase() string {
	if v := os.Getenv("KANBAN_NODE_AGENT"); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://127.0.0.1:8788"
}

// nodeAgentToken reads the shared secret for the X-Node-Agent-Token header.
// Kept in ~/.hermes/node-agent.env (chmod 600) so every local consumer
// (kanban-board, gateway watcher) reads the same value without shell exports.
func nodeAgentToken() string {
	if v := os.Getenv("NODE_AGENT_TOKEN"); v != "" {
		return v
	}
	raw, err := os.ReadFile(filepath.Join(hermesHome(), "node-agent.env"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if v, ok := strings.CutPrefix(line, "NODE_AGENT_TOKEN="); ok {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// NodeDispatchRequest mirrors transport.DispatchRequest on the node-agent.
type NodeDispatchRequest struct {
	TaskID         string `json:"task_id"`
	CardID         string `json:"-"`
	Title          string `json:"title,omitempty"`
	Board          string `json:"board"`
	Message        string `json:"message"`
	Workspace      string `json:"workspace"`
	Model          string `json:"model,omitempty"`
	Provider       string `json:"provider,omitempty"`
	Executor       string `json:"executor,omitempty"`
	Command        string `json:"command,omitempty"`
	ExecutionMode  string `json:"execution_mode,omitempty"` // direct|agentic
	NoRTK          bool   `json:"no_rtk,omitempty"`         // preserve machine-readable command output
	MaxIterations  int    `json:"max_iterations,omitempty"`
	Acceptance     string `json:"acceptance,omitempty"`
	DSHWorkspaceID string `json:"dsh_workspace_id,omitempty"`
	DSHSessionID   string `json:"dsh_session_id,omitempty"`
	LastTurnSeq    *int64 `json:"last_turn_seq,omitempty"`
	LastCommentID  *int64 `json:"last_comment_id,omitempty"`
	RunID          string `json:"run_id,omitempty"`
	// SessionContinuation tells worker to prompt existing DSHSessionID instead of creating a cold session.
	SessionContinuation bool `json:"session_continuation,omitempty"`
}

// NodeDispatchResult mirrors transport.ResultRequest.
type NodeDispatchResult struct {
	TaskID         string `json:"task_id"`
	Success        bool   `json:"success"`
	Output         string `json:"output"`
	Error          string `json:"error,omitempty"`
	DurationMs     int64  `json:"duration_ms"`
	DSHWorkspaceID string `json:"dsh_workspace_id,omitempty"`
	WorkspaceID    string `json:"workspace_id,omitempty"`
	DSHSessionID   string `json:"dsh_session_id,omitempty"`
	SessionID      string `json:"session_id,omitempty"`
	LastTurnSeq    *int64 `json:"last_turn_seq,omitempty"`
}

var dshSessionProof = regexp.MustCompile(`(?i)(?:dsh_session_id|session_id|Session)(?:[:=])[[:space:]]*([^[:space:]]+)`)

type HarnessBinding struct {
	CardID             string `json:"card_id"`
	WorkspacePath      string `json:"workspace_path"`
	HarnessWorkspaceID string `json:"harness_workspace_id"`
	HarnessSessionID   string `json:"harness_session_id"`
	LastTurnSeq        int64  `json:"last_turn_seq"`
	LastCommentID      int64  `json:"last_comment_id"`
	Status             string `json:"status"`
}

func DeterministicDSHSessionID(boardID, cardID string) string {
	h := sha1.Sum([]byte(boardID + "/" + cardID))
	return "switchyard-card-" + hex.EncodeToString(h[:8])
}

// ResolveHarnessBinding returns durable card continuity. existed reports whether worker must prompt an existing session.
func ResolveHarnessBinding(db *sql.DB, boardID, cardID, workspacePath string) (HarnessBinding, bool, error) {
	if err := ensureHarnessBindingsSchema(db); err != nil {
		return HarnessBinding{}, false, err
	}
	workspacePath = filepath.Clean(strings.TrimSpace(workspacePath))
	if workspacePath == "." || workspacePath == "" {
		return HarnessBinding{}, false, fmt.Errorf("workspace path required")
	}
	var b HarnessBinding
	err := db.QueryRow(`SELECT card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status FROM harness_bindings WHERE card_id=?`, cardID).
		Scan(&b.CardID, &b.WorkspacePath, &b.HarnessWorkspaceID, &b.HarnessSessionID, &b.LastTurnSeq, &b.LastCommentID, &b.Status)
	if err == nil {
		if filepath.Clean(b.WorkspacePath) != workspacePath {
			return HarnessBinding{}, false, fmt.Errorf("card %s is bound to workspace %q, not %q", cardID, b.WorkspacePath, workspacePath)
		}
		continuation := b.Status != "active" && b.HarnessWorkspaceID != "" && b.HarnessSessionID != ""
		return b, continuation, nil
	}
	if err != sql.ErrNoRows {
		return HarnessBinding{}, false, err
	}

	var legacySessionID string
	_ = db.QueryRow(`SELECT COALESCE(dsh_session_id,'') FROM tasks WHERE id=?`, cardID).Scan(&legacySessionID)
	legacySessionID = strings.TrimSpace(legacySessionID)
	existed := legacySessionID != ""
	status := "active"
	if existed {
		status = "idle"
	}
	b = HarnessBinding{CardID: cardID, WorkspacePath: workspacePath, HarnessSessionID: legacySessionID, LastTurnSeq: -1, Status: status}
	if !existed {
		b.HarnessSessionID = DeterministicDSHSessionID(boardID, cardID)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT OR IGNORE INTO harness_bindings (card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status, created_at, updated_at) VALUES (?,?,?,?,?,0,?,?,?)`, b.CardID, b.WorkspacePath, "", b.HarnessSessionID, b.LastTurnSeq, b.Status, now, now); err != nil {
		return HarnessBinding{}, false, err
	}
	if err := db.QueryRow(`SELECT card_id, workspace_path, harness_workspace_id, harness_session_id, last_turn_seq, last_comment_id, status FROM harness_bindings WHERE card_id=?`, cardID).
		Scan(&b.CardID, &b.WorkspacePath, &b.HarnessWorkspaceID, &b.HarnessSessionID, &b.LastTurnSeq, &b.LastCommentID, &b.Status); err != nil {
		return HarnessBinding{}, false, err
	}
	if filepath.Clean(b.WorkspacePath) != workspacePath {
		return HarnessBinding{}, false, fmt.Errorf("card %s is bound to workspace %q, not %q", cardID, b.WorkspacePath, workspacePath)
	}
	return b, b.Status != "active" && b.HarnessWorkspaceID != "" && b.HarnessSessionID != "", nil
}

type dshResultIdentity struct {
	sessionID   string
	workspaceID string
	valid       bool
}

func resolveDSHResultIdentity(req NodeDispatchRequest, result NodeDispatchResult) (dshResultIdentity, error) {
	sessionID := strings.TrimSpace(result.DSHSessionID)
	if sessionID == "" {
		sessionID = strings.TrimSpace(result.SessionID)
	}
	if sessionID == "" {
		match := dshSessionProof.FindStringSubmatch(result.Output)
		if len(match) == 2 {
			sessionID = strings.TrimSpace(match[1])
		}
	}
	returnedSession := sessionID != ""
	if expected := strings.TrimSpace(req.DSHSessionID); sessionID != "" && expected != "" && sessionID != expected {
		return dshResultIdentity{}, fmt.Errorf("worker returned session %q, dispatched session was %q", sessionID, expected)
	}
	if sessionID == "" && (req.SessionContinuation || !result.Success || result.LastTurnSeq != nil) {
		sessionID = strings.TrimSpace(req.DSHSessionID)
	}

	workspaceID := strings.TrimSpace(result.DSHWorkspaceID)
	if workspaceID == "" {
		workspaceID = strings.TrimSpace(result.WorkspaceID)
	}
	returnedWorkspace := workspaceID != ""
	if expected := strings.TrimSpace(req.DSHWorkspaceID); workspaceID != "" && expected != "" && workspaceID != expected {
		return dshResultIdentity{}, fmt.Errorf("worker returned workspace %q, dispatched workspace was %q", workspaceID, expected)
	}
	if workspaceID == "" && (req.SessionContinuation || !result.Success || result.LastTurnSeq != nil) {
		workspaceID = strings.TrimSpace(req.DSHWorkspaceID)
	}
	if result.Success && !returnedSession {
		return dshResultIdentity{}, fmt.Errorf("worker result omitted session id")
	}
	if result.Success && !returnedWorkspace {
		return dshResultIdentity{}, fmt.Errorf("worker result omitted workspace id")
	}
	if result.Success && result.LastTurnSeq == nil {
		return dshResultIdentity{}, fmt.Errorf("worker result omitted last turn sequence")
	}
	if result.Success && req.LastTurnSeq != nil && *result.LastTurnSeq <= *req.LastTurnSeq {
		return dshResultIdentity{}, fmt.Errorf("worker returned stale turn sequence %d, dispatched cursor was %d", *result.LastTurnSeq, *req.LastTurnSeq)
	}
	return dshResultIdentity{sessionID: sessionID, workspaceID: workspaceID, valid: true}, nil
}

func updateDSHBindingTx(tx *sql.Tx, taskID string, commentID *int64, result NodeDispatchResult, identity dshResultIdentity) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if !identity.valid {
		result, err := tx.Exec(`UPDATE harness_bindings SET status='error', updated_at=? WHERE card_id=?`, now, taskID)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected != 1 {
			return fmt.Errorf("harness binding missing for card %s", taskID)
		}
		return nil
	}
	if identity.sessionID == "" {
		return nil
	}
	if _, err := tx.Exec(`UPDATE tasks SET dsh_session_id=? WHERE id=?`, identity.sessionID, taskID); err != nil {
		return err
	}
	ready := result.Success && identity.workspaceID != ""
	updated, err := tx.Exec(`UPDATE harness_bindings SET harness_session_id=?, harness_workspace_id=CASE WHEN ?='' THEN harness_workspace_id ELSE ? END, last_turn_seq=CASE WHEN ? IS NOT NULL AND ? > last_turn_seq THEN ? ELSE last_turn_seq END, last_comment_id=CASE WHEN ? AND ? IS NOT NULL AND ? > last_comment_id THEN ? ELSE last_comment_id END, status=CASE WHEN ? THEN 'idle' ELSE 'error' END, updated_at=? WHERE card_id=?`, identity.sessionID, identity.workspaceID, identity.workspaceID, result.LastTurnSeq, result.LastTurnSeq, result.LastTurnSeq, result.Success, commentID, commentID, commentID, ready, now, taskID)
	if err != nil {
		return err
	}
	affected, err := updated.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return fmt.Errorf("harness binding missing for card %s", taskID)
	}
	return nil
}

func saveDSHSessionID(db *sql.DB, taskID, fallbackSessionID, fallbackWorkspaceID string, fallbackCommentID *int64, continuation bool, result NodeDispatchResult) {
	req := NodeDispatchRequest{DSHSessionID: fallbackSessionID, DSHWorkspaceID: fallbackWorkspaceID, SessionContinuation: continuation}
	identity, err := resolveDSHResultIdentity(req, result)
	if err != nil {
		return
	}
	tx, err := db.Begin()
	if err != nil {
		return
	}
	if err := updateDSHBindingTx(tx, taskID, fallbackCommentID, result, identity); err != nil {
		_ = tx.Rollback()
		return
	}
	_ = tx.Commit()
}

func finalizeRemoteResult(db *sql.DB, req NodeDispatchRequest, taskID, eventKind string, result NodeDispatchResult, identity dshResultIdentity) (bool, error) {
	tx, err := db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	baseline := int64(0)
	hasBaseline := req.LastCommentID != nil
	if hasBaseline {
		baseline = *req.LastCommentID
	}
	failure := ""
	if !result.Success {
		failure = result.Error
		if failure == "" {
			failure = result.Output
		}
	}
	args := []any{hasBaseline, taskID, baseline, result.Success, time.Now().Unix(), result.Output, trimErrStr(failure), taskID}
	query := `UPDATE tasks SET status=CASE WHEN ? AND EXISTS (SELECT 1 FROM task_comments WHERE task_id=? AND id>?) THEN 'todo' WHEN ? THEN 'review' ELSE 'blocked' END, completed_at=?, result=?, last_failure_error=?, current_run_id=NULL WHERE id=? AND status='running'`
	if req.RunID != "" {
		query += ` AND current_run_id=?`
		args = append(args, req.RunID)
	}
	updated, err := tx.Exec(query, args...)
	if err != nil {
		return false, err
	}
	affected, err := updated.RowsAffected()
	if err != nil || affected != 1 {
		return false, err
	}
	if req.Executor == "dsh" {
		if err := updateDSHBindingTx(tx, taskID, req.LastCommentID, result, identity); err != nil {
			return false, err
		}
	}
	if err := insertEventTx(tx, taskID, eventKind, map[string]any{"executor": req.Executor, "output": result.Output, "error": result.Error, "duration_ms": result.DurationMs}); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func finalizeRemoteTimeout(db *sql.DB, req NodeDispatchRequest, taskID string) (bool, error) {
	tx, err := db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	baseline := int64(0)
	hasBaseline := req.LastCommentID != nil
	if hasBaseline {
		baseline = *req.LastCommentID
	}
	args := []any{hasBaseline, taskID, baseline, time.Now().Unix(), "dispatch_wait_timeout: remote watcher exceeded wait", taskID}
	query := `UPDATE tasks SET status=CASE WHEN ? AND EXISTS (SELECT 1 FROM task_comments WHERE task_id=? AND id>?) THEN 'todo' ELSE 'blocked' END, completed_at=?, last_failure_error=?, current_run_id=NULL WHERE id=? AND status='running'`
	if req.RunID != "" {
		query += ` AND current_run_id=?`
		args = append(args, req.RunID)
	}
	updated, err := tx.Exec(query, args...)
	if err != nil {
		return false, err
	}
	affected, err := updated.RowsAffected()
	if err != nil || affected != 1 {
		return false, err
	}
	if err := insertEventTx(tx, taskID, "failed", map[string]any{"reason": "timeout", "run_id": req.RunID}); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

// NodeAgentStatus is what GET /api/remote/nodes returns.
type NodeAgentStatus struct {
	Status string `json:"status"` // up | down
	Nodes  []struct {
		NodeID     string            `json:"node_id"`
		Hostname   string            `json:"hostname"`
		Workspaces []string          `json:"workspaces"`
		Executors  []string          `json:"executors,omitempty"`
		Versions   map[string]string `json:"versions,omitempty"`
		Transports []string          `json:"transports,omitempty"`
		Status     string            `json:"status"`
		LastSeen   string            `json:"last_seen"`
	} `json:"nodes,omitempty"`
	Error string `json:"error,omitempty"`
}

// NodeAgentHealth proxies node-agent /health.
func NodeAgentHealth() (*NodeAgentStatus, error) {
	c := &http.Client{Timeout: 5 * time.Second}
	hreq, err := http.NewRequest("GET", nodeAgentBase()+"/health", nil)
	if err != nil {
		st := &NodeAgentStatus{Status: "down", Error: err.Error()}
		broadcastEvent("node_health", st)
		return st, nil
	}
	if tok := nodeAgentToken(); tok != "" {
		hreq.Header.Set("X-Node-Agent-Token", tok)
	}
	resp, err := c.Do(hreq)
	if err != nil {
		st := &NodeAgentStatus{Status: "down", Error: err.Error()}
		broadcastEvent("node_health", st)
		return st, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	var st NodeAgentStatus
	if err := json.Unmarshal(body, &st); err != nil {
		down := &NodeAgentStatus{Status: "down", Error: err.Error()}
		broadcastEvent("node_health", down)
		return down, nil
	}
	// A healthy HTTP response only proves that the node-agent endpoint is
	// reachable. Preserve an explicit status from the agent and use "up" only
	// for the legacy response shape that omitted it.
	if strings.TrimSpace(st.Status) == "" {
		st.Status = "up"
	}
	broadcastEvent("node_health", st)
	return &st, nil
}

// DispatchRemote sends one task to the node-agent and waits (bounded) for the
// result. node-agent routes by workspace prefix; an unknown workspace falls
// back to the first online node.
func DispatchRemote(req NodeDispatchRequest, wait time.Duration) (*NodeDispatchResult, error) {
	return dispatchRemote(req, wait, true, nil)
}

// DispatchRemoteWithProgress forwards progress chunks as they arrive. The
// callback is intentionally optional so existing board/task callers keep the
// same behavior while chat can translate structured worker markers into chat
// run events.
func DispatchRemoteWithProgress(req NodeDispatchRequest, wait time.Duration, onProgress func(string)) (*NodeDispatchResult, error) {
	return dispatchRemote(req, wait, true, onProgress)
}

// DispatchRemoteRaw uses node-agent as a remote command channel without
// touching the Kanban task row. Review uses this for git commands.
func DispatchRemoteRaw(req NodeDispatchRequest, wait time.Duration) (*NodeDispatchResult, error) {
	return dispatchRemote(req, wait, false, nil)
}

func ClaimTaskRun(db *sql.DB, taskID string) (string, bool, error) {
	if err := ensureTaskExecutionColumns(db); err != nil {
		return "", false, err
	}
	runID := fmt.Sprintf("run_%x", time.Now().UnixNano())
	res, err := db.Exec(`UPDATE tasks SET status='running', started_at=?, completed_at=NULL, current_run_id=? WHERE id=? AND status IN ('todo','ready')`, time.Now().Unix(), runID, taskID)
	if err != nil {
		return "", false, err
	}
	affected, err := res.RowsAffected()
	return runID, affected == 1, err
}

func finalizeDispatchFailure(db *sql.DB, taskID, runID, reason string) error {
	if runID == "" {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`UPDATE tasks SET status='todo', started_at=NULL, completed_at=NULL, current_run_id=NULL, last_failure_error=? WHERE id=? AND status='running' AND current_run_id=?`, trimErrStr(reason), taskID, runID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return err
	}
	if err := insertEventTx(tx, taskID, "failed", map[string]any{"reason": reason, "run_id": runID}); err != nil {
		return err
	}
	return tx.Commit()
}

func (req NodeDispatchRequest) recordID() string {
	if req.CardID != "" {
		return req.CardID
	}
	return req.TaskID
}

func dispatchRemote(req NodeDispatchRequest, wait time.Duration, persistTask bool, onProgress func(string)) (*NodeDispatchResult, error) {
	recordID := req.recordID()
	if strings.TrimSpace(req.TaskID) == "" {
		return nil, fmt.Errorf("task_id required")
	}
	if strings.TrimSpace(req.Workspace) == "" {
		return nil, fmt.Errorf("workspace required (remote dispatch is workspace-scoped)")
	}
	if persistTask && req.CardID == "" {
		if db, err := openDB(req.Board); err == nil {
			var exists int
			_ = db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=?`, req.TaskID).Scan(&exists)
			db.Close()
			if exists == 1 {
				req.CardID = req.TaskID
				recordID = req.TaskID
			} else {
				persistTask = false
			}
		} else {
			persistTask = false
		}
	}
	if persistTask && req.RunID == "" {
		db, err := openDB(req.Board)
		if err != nil {
			return nil, err
		}
		runID, claimed, claimErr := ClaimTaskRun(db, recordID)
		db.Close()
		if claimErr != nil {
			return nil, claimErr
		}
		if !claimed {
			return nil, fmt.Errorf("task %s is not claimable", recordID)
		}
		req.TaskID = runID
		req.RunID = runID
	}
	c := &http.Client{Timeout: 10 * time.Second}
	buf, _ := json.Marshal(req)
	hreq, err := http.NewRequest("POST", nodeAgentBase()+"/api/dispatch", bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	hreq.Header.Set("Content-Type", "application/json")
	if tok := nodeAgentToken(); tok != "" {
		hreq.Header.Set("X-Node-Agent-Token", tok)
	}
	resp, err := c.Do(hreq)
	if err != nil {
		reason := fmt.Sprintf("node-agent unreachable: %v", err)
		if persistTask && req.RunID != "" {
			if db, openErr := openDB(req.Board); openErr == nil {
				_ = finalizeDispatchFailure(db, recordID, req.RunID, reason)
				db.Close()
			}
		}
		return nil, fmt.Errorf("node-agent unreachable: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != 200 {
		reason := fmt.Sprintf("node-agent dispatch %d: %s", resp.StatusCode, trimErrStr(string(body)))
		if persistTask && req.RunID != "" {
			if db, openErr := openDB(req.Board); openErr == nil {
				_ = finalizeDispatchFailure(db, recordID, req.RunID, reason)
				db.Close()
			}
		}
		return nil, fmt.Errorf("node-agent dispatch %d: %s", resp.StatusCode, trimErrStr(string(body)))
	}
	var ack struct {
		Status     string `json:"status"`
		NodeID     string `json:"node_id"`
		Transport  string `json:"transport"`
		DeliveryID string `json:"delivery_id"`
	}
	if err := json.Unmarshal(body, &ack); err != nil {
		reason := "node-agent bad ack: " + trimErrStr(string(body))
		if persistTask && req.RunID != "" {
			if db, openErr := openDB(req.Board); openErr == nil {
				_ = finalizeDispatchFailure(db, recordID, req.RunID, reason)
				db.Close()
			}
		}
		return nil, fmt.Errorf("node-agent bad ack: %s", trimErrStr(string(body)))
	}

	// live flow tracking: dispatched + running
	flowSet(FlowTask{TaskID: recordID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowDispatched})
	flowSet(FlowTask{TaskID: recordID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowRunning})
	if persistTask {
		if db, err := openDB(req.Board); err == nil {
			now := time.Now().Unix()
			if req.RunID == "" {
				_ = insertEvent(db, recordID, "remote_dispatched", map[string]any{"node_id": ack.NodeID, "started_at": now})
				_, _ = db.Exec(`UPDATE tasks SET status='running', started_at=?, completed_at=NULL WHERE id=?`, now, recordID)
			} else {
				var owned int
				_ = db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE id=? AND status='running' AND current_run_id=?`, recordID, req.RunID).Scan(&owned)
				if owned == 1 {
					_ = insertEvent(db, recordID, "remote_dispatched", map[string]any{"node_id": ack.NodeID, "started_at": now, "run_id": req.RunID})
				}
			}
			db.Close()
		}
	}

	// poll result + live progress tail
	deadline := time.Now().Add(wait)
	pc := &http.Client{Timeout: 5 * time.Second}
	off := 0
	for time.Now().Before(deadline) {
		time.Sleep(1 * time.Second)
		// tail progress before checking result so live log appears even before completion
		if poff, txt := fetchProgress(pc, req.TaskID, off); txt != "" {
			_ = AppendWorkerLog(req.Board, recordID, txt)
			executor := req.Executor
			if executor == "" {
				executor = "auto"
			}
			_ = PersistWorkerLogEvent(req.Board, recordID, executor, "stdout", txt, int64(poff))
			if strings.EqualFold(strings.TrimSpace(req.ExecutionMode), "agentic") {
				persistShellIterationEvents(req.Board, recordID, txt)
			}
			if onProgress != nil {
				onProgress(txt)
			}
			off = poff
		}
		preq, err := http.NewRequest("GET", nodeAgentBase()+"/api/results/"+req.TaskID, nil)
		if err != nil {
			continue
		}
		if tok := nodeAgentToken(); tok != "" {
			preq.Header.Set("X-Node-Agent-Token", tok)
		}
		r2, err := pc.Do(preq)
		if err != nil {
			continue
		}
		if r2.StatusCode == 404 {
			r2.Body.Close()
			continue
		}
		b2, _ := io.ReadAll(io.LimitReader(r2.Body, 1<<20))
		r2.Body.Close()
		if r2.StatusCode != 200 {
			continue
		}
		var res NodeDispatchResult
		if err := json.Unmarshal(b2, &res); err != nil {
			continue
		}
		if res.TaskID != "" && res.TaskID != req.TaskID {
			continue
		}
		identity := dshResultIdentity{valid: true}
		if req.Executor == "dsh" {
			var identityErr error
			identity, identityErr = resolveDSHResultIdentity(req, res)
			if identityErr != nil {
				identity.valid = false
				res.Success = false
				res.Error = "dsh_identity_rejected: " + identityErr.Error()
			}
		}
		evtKind := "completed"
		stage := FlowDone
		if !res.Success {
			evtKind = "failed"
			stage = FlowFailed
		}
		if persistTask {
			db, err := openDB(req.Board)
			if err != nil {
				return nil, err
			}
			finalized, finalizeErr := finalizeRemoteResult(db, req, recordID, evtKind, res, identity)
			db.Close()
			if finalizeErr != nil {
				return nil, fmt.Errorf("finalize remote result: %w", finalizeErr)
			}
			if !finalized {
				return &res, nil
			}
		}
		flowSet(FlowTask{TaskID: recordID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: stage})
		return &res, nil
	}
	if persistTask {
		db, err := openDB(req.Board)
		if err != nil {
			return nil, err
		}
		finalized, finalizeErr := finalizeRemoteTimeout(db, req, recordID)
		db.Close()
		if finalizeErr != nil {
			return nil, fmt.Errorf("finalize remote timeout: %w", finalizeErr)
		}
		if finalized {
			flowSet(FlowTask{TaskID: recordID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowFailed})
		}
	} else {
		flowSet(FlowTask{TaskID: recordID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowFailed})
	}
	return nil, fmt.Errorf("dispatch_wait_timeout: timeout after %s waiting for result of %s (node %s)", wait, req.TaskID, ack.NodeID)
}

func persistShellIterationEvents(slug, taskID, chunk string) {
	db, err := openDB(slug)
	if err != nil {
		return
	}
	defer db.Close()
	for _, line := range strings.Split(chunk, "\n") {
		const marker = "HERMES_EVENT: "
		idx := strings.Index(line, marker)
		if idx < 0 {
			continue
		}
		var event struct {
			Phase string `json:"phase"`
			Label string `json:"label"`
		}
		if json.Unmarshal([]byte(strings.TrimSpace(line[idx+len(marker):])), &event) != nil || event.Label == "" {
			continue
		}
		iteration := 0
		if strings.HasPrefix(event.Label, "Iteration ") {
			_, _ = fmt.Sscanf(event.Label, "Iteration %d", &iteration)
		} else if strings.HasPrefix(event.Label, "Planning shell iteration ") {
			_, _ = fmt.Sscanf(event.Label, "Planning shell iteration %d", &iteration)
		}
		_ = insertEvent(db, taskID, "shell_iteration", map[string]any{"phase": event.Phase, "label": event.Label, "iteration": iteration})
	}
}

// RemoteJobTimeout is the shared worker/control-plane timeout. The server
// override lets the control plane share a value with NODE_AGENT_JOB_TIMEOUT.
func RemoteJobTimeout() time.Duration {
	secs := 600
	for _, key := range []string{"KANBAN_NODE_AGENT_JOB_TIMEOUT", "NODE_AGENT_JOB_TIMEOUT"} {
		if v := os.Getenv(key); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				secs = n
				break
			}
		}
	}
	return time.Duration(secs) * time.Second
}

func RemoteDispatchWait() time.Duration { return RemoteJobTimeout() + 2*time.Minute }

// RemoteDispatchWaitFor gives agentic shell jobs enough time for multiple
// planner/execution cycles without changing the timeout for direct jobs.
func RemoteDispatchWaitFor(executionMode string) time.Duration {
	if strings.EqualFold(strings.TrimSpace(executionMode), "agentic") {
		secs := 1200
		for _, key := range []string{"KANBAN_NODE_AGENT_SHELL_AGENTIC_TIMEOUT", "NODE_AGENT_SHELL_AGENTIC_TIMEOUT"} {
			if v := os.Getenv(key); v != "" {
				if n, err := strconv.Atoi(v); err == nil && n > 0 {
					secs = n
					break
				}
			}
		}
		return time.Duration(secs)*time.Second + 2*time.Minute
	}
	return RemoteDispatchWait()
}

func trimErrStr(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 200 {
		s = s[:200] + "..."
	}
	return s
}
func fetchProgress(c *http.Client, taskID string, off int) (int, string) {
	url := fmt.Sprintf("%s/api/progress/%s?offset=%d", nodeAgentBase(), taskID, off)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return off, ""
	}
	if tok := nodeAgentToken(); tok != "" {
		req.Header.Set("X-Node-Agent-Token", tok)
	}
	resp, err := c.Do(req)
	if err != nil {
		return off, ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return off, ""
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var data struct {
		Text   string `json:"text"`
		Offset int    `json:"offset"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return off, ""
	}
	if data.Text == "" {
		return data.Offset, ""
	}
	return data.Offset, data.Text
}
