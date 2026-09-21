package kanban

import (
	"context"
	"strings"
	"testing"
)

func TestRouteChatLocalFastPath(t *testing.T) {
	t.Setenv("TYPESAFE_API_KEY", "")
	route := RouteChat(context.Background(), "Room", "hello", "", 0, "")
	if route.Intent != "casual_chat" || route.Source != "local_fast_path" || route.NeedsWorkspace {
		t.Fatalf("route = %+v", route)
	}
}

func TestRouteChatLocalWorkspaceAndConfirmation(t *testing.T) {
	t.Setenv("TYPESAFE_API_KEY", "")
	route := RouteChat(context.Background(), "Repo work", "delete the old migration and deploy the change", "/workspace", 0, "")
	if route.Intent != "task_execution" || !route.NeedsWorkspace || !route.NeedsConfirmation {
		t.Fatalf("route = %+v", route)
	}
}

func TestRouteChatConfirmationContinuation(t *testing.T) {
	t.Setenv("TYPESAFE_API_KEY", "")
	route := RouteChat(context.Background(), "Repo work", "confirm", "/workspace", 0, "assistant: Confirmation required before execution")
	if route.Intent != "task_execution" || !route.NeedsWorkspace || route.NeedsConfirmation {
		t.Fatalf("route = %+v", route)
	}
}

func TestChatRoutingPromptContainsDecision(t *testing.T) {
	prompt := ChatRoutingPrompt(ChatRoute{Intent: "workspace_question", ContextScope: "workspace_focused", NeedsWorkspace: true, Confidence: 0.9})
	if prompt == "" || !chatContainsAny(prompt, "workspace_question", "workspace_focused") {
		t.Fatalf("prompt = %q", prompt)
	}
}

func TestRouteChatCreateTaskRequiresConfirmation(t *testing.T) {
	t.Setenv("TYPESAFE_API_KEY", "")
	route := RouteChat(context.Background(), "Room", "buat task perbaiki login", "", 0, "")
	if route.Intent != "create_kanban_task" || !route.NeedsConfirmation {
		t.Fatalf("route = %+v", route)
	}
}

func TestPrepareTaskExecutionMessageCompactsByScope(t *testing.T) {
	message := string(make([]byte, 17000))
	for i := range message {
		message = message[:i] + "x" + message[i+1:]
	}
	focused := PrepareTaskExecutionMessage("t_focus", message, TaskIdentity{Case: "coding", Scope: "focused", Confidence: 0.9})
	if len(focused) > 8300 || !strings.Contains(focused, "task context compacted") {
		t.Fatalf("focused message was not compacted: %d", len(focused))
	}
	none := PrepareTaskExecutionMessage("t_none", message, TaskIdentity{Case: "ops", Scope: "none", Confidence: 0.9})
	if len(none) > 4300 || !strings.Contains(none, "scope=none") {
		t.Fatalf("none message was not bounded: %d", len(none))
	}
}
