package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"gopkg.in/yaml.v3"
)

// Hermes owns MCP configuration in ~/.hermes/config.yaml under the
// mcp_servers: key, and consumes it through `hermes mcp` (add/list/test/serve).
// Switchyard reads that block rather than maintaining a parallel registry, so
// there is exactly one source of truth for which MCP servers the agent uses.
//
// Secrets are never surfaced: a server reports only whether credentials are
// configured, matching the Provider.APIKeySet convention in providers.go.

// HermesMCPServer is the read model for one mcp_servers entry.
type HermesMCPServer struct {
	Name string `json:"name"`
	// Transport is "stdio" when command is set, otherwise "http".
	Transport string   `json:"transport"`
	Command   string   `json:"command,omitempty"`
	Args      []string `json:"args,omitempty"`
	URL       string   `json:"url,omitempty"`
	Headers   []string `json:"headers,omitempty"`  // header names only, never values
	EnvKeys   []string `json:"env_keys,omitempty"` // env var names only, never values
	// SecretSet reports that at least one env var or header is configured.
	SecretSet bool `json:"secret_set"`
	Enabled   bool `json:"enabled"`
	Timeout   int  `json:"timeout,omitempty"`
	// AuthHint is "oauth" or "header" when declared, else empty.
	AuthHint string `json:"auth_hint,omitempty"`
}

// ListHermesMCPServers reads the mcp_servers block from the active profile's
// config.yaml. A missing or unparseable file is an error: silently reporting an
// empty roster would hide a broken agent config.
func ListHermesMCPServers(profile string) ([]HermesMCPServer, error) {
	if !profileExists(profile) {
		return nil, fmt.Errorf("unknown profile %q", profile)
	}
	path := filepath.Join(profileDir(profile), "config.yaml")
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []HermesMCPServer{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return []HermesMCPServer{}, nil
	}
	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	block, ok := doc["mcp_servers"]
	if !ok || block == nil {
		return []HermesMCPServer{}, nil
	}
	entries, ok := block.(map[string]any)
	if !ok {
		// `mcp_servers:` present but not a mapping: a list from an older or
		// hand-edited config. Report it rather than pretending it is empty.
		return nil, fmt.Errorf("%s: mcp_servers is not a mapping", path)
	}
	out := make([]HermesMCPServer, 0, len(entries))
	for name, rawEntry := range entries {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, hermesMCPServerFrom(name, entry))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func hermesMCPServerFrom(name string, entry map[string]any) HermesMCPServer {
	s := HermesMCPServer{Name: name}
	s.Command = yamlString(entry["command"])
	s.Args = yamlStringSlice(entry["args"])
	s.URL = yamlString(entry["url"])
	s.Timeout = yamlInt(entry["timeout"])
	s.AuthHint = yamlString(entry["auth"])

	// hermes treats a missing `enabled` as enabled; an explicit false is the
	// only way to disable a server.
	s.Enabled = true
	if v, ok := entry["enabled"]; ok {
		if b, ok := v.(bool); ok {
			s.Enabled = b
		}
	}

	if s.Command != "" {
		s.Transport = "stdio"
	} else {
		s.Transport = "http"
	}

	if env, ok := entry["env"].(map[string]any); ok {
		for key := range env {
			s.EnvKeys = append(s.EnvKeys, key)
		}
		sort.Strings(s.EnvKeys)
		s.SecretSet = len(s.EnvKeys) > 0
	}
	if headers, ok := entry["headers"].(map[string]any); ok {
		for key := range headers {
			s.Headers = append(s.Headers, key)
		}
		sort.Strings(s.Headers)
		s.SecretSet = s.SecretSet || len(s.Headers) > 0
	}
	if s.AuthHint == "header" {
		s.SecretSet = true
	}
	return s
}

func yamlString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		return fmt.Sprint(t)
	}
}

func yamlInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}

func yamlStringSlice(v any) []string {
	items, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if s := yamlString(item); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// FindHermesMCPServer returns one server by name.
func FindHermesMCPServer(profile, name string) (HermesMCPServer, bool, error) {
	servers, err := ListHermesMCPServers(profile)
	if err != nil {
		return HermesMCPServer{}, false, err
	}
	for _, s := range servers {
		if s.Name == name {
			return s, true, nil
		}
	}
	return HermesMCPServer{}, false, nil
}

// HermesMCPToolsetReport describes which MCP toolsets are enabled per platform
// in platform_toolsets, e.g. cli: [hermes-cli, mcp-codegraph].
func HermesMCPToolsetReport(profile string) (map[string][]string, error) {
	if !profileExists(profile) {
		return nil, fmt.Errorf("unknown profile %q", profile)
	}
	raw, err := os.ReadFile(filepath.Join(profileDir(profile), "config.yaml"))
	if os.IsNotExist(err) {
		return map[string][]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	toolsets, _ := doc["platform_toolsets"].(map[string]any)
	out := map[string][]string{}
	for platform, rawList := range toolsets {
		out[platform] = yamlStringSlice(rawList)
	}
	return out, nil
}
