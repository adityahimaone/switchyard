package kanban

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestChatExecutorArgs(t *testing.T) {
	cases := []struct{ name, agent, prompt, want string }{
		{"hermes", "hermes", "explain this implementation in detail", "chat -Q --reasoning minimal"},
		{"fast", "hermes", "hello", "chat -Q --reasoning none"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args, err := chatCommand(tc.agent, "default", "model-x", tc.prompt)
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

func TestTodayChatAnswer(t *testing.T) {
	got, ok := todayChatAnswer("hari ini hari apa", time.Date(2026, 9, 14, 0, 0, 0, 0, time.FixedZone("CST", 8*60*60)))
	if !ok || got != "Hari ini Senin, 14 September 2026." {
		t.Fatalf("got=%q ok=%v", got, ok)
	}
	if _, ok := todayChatAnswer("summarize this", time.Now()); ok {
		t.Fatal("non-date prompt matched fast path")
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

func TestGreetingChatAnswer(t *testing.T) {
	cases := []string{"hello", "hi", "halo", "hey", "hai", "Hello!", "HALO"}
	for _, c := range cases {
		if _, ok := greetingChatAnswer(c); !ok {
			t.Fatalf("greeting %q not matched", c)
		}
	}
	if _, ok := greetingChatAnswer("summarize this workspace in detail"); ok {
		t.Fatal("long prompt matched greeting")
	}
}

func TestGreetingChatAnswerContent(t *testing.T) {
	got, ok := greetingChatAnswer("hello")
	if !ok || got == "" {
		t.Fatalf("got=%q ok=%v", got, ok)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
