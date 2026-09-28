package kanban

import (
	"context"
	"errors"
	"io/fs"
	"testing"
)

const realCodegraphTestOutput = `
  Testing 'codegraph'...
  Transport: stdio → codegraph
  Auth: none
  ✓ Connected (1669ms)
  ✓ Tools discovered: 1

    codegraph_explore                    PRIMARY TOOL — call FIRST for almost any question OR be...
`

func TestParseHermesMCPTestOutputReadsRealCLIOutput(t *testing.T) {
	got := parseHermesMCPTestOutput(realCodegraphTestOutput)
	if got.state != "ok" {
		t.Fatalf("expected ok state, got %q", got.state)
	}
	if got.tools != 1 {
		t.Fatalf("expected 1 tool, got %d", got.tools)
	}
	if len(got.toolNames) != 1 || got.toolNames[0] != "codegraph_explore" {
		t.Fatalf("expected codegraph_explore, got %#v", got.toolNames)
	}
}

func TestParseHermesMCPTestOutputReadsFailure(t *testing.T) {
	out := `
  Testing 'github'...
  ✗ Failed to connect: command not found
`
	got := parseHermesMCPTestOutput(out)
	if got.errorMessage == "" {
		t.Fatalf("expected an error message, got %#v", got)
	}
	if got.state == "ok" {
		t.Fatalf("failure output parsed as ok: %#v", got)
	}
}

func TestParseHermesMCPTestOutputHandlesEmpty(t *testing.T) {
	if got := parseHermesMCPTestOutput(""); got.state != "unknown" {
		t.Fatalf("empty output should be unknown, got %#v", got)
	}
}

func TestTestHermesMCPServerReportsDisabledWithoutProbing(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  sparkbites:\n    command: npx\n    enabled: false\n")

	// Any spawn attempt would be a bug; fail loudly if one happens.
	orig := hermesMCPTestCommand
	t.Cleanup(func() { hermesMCPTestCommand = orig })
	hermesMCPTestCommand = func(context.Context, string, string) (string, error) {
		t.Fatal("disabled server must not be probed")
		return "", nil
	}

	health, err := TestHermesMCPServer(context.Background(), "default", "sparkbites")
	if err != nil {
		t.Fatal(err)
	}
	if health.State != "disabled" {
		t.Fatalf("expected disabled, got %#v", health)
	}
}

func TestTestHermesMCPServerSurfacesHealthFromCLI(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  codegraph:\n    command: codegraph\n    args: [serve, --mcp]\n")

	orig := hermesMCPTestCommand
	t.Cleanup(func() { hermesMCPTestCommand = orig })
	hermesMCPTestCommand = func(context.Context, string, string) (string, error) {
		return realCodegraphTestOutput, nil
	}

	health, err := TestHermesMCPServer(context.Background(), "default", "codegraph")
	if err != nil {
		t.Fatal(err)
	}
	if health.State != "ok" || health.Tools != 1 {
		t.Fatalf("unexpected health: %#v", health)
	}
	if health.Transport != "stdio" || !health.Enabled {
		t.Fatalf("unexpected metadata: %#v", health)
	}
}

func TestTestHermesMCPServerSurfacesTransportFailure(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  broken:\n    command: definitely-not-installed\n")

	orig := hermesMCPTestCommand
	t.Cleanup(func() { hermesMCPTestCommand = orig })
	hermesMCPTestCommand = func(context.Context, string, string) (string, error) {
		return "", errors.New("exec: not found")
	}

	health, err := TestHermesMCPServer(context.Background(), "default", "broken")
	if err != nil {
		t.Fatalf("a failed probe is a health result, not a handler error: %v", err)
	}
	if health.State != "failed" || health.ErrorMessage == "" {
		t.Fatalf("expected failed health, got %#v", health)
	}
}

func TestTestHermesMCPServerUnknownServer(t *testing.T) {
	writeMCPConfig(t, "mcp_servers:\n  codegraph:\n    command: codegraph\n")
	_, err := TestHermesMCPServer(context.Background(), "default", "nope")
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("expected not-exist, got %v", err)
	}
}
