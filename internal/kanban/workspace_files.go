package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type WorkspaceFile struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size,omitempty"`
}

type WorkspaceFileRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Path        string `json:"path"`
	Content     string `json:"content,omitempty"`
}

type WorkspaceFileResult struct {
	WorkspaceID string `json:"workspace_id"`
	Host        string `json:"host"`
	Transport   string `json:"transport"`
	Path        string `json:"path"`
	LocalPath   string `json:"local_path,omitempty"`
}

func cleanWorkspaceRelative(path string) (string, error) {
	path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
	if path == "" || strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("invalid workspace path")
	}
	clean := filepath.ToSlash(filepath.Clean(path))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("workspace path escapes root")
	}
	return clean, nil
}

func ResolveWorkspaceFile(ws Workspace, path string) (WorkspaceFileResult, error) {
	rel, err := cleanWorkspaceRelative(path)
	if err != nil {
		return WorkspaceFileResult{}, err
	}
	if strings.TrimSpace(ws.ID) == "" || strings.TrimSpace(ws.Path) == "" {
		return WorkspaceFileResult{}, fmt.Errorf("workspace is not registered")
	}
	if ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1" {
		return WorkspaceFileResult{WorkspaceID: ws.ID, Host: ws.Host, Transport: "node-agent", Path: rel}, nil
	}
	root, err := filepath.Abs(localWorkspacePath(ws.Path))
	if err != nil {
		return WorkspaceFileResult{}, fmt.Errorf("invalid workspace root")
	}
	target := filepath.Join(root, filepath.FromSlash(rel))
	abs, err := filepath.Abs(target)
	if err != nil || (abs != root && !strings.HasPrefix(abs, root+string(filepath.Separator))) {
		return WorkspaceFileResult{}, fmt.Errorf("workspace path escapes root")
	}
	check := abs
	if _, err := os.Lstat(check); err != nil {
		check = filepath.Dir(check)
	}
	real, err := filepath.EvalSymlinks(check)
	if err != nil {
		return WorkspaceFileResult{}, fmt.Errorf("invalid workspace path")
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil || (real != realRoot && !strings.HasPrefix(real, realRoot+string(filepath.Separator))) {
		return WorkspaceFileResult{}, fmt.Errorf("workspace path escapes root")
	}
	return WorkspaceFileResult{WorkspaceID: ws.ID, Host: "localhost", Transport: "local", Path: rel, LocalPath: abs}, nil
}
