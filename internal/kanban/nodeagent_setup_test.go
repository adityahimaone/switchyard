package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNodeAgentSetupProvisionsTokenOnce(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("NODE_AGENT_TOKEN", "")
	t.Setenv("NODE_AGENT_PUBLIC_URL", "http://100.75.2.78:8788")

	first, err := NodeAgentSetup()
	if err != nil {
		t.Fatal(err)
	}
	if !first.TokenCreated || first.Token == "" {
		t.Fatalf("first call must provision the token: %+v", first)
	}
	if len(first.Token) != 64 {
		t.Fatalf("token = %q, want 64 hex chars (32 bytes)", first.Token)
	}
	// The secret lands in the 0600 file next to the boards.
	info, err := os.Stat(filepath.Join(home, "node-agent.env"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("file mode = %v, want 600", info.Mode().Perm())
	}

	// A second read reuses the same secret.
	second, err := NodeAgentSetup()
	if err != nil {
		t.Fatal(err)
	}
	if second.TokenCreated || second.Token != first.Token {
		t.Fatalf("second call = %+v, want the same token without re-provisioning", second)
	}

	// The commands are complete: install lines carry the
	// token, update lines deliberately do not.
	if !strings.Contains(first.InstallMac, "/install/mac") ||
		!strings.Contains(first.InstallMac, "env NODE_AGENT_TOKEN="+first.Token) {
		t.Fatalf("install_mac = %q", first.InstallMac)
	}
	if !strings.Contains(first.InstallWindows, "$env:NODE_AGENT_TOKEN='"+first.Token+"'") ||
		!strings.Contains(first.InstallWindows, "/install/windows") {
		t.Fatalf("install_windows = %q", first.InstallWindows)
	}
	for _, cmd := range []string{first.UpdateMac, first.UpdateWindows} {
		if strings.Contains(cmd, first.Token) {
			t.Fatalf("update command %q leaks the token", cmd)
		}
	}
	if !strings.Contains(first.UpdateMac, "/update/mac") {
		t.Fatalf("update_mac = %q", first.UpdateMac)
	}
	if !strings.Contains(first.UpdateWindows, "/update/windows") {
		t.Fatalf("update_windows = %q", first.UpdateWindows)
	}
}

func TestNodeAgentSetupWithoutPublicURL(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("NODE_AGENT_TOKEN", "")
	t.Setenv("NODE_AGENT_PUBLIC_URL", "")

	setup, err := NodeAgentSetup()
	if err != nil {
		t.Fatal(err)
	}
	if setup.ServerURL != "" || setup.InstallMac != "" || setup.UpdateWindows != "" {
		t.Fatalf("commands must stay empty until NODE_AGENT_PUBLIC_URL is set: %+v", setup)
	}
}

func TestNodeAgentSetupReusesEnvToken(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("NODE_AGENT_TOKEN", "env-provided-token")
	t.Setenv("NODE_AGENT_PUBLIC_URL", "http://x:8788")

	setup, err := NodeAgentSetup()
	if err != nil {
		t.Fatal(err)
	}
	if setup.Token != "env-provided-token" {
		t.Fatalf("token = %q, want the env token", setup.Token)
	}
	if setup.TokenCreated {
		t.Fatal("an env-provided token must not provision a file")
	}
	if _, err := os.Stat(filepath.Join(home, "node-agent.env")); err == nil {
		t.Fatal("no file should be written when the env token is set")
	}
}
