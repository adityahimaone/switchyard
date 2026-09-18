package kanban

import (
	"testing"
)

func TestStartWorkspaceTerminalRejectsUnregistered(t *testing.T) {
	ws := Workspace{ID: "", Path: "", Host: ""}
	if _, err := StartWorkspaceTerminal(ws, "echo hi"); err == nil {
		t.Fatal("unregistered workspace accepted")
	}
}

func TestStartWorkspaceTerminalRejectsRemoteWithoutAgent(t *testing.T) {
	ws := Workspace{ID: "mac", Path: "/Users/adit/project", Host: "mac-tailscale"}
	if _, err := StartWorkspaceTerminal(ws, "ls"); err == nil {
		t.Fatal("remote workspace without node-agent accepted for local terminal")
	}
}

func TestStartWorkspaceTerminalLocalReturnsSessionID(t *testing.T) {
	root := t.TempDir()
	ws := Workspace{ID: "local", Path: root, Host: "localhost"}
	sess, err := StartWorkspaceTerminal(ws, "echo ok")
	if err != nil {
		t.Fatal(err)
	}
	if sess.SessionID == "" {
		t.Fatal("empty session id")
	}
	if sess.Transport != "local" {
		t.Fatalf("unexpected transport: %s", sess.Transport)
	}
}
