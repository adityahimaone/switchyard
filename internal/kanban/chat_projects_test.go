package kanban

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// seedWorkspaces writes a workspaces.json so ValidateProjectWorkspace has a
// registry to check against, mirroring the real ~/.hermes/workspaces.json.
func seedWorkspaces(t *testing.T, paths ...string) {
	t.Helper()
	items := make([]map[string]any, 0, len(paths))
	for i, p := range paths {
		items = append(items, map[string]any{
			"id": "ws" + string(rune('a'+i)), "name": filepath.Base(p), "path": p, "host": "mac-tailscale", "kind": "dir",
		})
	}
	raw, err := json.Marshal(map[string]any{"version": 1, "workspaces": items})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hermesHome(), "workspaces.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestValidateProjectWorkspaceRejectsUnregistered(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedWorkspaces(t, "/Users/dev/one")
	if err := ValidateProjectWorkspace("/Users/dev/one"); err != nil {
		t.Fatalf("registered path rejected: %v", err)
	}
	if err := ValidateProjectWorkspace("/Users/dev/two"); err == nil {
		t.Fatal("unregistered path accepted")
	}
	if err := ValidateProjectWorkspace("  "); err == nil {
		t.Fatal("blank path accepted")
	}
}

func TestCreateChatProjectPersistsWorkspaceAndExecutor(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedWorkspaces(t, "/Users/dev/one")
	p, err := CreateChatProject("Agents", "#abc", "/Users/dev/one", "dsh", `{"permission_mode":"danger-full-access"}`, "chat-to-code")
	if err != nil {
		t.Fatal(err)
	}
	if p.Workspace != "/Users/dev/one" || p.Executor != "dsh" || p.Options == "" || p.Description != "chat-to-code" {
		t.Fatalf("create lost fields: %+v", p)
	}
	items, err := ListChatProjects()
	if err != nil || len(items) != 1 {
		t.Fatalf("list=%v err=%v", items, err)
	}
	if items[0].Workspace != "/Users/dev/one" || items[0].Executor != "dsh" {
		t.Fatalf("list lost fields: %+v", items[0])
	}
	def, err := CreateChatProject("Plain", "", "/Users/dev/one", "", "", "")
	if err != nil || def.Executor != "hermes" {
		t.Fatalf("default executor: %+v err=%v", def, err)
	}
}

func TestCreateChatProjectRejectsBadWorkspaceAndExecutor(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedWorkspaces(t, "/Users/dev/one")
	if _, err := CreateChatProject("Bad", "", "/Users/dev/nope", "hermes", "", ""); err == nil {
		t.Fatal("unregistered workspace accepted")
	}
	if _, err := CreateChatProject("Bad2", "", "/Users/dev/one", "codex", "", ""); err == nil {
		t.Fatal("unsupported executor accepted")
	}
}

func TestUpdateChatProjectRebindsWorkspaceAndExecutor(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	seedWorkspaces(t, "/Users/dev/one", "/Users/dev/two")
	p, err := CreateChatProject("Agents", "", "/Users/dev/one", "hermes", "", "")
	if err != nil {
		t.Fatal(err)
	}
	ws, ex, opts := "/Users/dev/two", "commandcode", `{"mode":"plan"}`
	updated, err := UpdateChatProject(p.ID, nil, nil, &ws, &ex, &opts, nil)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Workspace != ws || updated.Executor != ex || updated.Options != opts {
		t.Fatalf("update lost fields: %+v", updated)
	}
	bad := "codex"
	if _, err := UpdateChatProject(p.ID, nil, nil, nil, &bad, nil, nil); err == nil {
		t.Fatal("update accepted unsupported executor")
	}
}

func TestExecutorSessionIDRoundTrip(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	s, err := CreateChatSession("t", "dsh", "default", "/Users/dev/one", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := SetExecutorOptions(s.ID, `{"permission_mode":"read-only"}`); err != nil {
		t.Fatal(err)
	}
	if err := SetExecutorSessionID(s.ID, "dsh-session-1"); err != nil {
		t.Fatal(err)
	}
	got, err := GetChatSession(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExecutorSessionID != "dsh-session-1" || got.ExecutorOptions == "" {
		t.Fatalf("round trip lost fields: %+v", got)
	}
	items, err := ListChatSessions(false)
	if err != nil || len(items) != 1 || items[0].ExecutorSessionID != "dsh-session-1" || items[0].ExecutorOptions == "" {
		t.Fatalf("list lost executor fields: %+v err=%v", items, err)
	}
}

func TestChatSessionAcceptsExecutorAgents(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	for _, agent := range []string{"hermes", "dsh", "commandcode"} {
		if _, err := CreateChatSession("t", agent, "default", "", ""); err != nil {
			t.Fatalf("agent %q rejected: %v", agent, err)
		}
	}
	if _, err := CreateChatSession("t", "codex", "default", "", ""); err == nil {
		t.Fatal("unknown agent accepted")
	}
}
