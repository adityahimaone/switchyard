package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const profileMemoryMaxBytes = 512 << 10

func profileMemoryPath(profile, scope string) (string, error) {
	if !validProfileName(profile) {
		return "", fmt.Errorf("invalid profile")
	}
	if scope != "memory" && scope != "user" {
		return "", fmt.Errorf("unsupported memory scope")
	}
	return filepath.Join(profileDir(profile), "memories", map[string]string{"memory": "MEMORY.md", "user": "USER.md"}[scope]), nil
}

func ReadProfileMemory(profile, scope string) (string, *float64, error) {
	path, err := profileMemoryPath(profile, scope)
	if err != nil {
		return "", nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", nil, err
	}
	if len(data) > profileMemoryMaxBytes {
		return "", nil, fmt.Errorf("memory exceeds %d bytes", profileMemoryMaxBytes)
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", nil, err
	}
	mtime := float64(info.ModTime().Unix())
	return string(data), &mtime, nil
}

func WriteProfileMemory(profile, scope, content string) error {
	path, err := profileMemoryPath(profile, scope)
	if err != nil {
		return err
	}
	if len([]byte(content)) > profileMemoryMaxBytes {
		return fmt.Errorf("memory exceeds %d bytes", profileMemoryMaxBytes)
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".memory-*")
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

func profileMemoryScope(path string) string {
	if strings.HasSuffix(path, "USER.md") {
		return "user"
	}
	return "memory"
}
