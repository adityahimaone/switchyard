package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestChatPromptIncludesAttachmentAnalysisBeforeUserIntent(t *testing.T) {
	got := formatChatAttachmentPrompt("Review this screenshot and tell me next step", []string{"image shows login error", "image contains stack trace"})
	want := "Attached image analysis:\n- image shows login error\n- image contains stack trace\n\nUser request:\nReview this screenshot and tell me next step"
	if got != want {
		t.Fatalf("prompt=%q, want %q", got, want)
	}
}

func TestChatPromptWithoutAttachmentAnalysisKeepsUserPrompt(t *testing.T) {
	if got := formatChatAttachmentPrompt("Continue with task", nil); got != "Continue with task" {
		t.Fatalf("prompt=%q", got)
	}
}

func TestChatSessionAutoTitleUsesFirstPrompt(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("New chat", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := AutoTitleChatSession(s.ID, "  Fix workspace routing  "); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Fix workspace routing" {
		t.Fatalf("title=%q", got.Title)
	}
	if err := AutoTitleChatSession(s.ID, "second prompt"); err != nil {
		t.Fatal(err)
	}
	got, err = GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "Fix workspace routing" {
		t.Fatalf("title changed=%q", got.Title)
	}
}

func TestChatLifecycleEventIncludesIdentity(t *testing.T) {
	ch := Hub.Subscribe()
	defer Hub.Unsubscribe(ch)
	r := &ChatRun{SessionID: "cs_test", ID: "cr_test", MessageID: "cm_test", State: "running"}
	broadcastChatLifecycle(r)
	select {
	case ev := <-ch:
		if ev.Kind != "chat_run_state" {
			t.Fatalf("kind=%s", ev.Kind)
		}
		payload, ok := ev.Data.(ChatLifecycleEvent)
		if !ok || payload.SessionID != r.SessionID || payload.RunID != r.ID || payload.MessageID != r.MessageID || payload.State != r.State {
			t.Fatalf("payload=%+v", ev.Data)
		}
	default:
		t.Fatal("lifecycle event not broadcast")
	}
}

func TestChatSessionActiveRun(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("New chat", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	m, err := CreateChatMessage(s.ID, "user", "running prompt", "")
	if err != nil {
		t.Fatal(err)
	}
	r, err := CreateChatRun(s.ID, m.ID, "hermes", "default", "", "", m.Content)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ActiveChatRun(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.ID != r.ID {
		t.Fatalf("active run=%+v", got)
	}
	if err := UpdateChatRunState(r.ID, "done", "ok", ""); err != nil {
		t.Fatal(err)
	}
	got, err = ActiveChatRun(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("finished run returned: %+v", got)
	}
}

func TestChatSessionMessageRunLifecycle(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if _, err := os.Stat(filepath.Join(home, "kanban")); !os.IsNotExist(err) {
		t.Fatalf("test home unexpectedly initialized: %v", err)
	}

	s, err := CreateChatSession("API health", "hermes", "default", "development", "")
	if err != nil {
		t.Fatal(err)
	}
	m, err := CreateChatMessage(s.ID, "user", "Check health", "")
	if err != nil {
		t.Fatal(err)
	}
	a, err := StoreAttachmentBytes([]byte("\x89PNG\r\n\x1a\nchat-attachment"), "check.png")
	if err != nil {
		t.Fatal(err)
	}
	if err := LinkChatAttachment(m.ID, a.ID); err != nil {
		t.Fatal(err)
	}
	r, err := CreateChatRun(s.ID, m.ID, "hermes", "default", "development", "", m.Content)
	if err != nil {
		t.Fatal(err)
	}
	if r.State != "loading" {
		t.Fatalf("state=%q", r.State)
	}
	if err := AppendChatRunEvent(r.ID, "running", `{"state":"running"}`); err != nil {
		t.Fatal(err)
	}
	if err := UpdateChatRunState(r.ID, "done", "all healthy", ""); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatRun(r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.State != "done" || got.Output != "all healthy" || got.EndedAt == nil {
		t.Fatalf("unexpected run: %+v", got)
	}
	events, err := ListChatRunEvents(r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 {
		t.Fatalf("events=%d, want 3", len(events))
	}
	messages, err := ListChatMessages(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 || messages[0].Content != "Check health" {
		t.Fatalf("messages=%+v", messages)
	}
	if len(messages[0].Attachments) != 1 || messages[0].Attachments[0].Filename != "check.png" {
		t.Fatalf("message attachments=%+v", messages[0].Attachments)
	}
}

func TestChatRejectsInvalidAgentAndEmptyMessage(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := CreateChatSession("x", "unknown", "default", "", ""); err == nil {
		t.Fatal("invalid agent accepted")
	}
	s, err := CreateChatSession("x", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := CreateChatMessage(s.ID, "user", " ", ""); err == nil {
		t.Fatal("empty message accepted")
	}
}

func TestChatSessionHermesIDRoundTrip(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("t", "hermes", "default", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetHermesSessionID(s.ID, "sess_abc"); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.HermesSessionID != "sess_abc" {
		t.Fatalf("want sess_abc got %q", got.HermesSessionID)
	}
	if err := ClearHermesSessionID(s.ID); err != nil {
		t.Fatal(err)
	}
	got, err = GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.HermesSessionID != "" {
		t.Fatalf("expected cleared, got %q", got.HermesSessionID)
	}
}
