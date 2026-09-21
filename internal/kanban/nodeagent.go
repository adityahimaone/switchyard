package kanban

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
	TaskID        string `json:"task_id"`
	Title         string `json:"title,omitempty"`
	Board         string `json:"board"`
	Message       string `json:"message"`
	Workspace     string `json:"workspace"`
	Model         string `json:"model,omitempty"`
	Provider      string `json:"provider,omitempty"`
	Executor      string `json:"executor,omitempty"`
	Command       string `json:"command,omitempty"`
	ExecutionMode string `json:"execution_mode,omitempty"` // direct|agentic
	MaxIterations int    `json:"max_iterations,omitempty"`
	Acceptance    string `json:"acceptance,omitempty"`
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

func dispatchRemote(req NodeDispatchRequest, wait time.Duration, persistTask bool, onProgress func(string)) (*NodeDispatchResult, error) {
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
	if persistTask {
		if db, err := openDB(req.Board); err == nil {
			now := time.Now().Unix()
			_ = insertEvent(db, req.TaskID, "remote_dispatched", map[string]any{"node_id": ack.NodeID, "started_at": now})
			_, _ = db.Exec(`UPDATE tasks SET status='running', started_at=?, completed_at=NULL WHERE id=?`, now, req.TaskID)
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
			_ = AppendWorkerLog(req.Board, req.TaskID, txt)
			executor := req.Executor
			if executor == "" {
				executor = "auto"
			}
			_ = PersistWorkerLogEvent(req.Board, req.TaskID, executor, "stdout", txt, int64(poff))
			if strings.EqualFold(strings.TrimSpace(req.ExecutionMode), "agentic") {
				persistShellIterationEvents(req.Board, req.TaskID, txt)
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
		// live flow tracking: done / failed
		stage := FlowDone
		evtKind := "completed"
		if !res.Success {
			stage = FlowFailed
			evtKind = "failed"
		}
		flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: stage})
		if persistTask {
			if db, err := openDB(req.Board); err == nil {
				_ = insertEvent(db, req.TaskID, evtKind, map[string]any{"executor": req.Executor, "output": res.Output, "error": res.Error, "duration_ms": res.DurationMs})
				now := time.Now().Unix()
				newStatus := "blocked"
				if res.Success {
					newStatus = "review"
				}
				failure := ""
				if !res.Success {
					failure = res.Error
					if failure == "" {
						failure = res.Output
					}
				}
				_, _ = db.Exec(`UPDATE tasks SET status=?, completed_at=?, result=?, last_failure_error=? WHERE id=? AND status='running'`,
					newStatus, now, res.Output, trimErrStr(failure), req.TaskID)
				db.Close()
			}
		}
		return &res, nil
	}
	// live flow tracking: timeout = failed
	flowSet(FlowTask{TaskID: req.TaskID, Title: req.Title, Board: req.Board, NodeID: ack.NodeID, Executor: req.Executor, Transport: ack.Transport, Stage: FlowFailed})
	if persistTask {
		if db, err := openDB(req.Board); err == nil {
			_ = insertEvent(db, req.TaskID, "failed", map[string]any{"reason": "timeout"})
			_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status='running'`, time.Now().Unix(), "dispatch_wait_timeout: remote watcher exceeded wait", req.TaskID)
			db.Close()
		}
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
