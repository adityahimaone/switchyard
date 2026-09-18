package kanban

import (
	"os"
	"testing"
)

func TestEcosystemRegistryProfileIsolationAndAtomicLifecycle(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	mcp, err := UpsertMCPServer("default", MCPServer{
		ID: "docs", Name: "Docs", Transport: "http", Endpoint: "https://example.com/mcp", Enabled: true,
	})
	if err != nil || len(mcp) != 1 {
		t.Fatalf("mcp create: %v %#v", err, mcp)
	}
	if _, err := ListMCPServers("missing"); err == nil {
		t.Fatal("unknown profile was accepted")
	}
	items, err := UpsertExtension("default", ExtensionManifest{
		ID: "board-tools", Name: "Board Tools", Version: "1", Capabilities: []string{"read_tasks"},
	})
	if err != nil || len(items) != 1 {
		t.Fatalf("extension create: %v %#v", err, items)
	}
	if _, err := DeleteMCPServer("default", "docs"); err != nil {
		t.Fatal(err)
	}
	if _, err := DeleteExtension("default", "board-tools"); err != nil {
		t.Fatal(err)
	}
}

func TestGatewayStatusFailsClosedWithoutConfig(t *testing.T) {
	t.Setenv("KANBAN_GATEWAY_URL", "")
	if got := GatewayStatusReport(); got.State != "disabled" || got.URL != "" {
		t.Fatalf("unexpected gateway state: %#v", got)
	}
}
