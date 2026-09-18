package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const profileSkillMaxBytes = 256 << 10

func validateProfileSkillName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || strings.Contains(name, "..") || strings.ContainsAny(name, `/\\$`) {
		return fmt.Errorf("invalid skill name")
	}
	return nil
}

func profileSkillPath(profile, skill string) (string, error) {
	if !profileExists(profile) {
		return "", fmt.Errorf("profile %q not found", profile)
	}
	if err := validateProfileSkillName(skill); err != nil {
		return "", err
	}
	return filepath.Join(profileDir(profile), "skills", skill, "SKILL.md"), nil
}

func ListProfileSkills(profile string) ([]string, error) {
	if !profileExists(profile) {
		return nil, fmt.Errorf("profile %q not found", profile)
	}
	entries, err := os.ReadDir(filepath.Join(profileDir(profile), "skills"))
	if os.IsNotExist(err) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			out = append(out, entry.Name())
		}
	}
	sort.Strings(out)
	return out, nil
}

func ReadProfileSkill(profile, skill string) (string, error) {
	path, err := profileSkillPath(profile, skill)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if len(data) > profileSkillMaxBytes {
		return "", fmt.Errorf("skill exceeds %d bytes", profileSkillMaxBytes)
	}
	return string(data), nil
}

func WriteProfileSkill(profile, skill, content string) error {
	path, err := profileSkillPath(profile, skill)
	if err != nil {
		return err
	}
	if len([]byte(content)) > profileSkillMaxBytes {
		return fmt.Errorf("skill exceeds %d bytes", profileSkillMaxBytes)
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".SKILL.md-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}
