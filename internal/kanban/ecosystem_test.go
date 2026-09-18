package kanban

import "testing"

func TestValidateExtensionManifest(t *testing.T) {
	if err := ValidateExtensionManifest(ExtensionManifest{ID: "board-tools", Name: "Board Tools", Version: "1", Capabilities: []string{"read_tasks"}}); err != nil {
		t.Fatal(err)
	}
	for _, manifest := range []ExtensionManifest{
		{ID: "../escape", Name: "x", Version: "1"},
		{ID: "bad", Name: "x", Version: "1", Capabilities: []string{"shell"}},
	} {
		if err := ValidateExtensionManifest(manifest); err == nil {
			t.Fatalf("expected invalid manifest rejection: %+v", manifest)
		}
	}
}

func TestValidateMCPServerRejectsUnsafeURL(t *testing.T) {
	if err := ValidateMCPServer(MCPServer{ID: "docs", Name: "Docs", Transport: "http", Endpoint: "https://example.com/mcp"}); err != nil {
		t.Fatal(err)
	}
	if err := ValidateMCPServer(MCPServer{ID: "local", Name: "Local", Transport: "http", Endpoint: "http://169.254.169.254/mcp"}); err == nil {
		t.Fatal("expected metadata endpoint rejection")
	}
}
