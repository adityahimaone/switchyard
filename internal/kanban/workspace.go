package kanban

import (
	"bufio"
	"context"
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

// workspaceFile is the on-disk shape of ~/.hermes/workspaces.json (shared with
// hermes CLI / node-agent). Entries carry extra keys we don't model
// (luvus_workspace_id, remote, apps, ...); saveWorkspaces preserves them.
type workspaceFile struct {
	Version    int         `json:"version"`
	Source     string      `json:"source,omitempty"`
	Workspaces []Workspace `json:"workspaces"`
}

// typed keys that win over the original file on save
var workspaceKnownKeys = map[string]bool{
	"id": true, "name": true, "path": true, "host": true, "os": true, "kind": true,
	"note": true, "apps": true, "codegraph_apps": true, "codegraph_hidden": true,
}

var wsMu sync.Mutex

func workspacesPath() string {
	return filepath.Join(hermesHome(), "workspaces.json")
}

func loadWorkspaces() (*workspaceFile, error) {
	raw, err := os.ReadFile(workspacesPath())
	if err != nil {
		return nil, err
	}
	var f workspaceFile
	if err := json.Unmarshal(raw, &f); err != nil {
		return nil, err
	}
	if f.Workspaces == nil {
		f.Workspaces = []Workspace{}
	}
	return &f, nil
}

// saveWorkspaces writes atomically under a process lock. Unknown keys of each
// original entry (luvus_workspace_id, remote, ...) survive: our known fields
// win, everything else is carried over as-is.
func saveWorkspaces(f *workspaceFile) error {
	// originals by id
	origByID := map[string]map[string]json.RawMessage{}
	if raw, err := os.ReadFile(workspacesPath()); err == nil {
		var orig map[string]json.RawMessage
		if json.Unmarshal(raw, &orig) == nil {
			var origList []map[string]json.RawMessage
			if v, ok := orig["workspaces"]; ok && json.Unmarshal(v, &origList) == nil {
				for _, m := range origList {
					var id string
					if json.Unmarshal(m["id"], &id) == nil {
						origByID[id] = m
					}
				}
			}
		}
	}

	mergedList := make([]json.RawMessage, 0, len(f.Workspaces))
	for i := range f.Workspaces {
		w := &f.Workspaces[i]
		cur, err := json.Marshal(w)
		if err != nil {
			return err
		}
		var curMap map[string]json.RawMessage
		if err := json.Unmarshal(cur, &curMap); err != nil {
			return err
		}
		merged := map[string]json.RawMessage{}
		for k, v := range origByID[w.ID] {
			if !workspaceKnownKeys[k] {
				merged[k] = v
			}
		}
		for k, v := range curMap {
			merged[k] = v
		}
		enc, err := json.Marshal(merged)
		if err != nil {
			return err
		}
		mergedList = append(mergedList, enc)
	}

	out := map[string]any{"version": f.Version, "workspaces": mergedList}
	if f.Source != "" {
		out["source"] = f.Source
	}
	raw, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	tmp := workspacesPath() + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, workspacesPath())
}

func localWorkspacePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "~" || strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			if path == "~" {
				return home
			}
			return filepath.Join(home, strings.TrimPrefix(path, "~/"))
		}
	}
	return path
}

// ListWorkspaces reads + hydrates status from ping history so the list
// doesn't flicker to "unknown" after a restart — last known status wins.
// Local hosts stay "local" only when their path exists; missing local paths
// must surface as unreachable instead of looking healthy.
func ListWorkspaces() ([]Workspace, error) {
	wsMu.Lock()
	defer wsMu.Unlock()
	f, err := loadWorkspaces()
	if err != nil {
		if os.IsNotExist(err) {
			return []Workspace{}, nil
		}
		return nil, err
	}
	// hydrate from history (best-effort, ignore errors)
	hist, _ := loadPingMap()
	out := f.Workspaces
	for i := range out {
		w := &out[i]
		if w.Host == "" || w.Host == "localhost" || w.Host == "127.0.0.1" {
			// local workspace: "local" only while the path exists; a missing
			// or tilde path the dispatcher can't resolve must show offline.
			w.Path = localWorkspacePath(w.Path)
			if _, err := os.Stat(w.Path); err != nil {
				w.Status = "unreachable"
				w.StatusMsg = "local path missing: " + trimErr(err)
			} else {
				w.Status = "local"
			}
			continue
		}
		if pts := hist[w.ID]; len(pts) > 0 {
			last := pts[len(pts)-1]
			if last.Ok {
				w.Status = "connected"
				if last.Ms != nil {
					w.PingMs = last.Ms
				}
				w.StatusMsg = last.Msg
			} else {
				// debounce: need 3 consecutive fails to flip offline
				c := 1
				for j := len(pts) - 2; j >= 0 && c < 3; j-- {
					if !pts[j].Ok {
						c++
					} else {
						break
					}
				}
				if c >= 3 {
					w.Status = "unreachable"
					w.StatusMsg = last.Msg
				} else {
					w.Status = "connected"
					w.StatusMsg = fmt.Sprintf("connected (retry %d/3) — %s", c, last.Msg)
					if last.Ms != nil {
						w.PingMs = last.Ms
					}
				}
			}
		} else {
			w.Status = "unknown"
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// SaveWorkspace creates or updates one workspace entry (by id).
func SaveWorkspace(w *Workspace) error {
	if strings.TrimSpace(w.ID) == "" {
		return fmt.Errorf("id required")
	}
	w.ID = strings.ToLower(strings.TrimSpace(w.ID))
	if strings.ContainsAny(w.ID, "/\\ ") {
		return fmt.Errorf("invalid id %q", w.ID)
	}
	if strings.TrimSpace(w.Name) == "" {
		w.Name = w.ID
	}
	if w.Kind == "" {
		w.Kind = "dir"
	}
	if w.OS == "" {
		w.OS = inferOS(w.Host, w.Path)
	}
	wsMu.Lock()
	defer wsMu.Unlock()
	f, err := loadWorkspaces()
	if err != nil {
		if os.IsNotExist(err) {
			f = &workspaceFile{Version: 1, Source: "kanban-board"}
		} else {
			return err
		}
	}
	found := false
	for i := range f.Workspaces {
		if f.Workspaces[i].ID == w.ID {
			keep := f.Workspaces[i].Status // runtime field, not persisted anyway
			f.Workspaces[i] = *w
			f.Workspaces[i].Status = keep
			found = true
			break
		}
	}
	if !found {
		f.Workspaces = append(f.Workspaces, *w)
	}
	if err := saveWorkspaces(f); err != nil {
		return err
	}
	broadcastEvent("workspace_updated", map[string]any{"workspace_id": w.ID})
	return nil
}

// DeleteWorkspace removes an entry by id.
func DeleteWorkspace(id string) error {
	wsMu.Lock()
	defer wsMu.Unlock()
	f, err := loadWorkspaces()
	if err != nil {
		return err
	}
	kept := f.Workspaces[:0]
	deleted := false
	for _, e := range f.Workspaces {
		if e.ID == id {
			deleted = true
			continue
		}
		kept = append(kept, e)
	}
	if !deleted {
		return fmt.Errorf("workspace %q not found", id)
	}
	f.Workspaces = kept
	if err := saveWorkspaces(f); err != nil {
		return err
	}
	broadcastEvent("workspace_deleted", map[string]any{"workspace_id": id})
	return nil
}

// PingWorkspace probes the workspace: local → stat path; remote → ssh
// `test -d <path>` with 5s connect timeout. Reports latency in ms.
func PingWorkspace(w *Workspace) Workspace {
	res := *w
	res.Status = "unknown"
	res.StatusMsg = ""
	res.PingMs = nil
	start := time.Now()
	if res.Host == "" || res.Host == "localhost" || res.Host == "127.0.0.1" {
		res.Path = localWorkspacePath(res.Path)
		if _, err := os.Stat(res.Path); err == nil {
			res.Status, res.StatusMsg = "connected", "path ok"
		} else {
			res.Status, res.StatusMsg = "unreachable", trimErr(err)
		}
	} else {
		// two attempts: ssh over tailscale occasionally stalls one probe;
		// a single retry kills most false "unreachable" reports.
		var out []byte
		var err error
		for attempt := 0; attempt < 2; attempt++ {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			cmd := exec.CommandContext(ctx, "ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes", res.Host,
				"test -d "+shellQuote(res.Path)+" && echo ok")
			out, err = cmd.Output()
			cancel()
			if err == nil && strings.TrimSpace(string(out)) == "ok" {
				break
			}
			if attempt == 0 {
				time.Sleep(1200 * time.Millisecond)
			}
		}
		ms := float64(time.Since(start).Microseconds()) / 1000.0
		res.PingMs = &ms
		if err != nil {
			res.Status, res.StatusMsg = "unreachable", trimErr(err)
		} else if strings.TrimSpace(string(out)) == "ok" {
			res.Status, res.StatusMsg = "connected", fmt.Sprintf("path ok via %s", res.Host)
		} else {
			res.Status, res.StatusMsg = "connected", "host reachable, path missing"
		}
	}
	return res
}

func trimErr(err error) string {
	s := err.Error()
	if len(s) > 160 {
		s = s[:160]
	}
	return s
}

// WorkspaceOS reports the OS that owns a workspace path, preferring the
// registered workspace entry over the path-shape guess. Callers that must
// speak that host's shell (the review gate builds git scripts for the worker,
// not for this process) need this to pick a dialect.
func WorkspaceOS(path, host string) string {
	if ws, err := ListWorkspaces(); err == nil {
		for _, w := range ws {
			if w.OS != "" && sameOrParentPath(w.Path, path) {
				return w.OS
			}
		}
	}
	return inferOS(host, path)
}

// sameOrParentPath reports whether candidate is prefix or an ancestor of path.
func sameOrParentPath(candidate, path string) bool {
	c, p := strings.ToLower(strings.TrimRight(candidate, `\/`)), strings.ToLower(path)
	if c == "" || p == "" {
		return false
	}
	if p == c {
		return true
	}
	return strings.HasPrefix(p, c+`\`) || strings.HasPrefix(p, c+"/")
}

// inferOS guesses the target OS from host/path shape (mac, windows, linux).
func inferOS(host, path string) string {
	h, p := strings.ToLower(host), strings.ToLower(path)
	if strings.Contains(h, "windows") || strings.Contains(p, ":\\") {
		return "windows"
	}
	if strings.Contains(h, "mac") || strings.HasPrefix(p, "/users/") {
		return "mac"
	}
	if h == "" || h == "localhost" || h == "127.0.0.1" {
		return "linux"
	}
	return "linux"
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// WorkspaceLogs greps board dispatcher logs + the unified workspace-ping.log for this
// workspace's id — a cheap stand-in for hermes-webui's workspace activity view.
func WorkspaceLogs(w *Workspace, n int) ([]string, error) {
	if n <= 0 || n > 500 {
		n = 50
	}
	var lines []string
	root := filepath.Join(hermesHome(), "kanban", "boards")
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			f, err := os.Open(filepath.Join(root, e.Name(), "dispatcher.log"))
			if err != nil {
				continue
			}
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				t := sc.Text()
				if strings.Contains(t, w.ID) || strings.Contains(t, w.Path) {
					lines = append(lines, e.Name()+" | "+t)
				}
			}
			f.Close()
		}
	}
	// unified ping log — one line per PingWorkspace probe, filtered by workspace id
	if pf, err := os.Open(pingLogPath()); err == nil {
		sc := bufio.NewScanner(pf)
		for sc.Scan() {
			t := sc.Text()
			if strings.Contains(t, "["+w.ID+"]") {
				lines = append(lines, "ping | "+t)
			}
		}
		pf.Close()
	}
	// dispatcher + ping lines interleave chronologically because both use RFC3339
	// prefix; but we emitted pings sequentially, so appending is already ~sorted.
	// Cap to last n rather than doing a full sort/merge.
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	if lines == nil {
		lines = []string{}
	}
	return lines, nil
}
