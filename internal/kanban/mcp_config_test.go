package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeMCPConfig(t *testing.T, body string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestListHermesMCPServersParsesStdioAndHTTP(t *testing.T) {
	writeMCPConfig(t, `
mcp_servers:
  codegraph:
    command: codegraph
    args:
      - serve
      - --mcp
    timeout: 120
    connect_timeout: 60
    enabled: true
  refero:
    connect_timeout: 60
    enabled: false
    headers:
      Authorization: Bearer super-secret-token
    url: https://api.refero.design/mcp
platform_toolsets:
  cli:
    - hermes-cli
    - mcp-codegraph
`)
	servers, err := ListHermesMCPServers("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %#v", servers)
	}
	// Sorted by name: codegraph then refero.
	cg := servers[0]
	if cg.Name != "codegraph" || cg.Transport != "stdio" || cg.Command != "codegraph" {
		t.Fatalf("codegraph parsed wrong: %#v", cg)
	}
	if len(cg.Args) != 2 || cg.Args[0] != "serve" || cg.Args[1] != "--mcp" {
		t.Fatalf("codegraph args parsed wrong: %#v", cg.Args)
	}
	if !cg.Enabled || cg.Timeout != 120 {
		t.Fatalf("codegraph flags parsed wrong: %#v", cg)
	}

	ref := servers[1]
	if ref.Transport != "http" || ref.URL != "https://api.refero.design/mcp" {
		t.Fatalf("refero parsed wrong: %#v", ref)
	}
	if ref.Enabled {
		t.Fatal("explicit enabled: false was not honoured")
	}
	if !ref.SecretSet {
		t.Fatal("header secret not flagged")
	}
	if len(ref.Headers) != 1 || ref.Headers[0] != "Authorization" {
		t.Fatalf("expected header name only, got %#v", ref.Headers)
	}
}

func TestListHermesMCPServersNeverReturnsSecretValues(t *testing.T) {
	writeMCPConfig(t, `
mcp_servers:
  github:
    command: npx
    args:
      - -y
      - '@modelcontextprotocol/server-github'
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: ghp_secretvalue123
`)
	servers, err := ListHermesMCPServers("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %#v", servers)
	}
	got := servers[0]
	if !got.SecretSet {
		t.Fatal("env secret not flagged")
	}
	if len(got.EnvKeys) != 1 || got.EnvKeys[0] != "GITHUB_PERSONAL_ACCESS_TOKEN" {
		t.Fatalf("expected env key name only, got %#v", got.EnvKeys)
	}
	// The token value must not appear anywhere in the serialised struct.
	if strings.Contains(got.Command, "ghp_") {
		t.Fatal("secret leaked into command field")
	}
}

func TestListHermesMCPServersDefaultsToEnabled(t *testing.T) {
	writeMCPConfig(t, `
mcp_servers:
  time:
    command: uvx
    args:
      - mcp-server-time
`)
	servers, err := ListHermesMCPServers("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 1 || !servers[0].Enabled {
		t.Fatalf("missing enabled key should default to true: %#v", servers)
	}
}

func TestListHermesMCPServersMissingBlockAndFile(t *testing.T) {
	writeMCPConfig(t, "model:\n  default: x\n")
	servers, err := ListHermesMCPServers("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected empty roster, got %#v", servers)
	}
}

func TestListHermesMCPServersMissingConfigFile(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	servers, err := ListHermesMCPServers("default")
	if err != nil {
		t.Fatalf("absent config should not error: %v", err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected empty roster, got %#v", servers)
	}
}

func TestListHermesMCPServersRejectsUnknownProfile(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if _, err := ListHermesMCPServers("missing"); err == nil {
		t.Fatal("unknown profile accepted")
	}
}

func TestListHermesMCPServersRejectsNonMappingBlock(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  - one\n  - two\n")
	if _, err := ListHermesMCPServers("default"); err == nil {
		t.Fatal("a non-mapping mcp_servers block should surface as an error")
	}
}

func TestListHermesMCPServersSurfacesCorruptYAML(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  bad: [unclosed\n")
	if _, err := ListHermesMCPServers("default"); err == nil {
		t.Fatal("corrupt config silently reported as empty")
	}
}

func TestHermesMCPToolsetReport(t *testing.T) {
	writeMCPConfig(t, `
platform_toolsets:
  cli:
    - hermes-cli
    - mcp-codegraph
  slack:
    - hermes-slack
`)
	toolsets, err := HermesMCPToolsetReport("default")
	if err != nil {
		t.Fatal(err)
	}
	if len(toolsets["cli"]) != 2 || toolsets["cli"][1] != "mcp-codegraph" {
		t.Fatalf("cli toolset parsed wrong: %#v", toolsets["cli"])
	}
	if len(toolsets["slack"]) != 1 {
		t.Fatalf("slack toolset parsed wrong: %#v", toolsets["slack"])
	}
}

func TestFindHermesMCPServer(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  codegraph:\n    command: codegraph\n")
	got, ok, err := FindHermesMCPServer("default", "codegraph")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || got.Command != "codegraph" {
		t.Fatalf("lookup failed: %#v %v", got, ok)
	}
	if _, ok, err := FindHermesMCPServer("default", "nope"); err != nil || ok {
		t.Fatalf("absent server should report not-found: %v %v", ok, err)
	}
}
