package kanban

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
	TaskID    string `json:"task_id"`
	Title     string `json:"title,omitempty"`
	Board     string `json:"board"`
	Message   string `json:"message"`
	Workspace string `json:"workspace"`
	Model     string `json:"model,omitempty"`
	Provider  string `json:"provider,omitempty"`
	Executor  string `json:"executor,omitempty"`
	Command   string `json:"command,omitempty"`
}

// NodeDispatchResult mirrors transport.ResultRequest.
type NodeDispatchResult struct {
	TaskID     string `json:"task_id"`
	Success    bool   `json:"success"`
	Output     string `json:"output"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"duration_ms"`
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
	st.Status = "up"
	broadcastEvent("node_health", st)
	return &st, nil
}

// DispatchRemote sends one task to the node-agent and waits (bounded) for the
// result. node-agent routes by workspace prefix; an unknown workspace falls
// back to the first online node.
func DispatchRemote(req NodeDispatchRequest, wait time.Duration) (*NodeDispatchResult, error) {
	if strings.TrimSpace(req.TaskID) == "" {
		return nil, fmt.Errorf("task_id required")
	}
	if strings.TrimSpace(req.Workspace) == "" {
		return nil, fmt.Errorf("workspace required (remote dispatch is workspace-scoped)")
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
		return nil, fmt.Errorf("node-agent unreachable: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("node-agent dispatch %d: %s", resp.StatusCode, trimErrStr(string(body)))
	}
	var ack struct {
		Status     string `json:"status"`
		NodeID     string `json:"node_id"`
		Transport  string `json:"transport"`
		DeliveryID string `json:"delivery_id"`
	}
	if err := json.Unmarshal(body, &ack); err != nil {
		return nil, fmt.Errorf("node-agent bad ack: %s", trimErrStr(string(body)))
	}

	// live flow tracking: dispatched + running
	flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowDispatched})
	flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowRunning})
	if db, err := openDB(req.Board); err == nil {
		_ = insertEvent(db, req.TaskID, "remote_dispatched", map[string]any{"node_id": ack.NodeID})
		_, _ = db.Exec(`UPDATE tasks SET status='running' WHERE id=?`, req.TaskID)
		db.Close()
	}

	// poll result + live progress tail
	deadline := time.Now().Add(wait)
	pc := &http.Client{Timeout: 5 * time.Second}
	off := 0
	for time.Now().Before(deadline) {
		time.Sleep(1 * time.Second)
		// tail progress before checking result so live log appears even before completion
		if poff, txt := fetchProgress(pc, req.TaskID, off); txt != "" {
			_ = AppendWorkerLog(req.Board, req.TaskID, txt)
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
		// live flow tracking: done / failed
		stage := FlowDone
		evtKind := "completed"
		if !res.Success {
			stage = FlowFailed
			evtKind = "failed"
		}
		flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: stage})
		if db, err := openDB(req.Board); err == nil {
			_ = insertEvent(db, req.TaskID, evtKind, map[string]any{"output": res.Output, "error": res.Error})
			now := time.Now().Unix()
			newStatus := "blocked"
			if res.Success {
				newStatus = "review"
			}
			_, _ = db.Exec(`UPDATE tasks SET status=?, completed_at=?, result=? WHERE id=? AND status='running'`,
				newStatus, now, res.Output, req.TaskID)
			db.Close()
		}
		return &res, nil
	}
	// live flow tracking: timeout = failed
	flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowFailed})
	if db, err := openDB(req.Board); err == nil {
		_ = insertEvent(db, req.TaskID, "failed", map[string]any{"reason": "timeout"})
		_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status='running'`, time.Now().Unix(), "remote watcher timeout", req.TaskID)
		db.Close()
	}
	return nil, fmt.Errorf("timeout after %s waiting for result of %s (node %s)", wait, req.TaskID, ack.NodeID)
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
