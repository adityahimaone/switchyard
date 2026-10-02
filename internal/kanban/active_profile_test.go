package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

// writeProfileDir creates <hermes>/profiles/<name>/config.yaml so the name
// passes profileExists and ListProfiles.
func writeProfileDir(t *testing.T, name string) {
	t.Helper()
	dir := filepath.Join(hermesHome(), "profiles", name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := "model:\n  default: test-model\n  provider: custom\n  base_url: https://example.test/v1\n"
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
}

// Nothing stored yet means "default", which must stay the implicit default so an
// existing install behaves exactly as before this feature.
func TestActiveProfileDefaultsToDefault(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if got := ActiveProfile(); got != "default" {
		t.Fatalf("ActiveProfile() = %q, want default", got)
	}
}

func TestSetActiveProfileRoundTrips(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("karina"); err != nil {
		t.Fatal(err)
	}
	if got := ActiveProfile(); got != "karina" {
		t.Fatalf("ActiveProfile() = %q, want karina", got)
	}
}

// Storing a profile that does not exist would break every caller that trusts
// the value, so the write is refused rather than persisted.
func TestSetActiveProfileRejectsUnknown(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("ghost"); err == nil {
		t.Fatal("expected an error for a profile that does not exist")
	}
	if got := ActiveProfile(); got != "default" {
		t.Fatalf("a rejected activation must not be stored, got %q", got)
	}
}

// Deleting the active profile must not leave every default-path caller pointing
// at a directory that is gone.
func TestActiveProfileFallsBackWhenProfileDeleted(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("karina"); err != nil {
		t.Fatal(err)
	}
	if err := DeleteProfile("karina"); err != nil {
		t.Fatal(err)
	}
	if got := ActiveProfile(); got != "default" {
		t.Fatalf("ActiveProfile() = %q, want default after deletion", got)
	}
}

func TestActiveProfileIgnoresCorruptFile(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := os.WriteFile(activeProfileSettingPath(), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := ActiveProfile(); got != "default" {
		t.Fatalf("ActiveProfile() = %q, want default for a corrupt file", got)
	}
}

// Exactly one profile may report active, and it must be the stored one — this
// is the flag the Profiles page renders its lamp from.
func TestOnlyStoredProfileIsActive(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	writeProfileDir(t, "ningning")
	if err := SetActiveProfile("ningning"); err != nil {
		t.Fatal(err)
	}

	profiles, err := ListProfiles()
	if err != nil {
		t.Fatal(err)
	}
	byName := map[string]bool{}
	for _, p := range profiles {
		byName[p.Name] = p.Active
	}
	if !byName["ningning"] {
		t.Errorf("ningning should be active, flags = %v", byName)
	}
	if byName["karina"] || byName["default"] {
		t.Errorf("only one profile may be active, flags = %v", byName)
	}

	full, err := ListProfilesFull()
	if err != nil {
		t.Fatal(err)
	}
	active := 0
	for _, p := range full {
		if p.Active {
			active++
			if p.Name != "ningning" {
				t.Errorf("active profile = %q, want ningning", p.Name)
			}
		}
	}
	if active != 1 {
		t.Errorf("active count = %d, want exactly 1", active)
	}
}

// Activating a different profile must move the flag rather than leave both set.
func TestSetActiveProfileMovesTheFlag(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("karina"); err != nil {
		t.Fatal(err)
	}
	p, err := GetProfile("karina")
	if err != nil {
		t.Fatal(err)
	}
	if !p.Active {
		t.Error("karina should report active right after activation")
	}
	if err := SetActiveProfile("default"); err != nil {
		t.Fatal(err)
	}
	p, err = GetProfile("karina")
	if err != nil {
		t.Fatal(err)
	}
	if p.Active {
		t.Error("karina should no longer be active once default is activated")
	}
	def, err := GetProfile("default")
	if err != nil {
		t.Fatal(err)
	}
	if !def.Active {
		t.Error("default should report active after being activated")
	}
}

// The flag is worthless unless the default-path callers read it: these all
// received "" meaning "unspecified" before and "default" was substituted.
func TestDefaultProfileResolvesUnspecified(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("karina"); err != nil {
		t.Fatal(err)
	}
	if got := DefaultProfile(""); got != "karina" {
		t.Errorf("DefaultProfile(\"\") = %q, want karina", got)
	}
	if got := DefaultProfile("  "); got != "karina" {
		t.Errorf("DefaultProfile(whitespace) = %q, want karina", got)
	}
	// An explicit choice is never overridden by the active profile.
	if got := DefaultProfile("ningning"); got != "ningning" {
		t.Errorf("DefaultProfile(\"ningning\") = %q, want ningning", got)
	}
}

// A new chat session with no profile named must use the active one, otherwise
// the chat executor resolves a model from a profile the user did not pick.
func TestCreateChatSessionUsesActiveProfile(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeProfileDir(t, "karina")
	if err := SetActiveProfile("karina"); err != nil {
		t.Fatal(err)
	}
	s, err := CreateChatSession("t", "hermes", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if s.Profile != "karina" {
		t.Fatalf("session profile = %q, want karina", s.Profile)
	}
}
