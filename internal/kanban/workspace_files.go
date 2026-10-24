package kanban

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
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
	if clean == ".." || strings.HasPrefix(clean, "../") {
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

type FileSearchMatch struct {
	Path      string `json:"path"`
	Basename  string `json:"basename"`
	Directory string `json:"directory"`
	Score     int    `json:"score"`
}

var (
	wsFilesCacheMu sync.Mutex
	wsFilesCache   = map[string]struct {
		files []string
		exp   time.Time
	}{}
)

func cachedGitTrackedFiles(ws Workspace) ([]string, error) {
	wsFilesCacheMu.Lock()
	cached, ok := wsFilesCache[ws.Path]
	if ok && time.Now().Before(cached.exp) {
		wsFilesCacheMu.Unlock()
		return cached.files, nil
	}
	wsFilesCacheMu.Unlock()

	var files []string
	if ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1" {
		out, code := workerShell(ws.Path, "git ls-files", "cd "+shellQuotePath(ws.Path)+" && git ls-files")
		if code == 0 {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if l := strings.TrimSpace(line); l != "" {
					files = append(files, l)
				}
			}
		}
	} else {
		root := localWorkspacePath(ws.Path)
		cmd := exec.Command("git", "-C", root, "ls-files")
		if out, err := cmd.Output(); err == nil && len(out) > 0 {
			for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				if l := strings.TrimSpace(line); l != "" {
					files = append(files, l)
				}
			}
		} else {
			_ = filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
				if err != nil || info == nil {
					return nil
				}
				if info.IsDir() {
					name := info.Name()
					if name == ".git" || name == "node_modules" || name == "vendor" || name == "dist" {
						return filepath.SkipDir
					}
					return nil
				}
				rel, rErr := filepath.Rel(root, p)
				if rErr == nil {
					files = append(files, filepath.ToSlash(rel))
				}
				return nil
			})
		}
	}

	wsFilesCacheMu.Lock()
	wsFilesCache[ws.Path] = struct {
		files []string
		exp   time.Time
	}{files: files, exp: time.Now().Add(30 * time.Second)}
	wsFilesCacheMu.Unlock()

	return files, nil
}

// SearchWorkspaceFiles fuzzy-searches tracked files within a workspace.
func SearchWorkspaceFiles(ws Workspace, query string, limit int) ([]FileSearchMatch, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	allFiles, err := cachedGitTrackedFiles(ws)
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	var matches []FileSearchMatch
	for _, rel := range allFiles {
		lower := strings.ToLower(rel)
		base := filepath.Base(lower)
		score := 0
		switch {
		case q == "":
			score = 1
		case base == q:
			score = 100
		case strings.HasPrefix(base, q):
			score = 80
		case strings.Contains(base, q):
			score = 60
		case strings.Contains(lower, q):
			score = 40
		default:
			continue
		}
		matches = append(matches, FileSearchMatch{
			Path:      rel,
			Basename:  filepath.Base(rel),
			Directory: filepath.Dir(rel),
			Score:     score,
		})
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].Score != matches[j].Score {
			return matches[i].Score > matches[j].Score
		}
		return len(matches[i].Path) < len(matches[j].Path)
	})
	if len(matches) > limit {
		matches = matches[:limit]
	}
	return matches, nil
}

type SymbolSearchMatch struct {
	Name     string `json:"name"`
	Kind     string `json:"kind"`
	FilePath string `json:"file_path"`
	Line     int    `json:"line"`
}

// SearchWorkspaceSymbols searches for symbols in the workspace using codegraph or file scanning.
func SearchWorkspaceSymbols(ws Workspace, query string, limit int) ([]SymbolSearchMatch, error) {
	if limit <= 0 || limit > 50 {
		limit = 15
	}
	q := strings.TrimSpace(query)
	if q == "" {
		return []SymbolSearchMatch{}, nil
	}
	root := localWorkspacePath(ws.Path)
	cmdStr := fmt.Sprintf("codegraph query %s --json", shellQuote(q))
	var out string
	var err error
	if ws.Host != "" && ws.Host != "localhost" && ws.Host != "127.0.0.1" {
		out, _ = workerShell(ws.Path, "codegraph query", "cd "+shellQuotePath(ws.Path)+" && "+cmdStr)
	} else {
		cmd := exec.Command("sh", "-c", "cd "+shellQuote(root)+" && "+cmdStr)
		bytes, e := cmd.Output()
		out = string(bytes)
		err = e
	}
	if err == nil && len(strings.TrimSpace(out)) > 0 {
		var results []struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
			File string `json:"file"`
			Line int    `json:"line"`
		}
		if jsonErr := json.Unmarshal([]byte(out), &results); jsonErr == nil && len(results) > 0 {
			var matches []SymbolSearchMatch
			for _, r := range results {
				matches = append(matches, SymbolSearchMatch{
					Name:     r.Name,
					Kind:     r.Kind,
					FilePath: r.File,
					Line:     r.Line,
				})
				if len(matches) >= limit {
					break
				}
			}
			return matches, nil
		}
	}

	files, fErr := cachedGitTrackedFiles(ws)
	if fErr != nil {
		return []SymbolSearchMatch{}, nil
	}
	var matches []SymbolSearchMatch
	lowerQ := strings.ToLower(q)
	for _, rel := range files {
		ext := filepath.Ext(rel)
		if ext != ".go" && ext != ".ts" && ext != ".tsx" && ext != ".js" && ext != ".jsx" && ext != ".py" && ext != ".rs" {
			continue
		}
		full := filepath.Join(root, rel)
		data, rErr := os.ReadFile(full)
		if rErr != nil {
			continue
		}
		lines := strings.Split(string(data), "\n")
		for lineIdx, line := range lines {
			if strings.Contains(strings.ToLower(line), lowerQ) {
				trimmed := strings.TrimSpace(line)
				kind := "symbol"
				if strings.HasPrefix(trimmed, "func ") || strings.HasPrefix(trimmed, "function ") || strings.Contains(trimmed, "() =>") || strings.Contains(trimmed, " = (") {
					kind = "function"
				} else if strings.HasPrefix(trimmed, "type ") || strings.HasPrefix(trimmed, "interface ") || strings.HasPrefix(trimmed, "class ") || strings.HasPrefix(trimmed, "struct ") {
					kind = "type"
				} else if strings.HasPrefix(trimmed, "const ") || strings.HasPrefix(trimmed, "var ") {
					kind = "variable"
				} else {
					continue
				}
				matches = append(matches, SymbolSearchMatch{
					Name:     trimmed,
					Kind:     kind,
					FilePath: rel,
					Line:     lineIdx + 1,
				})
				if len(matches) >= limit {
					return matches, nil
				}
			}
		}
	}
	return matches, nil
}

type WorkspaceDefaultsResult struct {
	SuggestedGateCommand   string `json:"suggested_gate_command"`
	SuggestedVerifyProfile string `json:"suggested_verify_profile"`
}

// GetWorkspaceDefaults inspects workspace marker files to suggest smart test gates and verify profiles.
func GetWorkspaceDefaults(ws Workspace) (WorkspaceDefaultsResult, error) {
	root := localWorkspacePath(ws.Path)
	res := WorkspaceDefaultsResult{
		SuggestedVerifyProfile: "fast",
	}

	if _, err := os.Stat(filepath.Join(root, "web", "src")); err == nil {
		res.SuggestedVerifyProfile = "ui"
	} else if _, err := os.Stat(filepath.Join(root, "src", "App.tsx")); err == nil {
		res.SuggestedVerifyProfile = "ui"
	}

	if _, err := os.Stat(filepath.Join(root, ".e2e", "e2e.config.ts")); err == nil {
		res.SuggestedVerifyProfile = "e2e"
	} else if _, err := os.Stat(filepath.Join(root, "playwright.config.ts")); err == nil {
		res.SuggestedVerifyProfile = "e2e"
	}

	if _, err := os.Stat(filepath.Join(root, "pnpm-lock.yaml")); err == nil {
		res.SuggestedGateCommand = "pnpm test -- --run"
	} else if _, err := os.Stat(filepath.Join(root, "package.json")); err == nil {
		res.SuggestedGateCommand = "npm test"
	} else if _, err := os.Stat(filepath.Join(root, "go.mod")); err == nil {
		res.SuggestedGateCommand = "go test ./..."
	} else if _, err := os.Stat(filepath.Join(root, "Cargo.toml")); err == nil {
		res.SuggestedGateCommand = "cargo test"
	} else if _, err := os.Stat(filepath.Join(root, "pyproject.toml")); err == nil {
		res.SuggestedGateCommand = "pytest"
	}

	return res, nil
}
