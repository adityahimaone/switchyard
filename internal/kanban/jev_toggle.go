package kanban

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func jevSettingPath() string { return filepath.Join(hermesHome(), "jev-routing.json") }

// JEVEnabled defaults true for backwards compatibility.
func JEVEnabled() bool {
	raw, err := os.ReadFile(jevSettingPath())
	if err != nil {
		return true
	}
	var value struct {
		Enabled *bool `json:"enabled"`
	}
	if json.Unmarshal(raw, &value) != nil || value.Enabled == nil {
		return true
	}
	return *value.Enabled
}

func SetJEVEnabled(enabled bool) error {
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return err
	}
	raw, err := json.Marshal(struct {
		Enabled bool `json:"enabled"`
	}{enabled})
	if err != nil {
		return err
	}
	return os.WriteFile(jevSettingPath(), raw, 0o600)
}
