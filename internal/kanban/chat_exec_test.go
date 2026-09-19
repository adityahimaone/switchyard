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
		{"hermes", "hermes", "explain this implementation in detail", "chat -Q --reasoning low"},
		{"fast", "hermes", "hello", "chat -Q --reasoning none"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args, err := chatCommand(tc.agent, "default", "model-x", tc.prompt, "")
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

func TestTimeChatAnswer(t *testing.T) {
	now := time.Date(2026, 9, 14, 21, 7, 0, 0, time.FixedZone("WIB", 7*60*60))
	got, ok := timeChatAnswer("jam berapa", now)
	if !ok || got != "Sekarang 21:07 WIB." {
		t.Fatalf("got=%q ok=%v", got, ok)
	}
	if _, ok := timeChatAnswer("sunset jam berapa", now); ok {
		t.Fatal("sunset prompt must wait for location-aware provider")
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
		if _, err := chatCommand(agent, "default", "", "x", ""); err == nil {
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

func TestChatCommandResume(t *testing.T) {
	// hermes_session_id set → --resume present
	args, err := chatCommand("hermes", "default", "", "hi", "sess_xyz")
	if err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, a := range args {
		joined += " " + a
	}
	if !contains(joined, "--resume") || !contains(joined, "sess_xyz") {
		t.Fatalf("resume flag missing: %v", args)
	}
	// empty → no --resume
	args2, _ := chatCommand("hermes", "default", "", "hi", "")
	joined2 := ""
	for _, a := range args2 {
		joined2 += " " + a
	}
	if contains(joined2, "--resume") {
		t.Fatalf("unexpected resume: %v", args2)
	}
}

func TestParseHermesSessionID(t *testing.T) {
	cases := []struct {
		name string
		out  string
		want string
	}{
		{"found", "some header\nSession: 20260914_175347_076ded\nShutting down…", "20260914_175347_076ded"},
		{"found_multiline", "│  Session: abc123_def      │", "abc123_def"},
		{"found_runtime_format", "session_id: 20260915_125120_01cdde", "20260915_125120_01cdde"},
		{"empty", "no session here", ""},
		{"empty_str", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseHermesSessionID(tc.out)
			if got != tc.want {
				t.Fatalf("got=%q want=%q", got, tc.want)
			}
		})
	}
}

func TestParseHermesStructuredEvent(t *testing.T) {
	event, ok := parseHermesStructuredEvent(`HERMES_EVENT: {"phase":"reading_skill","name":"ui-styling"}`)
	if !ok || event.Phase != "reading_skill" || event.Name != "ui-styling" {
		t.Fatalf("event=%+v ok=%v", event, ok)
	}
	if _, ok := parseHermesStructuredEvent("ordinary Hermes output"); ok {
		t.Fatal("ordinary output must not be treated as structured activity")
	}
	if got := stripHermesMetadata("answer\nHERMES_EVENT: {\"phase\":\"shell_command\"}\nSession: abc"); got != "answer" {
		t.Fatalf("metadata not stripped: %q", got)
	}
}

func TestDaemonHealthyMissingSocket(t *testing.T) {
	t.Setenv("HERMES_DAEMON_SOCK", filepath.Join(t.TempDir(), "missing.sock"))
	if daemonHealthy() {
		t.Fatal("expected missing daemon socket to be unhealthy")
	}
}

func TestDaemonSessionIDFromCompletedEvent(t *testing.T) {
	got := daemonSessionID(map[string]string{"kind": "completed", "session_id": "sess_room_2"})
	if got != "sess_room_2" {
		t.Fatalf("session id=%q", got)
	}
	if got := daemonSessionID(map[string]string{"kind": "tool_output"}); got != "" {
		t.Fatalf("unexpected session id=%q", got)
	}
}

func TestClearHermesSessionIDFunc(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("t", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetHermesSessionID(s.ID, "stale"); err != nil {
		t.Fatal(err)
	}
	ClearHermesSessionID(s.ID)
	got, _ := GetChatSession(s.ID)
	if got.HermesSessionID != "" {
		t.Fatalf("expected cleared, got %q", got.HermesSessionID)
	}
}
