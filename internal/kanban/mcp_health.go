package kanban

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"strings"
	"time"
)

// hermesMCPTestCommand is a seam so tests can stub the subprocess, following
// the cronCommand convention in cron.go.
var hermesMCPTestCommand = runHermesMCPTest

const hermesMCPTestTimeout = 30 * time.Second

// MCPServerHealth is the live status of one configured MCP server, derived by
// running `hermes mcp test` against the real agent.
type MCPServerHealth struct {
	Name         string   `json:"name"`
	State        string   `json:"state"` // ok | failed | disabled | unknown
	Enabled      bool     `json:"enabled"`
	Transport    string   `json:"transport"`
	Tools        int      `json:"tools"`
	ToolNames    []string `json:"tool_names,omitempty"`
	LatencyMS    int64    `json:"latency_ms,omitempty"`
	ErrorMessage string   `json:"error,omitempty"`
}

// TestHermesMCPServer probes one configured server through the hermes CLI,
// which is the only component that actually knows how to connect to it.
// Disabled servers are reported without spawning anything.
func TestHermesMCPServer(ctx context.Context, profile, name string) (MCPServerHealth, error) {
	server, found, err := FindHermesMCPServer(profile, name)
	if err != nil {
		return MCPServerHealth{}, err
	}
	if !found {
		return MCPServerHealth{Name: name, State: "unknown"},
			fmt.Errorf("mcp server %q: %w", name, fs.ErrNotExist)
	}
	health := MCPServerHealth{
		Name:      server.Name,
		Enabled:   server.Enabled,
		Transport: server.Transport,
	}
	if !server.Enabled {
		health.State = "disabled"
		return health, nil
	}

	// Pin HERMES_HOME so the CLI reads the same profile config the board read.
	probeCtx, cancel := context.WithTimeout(ctx, hermesMCPTestTimeout)
	defer cancel()
	started := time.Now()
	out, err := hermesMCPTestCommand(probeCtx, profile, name)
	health.LatencyMS = time.Since(started).Milliseconds()
	if err != nil && out == "" {
		health.State = "failed"
		health.ErrorMessage = err.Error()
		return health, nil
	}

	parsed := parseHermesMCPTestOutput(out)
	health.State = parsed.state
	health.Tools = parsed.tools
	health.ToolNames = parsed.toolNames
	health.ErrorMessage = parsed.errorMessage
	if parsed.state == "unknown" && err != nil {
		health.State = "failed"
		health.ErrorMessage = err.Error()
	}
	return health, nil
}

type parsedMCPTest struct {
	state        string
	tools        int
	toolNames    []string
	errorMessage string
}

// parseHermesMCPTestOutput reads `hermes mcp test` output. The CLI prints
// "✓ Connected (1669ms)" and "✓ Tools discovered: N" on success, and a
// failure reason on a line marked with ✗.
func parseHermesMCPTestOutput(out string) parsedMCPTest {
	result := parsedMCPTest{state: "unknown"}
	for _, line := range strings.Split(out, "\n") {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.Contains(trimmed, "Tools discovered:"):
			result.tools = parseIntAfter(trimmed, "Tools discovered:")
		case strings.Contains(trimmed, "✗") || strings.HasPrefix(trimmed, "Error"):
			if result.errorMessage == "" {
				result.errorMessage = strings.TrimLeft(trimmed, "✗Error: ")
			}
		case strings.Contains(trimmed, "Connected"):
			result.state = "ok"
		}
		// Tool names are printed indented beneath the discovered count.
		if name, ok := toolNameFromLine(line); ok {
			result.toolNames = append(result.toolNames, name)
		}
	}
	return result
}

// toolNameFromLine recognises the indented tool identifiers the CLI prints
// beneath the discovered count, e.g. "    codegraph_explore   PRIMARY TOOL ...".
func toolNameFromLine(line string) (string, bool) {
	if strings.TrimSpace(line) == "" {
		return "", false
	}
	// The tool list is always indented; the surrounding report lines are not.
	if !strings.HasPrefix(line, " ") {
		return "", false
	}
	trimmed := strings.TrimSpace(line)
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return "", false
	}
	name := fields[0]
	// Tool identifiers are snake_case; skip prose.
	if !strings.Contains(name, "_") {
		return "", false
	}
	for _, r := range name {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_') {
			return "", false
		}
	}
	return name, true
}

func parseIntAfter(line, marker string) int {
	idx := strings.Index(line, marker)
	if idx < 0 {
		return 0
	}
	rest := strings.TrimSpace(line[idx+len(marker):])
	num := 0
	for _, r := range rest {
		if r < '0' || r > '9' {
			break
		}
		num = num*10 + int(r-'0')
	}
	return num
}

// runHermesMCPTest invokes the hermes CLI against a specific profile.
func runHermesMCPTest(ctx context.Context, profile, name string) (string, error) {
	env := os.Environ()
	// Non-default profiles live in their own HERMES_HOME subtree, so the CLI
	// must be pointed at the same config the board just read.
	if home, ok := os.LookupEnv("HERMES_HOME"); ok {
		if profileHome := profileDir(profile); profileHome != home {
			env = append(env, "HERMES_HOME="+profileHome)
		}
	}
	cmd := exec.CommandContext(ctx, "hermes", "mcp", "test", name)
	cmd.Env = env
	out, err := cmd.CombinedOutput()
	return string(out), err
}
