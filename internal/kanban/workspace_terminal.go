package kanban

import (
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

type TerminalSession struct {
	SessionID string `json:"session_id"`
	Transport string `json:"transport"`
	Host      string `json:"host,omitempty"`
}

var terminalSessions = struct {
	sync.Mutex
	m map[string]*exec.Cmd
}{m: make(map[string]*exec.Cmd)}

func StartWorkspaceTerminal(ws Workspace, command string) (TerminalSession, error) {
	if strings.TrimSpace(ws.ID) == "" || strings.TrimSpace(ws.Path) == "" {
		return TerminalSession{}, fmt.Errorf("workspace not registered")
	}
	if ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1" {
		return TerminalSession{}, fmt.Errorf("remote workspace requires node-agent")
	}
	command = strings.TrimSpace(command)
	if command == "" {
		return TerminalSession{}, fmt.Errorf("command required")
	}
	sid := newChatID("term")
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = localWorkspacePath(ws.Path)
	terminalSessions.Lock()
	terminalSessions.m[sid] = cmd
	terminalSessions.Unlock()
	if err := cmd.Start(); err != nil {
		terminalSessions.Lock()
		delete(terminalSessions.m, sid)
		terminalSessions.Unlock()
		return TerminalSession{}, fmt.Errorf("terminal start failed: %w", err)
	}
	go func() {
		_ = cmd.Wait()
		terminalSessions.Lock()
		delete(terminalSessions.m, sid)
		terminalSessions.Unlock()
	}()
	return TerminalSession{SessionID: sid, Transport: "local"}, nil
}
