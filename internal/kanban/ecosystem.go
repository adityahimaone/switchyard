package kanban

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var allowedExtensionCapabilities = map[string]bool{
	"read_tasks": true,
	"read_logs":  true,
	"read_nodes": true,
}

// ValidationError marks a rejected registry payload, so HTTP handlers can
// answer 400 and distinguish bad input from a filesystem failure.
type ValidationError struct{ Err error }

func (e *ValidationError) Error() string { return e.Err.Error() }
func (e *ValidationError) Unwrap() error { return e.Err }

func invalid(msg string) error { return &ValidationError{Err: errors.New(msg)} }
func invalidErr(err error) error {
	if err == nil {
		return nil
	}
	return &ValidationError{Err: err}
}

// IsValidationError reports whether err came from registry validation.
func IsValidationError(err error) bool {
	var ve *ValidationError
	return errors.As(err, &ve)
}

type MCPServer struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Transport    string   `json:"transport"` // stdio | http
	Endpoint     string   `json:"endpoint,omitempty"`
	Command      string   `json:"command,omitempty"`
	Enabled      bool     `json:"enabled"`
	Capabilities []string `json:"capabilities,omitempty"`
	CreatedAt    int64    `json:"created_at"`
}

type ExtensionManifest struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Description  string   `json:"description,omitempty"`
	Capabilities []string `json:"capabilities"`
}

type ecosystemStore struct {
	mu sync.RWMutex
}

var ecosystem = &ecosystemStore{}

func (s *ecosystemStore) path(profile, file string) (string, error) {
	if !profileExists(profile) {
		return "", fmt.Errorf("unknown profile %q", profile)
	}
	name := strings.TrimSpace(file)
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "..") {
		return "", errors.New("invalid ecosystem file")
	}
	dir := filepath.Join(profileDir(profile), "ecosystem")
	return filepath.Join(dir, name), nil
}

func (s *ecosystemStore) read(profile, file string, out any) error {
	p, err := s.path(profile, file)
	if err != nil {
		return err
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return json.Unmarshal(raw, out)
}

func (s *ecosystemStore) write(profile, file string, value any) error {
	p, err := s.path(profile, file)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, body, 0o600); err != nil {
		return err
	}
	if err := syncFile(tmp); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func syncFile(path string) error {
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

func validEcosystemID(id string) bool {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_' || r == '.') {
			return false
		}
	}
	return !strings.HasPrefix(id, ".") && !strings.HasSuffix(id, ".") && !strings.Contains(id, "..")
}

func ValidateExtensionManifest(m ExtensionManifest) error {
	if !validEcosystemID(m.ID) {
		return invalid("invalid extension id")
	}
	if strings.TrimSpace(m.Name) == "" || strings.TrimSpace(m.Version) == "" {
		return invalid("name and version required")
	}
	if len(m.Capabilities) == 0 {
		return invalid("at least one capability required")
	}
	seen := map[string]bool{}
	for _, c := range m.Capabilities {
		if !allowedExtensionCapabilities[c] {
			return invalidErr(fmt.Errorf("unsupported capability %q", c))
		}
		if seen[c] {
			return invalid("duplicate capability")
		}
		seen[c] = true
	}
	return nil
}

func ValidateMCPServer(m MCPServer) error {
	if !validEcosystemID(m.ID) {
		return invalid("invalid mcp id")
	}
	if strings.TrimSpace(m.Name) == "" {
		return invalid("name required")
	}
	if m.Transport != "stdio" && m.Transport != "http" {
		return invalid("transport must be stdio or http")
	}
	if m.Transport == "stdio" {
		if strings.TrimSpace(m.Command) == "" {
			return invalid("command required for stdio transport")
		}
		return nil
	}
	return invalidErr(validateEndpointURL(m.Endpoint))
}

func validateEndpointURL(endpoint string) error {
	if strings.TrimSpace(endpoint) == "" {
		return errors.New("endpoint required for http transport")
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return errors.New("invalid endpoint url")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackHost(u.Hostname())) {
		return errors.New("endpoint must use https or loopback http")
	}
	if u.User != nil {
		return errors.New("endpoint must not contain userinfo")
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("endpoint requires host")
	}
	ip := net.ParseIP(host)
	if ip != nil {
		if ip.IsLoopback() {
			return nil
		}
		return errors.New("endpoint must not target private or link-local ip")
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("endpoint host lookup failed: %w", err)
	}
	for _, candidate := range ips {
		if candidate.IsLoopback() || candidate.IsPrivate() || candidate.IsLinkLocalUnicast() || candidate.IsLinkLocalMulticast() || candidate.IsUnspecified() {
			return errors.New("endpoint must not resolve to private or link-local address")
		}
	}
	return nil
}

func isLoopbackHost(host string) bool {
	ip := net.ParseIP(host)
	if ip != nil {
		return ip.IsLoopback()
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return false
	}
	for _, candidate := range ips {
		if candidate.IsLoopback() {
			return true
		}
	}
	return false
}

func ListMCPServers(profile string) ([]MCPServer, error) {
	ecosystem.mu.RLock()
	defer ecosystem.mu.RUnlock()
	items := []MCPServer{}
	if err := ecosystem.read(profile, "mcp.json", &items); err != nil {
		return nil, err
	}
	return items, nil
}

func UpsertMCPServer(profile string, m MCPServer) ([]MCPServer, error) {
	if err := ValidateMCPServer(m); err != nil {
		return nil, err
	}
	ecosystem.mu.Lock()
	defer ecosystem.mu.Unlock()
	items, err := ListMCPServersUnlocked(profile)
	if err != nil {
		return nil, err
	}
	replaced := false
	for i := range items {
		if items[i].ID == m.ID {
			// Preserve the original creation timestamp across replacement;
			// it is server-owned, not client-supplied.
			m.CreatedAt = items[i].CreatedAt
			items[i] = m
			replaced = true
			break
		}
	}
	if !replaced {
		m.CreatedAt = time.Now().Unix()
		items = append(items, m)
	}
	if err := ecosystem.write(profile, "mcp.json", items); err != nil {
		return nil, err
	}
	broadcastEvent("ecosystem_mcp_changed", map[string]any{"profile": profile, "id": m.ID})
	return items, nil
}

func ListMCPServersUnlocked(profile string) ([]MCPServer, error) {
	items := []MCPServer{}
	if err := ecosystem.read(profile, "mcp.json", &items); err != nil {
		return nil, err
	}
	return items, nil
}

func DeleteMCPServer(profile, id string) ([]MCPServer, error) {
	ecosystem.mu.Lock()
	defer ecosystem.mu.Unlock()
	items, err := ListMCPServersUnlocked(profile)
	if err != nil {
		return nil, err
	}
	kept := items[:0]
	for _, item := range items {
		if item.ID != id {
			kept = append(kept, item)
		}
	}
	if len(kept) == len(items) {
		return nil, fmt.Errorf("mcp server %q: %w", id, fs.ErrNotExist)
	}
	if err := ecosystem.write(profile, "mcp.json", kept); err != nil {
		return nil, err
	}
	broadcastEvent("ecosystem_mcp_changed", map[string]any{"profile": profile, "id": id, "deleted": true})
	return kept, nil
}

func ListExtensions(profile string) ([]ExtensionManifest, error) {
	ecosystem.mu.RLock()
	defer ecosystem.mu.RUnlock()
	items := []ExtensionManifest{}
	if err := ecosystem.read(profile, "extensions.json", &items); err != nil {
		return nil, err
	}
	return items, nil
}

func UpsertExtension(profile string, m ExtensionManifest) ([]ExtensionManifest, error) {
	if err := ValidateExtensionManifest(m); err != nil {
		return nil, err
	}
	ecosystem.mu.Lock()
	defer ecosystem.mu.Unlock()
	items, err := ListExtensionsUnlocked(profile)
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].ID == m.ID {
			items[i] = m
			if err := ecosystem.write(profile, "extensions.json", items); err != nil {
				return nil, err
			}
			broadcastEvent("ecosystem_extensions_changed", map[string]any{"profile": profile, "id": m.ID})
			return items, nil
		}
	}
	items = append(items, m)
	if err := ecosystem.write(profile, "extensions.json", items); err != nil {
		return nil, err
	}
	broadcastEvent("ecosystem_extensions_changed", map[string]any{"profile": profile, "id": m.ID})
	return items, nil
}

func ListExtensionsUnlocked(profile string) ([]ExtensionManifest, error) {
	items := []ExtensionManifest{}
	if err := ecosystem.read(profile, "extensions.json", &items); err != nil {
		return nil, err
	}
	return items, nil
}

func DeleteExtension(profile, id string) ([]ExtensionManifest, error) {
	ecosystem.mu.Lock()
	defer ecosystem.mu.Unlock()
	items, err := ListExtensionsUnlocked(profile)
	if err != nil {
		return nil, err
	}
	kept := items[:0]
	for _, item := range items {
		if item.ID != id {
			kept = append(kept, item)
		}
	}
	if len(kept) == len(items) {
		return nil, fmt.Errorf("extension %q: %w", id, fs.ErrNotExist)
	}
	if err := ecosystem.write(profile, "extensions.json", kept); err != nil {
		return nil, err
	}
	broadcastEvent("ecosystem_extensions_changed", map[string]any{"profile": profile, "id": id, "deleted": true})
	return kept, nil
}

type GatewayStatus struct {
	State string `json:"state"` // disabled | up | down
	URL   string `json:"url,omitempty"`
	Error string `json:"error,omitempty"`
}

func GatewayStatusReport() GatewayStatus {
	raw := strings.TrimSpace(os.Getenv("KANBAN_GATEWAY_URL"))
	if raw == "" {
		return GatewayStatus{State: "disabled"}
	}
	// Validate before echoing: this value reaches the browser, and an invalid
	// URL must not be reported as a healthy gateway.
	if err := validateEndpointURL(raw); err != nil {
		return GatewayStatus{State: "down", Error: err.Error()}
	}
	return GatewayStatus{State: "up", URL: raw}
}
