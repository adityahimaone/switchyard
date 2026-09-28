package kanban

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
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

// An invalid gateway URL must not be reported as healthy, and must not be
// echoed back to the browser.
func TestGatewayStatusRejectsInvalidURL(t *testing.T) {
	t.Setenv("KANBAN_GATEWAY_URL", "http://169.254.169.254/")
	got := GatewayStatusReport()
	if got.State == "up" {
		t.Fatalf("metadata endpoint reported as up: %#v", got)
	}
	if got.URL != "" {
		t.Fatalf("invalid url echoed to client: %#v", got)
	}
	if got.Error == "" {
		t.Fatal("expected an error explanation for a rejected url")
	}
}

func TestGatewayStatusAcceptsHTTPS(t *testing.T) {
	// example.com is public and resolves to routable addresses, so it passes
	// the private/link-local guard.
	t.Setenv("KANBAN_GATEWAY_URL", "https://example.com")
	if got := GatewayStatusReport(); got.State != "up" {
		t.Fatalf("valid https gateway rejected: %#v", got)
	}
}

// The upsert-replace branch used to broadcast before persisting, so a
// subscriber could refetch a file that was never written.
func TestUpsertExtensionReplacePersistsBeforeReturning(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	first, err := UpsertExtension("default", ExtensionManifest{
		ID: "ext", Name: "First", Version: "1", Capabilities: []string{"read_tasks"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 1 || first[0].Name != "First" {
		t.Fatalf("unexpected create result: %#v", first)
	}
	updated, err := UpsertExtension("default", ExtensionManifest{
		ID: "ext", Name: "Second", Version: "2", Capabilities: []string{"read_logs"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(updated) != 1 || updated[0].Name != "Second" {
		t.Fatalf("unexpected replace result: %#v", updated)
	}
	// The replace must be on disk, not just in the returned slice.
	reread, err := ListExtensions("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(reread) != 1 || reread[0].Name != "Second" || reread[0].Version != "2" {
		t.Fatalf("replace did not persist: %#v", reread)
	}
}

func TestUpsertMCPServerReplacePreservesCreatedAt(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	created, err := UpsertMCPServer("default", MCPServer{
		ID: "cg", Name: "CG", Transport: "stdio", Command: "codegraph", CreatedAt: 111,
	})
	if err != nil {
		t.Fatal(err)
	}
	// created_at is server-owned: a client-supplied value is discarded.
	firstStamp := created[0].CreatedAt
	if firstStamp == 0 || firstStamp == 111 {
		t.Fatalf("created_at not stamped by the server: %#v", created[0])
	}
	// A client claiming a different created_at must not rewrite history.
	updated, err := UpsertMCPServer("default", MCPServer{
		ID: "cg", Name: "CG Renamed", Transport: "stdio", Command: "codegraph", CreatedAt: 999,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated[0].CreatedAt != firstStamp {
		t.Fatalf("replace rewrote created_at: %#v", updated[0])
	}
	if updated[0].Name != "CG Renamed" {
		t.Fatalf("replace did not apply fields: %#v", updated[0])
	}
}

func TestDeleteMissingRegistryEntriesReportNotFound(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := DeleteMCPServer("default", "nope"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("expected not-exist, got %v", err)
	}
	if _, err := DeleteExtension("default", "nope"); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("expected not-exist, got %v", err)
	}
}

func TestValidationErrorsAreDistinguishable(t *testing.T) {
	err := ValidateMCPServer(MCPServer{ID: "ok", Name: "ok", Transport: "bogus"})
	if !IsValidationError(err) {
		t.Fatalf("transport error not marked as validation: %v", err)
	}
	if _, err := ListMCPServers("missing"); IsValidationError(err) {
		t.Fatal("unknown profile should not be a validation error")
	}
}

func TestValidEcosystemIDBoundaries(t *testing.T) {
	valid := []string{"a", "abc", "a-b_c.d", strings.Repeat("a", 64)}
	for _, id := range valid {
		if !validEcosystemID(id) {
			t.Fatalf("expected %q to be valid", id)
		}
	}
	invalidIDs := []string{
		"",                      // empty
		strings.Repeat("a", 65), // over length cap
		".hidden",               // leading dot
		"trailing.",             // trailing dot
		"a..b",                  // double dot
		"../escape",             // traversal
		"UPPER",                 // uppercase
		"with space",
		"sl/ash",
	}
	for _, id := range invalidIDs {
		if validEcosystemID(id) {
			t.Fatalf("expected %q to be rejected", id)
		}
	}
}

func TestIsLoopbackHostAcceptsLoopbackForms(t *testing.T) {
	for _, host := range []string{"127.0.0.1", "::1", "localhost"} {
		if !isLoopbackHost(host) {
			t.Fatalf("expected %q to be loopback", host)
		}
	}
	for _, host := range []string{"example.com", "169.254.169.254", "10.0.0.1"} {
		if isLoopbackHost(host) {
			t.Fatalf("expected %q to be non-loopback", host)
		}
	}
}

func TestValidateEndpointURLRejectsPrivateTargets(t *testing.T) {
	cases := []string{
		"http://example.com/mcp",   // plain http to a non-loopback host
		"https://user:pw@host/mcp", // userinfo
		"https://169.254.169.254/", // link-local literal
		"https://10.0.0.5/mcp",     // private literal
		"https://192.168.1.1/mcp",  // private literal
		"",                         // empty
		"://nope",                  // unparseable
	}
	for _, endpoint := range cases {
		if err := validateEndpointURL(endpoint); err == nil {
			t.Fatalf("expected %q to be rejected", endpoint)
		}
	}
	if err := validateEndpointURL("http://127.0.0.1:8787/mcp"); err != nil {
		t.Fatalf("loopback http rejected: %v", err)
	}
}

// A corrupt registry file must surface as an error, not as "no servers".
func TestCorruptRegistrySurfacesError(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "ecosystem")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mcp.json"), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := ListMCPServers("default"); err == nil {
		t.Fatal("corrupt registry silently reported as empty")
	}
}
