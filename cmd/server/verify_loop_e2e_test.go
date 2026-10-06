package main

// The design quality loop, end to end, on one card.
//
// A mac-side UI task — commandcode executor, a pen.dev design
// committed at design/sign-in.pen, the ui verify rung — is
// created through the HTTP API the board UI uses, picked up
// by the real dispatcher, sent through node-agent (a fake
// that completes every dispatch immediately), verified by
// the verify hook, and read back over the same API a
// reviewer would.
//
// The fake stands in for the Mac: pen.dev generation and the
// commandcode agent are per-machine, user-run steps (pen login is
// interactive), so the test proves the control plane's half —
// the API surface, claim, dispatch, design-reference injection,
// session continuity, the verify hook, artifact transport —
// without either.

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"kanban-board/internal/kanban"
)

// loopShot encodes a 1x1 PNG — the smallest valid image the
// attachment store accepts — in the given colour, standing in
// for one screenshot a verify run produced. Light and dark
// differ so the store's dedup-by-SHA keeps both, the way it
// keeps two screenshots that differ by theme.
func loopShot(c color.Color) []byte {
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, c)
	if err := png.Encode(&buf, img); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

// loopFakeNode is a node-agent stand-in. It completes every dispatch
// immediately, serves the artifacts a verify run reports, and records
// every dispatch so the test can assert on what the control plane
// actually sent — the prompt, the executor, the command.
type loopFakeNode struct {
	*httptest.Server

	light, dark []byte

	mu         sync.Mutex
	dispatches []kanban.NodeDispatchRequest
	results    map[string]*kanban.NodeDispatchResult
	artifacts  map[string]map[string][]byte
}

func startLoopFakeNode(t *testing.T) *loopFakeNode {
	t.Helper()
	fake := &loopFakeNode{
		light:     loopShot(color.White),
		dark:      loopShot(color.Black),
		results:   map[string]*kanban.NodeDispatchResult{},
		artifacts: map[string]map[string][]byte{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/dispatch", fake.handleDispatch)
	mux.HandleFunc("GET /api/results/{task_id}", fake.handleResult)
	mux.HandleFunc("GET /api/nodes/artifacts/{task_id}/{name}", fake.handleArtifact)
	mux.HandleFunc("GET /api/progress/{task_id}", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	fake.Server = httptest.NewServer(mux)
	t.Cleanup(fake.Close)
	return fake
}

func (f *loopFakeNode) handleDispatch(w http.ResponseWriter, r *http.Request) {
	var req kanban.NodeDispatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	f.dispatches = append(f.dispatches, req)
	res := f.resultFor(&req)
	f.results[req.TaskID] = res
	if len(res.Artifacts) > 0 {
		f.artifacts[req.TaskID] = map[string][]byte{
			"ui-light.png": f.light,
			"ui-dark.png":  f.dark,
		}
	}
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":      "queued",
		"node_id":     "fake-mac",
		"transport":   "http",
		"delivery_id": "dl-" + req.TaskID,
	})
}

func (f *loopFakeNode) handleResult(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("task_id")
	f.mu.Lock()
	res, ok := f.results[id]
	f.mu.Unlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

func (f *loopFakeNode) handleArtifact(w http.ResponseWriter, r *http.Request) {
	taskID, name := r.PathValue("task_id"), r.PathValue("name")
	f.mu.Lock()
	data, ok := f.artifacts[taskID][name]
	f.mu.Unlock()
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(data)
}

// resultFor answers a dispatch the way the worker it stands in for
// would: the card's agent run reports its session id back (the
// control plane rejects a successful commandcode run that omits it),
// the verify hook's own shell runs report output, and the verify run
// reports the screenshots it produced.
func (f *loopFakeNode) resultFor(req *kanban.NodeDispatchRequest) *kanban.NodeDispatchResult {
	switch {
	case strings.Contains(req.Command, "git diff"):
		// The changed-file probe: one web/src file, a UI change.
		return &kanban.NodeDispatchResult{
			TaskID: req.TaskID, Success: true, DurationMs: 12,
			Output: "web/src/features/board/SignInCard.tsx\n",
		}
	case strings.Contains(req.Command, "pnpm verify:"):
		// The verify run itself: green, with the evidence it produced.
		return &kanban.NodeDispatchResult{
			TaskID: req.TaskID, Success: true, DurationMs: 900,
			Output: "3 passed\n",
			Artifacts: []kanban.NodeArtifact{
				{Name: "ui-light.png", Path: "/tmp/ui-light.png", Bytes: int64(len(f.light)), MIME: "image/png"},
				{Name: "ui-dark.png", Path: "/tmp/ui-dark.png", Bytes: int64(len(f.dark)), MIME: "image/png"},
			},
		}
	default:
		// The card's run on the commandcode executor. A real
		// worker echoes its session id back — creating one on
		// a first run — because the control plane rejects a
		// successful commandcode run that omits it.
		session := firstNonEmpty(req.CommandCodeSessionID, req.OMPSessionID, req.DSHSessionID)
		if session == "" {
			session = "cmd-loop-" + req.TaskID
		}
		return &kanban.NodeDispatchResult{
			TaskID:     req.TaskID,
			Success:    true,
			DurationMs: 4000,
			// A real commandcode run returns its full transcript,
			// which runs past a megabyte — the result body must
			// survive that size or the run can never finalize.
			Output:               "Implemented the sign-in card to the committed design mock.\n" + strings.Repeat("agent transcript line\n", 60_000),
			CommandCodeSessionID: session,
		}
	}
}

func (f *loopFakeNode) dispatchByExecutor(executor string) *kanban.NodeDispatchRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.dispatches {
		if f.dispatches[i].Executor == executor {
			return &f.dispatches[i]
		}
	}
	return nil
}

func (f *loopFakeNode) dispatchByCommand(substr string) *kanban.NodeDispatchRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.dispatches {
		if strings.Contains(f.dispatches[i].Command, substr) {
			return &f.dispatches[i]
		}
	}
	return nil
}

func (f *loopFakeNode) dispatchCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.dispatches)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// loopLogin signs in as the dev administrator and returns the
// session cookie every API call after it carries.
func loopLogin(t *testing.T, baseURL string) *http.Cookie {
	t.Helper()
	resp, err := http.Post(baseURL+"/api/auth/login", "application/json",
		strings.NewReader(`{"password":"123456"}`))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login = %d, want 200", resp.StatusCode)
	}
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		t.Fatal("login returned no session cookie")
	}
	return cookies[0]
}

// loopAPI sends a request to the API with the session cookie,
// the way a board client does, and returns the response for
// the caller to inspect.
func loopAPI(t *testing.T, baseURL string, cookie *http.Cookie, method, path string, body any) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, baseURL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(cookie)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

// TestVerifyLoopE2E drives the whole loop the way a mac-side UI card
// travels it: the card is created over the HTTP API, the dispatcher
// claims and dispatches it to the commandcode executor with the
// committed design in its prompt, the verify hook routes the card to
// the ui rung, the run's screenshots are pulled back as card
// attachments, and the verdict is readable over the API.
func TestVerifyLoopE2E(t *testing.T) {
	fake := startLoopFakeNode(t)
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("KANBAN_NODE_AGENT", fake.URL)
	// SWITCHYARD_DEV seeds the known dev password, so the test
	// signs in the way the board UI does.
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatalf("auth seed: %v", err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		t.Fatalf("attachments db: %v", err)
	}

	// The commandcode harness runs an agent, so the card's
	// assignee must name a profile with a model to run it
	// with. The default profile's config lives at the hermes
	// home root.
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  default: loop-test-model\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// The API surface a board client uses — login, boards,
	// tasks, the verify verdict — behind the real auth
	// middleware.
	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	api := httptest.NewServer(authHandler(mux))
	t.Cleanup(api.Close)
	cookie := loopLogin(t, api.URL)

	// A board, then a mac-side UI card in it: the commandcode
	// executor on the mac node, a pen.dev design committed at
	// design/sign-in.pen, and the ui verify rung. A /Users/
	// path routes to node-agent on its own. A fresh board
	// needs its schema seeded before its first card — the
	// import flow does this.
	if res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards",
		map[string]string{"slug": "loop", "name": "Loop"}); res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards = %d, want 201", res.StatusCode)
	}
	if err := kanban.EnsureImportSchemaPublic("loop"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	res := loopAPI(t, api.URL, cookie, http.MethodPost, "/api/boards/loop/tasks", map[string]any{
		"title":          "Sign-in card to the design mock",
		"body":           "Implement the sign-in card to the committed pen.dev mock.",
		"executor":       "commandcode",
		"assignee":       "default",
		"workspace_path": "/Users/mac/loop-workspace",
		"workspace_kind": "dir",
		"verify_profile": kanban.VerifyUI,
		"design_source":  "design/sign-in.pen",
		"isolation":      "workspace",
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("POST /api/boards/loop/tasks = %d, want 201", res.StatusCode)
	}
	var card kanban.Task
	if err := json.NewDecoder(res.Body).Decode(&card); err != nil {
		t.Fatal(err)
	}
	if card.ID == "" {
		t.Fatal("the API returned no card id")
	}

	// The real dispatcher: claim the card, dispatch it, then run the
	// gate and the verify hook on the result.
	dispatchPendingRemoteTasks()

	// The card reached the commandcode executor as a node-agent
	// dispatch into its mac workspace, carrying the committed design.
	taskRun := fake.dispatchByExecutor("commandcode")
	if taskRun == nil {
		t.Fatalf("no commandcode dispatch reached the node; %d dispatch(es) recorded", fake.dispatchCount())
	}
	if taskRun.Workspace != "/Users/mac/loop-workspace" {
		t.Errorf("workspace = %q, want the mac workspace", taskRun.Workspace)
	}
	if taskRun.Board != "loop" {
		t.Errorf("board = %q, want loop", taskRun.Board)
	}
	for _, want := range []string{"Design Reference", "design/sign-in.pen"} {
		if !strings.Contains(taskRun.Message, want) {
			t.Errorf("dispatch prompt missing %q", want)
		}
	}

	// The verify hook probed the diff, routed the card to the ui
	// rung, and ran it.
	if fake.dispatchByCommand("git diff") == nil {
		t.Error("the verify hook never probed the changed files")
	}
	if fake.dispatchByCommand("pnpm verify:ui") == nil {
		t.Errorf("the ui rung never ran; %d dispatch(es) recorded", fake.dispatchCount())
	}

	// The verdict landed on the card.
	state, err := kanban.VerifyState("loop", card.ID)
	if err != nil {
		t.Fatalf("verify state: %v", err)
	}
	if state.Profile != kanban.VerifyUI || state.ProfileEffective != kanban.VerifyUI {
		t.Errorf("profile = %q (effective %q), want ui/ui", state.Profile, state.ProfileEffective)
	}
	if state.Status != "passed" {
		t.Errorf("verify status = %q, want passed (output: %s)", state.Status, state.Output)
	}
	if !strings.Contains(state.Output, "verification artifact(s) attached") {
		t.Errorf("verify output does not mention the artifacts:\n%s", state.Output)
	}

	// The screenshots the run produced are attached to the card.
	atts, err := kanban.ListTaskAttachments("loop", card.ID)
	if err != nil {
		t.Fatalf("attachments: %v", err)
	}
	var names []string
	for _, a := range atts {
		names = append(names, a.Filename)
	}
	if len(names) != 2 {
		t.Fatalf("attachments = %v, want the two verify screenshots", names)
	}

	// The card sits in review with the agent's result — the state a
	// reviewer opens it in.
	loaded, err := kanban.GetTask("loop", card.ID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.Status != "review" {
		t.Errorf("status = %q, want review", loaded.Status)
	}
	if loaded.Result == "" {
		t.Error("the agent's result never landed on the card")
	}

	// The HTTP surface a reviewer uses reports the verdict and the
	// evidence together — over the API, with the session.
	rec := loopAPI(t, api.URL, cookie, http.MethodGet,
		"/api/boards/loop/tasks/"+card.ID+"/verify", nil)
	raw, err := io.ReadAll(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	if rec.StatusCode != http.StatusOK {
		t.Fatalf("GET /verify = %d, want 200 (body: %s)", rec.StatusCode, raw)
	}
	var body verifyResponse
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "passed" || len(body.Attachments) != 2 {
		t.Errorf("GET /verify: status %q, %d attachment(s), want passed with 2", body.Status, len(body.Attachments))
	}
}
