package kanban

import "testing"

func TestChatAgentAllowlist(t *testing.T) {
	if !validChatAgents["hermes"] {
		t.Fatal("hermes missing from chat allowlist")
	}
	for _, agent := range []string{"codex", "shell", "auto"} {
		if validChatAgents[agent] {
			t.Fatalf("%s remains enabled for chat", agent)
		}
	}
}
