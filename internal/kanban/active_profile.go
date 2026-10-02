package kanban

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// The active profile is the app's default agent profile: the one used when a
// caller does not name one — a new chat session, the memory page picker, MCP
// and extension config. It is stored outside hermes' own config tree because
// ~/.hermes is read by the hermes CLI and a stray key there is a merge
// conflict waiting to happen; the same reason executors.json and
// jev-routing.json live beside it rather than inside config.yaml.

func activeProfileSettingPath() string { return filepath.Join(hermesHome(), "active-profile.json") }

// ActiveProfile returns the stored profile name, or "default" when nothing has
// been set yet. A name that no longer exists on disk falls back to "default"
// so a deleted profile can never wedge every default-path caller.
func ActiveProfile() string {
	raw, err := os.ReadFile(activeProfileSettingPath())
	if err != nil {
		return "default"
	}
	var stored struct {
		Profile string `json:"profile"`
	}
	if json.Unmarshal(raw, &stored) != nil {
		return "default"
	}
	name := strings.TrimSpace(stored.Profile)
	if name == "" || !profileExists(name) {
		return "default"
	}
	return name
}

// SetActiveProfile records the new default. Refuses a name that is not a real
// profile: silently storing it would break every caller that trusts the value.
func SetActiveProfile(name string) error {
	name = strings.TrimSpace(name)
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(struct {
		Profile string `json:"profile"`
	}{name})
	if err != nil {
		return err
	}
	return os.WriteFile(activeProfileSettingPath(), append(raw, '\n'), 0o600)
}

// DefaultProfile resolves the profile for a caller that passed none. An empty
// input means "unset" everywhere in this package — chat sessions, task
// assignees, notification fan-out — so this is the single place that maps it
// onto the active profile.
func DefaultProfile(name string) string {
	if strings.TrimSpace(name) != "" {
		return name
	}
	return ActiveProfile()
}