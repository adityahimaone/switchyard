package kanban

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type CodeGraphApp struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Manual bool   `json:"manual,omitempty"`
}

type CodeGraphStatus struct {
	State       string `json:"state"`
	Available   bool   `json:"available"`
	Indexed     bool   `json:"indexed"`
	LastChanged int64  `json:"last_changed,omitempty"`
	LastLabel   string `json:"last_label,omitempty"`
	Message     string `json:"message,omitempty"`
}

type CodeGraphEntry struct {
	CodeGraphApp
	Status CodeGraphStatus `json:"status"`
}

type CodeGraphReport struct {
	WorkspaceID string           `json:"workspace_id"`
	Apps        []CodeGraphEntry `json:"apps"`
	Hidden      []string         `json:"hidden"`
}

type codeGraphJob struct {
	ID      string `json:"id"`
	Path    string `json:"path"`
	State   string `json:"state"`
	Message string `json:"message,omitempty"`
}

var codeGraphJobs = struct {
	sync.RWMutex
	m map[string]codeGraphJob
}{m: map[string]codeGraphJob{}}

var codeGraphMarkers = []string{".codegraph", "package.json", "go.mod", "composer.json", "Cargo.toml", "pyproject.toml"}
var codeGraphSkip = map[string]bool{".git": true, "node_modules": true, "vendor": true, "dist": true, "build": true, ".next": true, "target": true, ".codegraph": true}

func codeGraphStatusHealthy(output string) bool {
	return strings.Contains(output, "✓ Index is up to date")
}

func validRelativeCodeGraphPath(path string) bool {
	path = filepath.ToSlash(strings.TrimSpace(path))
	if path == "." {
		return true
	}
	return path != "" && path != ".." && !filepath.IsAbs(path) && !strings.HasPrefix(path, "../") && !strings.Contains(path, "\\")
}

func codeGraphCommand(w Workspace, command string) ([]byte, error) {
	if w.Host == "" || w.Host == "localhost" || w.Host == "127.0.0.1" {
		w.Path = localWorkspacePath(w.Path)
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		return exec.CommandContext(ctx, "sh", "-lc", command).Output()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", w.Host, command).Output()
}

func codeGraphScanCommand(root string) string {
	q := shellQuote(root)
	return fmt.Sprintf(`export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"; root=%s; if command -v codegraph >/dev/null 2>&1; then cg=1; else cg=0; fi; printf 'CG%%s\n' "$cg"; find "$root" -mindepth 1 -maxdepth 3 -type d -name .codegraph -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.next/*' -not -path '*/target/*' -print 2>/dev/null | while IFS= read -r indexDir; do d="${indexDir%%/.codegraph}"; mt=$(stat -f %%m "$indexDir" 2>/dev/null || stat -c %%Y "$indexDir" 2>/dev/null || printf 0); printf 'APP	%%s	1	%%s\n' "$d" "$mt"; done`, q)
}

func codeGraphStatus(w Workspace, app CodeGraphApp) CodeGraphStatus {
	root := filepath.Join(w.Path, filepath.FromSlash(app.Path))
	out, err := codeGraphCommand(w, fmt.Sprintf("export PATH=\"$HOME/.local/bin:/opt/homebrew/bin:$PATH\"; if command -v codegraph >/dev/null 2>&1; then echo yes; (cd %s && codegraph status 2>&1); else echo no; fi; stat -f %%m %s/.codegraph 2>/dev/null || stat -c %%Y %s/.codegraph 2>/dev/null || true", shellQuote(root), shellQuote(root), shellQuote(root)))
	if err != nil {
		return CodeGraphStatus{State: "unavailable", Message: trimErrStr(err.Error())}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) < 1 {
		return CodeGraphStatus{State: "unavailable", Message: "invalid status response"}
	}
	st := CodeGraphStatus{Available: strings.TrimSpace(lines[0]) == "yes"}
	if !st.Available {
		st.State = "unavailable"
		st.Message = "codegraph CLI not found"
	} else {
		statusOutput := strings.Join(lines[1:], "\n")
		st.Indexed = codeGraphStatusHealthy(statusOutput)
		if st.Indexed {
			st.State = "indexed"
		} else {
			st.State = "unavailable"
			st.Message = "index is not healthy"
		}
	}
	if len(lines) > 1 {
		fmt.Sscanf(strings.TrimSpace(lines[len(lines)-1]), "%d", &st.LastChanged)
		if st.LastChanged > 0 {
			st.LastLabel = "last changed"
		}
	}
	return st
}

func CodeGraphReportForWorkspace(w *Workspace) (*CodeGraphReport, error) {
	w.Path = localWorkspacePath(w.Path)
	out, err := codeGraphCommand(*w, codeGraphScanCommand(w.Path))
	if err != nil {
		return nil, err
	}
	manual := map[string]bool{}
	for _, app := range w.CodeGraphApps {
		if validRelativeCodeGraphPath(app.Path) {
			manual[filepath.ToSlash(app.Path)] = true
		}
	}
	entries := map[string]CodeGraphApp{}
	for _, app := range w.CodeGraphApps {
		p := filepath.ToSlash(app.Path)
		if validRelativeCodeGraphPath(p) {
			app.Path = p
			app.Manual = true
			if app.Name == "" {
				if p == "." {
					app.Name = filepath.Base(strings.TrimRight(w.Path, "/"))
					if app.Name == "." || app.Name == "" {
						app.Name = w.Name
					}
					if app.Name == "" {
						app.Name = w.ID
					}
				} else {
					app.Name = filepath.Base(p)
				}
			}
			entries[p] = app
		}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	available := len(lines) > 0 && strings.TrimSpace(lines[0]) == "CG1"
	for _, line := range lines[1:] {
		parts := strings.Split(line, "\t")
		if len(parts) != 4 || parts[0] != "APP" {
			continue
		}
		rel, err := filepath.Rel(w.Path, parts[1])
		if err != nil || !validRelativeCodeGraphPath(rel) {
			continue
		}
		rel = filepath.ToSlash(rel)
		if !manual[rel] {
			name := filepath.Base(rel)
			if rel == "." {
				name = filepath.Base(strings.TrimRight(w.Path, "/"))
				if name == "." || name == "" {
					name = w.Name
				}
				if name == "" {
					name = w.ID
				}
			}
			entries[rel] = CodeGraphApp{Path: rel, Name: name}
		}
	}
	apps := make([]CodeGraphEntry, 0, len(entries))
	for _, app := range entries {
		if containsString(w.CodeGraphHidden, app.Path) {
			continue
		}
		st := codeGraphStatus(*w, app)
		if !available && st.State == "indexed" {
			st.State = "unavailable"
		}
		if st.State != "indexed" {
			continue
		}
		apps = append(apps, CodeGraphEntry{CodeGraphApp: app, Status: st})
	}
	sort.Slice(apps, func(i, j int) bool { return apps[i].Path < apps[j].Path })
	return &CodeGraphReport{WorkspaceID: w.ID, Apps: apps, Hidden: w.CodeGraphHidden}, nil
}

func CodeGraphIndex(w *Workspace, path string) (*codeGraphJob, error) {
	w.Path = localWorkspacePath(w.Path)
	path = filepath.ToSlash(strings.TrimSpace(path))
	if !validRelativeCodeGraphPath(path) {
		return nil, fmt.Errorf("invalid app path")
	}
	report, err := CodeGraphReportForWorkspace(w)
	if err != nil {
		return nil, err
	}
	known := false
	for _, app := range report.Apps {
		if app.Path == path {
			known = true
			break
		}
	}
	if !known {
		return nil, fmt.Errorf("app path is not detected or configured")
	}
	root := filepath.Join(w.Path, filepath.FromSlash(path))
	if _, err := codeGraphCommand(*w, fmt.Sprintf("test -d %s", shellQuote(root))); err != nil {
		return nil, fmt.Errorf("app path not found")
	}
	codeGraphJobs.Lock()
	for _, existing := range codeGraphJobs.m {
		if existing.Path == path && (existing.State == "queued" || existing.State == "running") {
			codeGraphJobs.Unlock()
			return nil, fmt.Errorf("re-index already running for %s", path)
		}
	}
	id := fmt.Sprintf("cg_%d", time.Now().UnixNano())
	job := codeGraphJob{ID: id, Path: path, State: "queued"}
	codeGraphJobs.m[id] = job
	codeGraphJobs.Unlock()
	go func() {
		codeGraphJobs.Lock()
		j := codeGraphJobs.m[id]
		j.State = "running"
		codeGraphJobs.m[id] = j
		codeGraphJobs.Unlock()
		cmd := fmt.Sprintf("export PATH=\"$HOME/.local/bin:/opt/homebrew/bin:$PATH\"; if [ -d %s/.codegraph ]; then codegraph index %s --force --quiet; else codegraph init %s; fi", shellQuote(root), shellQuote(root), shellQuote(root))
		_, err := codeGraphCommand(*w, cmd)
		codeGraphJobs.Lock()
		j = codeGraphJobs.m[id]
		if err != nil {
			j.State = "failed"
			j.Message = trimErrStr(err.Error())
		} else {
			j.State = "done"
		}
		codeGraphJobs.m[id] = j
		codeGraphJobs.Unlock()
	}()
	return &job, nil
}

func CodeGraphJob(id string) (codeGraphJob, bool) {
	codeGraphJobs.RLock()
	defer codeGraphJobs.RUnlock()
	j, ok := codeGraphJobs.m[id]
	return j, ok
}

func containsString(xs []string, target string) bool {
	for _, x := range xs {
		if filepath.ToSlash(x) == target {
			return true
		}
	}
	return false
}
