package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// reviewGate implements the review column backend:
//   GET  /api/boards/{slug}/tasks/{id}/diff     -> git diff (full, inline)
//   POST /api/boards/{slug}/tasks/{id}/approve  -> {"action":"done"|"commit"|"commit_push"}
//
// Both run git ON the workspace host over SSH (workspace_transport=ssh).
// Approve is the ONLY path from review -> done; the plain status PATCH
// endpoint refuses that transition (see guard in main.go).

const diffLimit = 100 << 10 // 100KB truncation cap for raw diff output

// Git reports paths relative to the repository root, even when the command is
// run from a nested workspace. Normalize to that root first, while keeping the
// task workspace as the diff scope. This prevents nested workspaces from
// accidentally resolving untracked paths against the wrong directory.
const reviewScopeSetup = `repo_root=$(git rev-parse --show-toplevel) || exit 2; workspace=$(pwd -P); case "$workspace" in "$repo_root") scope=".";; "$repo_root"/*) scope="${workspace#"$repo_root"/}";; *) echo "workspace is outside git root" >&2; exit 2;; esac; cd "$repo_root" || exit 2; untracked() { git ls-files --others --exclude-standard -- "$scope"; }; `

type reviewTask struct {
	Slug          string
	ID            string
	Title         string
	Status        string
	WorkspacePath string
	Transport     string
	SSHTarget     string
	Result        string
}

func loadReviewTask(slug, id string) (*reviewTask, error) {
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	t := &reviewTask{}
	t.Slug = slug
	err = db.QueryRow(`SELECT id, title, status, workspace_path,
		COALESCE(workspace_transport,''), COALESCE(workspace_ssh_target,'mac-tailscale')
		, COALESCE(result,'') FROM tasks WHERE id=?`, id).
		Scan(&t.ID, &t.Title, &t.Status, &t.WorkspacePath, &t.Transport, &t.SSHTarget, &t.Result)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// runGit executes a git command inside the task workspace over SSH.
func runGit(t *reviewTask, args string) (string, int) {
	if t.Transport == "node-agent" {
		res, err := kanban.DispatchRemoteRaw(kanban.NodeDispatchRequest{
			TaskID: fmt.Sprintf("review-%s-%d", t.ID, time.Now().UnixNano()),
			Title:  t.Title, Board: t.Slug, Workspace: t.WorkspacePath,
			Executor: "shell", Command: args,
		}, kanban.RemoteDispatchWait())
		if err != nil {
			return err.Error(), 255
		}
		if res == nil {
			return "node-agent returned no result", 255
		}
		out := res.Output
		if res.Error != "" {
			out += "\n" + res.Error
		}
		if !res.Success {
			return out, 1
		}
		return out, 0
	}
	target := taskSSHTarget(t.SSHTarget)
	return sshRun(target, t.WorkspacePath, args)
}

func reviewWorkspaceClean(t *reviewTask) (bool, string, int) {
	// git diff --quiet ignores untracked files; review must treat new files as changes.
	out, code := runGit(t, reviewScopeSetup+`git diff --quiet HEAD -- "$scope"; diff_code=$?; untracked=$(untracked | head -20); if [ -n "$untracked" ]; then echo "$untracked"; exit 1; fi; exit $diff_code`)
	if code == 0 {
		return true, out, 0
	}
	if code == 1 {
		return false, out, 0
	}
	return false, out, code
}

type reviewSnapshot struct {
	stat  string
	diff  string
	names []string
	clean bool
}

func parseReviewSnapshot(raw string) reviewSnapshot {
	part := func(name, next string) string {
		value := raw
		if i := strings.Index(value, name); i >= 0 {
			value = value[i+len(name):]
		}
		if next != "" {
			if i := strings.Index(value, next); i >= 0 {
				value = value[:i]
			}
		}
		return strings.TrimSpace(value)
	}
	return reviewSnapshot{
		stat:  part("__STAT__", "__NAMES__"),
		diff:  part("__DIFF__", ""),
		names: parseChangedFilesRaw(part("__NAMES__", "__CLEAN__")),
		clean: part("__CLEAN__", "__DIFF__") == "1",
	}
}

func handleTaskDiff(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	t, err := loadReviewTask(slug, id)
	if err != nil {
		fail(w, err, 404)
		return
	}
	if t.Status != "review" {
		fail(w, fmt.Errorf("task not in review (status=%s)", t.Status), 400)
		return
	}
	if t.Transport != "ssh" && t.Transport != "node-agent" {
		fail(w, fmt.Errorf("unsupported transport %q for diff", t.Transport), 400)
		return
	}
	// Keep the clean-workspace path cheap. In particular, do not run a full
	// diff after Git has already told us there is nothing to review. Limit the
	// remote diff too, before it is sent back over SSH/node-agent.
	snapshot, code := runGit(t, reviewScopeSetup+`printf '__STAT__\n'; git diff --stat HEAD -- "$scope"; untracked | while IFS= read -r f; do [ -f "$f" ] || continue; git diff --no-index --stat /dev/null "$f" || true; done | tail -40; printf '__NAMES__\n'; git diff --name-only HEAD -- "$scope"; untracked; printf '__CLEAN__\n'; if git diff --quiet HEAD -- "$scope" && [ -z "$(untracked)" ]; then printf '1\n'; printf '__DIFF__\n'; exit 0; else printf '0\n'; fi; printf '__DIFF__\n'; git diff HEAD -- "$scope" | head -8000; untracked | while IFS= read -r f; do [ -f "$f" ] || continue; git diff --no-index /dev/null "$f" || true; done | head -8000`)
	if code != 0 && strings.TrimSpace(snapshot) == "" {
		fail(w, fmt.Errorf("git diff failed"), 500)
		return
	}
	review := parseReviewSnapshot(snapshot)
	files := review.names
	if len(files) == 0 && strings.TrimSpace(review.diff) != "" {
		files = parseDiffNames(review.diff)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"stat":       truncate(review.stat, 4000),
		"diff":       truncate(review.diff, diffLimit),
		"files":      files,
		"clean":      review.clean,
		"provenance": reviewProvenance(t.Result),
		"codegraph":  reviewCodeGraph(t.Result),
	})
}

func handleTaskApprove(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	var req struct {
		Action  string   `json:"action"`            // done | commit | commit_push
		Message string   `json:"message,omitempty"` // optional commit message override
		Files   []string `json:"files,omitempty"`   // per-file selective commit
	}
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err := json.Unmarshal(body, &req); err != nil {
		fail(w, err, 400)
		return
	}
	if req.Action != "done" && req.Action != "commit" && req.Action != "commit_push" {
		fail(w, fmt.Errorf("action must be done, commit, or commit_push"), 400)
		return
	}
	t, err := loadReviewTask(slug, id)
	if err != nil {
		fail(w, err, 404)
		return
	}
	if t.Status != "review" {
		fail(w, fmt.Errorf("task not in review (status=%s)", t.Status), 400)
		return
	}
	if t.Transport != "ssh" && t.Transport != "node-agent" {
		fail(w, fmt.Errorf("unsupported transport %q for approve", t.Transport), 400)
		return
	}
	if req.Action == "done" {
		if err := kanban.StatusTransition(slug, id, "done"); err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": "marked done without committing workspace changes"})
		return
	}

	clean, status, code := reviewWorkspaceClean(t)
	if code != 0 {
		fail(w, fmt.Errorf("git diff failed: %s", truncate(status, 500)), 500)
		return
	}
	if clean {
		if err := kanban.StatusTransition(slug, id, "done"); err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": "workspace clean; no commit needed"})
		return
	}
	// Build commit message: subject + bullet changes + Refs footer.
	subject := req.Message
	if subject == "" {
		subject = t.Title
	}

	// Files listed in the body: selective set when given, else all changed files.
	commitFiles := req.Files
	if len(commitFiles) == 0 {
		commitFiles = changedFiles(t)
	}
	const maxBullet = 100
	var msgBuilder strings.Builder
	msgBuilder.WriteString(subject)
	msgBuilder.WriteString("\n\n")
	for i, f := range commitFiles {
		if i >= maxBullet {
			fmt.Fprintf(&msgBuilder, "  - … (+%d more)\n", len(commitFiles)-maxBullet)
			break
		}
		msgBuilder.WriteString("  - " + f + "\n")
	}
	msgBuilder.WriteString("\nRefs: " + t.ID + "\n")
	msg := msgBuilder.String()

	var script string
	if len(req.Files) > 0 {
		if err := validateCommitFiles(req.Files); err != nil {
			fail(w, err, 400)
			return
		}
		quoted := make([]string, len(req.Files))
		for i, f := range req.Files {
			quoted[i] = shellQuote(f)
		}
		script = fmt.Sprintf("git add -- %s && git commit -m %s", strings.Join(quoted, " "), shellQuote(msg))
	} else {
		script = fmt.Sprintf("git add -A -- \"$scope\" && git commit -m %s", shellQuote(msg))
	}
	if req.Action == "commit_push" {
		script += " && git push"
	}
	out, code := runGit(t, reviewScopeSetup+script)
	if code != 0 {
		fail(w, fmt.Errorf("git failed (exit %d): %s", code, truncate(out, 500)), 500)
		return
	}
	if err := kanban.StatusTransition(slug, id, "done"); err != nil {
		fail(w, err, 500)
		return
	}
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err == nil {
		_, _ = db.Exec(`UPDATE tasks SET completed_at=? WHERE id=?`, time.Now().Unix(), id)
		db.Close()
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "done", "output": truncate(out, 4000)})
}

func reviewProvenance(result string) []string {
	var out []string
	for _, line := range strings.Split(result, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "provenance ") {
			out = append(out, strings.TrimSpace(line))
		}
	}
	return out
}

func reviewCodeGraph(result string) string {
	for _, line := range strings.Split(result, "\n") {
		if strings.Contains(strings.ToLower(line), "codegraph") {
			return strings.TrimSpace(line)
		}
	}
	return "skipped or unavailable"
}

func parseChangedFilesRaw(raw string) []string {
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		files = append(files, line)
	}
	return files
}

func parseDiffNames(raw string) []string {
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(raw, "\n") {
		if !strings.HasPrefix(line, "diff --git ") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 4 {
			continue
		}
		name := strings.TrimPrefix(parts[len(parts)-1], "b/")
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		files = append(files, name)
	}
	return files
}

func changedFiles(t *reviewTask) []string {
	out, code := runGit(t, reviewScopeSetup+`git diff --name-only HEAD -- "$scope"; untracked`)
	if code != 0 {
		return nil
	}
	seen := make(map[string]struct{})
	files := make([]string, 0)
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		files = append(files, line)
	}
	return files
}

func validateCommitFiles(files []string) error {
	for _, f := range files {
		if f == "" {
			return fmt.Errorf("empty file path")
		}
		if strings.Contains(f, "..") {
			return fmt.Errorf("path traversal rejected: %s", f)
		}
		if filepath.IsAbs(f) {
			return fmt.Errorf("absolute path rejected: %s", f)
		}
	}
	return nil
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}
