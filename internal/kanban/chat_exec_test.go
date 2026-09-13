package kanban

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChatExecutorArgs(t *testing.T) {
	cases := []struct{ name, agent, want string }{
		{"hermes", "hermes", "chat -Q"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args, err := chatCommand(tc.agent, "default", "model-x", "echo hi")
			if err != nil {
				t.Fatal(err)
			}
			joined := ""
			for _, arg := range args {
				joined += " " + arg
			}
			if !contains(joined, tc.want) {
				t.Fatalf("args=%q want %q", joined, tc.want)
			}
		})
	}
}

func TestChatExecutorRejectsUnknownAgent(t *testing.T) {
	for _, agent := range []string{"codex", "shell", "auto", "wat"} {
		if _, err := chatCommand(agent, "default", "", "x"); err == nil {
			t.Fatalf("agent %q accepted", agent)
		}
	}
}

func TestChatRemoteWorkspaceGuard(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := os.WriteFile(filepath.Join(os.Getenv("HERMES_HOME"), "workspaces.json"), []byte(`{"workspaces":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if isLocalWorkspace("/Users/adit/project") {
		t.Fatal("remote path classified local")
	}
	if isLocalWorkspace("C:\\project") {
		t.Fatal("windows path classified local")
	}
}

func TestChatContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if ctx.Err() == nil {
		t.Fatal("cancel failed")
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
