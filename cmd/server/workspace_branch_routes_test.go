package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// gitRepoWithBranches builds a real repo so the branch endpoints have something
// to read. These tests are deliberately end-to-end: the bug they guard against
// lived entirely in the wiring between the route and the workspace registry, so
// a unit test of the git helper alone would have passed while the feature stayed
// broken in the app.
func gitRepoWithBranches(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		full := append([]string{"-C", dir}, args...)
		if out, err := exec.Command("git", full...).CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	run("init", "-b", "main")
	run("config", "user.email", "t@example.com")
	run("config", "user.name", "test")
	run("commit", "--allow-empty", "-m", "init")
	run("branch", "feature")
	return dir
}

// branchRoutesServer boots the real board routes behind real auth, with a
// workspace registry that holds a *path-only* entry — the shape the hermes CLI
// writes, and the one that made the workspace unaddressable by id.
func branchRoutesServer(t *testing.T, repo string) (*httptest.Server, *http.Cookie) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatal(err)
	}
	registry := map[string]any{"workspaces": []map[string]any{{"path": repo}}}
	raw, err := json.Marshal(registry)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "workspaces.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerBoardsRoutes(mux)
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		ok, err := kanban.VerifyPassword(req.Password)
		if err != nil || !ok {
			http.Error(w, "bad password", http.StatusUnauthorized)
			return
		}
		session, err := kanban.CreateSession()
		if err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kanban_session", Value: session, Path: "/"})
	})
	srv := httptest.NewServer(authHandler(mux))
	t.Cleanup(srv.Close)

	login, err := http.Post(srv.URL+"/api/auth/login", "application/json", strings.NewReader(`{"password":"123456"}`))
	if err != nil {
		t.Fatal(err)
	}
	login.Body.Close()
	if login.StatusCode != http.StatusOK {
		t.Fatalf("login = %d", login.StatusCode)
	}
	cookies := login.Cookies()
	if len(cookies) == 0 {
		t.Fatal("no session cookie")
	}
	return srv, cookies[0]
}

func branchRequest(t *testing.T, srv *httptest.Server, cookie *http.Cookie, method, path, body string) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func decodeBranches(t *testing.T, res *http.Response) kanban.GitBranches {
	t.Helper()
	defer res.Body.Close()
	var out kanban.GitBranches
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode branches: %v", err)
	}
	return out
}

// TestWorkspaceBranchRoutesE2E covers the whole path the UI takes: list the
// workspaces, read a branch list, switch a branch, and be told plainly when git
// refuses.
func TestWorkspaceBranchRoutesE2E(t *testing.T) {
	repo := gitRepoWithBranches(t)
	srv, cookie := branchRoutesServer(t, repo)

	// The registry entry carries no id, so the derived one is what the picker
	// will address. Reading it back from the API is the point: this is exactly
	// the value the frontend puts in the URL.
	res := branchRequest(t, srv, cookie, "GET", "/api/workspaces", "")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET /api/workspaces = %d", res.StatusCode)
	}
	var list []kanban.Workspace
	if err := json.NewDecoder(res.Body).Decode(&list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("workspaces = %d, want 1", len(list))
	}
	id := list[0].ID
	if id == "" {
		t.Fatal("path-only registry entry was not given an id; every /api/workspaces/{id}/ route would 404")
	}
	if list[0].Name == "" {
		t.Error("path-only registry entry was not given a display name; the picker would render a blank row")
	}

	// Before the fix this returned 502 "invalid workspace path" for every
	// workspace, which is why the Pull button appeared to do nothing.
	res = branchRequest(t, srv, cookie, "GET", "/api/workspaces/"+id+"/branches", "")
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		t.Fatalf("GET branches = %d: %s", res.StatusCode, body)
	}
	branches := decodeBranches(t, res)
	if branches.Current != "main" {
		t.Errorf("current = %q, want main", branches.Current)
	}
	if len(branches.Branches) != 2 {
		t.Errorf("branches = %v, want main and feature", branches.Branches)
	}

	// Switching is a real mutation, so it must be observable afterwards.
	res = branchRequest(t, srv, cookie, "POST", "/api/workspaces/"+id+"/git-checkout", `{"branch":"feature"}`)
	var switched struct {
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&switched); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if !switched.Success {
		t.Fatalf("checkout refused: %s", switched.Error)
	}
	branches = decodeBranches(t, branchRequest(t, srv, cookie, "GET", "/api/workspaces/"+id+"/branches", ""))
	if branches.Current != "feature" {
		t.Errorf("current after checkout = %q, want feature", branches.Current)
	}

	// An unknown branch is a refusal the UI renders, not a 5xx.
	res = branchRequest(t, srv, cookie, "POST", "/api/workspaces/"+id+"/git-checkout", `{"branch":"nope"}`)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unknown branch = %d, want 200 with success:false", res.StatusCode)
	}
	var refused struct {
		Success bool   `json:"success"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&refused); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if refused.Success || !strings.Contains(refused.Error, "unknown branch") {
		t.Errorf("unknown branch response = %+v", refused)
	}

	// A pull with no upstream cannot succeed, but it must fail as a reported git
	// error — 200 + success:false — rather than as an unreachable workspace.
	res = branchRequest(t, srv, cookie, "POST", "/api/workspaces/"+id+"/git-pull", "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("git-pull = %d, want 200", res.StatusCode)
	}
	var pulled struct {
		Success bool   `json:"success"`
		Output  string `json:"output"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&pulled); err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if pulled.Success {
		t.Error("pull succeeded with no remote configured")
	}
	if pulled.Error == "" {
		t.Error("pull failure carried no message for the UI to show")
	}
	if strings.Contains(pulled.Error, "invalid workspace path") {
		t.Errorf("pull still fails in the resolver instead of reaching git: %s", pulled.Error)
	}
}

// TestWorkspaceBranchRoutesResolveByPathToo: the picker may be holding a list
// fetched before ids were derived, so addressing a workspace by its path has to
// keep working.
func TestWorkspaceBranchRoutesResolveByPathToo(t *testing.T) {
	repo := gitRepoWithBranches(t)
	srv, cookie := branchRoutesServer(t, repo)

	// A path contains slashes, so it is sent percent-encoded — the same shape a
	// stale client would produce.
	encoded := strings.ReplaceAll(repo, "/", "%2F")
	res := branchRequest(t, srv, cookie, "GET", "/api/workspaces/"+encoded+"/branches", "")
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("GET branches by path = %d: %s", res.StatusCode, body)
	}
	if got := decodeBranches(t, res); got.Current != "main" {
		t.Errorf("current = %q, want main", got.Current)
	}
}
