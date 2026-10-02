package kanban

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// A fake node-agent that really runs the commands it is sent.
//
// The worktree lifecycle is entirely git commands executed on a worker, so a
// test that stubs them out would only assert that the right strings were
// assembled — which is what the unit tests in worktree_test.go already do.
// What those cannot check is whether `git worktree add` and `git worktree list
// --porcelain` actually behave the way the parsing assumes, and whether a branch
// created in a worktree is really mergeable back into the base.
//
// So this fake speaks node-agent's HTTP protocol (POST /api/dispatch, then
// GET /api/results/{task_id}) and executes each command with `sh -c` in the
// requested workspace, with the same "workspace must exist" rule the real
// worker enforces. Real git, real directories, real branches.

type fakeAgent struct {
	t        *testing.T
	mu       sync.Mutex
	results  map[string]*fakeResult
	seq      int
	notFound map[string]bool // workspaces the caller claims that do not exist
}

type fakeResult struct {
	Output  string `json:"output"`
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Done    bool   `json:"done"`
}

func newFakeAgent(t *testing.T) *fakeAgent {
	t.Helper()
	return &fakeAgent{t: t, results: map[string]*fakeResult{}, notFound: map[string]bool{}}
}

type dispatchReq struct {
	TaskID    string `json:"task_id"`
	Title     string `json:"title"`
	Board     string `json:"board"`
	Message   string `json:"message"`
	Workspace string `json:"workspace"`
	Executor  string `json:"executor"`
	Command   string `json:"command"`
	NoRTK     bool   `json:"no_rtk"`
}

// start runs the fake and points the control plane at it for the test's
// duration.
func (a *fakeAgent) start() {
	a.t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/dispatch", func(w http.ResponseWriter, r *http.Request) {
		var req dispatchReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		// Mirrors node-agent's routing: an unknown workspace is a 409, not a
		// silent fallback to some other node.
		if a.claimsMissing(req.Workspace) {
			http.Error(w,
				fmt.Sprintf("no node owns workspace %q", req.Workspace),
				http.StatusConflict)
			return
		}
		a.mu.Lock()
		a.seq++
		id := fmt.Sprintf("delivery_%d", a.seq)
		a.mu.Unlock()

		res := a.execute(req)
		a.mu.Lock()
		a.results[req.TaskID] = res
		a.mu.Unlock()

		writeJSONAck(w, id)
	})

	mux.HandleFunc("GET /api/results/{taskID}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("taskID")
		a.mu.Lock()
		res, ok := a.results[id]
		a.mu.Unlock()
		if !ok {
			http.Error(w, "no such task", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})

	mux.HandleFunc("GET /api/progress/{taskID}", func(w http.ResponseWriter, r *http.Request) {
		// No live progress: the worktree commands are short and silent.
		w.WriteHeader(http.StatusOK)
	})

	srv := httptest.NewServer(mux)
	a.t.Cleanup(srv.Close)
	a.t.Setenv("KANBAN_NODE_AGENT", srv.URL)
	// An empty token keeps the fake from requiring one, matching a dev setup.
	a.t.Setenv("NODE_AGENT_TOKEN", "")
}

func writeJSONAck(w http.ResponseWriter, deliveryID string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":      "queued",
		"node_id":     "fake",
		"transport":   "http",
		"delivery_id": deliveryID,
	})
}

func (a *fakeAgent) claimsMissing(ws string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.notFound[ws]
}

// expectMissing makes the fake reject a workspace the way a worker that cannot
// stat the directory would.
func (a *fakeAgent) expectMissing(ws string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.notFound[ws] = true
}

// execute runs the command for real, enforcing the same existence check the
// worker does before spawning anything.
func (a *fakeAgent) execute(req dispatchReq) *fakeResult {
	if strings.TrimSpace(req.Workspace) == "" {
		return &fakeResult{Output: "workspace required", Success: false, Error: "workspace required", Done: true}
	}
	if st, err := os.Stat(req.Workspace); err != nil || !st.IsDir() {
		// This is the exact guard that makes worktree creation ordering
		// load-bearing: a dispatch into a directory that does not exist fails.
		msg := "workspace not found: " + req.Workspace
		return &fakeResult{Output: msg, Success: false, Error: msg, Done: true}
	}
	cmd := exec.Command("sh", "-c", req.Command)
	cmd.Dir = req.Workspace
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	if err != nil {
		return &fakeResult{Output: out.String(), Success: false, Error: err.Error(), Done: true}
	}
	return &fakeResult{Output: out.String(), Success: true, Done: true}
}

// --- git fixtures -------------------------------------------------------

// requireGit skips a test when git is unavailable, so a developer on a machine
// without it gets a clear skip rather than a confusing exec failure. Git is
// present on the CI runners and on any machine that has a checkout.
func requireGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed; skipping the worktree lifecycle test")
	}
}

// initRepo creates a real git repository with one commit, and returns its path.
// The user's git identity is set locally so the test does not depend on global
// config being present.
func initRepo(t *testing.T) string {
	t.Helper()
	requireGit(t)
	repo := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = repo
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Switchyard Test",
			"GIT_AUTHOR_EMAIL=test@example.invalid",
			"GIT_COMMITTER_NAME=Switchyard Test",
			"GIT_COMMITTER_EMAIL=test@example.invalid",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	run("init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", "-A")
	run("commit", "-q", "-m", "initial")
	return repo
}

func gitOut(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s in %s: %v\n%s", strings.Join(args, " "), dir, err, out)
	}
	return string(out)
}

// --- the e2e test -------------------------------------------------------

// TestWorktreeLifecycleAgainstRealGit drives the whole worktree flow through
// the node-agent protocol with real git and real directories. It covers the
// parts unit tests cannot: that `git worktree list --porcelain` parses into the
// shape WorktreeExists and BranchOnWorktree expect, and that a branch created in
// a worktree is really mergeable back into the base.
func TestWorktreeLifecycleAgainstRealGit(t *testing.T) {
	repo := initRepo(t)
	agent := newFakeAgent(t)
	agent.start()

	// A board with one worktree-isolated task, in review as a finished run
	// would be.
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := CreateTask("default", &Task{
		ID: "t_wt", Title: "isolated work", WorkspacePath: repo, Isolation: "worktree",
	}); err != nil {
		t.Fatalf("create: %v", err)
	}
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`UPDATE tasks SET status='review' WHERE id='t_wt'`); err != nil {
		t.Fatal(err)
	}

	// 1. Creating the worktree.
	wtPath, err := EnsureTaskWorktree(db, "t_wt", repo)
	if err != nil {
		t.Fatalf("EnsureTaskWorktree: %v", err)
	}
	wantPath := filepath.Join(repo, worktreeDirName, "t_wt")
	if wtPath != wantPath {
		t.Fatalf("worktree path = %q, want %q", wtPath, wantPath)
	}
	if st, err := os.Stat(wtPath); err != nil || !st.IsDir() {
		t.Fatalf("the worktree directory was not created: %v", err)
	}
	// It is a real checkout of the task's branch, not an empty directory.
	if got := strings.TrimSpace(gitOut(t, wtPath, "rev-parse", "--abbrev-ref", "HEAD")); got != "switchyard/t_wt" {
		t.Fatalf("worktree HEAD = %q, want the task branch", got)
	}
	// The base commit is present in it, so the agent starts from real history.
	if !strings.Contains(gitOut(t, wtPath, "log", "--oneline"), "initial") {
		t.Fatal("the worktree does not contain the base history")
	}

	// 2. The binding was recorded, so a restart does not create a second one.
	branch, recorded, err := TaskWorktree(db, "t_wt")
	if err != nil {
		t.Fatal(err)
	}
	if branch != "switchyard/t_wt" || recorded != wantPath {
		t.Fatalf("recorded binding = (%q,%q)", branch, recorded)
	}

	// 3. The repo now lists the worktree, in the porcelain shape the parser
	// reads. This is the assertion a stub could not make.
	list := gitOut(t, repo, "worktree", "list", "--porcelain")
	if !WorktreeExists(list, wantPath) {
		t.Fatalf("git worktree list did not report the worktree:\n%s", list)
	}
	if got := BranchOnWorktree(list, wantPath); got != "refs/heads/switchyard/t_wt" {
		t.Fatalf("BranchOnWorktree = %q, want refs/heads/switchyard/t_wt", got)
	}

	// 4. The worktree directory is excluded locally, so this task's own diff
	// does not show every other worktree.
	exclude := filepath.Join(repo, ".git", "info", "exclude")
	raw, err := os.ReadFile(exclude)
	if err != nil {
		t.Fatalf("the exclude file was not written: %v", err)
	}
	if !strings.Contains(string(raw), worktreeDirName+"/") {
		t.Fatalf("exclude does not mention %s/:\n%s", worktreeDirName, raw)
	}
	// And git agrees the directory is ignored, from inside the worktree.
	if out := gitOut(t, wtPath, "status", "--porcelain"); strings.Contains(out, worktreeDirName) {
		t.Fatalf("worktree directories still appear in status:\n%s", out)
	}

	// 5. A second call reuses the worktree rather than creating another. This is
	// the retry path: a retry must continue from the previous attempt, not start
	// a fresh checkout and lose its work.
	again, err := EnsureTaskWorktree(db, "t_wt", repo)
	if err != nil {
		t.Fatalf("second EnsureTaskWorktree: %v", err)
	}
	if again != wantPath {
		t.Fatalf("second call returned %q, want the same worktree %q", again, wantPath)
	}
	entries := strings.Count(gitOut(t, repo, "worktree", "list", "--porcelain"), "worktree ")
	if entries != 2 { // the main checkout plus ours
		t.Fatalf("expected 2 worktree entries after a repeat call, got %d", entries)
	}

	// 6. The agent edits inside the worktree, and the shared checkout is
	// untouched. This is the property that makes the diff belong to one task.
	if err := os.WriteFile(filepath.Join(wtPath, "feature.txt"), []byte("from the task\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, "feature.txt")); err == nil {
		t.Fatal("the edit leaked into the shared checkout")
	}
	// git agrees, from the main checkout.
	if out := gitOut(t, repo, "status", "--porcelain"); strings.Contains(out, "feature.txt") {
		t.Fatalf("the main checkout sees the worktree's edit:\n%s", out)
	}

	// 7. Approve commits on the task branch, then merges it back — the sequence
	// handleTaskApprove performs.
	gitOut(t, wtPath, "add", "-A")
	gitOut(t, wtPath, "commit", "-q", "-m", "Refs: t_wt")
	plan := PlanWorktree(repo, "t_wt")
	plan.Path = wantPath
	if _, err := MergeWorktreeToBase(repo, plan); err != nil {
		t.Fatalf("MergeWorktreeToBase: %v", err)
	}
	// The change is now in the base checkout, committed, and the worktree's
	// uncommitted state is gone because the work is in history.
	if _, err := os.Stat(filepath.Join(repo, "feature.txt")); err != nil {
		t.Fatalf("the merged file is missing from the base checkout: %v", err)
	}
	if !strings.Contains(gitOut(t, repo, "log", "--oneline"), "Refs: t_wt") {
		t.Fatal("the merged commit is not on the base branch")
	}
	// The shared checkout is clean: the merge committed, it did not leave a mess.
	if out := gitOut(t, repo, "status", "--porcelain"); strings.TrimSpace(out) != "" {
		t.Fatalf("the base checkout is dirty after the merge:\n%s", out)
	}

	// 8. Removal reclaims the directory and prunes the administrative entry.
	if err := RemoveTaskWorktree(db, "t_wt", repo); err != nil {
		t.Fatalf("RemoveTaskWorktree: %v", err)
	}
	if _, err := os.Stat(wtPath); err == nil {
		t.Fatal("the worktree directory survived removal")
	}
	entries = strings.Count(gitOut(t, repo, "worktree", "list", "--porcelain"), "worktree ")
	if entries != 1 {
		t.Fatalf("expected only the main checkout after removal, got %d entries", entries)
	}
}

// TestWorktreeSweepReclaimsOldWorktrees proves the cleanup path removes a real
// worktree for a task that finished long ago, and leaves a recent one alone.
func TestWorktreeSweepReclaimsOldWorktrees(t *testing.T) {
	repo := initRepo(t)
	agent := newFakeAgent(t)
	agent.start()

	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	for _, id := range []string{"t_old", "t_recent"} {
		if err := CreateTask("default", &Task{
			ID: id, Title: id, WorkspacePath: repo, Isolation: "worktree",
		}); err != nil {
			t.Fatalf("create %s: %v", id, err)
		}
	}
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	for _, id := range []string{"t_old", "t_recent"} {
		if _, err := EnsureTaskWorktree(db, id, repo); err != nil {
			t.Fatalf("worktree for %s: %v", id, err)
		}
	}
	// One finished long ago, one just now.
	old := time.Now().Add(-worktreeGracePeriod - 24*time.Hour).Unix()
	if _, err := db.Exec(`UPDATE tasks SET status='done', completed_at=? WHERE id='t_old'`, old); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE tasks SET status='done', completed_at=? WHERE id='t_recent'`, time.Now().Unix()); err != nil {
		t.Fatal(err)
	}

	n, err := SweepStaleWorktrees(db, time.Now())
	if err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if n != 1 {
		t.Fatalf("swept %d, want only the old one", n)
	}
	oldPath := filepath.Join(repo, worktreeDirName, "t_old")
	if _, err := os.Stat(oldPath); err == nil {
		t.Fatal("the old worktree was not reclaimed")
	}
	recentPath := filepath.Join(repo, worktreeDirName, "t_recent")
	if _, err := os.Stat(recentPath); err != nil {
		t.Fatalf("a recently finished task's worktree must be kept for review: %v", err)
	}
	// The binding is cleared so the sweep does not retry it forever.
	_, recorded, err := TaskWorktree(db, "t_old")
	if err != nil {
		t.Fatal(err)
	}
	if recorded != "" {
		t.Fatalf("the reclaimed task still advertises a worktree: %q", recorded)
	}
}

// TestWorkerRefusesMissingWorkspace covers the worker's behaviour that makes
// worktree creation ordering load-bearing.
//
// There are two distinct guards, and both matter:
//
//   - The gateway rejects an unregistered workspace with 409 before it is ever
//     queued, because a node claims workspaces by path prefix and an unknown path
//     has no owner.
//   - A registered but nonexistent directory is rejected by the worker itself,
//     with "workspace not found", when it tries to run the command.
//
// The first means a worktree path routes correctly the moment it sits under a
// registered root; the second is why it must exist on disk before dispatch.
func TestWorkerRefusesMissingWorkspace(t *testing.T) {
	repo := initRepo(t)
	agent := newFakeAgent(t)
	agent.start()

	missing := filepath.Join(repo, worktreeDirName, "t_never_made")

	// 1. An unregistered path is a routing failure, reported as such.
	agent.expectMissing(missing)
	out, code := workerShell(missing, "probe", "pwd")
	if code == 0 {
		t.Fatalf("a dispatch to an unowned workspace must fail, got success: %s", out)
	}
	if !strings.Contains(out, "no node owns workspace") {
		t.Fatalf("expected a routing failure naming the workspace, got: %s", out)
	}

	// 2. A workspace the fake does own, but whose directory is absent, fails
	// at the worker's existence check. This is the guard the ordering protects.
	orphan := filepath.Join(repo, "not-created-yet")
	orphanRes := &fakeResult{}
	a := agent
	// Register it as owned, so routing succeeds and the worker check is reached.
	a.mu.Lock()
	a.notFound[orphan] = false
	a.mu.Unlock()
	orphanRes = a.execute(dispatchReq{TaskID: "probe", Workspace: orphan, Command: "pwd"})
	if orphanRes.Success {
		t.Fatal("a dispatch into a nonexistent directory must fail")
	}
	if !strings.Contains(orphanRes.Error, "workspace not found") {
		t.Fatalf("failure should name the missing workspace, got: %s", orphanRes.Error)
	}

	// 3. Once the directory exists, the same command succeeds — which is why
	// EnsureTaskWorktree has to run before the agent dispatch.
	if err := os.MkdirAll(missing, 0o755); err != nil {
		t.Fatal(err)
	}
	a.mu.Lock()
	delete(a.notFound, missing)
	a.mu.Unlock()
	if out, code := workerShell(missing, "probe", "pwd"); code != 0 {
		t.Fatalf("a dispatch into an existing workspace should succeed: %s", out)
	}
}
