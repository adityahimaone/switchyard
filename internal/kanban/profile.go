package kanban

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// AgentProfile is a hermes agent profile: ~/.hermes/profiles/<name>/.
// config.yaml holds model/provider, SOUL.md is the system prompt, skills/ is
// the list of skill dirs. CRUD edits only these three surfaces.
type AgentProfile struct {
	Name      string `json:"name"`
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	Active    bool   `json:"active"`
	Valid     bool   `json:"valid"`
	AvatarURL string `json:"avatar_url,omitempty"`
	BaseURL   string `json:"base_url,omitempty"`

	SystemPrompt string   `json:"system_prompt"` // SOUL.md content
	Skills       []string `json:"skills"`        // dir names under skills/
}

type ProfileInput struct {
	Model        string   `json:"model"`
	Provider     string   `json:"provider"`
	SystemPrompt *string  `json:"system_prompt"` // nil = leave untouched
	Skills       []string `json:"skills"`
	SkillsSet    bool     `json:"-"`
}

func profileSkillsPath(name string) string { return filepath.Join(profileDir(name), "skills.json") }

func normalizeProfileSkills(skills []string) ([]string, error) {
	available, _ := ListSkills()
	known := map[string]string{}
	for _, skill := range available {
		known[skill.Name] = skill.Path
	}
	seen := map[string]bool{}
	out := []string{}
	for _, raw := range skills {
		name := strings.TrimSpace(raw)
		if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\\$`) {
			return nil, fmt.Errorf("invalid skill name %q", raw)
		}
		if _, ok := known[name]; !ok {
			return nil, fmt.Errorf("unknown skill %q", name)
		}
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out, nil
}

func readProfileSkills(name string) []string {
	var skills []string
	if raw, err := os.ReadFile(profileSkillsPath(name)); err == nil && json.Unmarshal(raw, &skills) == nil {
		return filterKnownProfileSkills(skills)
	}
	return filterKnownProfileSkills(listProfileSkills(profileDir(name)))
}

func filterKnownProfileSkills(skills []string) []string {
	available, _ := ListSkills()
	if len(available) == 0 {
		return skills
	}
	known := make(map[string]bool, len(available))
	for _, skill := range available {
		known[skill.Name] = true
	}
	out := make([]string, 0, len(skills))
	for _, skill := range skills {
		if known[skill] {
			out = append(out, skill)
		}
	}
	sort.Strings(out)
	return out
}

func writeProfileSkills(name string, skills []string) error {
	raw, err := json.Marshal(skills)
	if err != nil {
		return err
	}
	if err := os.WriteFile(profileSkillsPath(name), append(raw, '\n'), 0o600); err != nil {
		return err
	}
	dir := filepath.Join(profileDir(name), "skills")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	selected := map[string]bool{}
	available, _ := ListSkills()
	paths := map[string]string{}
	for _, skill := range available {
		paths[skill.Name] = skill.Path
	}
	for _, skill := range skills {
		selected[skill] = true
		link := filepath.Join(dir, skill)
		if info, err := os.Lstat(link); err == nil {
			if info.Mode()&os.ModeSymlink != 0 {
				_ = os.Remove(link)
			} else {
				continue
			}
		}
		if err := os.Symlink(filepath.Join(hermesHome(), "skills", paths[skill]), link); err != nil {
			return err
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		link := filepath.Join(dir, entry.Name())
		info, err := os.Lstat(link)
		if err == nil && info.Mode()&os.ModeSymlink != 0 && !selected[entry.Name()] {
			_ = os.Remove(link)
		}
	}
	return nil
}

func profileDir(name string) string {
	if name == "default" {
		return hermesHome()
	}
	return filepath.Join(hermesHome(), "profiles", name)
}

func profileExists(name string) bool {
	name = strings.TrimSpace(name)
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "..") {
		return false
	}
	if name == "default" {
		return true // implicit profile backed by ~/.hermes/config.yaml
	}
	st, err := os.Stat(filepath.Join(hermesHome(), "profiles", name))
	return err == nil && st.IsDir()
}

func listProfileSkills(dir string) []string {
	out := []string{}
	entries, err := os.ReadDir(filepath.Join(dir, "skills"))
	if err != nil {
		return out
	}
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") && e.Name() != "archive" && e.Name() != "backup_before_archive" {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}

// GetProfile returns one profile with SOUL.md + skills.
func GetProfile(name string) (*AgentProfile, error) {
	if !profileExists(name) {
		return nil, fmt.Errorf("profile %q not found", name)
	}
	dir := profileDir(name)
	p := &AgentProfile{Name: name, Skills: []string{}}
	if name == "default" {
		p.Active = true
	}
	if raw, err := os.ReadFile(filepath.Join(dir, "config.yaml")); err == nil {
		p.Model, p.Provider, p.BaseURL = parseModelYAML(string(raw))
	}
	p.Valid = profileValid(p.Provider)
	if hasAvatar(name) {
		p.AvatarURL = "/api/profiles/" + name + "/avatar"
	}
	if p.AvatarURL == "" {
		if ext := ProfileAvatarURL(name); ext != "" {
			p.AvatarURL = ext
		}
	}
	if raw, err := os.ReadFile(filepath.Join(dir, "SOUL.md")); err == nil {
		p.SystemPrompt = string(raw)
	}
	p.Skills = readProfileSkills(name)
	return p, nil
}

// ListProfilesFull = ListProfiles + prompt/skills presence (cheap variant for cards).
func ListProfilesFull() ([]*AgentProfile, error) {
	out := []*AgentProfile{}
	proot := filepath.Join(hermesHome(), "profiles")
	entries, err := os.ReadDir(proot)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			p, err := GetProfile(e.Name())
			if err != nil {
				continue
			}
			out = append(out, p)
		}
	}
	if _, err := os.Stat(filepath.Join(hermesHome(), "config.yaml")); err == nil || profileExists("default") {
		if p, err := GetProfile("default"); err == nil {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// CreateProfile makes a new profile dir with config.yaml (+ optional SOUL.md),
// copying model defaults from an existing template profile so the worker can
// actually boot (api_key/base_url come along — same trust domain, VPS-local).
func CreateProfile(name string, in ProfileInput) error {
	name = strings.TrimSpace(name)
	if name == "" || !validProfileName(name) {
		return fmt.Errorf("invalid profile name %q", name)
	}
	if profileExists(name) {
		return fmt.Errorf("profile %q already exists", name)
	}
	if !profileValid(in.Provider) {
		return fmt.Errorf("invalid provider %q — worker would crash (Unknown provider)", in.Provider)
	}
	dir := filepath.Join(hermesHome(), "profiles", name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	// copy config from default if present (brings api_key/base_url), then patch model
	if raw, err := os.ReadFile(filepath.Join(hermesHome(), "config.yaml")); err == nil {
		_ = os.WriteFile(filepath.Join(dir, "config.yaml"), raw, 0o600)
	}
	if err := PatchProfile(name, ProfileInput{Model: in.Model, Provider: in.Provider}); err != nil {
		return err
	}
	if in.Skills != nil {
		skills, err := normalizeProfileSkills(in.Skills)
		if err != nil {
			return err
		}
		if err := writeProfileSkills(name, skills); err != nil {
			return err
		}
	}
	if in.SystemPrompt != nil && strings.TrimSpace(*in.SystemPrompt) != "" {
		if err := os.WriteFile(filepath.Join(dir, "SOUL.md"), []byte(*in.SystemPrompt), 0o644); err != nil {
			return err
		}
	}
	return nil
}

// PatchProfile edits model/provider, SOUL.md, and selected global skills.
func PatchProfile(name string, in ProfileInput) error {
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	dir := profileDir(name)
	cfgPath := filepath.Join(dir, "config.yaml")

	if in.Model != "" || in.Provider != "" {
		raw, err := os.ReadFile(cfgPath)
		if err != nil {
			return fmt.Errorf("config.yaml missing: %w", err)
		}
		updated, err := patchModelYAML(string(raw), in.Model, in.Provider)
		if err != nil {
			return err
		}
		if err := os.WriteFile(cfgPath, []byte(updated), 0o600); err != nil {
			return err
		}
	}
	if in.SystemPrompt != nil {
		if err := os.WriteFile(filepath.Join(dir, "SOUL.md"), []byte(*in.SystemPrompt), 0o644); err != nil {
			return err
		}
	}
	if in.SkillsSet {
		skills, err := normalizeProfileSkills(in.Skills)
		if err != nil {
			return err
		}
		if err := writeProfileSkills(name, skills); err != nil {
			return err
		}
	}
	return nil
}

// DeleteProfile removes a profile dir (never "default").
func DeleteProfile(name string) error {
	if name == "default" {
		return fmt.Errorf("cannot delete default profile")
	}
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	return os.RemoveAll(filepath.Join(hermesHome(), "profiles", name))
}

func validProfileName(s string) bool {
	if len(s) > 32 {
		return false
	}
	for _, r := range s {
		ok := r == '-' || r == '_' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if !ok {
			return false
		}
	}
	return len(s) > 0
}

// patchModelYAML sets model.default / model.provider inside the `model:` block,
// preserving the rest of the file byte-for-byte (api_key, base_url, ...).
func patchModelYAML(src, model, provider string) (string, error) {
	lines := strings.Split(src, "\n")
	inModel := false
	sawModel, sawProvider := false, false
	for i, line := range lines {
		trimmed := strings.TrimRight(line, " \t\r")
		switch {
		case trimmed == "model:":
			inModel = true
		case inModel && strings.HasPrefix(trimmed, "  "):
			k, _, ok := strings.Cut(strings.TrimSpace(trimmed), ":")
			if !ok {
				continue
			}
			switch k {
			case "default":
				if model != "" {
					lines[i] = fmt.Sprintf("  default: %s", model)
				}
				sawModel = true
			case "provider":
				if provider != "" {
					lines[i] = fmt.Sprintf("  provider: %s", provider)
				}
				sawProvider = true
			}
		case inModel && trimmed != "" && !strings.HasPrefix(trimmed, " "):
			inModel = false
		}
	}
	if model != "" && !sawModel {
		return "", fmt.Errorf("model.default key not found in config.yaml")
	}
	if provider != "" && !sawProvider {
		return "", fmt.Errorf("model.provider key not found in config.yaml")
	}
	return strings.Join(lines, "\n"), nil
}

var _ = json.Marshal
