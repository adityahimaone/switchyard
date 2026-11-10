package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// seedNodeModels plants a node catalog in the cache the handler reads when no
// node can be asked, and removes it afterwards.
func seedNodeModels(t *testing.T, executor, profile, nodeID string, models []ModelOption) {
	t.Helper()
	key := modelsCacheKey(executor, profile, nodeID)
	modelsCacheMu.Lock()
	modelsCache[key] = cachedModels{cachedAt: time.Now(), resp: ModelsResponse{
		Executor: executor, Profile: profile, NodeID: nodeID, Source: "probed", Models: models,
	}}
	modelsCacheMu.Unlock()
	t.Cleanup(func() {
		modelsCacheMu.Lock()
		delete(modelsCache, key)
		modelsCacheMu.Unlock()
	})
}

func TestModelsRoutes(t *testing.T) {
	// Point the probe at a closed port. Otherwise this test's answer depends on
	// whether a node-agent happens to be running on the machine — the same
	// class of environment dependency that made the Command Code section below
	// flaky for 30 seconds at a time.
	t.Setenv("KANBAN_NODE_AGENT", "http://127.0.0.1:1")
	mux := buildMux("web/dist")

	// 1. Test DSH models
	req := httptest.NewRequest("GET", "/api/models?executor=dsh", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var dshResp ModelsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &dshResp); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}

	if dshResp.Executor != "dsh" {
		t.Fatalf("expected executor dsh, got %s", dshResp.Executor)
	}
	// dsh models belong to the worker that runs the card, and the default source
	// is that worker's running DSH host. With no worker reachable this process has
	// nothing honest to say, and an empty list is the correct answer: inventing one
	// is what put thirteen fabricated models in the picker.
	if len(dshResp.Models) > 0 {
		t.Fatalf("expected no models without a reachable worker, got %d", len(dshResp.Models))
	}

	// The parser reports what the profile declares and nothing else: no invented
	// pins, and no minimum length that quietly swaps in a different profile.
	if got := parseCordisPatchModels([]byte("[]")); len(got) != 0 {
		t.Fatalf("expected no models from an empty patch, got %d", len(got))
	}
	// Regression: the web profile declares six models. A short list is a real list,
	// not evidence that the wrong profile was read.
	small := []byte(`
plugins:
  adit-router:
    models:
      - id: main
      - id: cheap
      - id: free
      - id: codex
      - id: f8
      - id: claude-office
`)
	if got := parseCordisPatchModels(small); len(got) != 6 {
		t.Fatalf("expected 6 models from a 6-model patch, got %d", len(got))
	}
	for _, m := range fetchDSHModels("headless") {
		if strings.Contains(m.Value, "DeepSeek-V4.1-Flash") || strings.HasSuffix(m.Value, "/premium") {
			t.Errorf("model %q is not declared by any profile and must not be advertised", m.Value)
		}
		if m.Pinned {
			t.Errorf("model %q is pinned; pins are not declared by a profile", m.Value)
		}
	}

	// 2. Test Command Code models
	//
	// The fallback for this executor shells out to `cmd --list-models` with a
	// 30s budget. Asserting on it meant the test passed only where that CLI
	// happened to be installed, and failed after a 30s wait where it was not.
	// The handler's contract is "surface the node's catalog and invent nothing",
	// so seed a catalog and check that instead. CLI output parsing has its own
	// test below, with a fixture, where it belongs.
	seedNodeModels(t, "commandcode", "", "test-node", []ModelOption{
		{Value: "qwen/qwen3.8-omni-flash", Label: "Qwen 3.8 Omni Flash"},
		{Value: "claude-sonnet-5-5", Label: "Claude Sonnet 5.5"},
		{Value: "deepseek/deepseek-v4.1-flash", Label: "DeepSeek V4.1 Flash"},
	})
	reqCmd := httptest.NewRequest("GET", "/api/models?executor=commandcode", nil)
	recCmd := httptest.NewRecorder()
	mux.ServeHTTP(recCmd, reqCmd)

	if recCmd.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recCmd.Code, recCmd.Body.String())
	}

	var cmdResp ModelsResponse
	if err := json.Unmarshal(recCmd.Body.Bytes(), &cmdResp); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}

	if cmdResp.Executor != "commandcode" {
		t.Fatalf("expected executor commandcode, got %s", cmdResp.Executor)
	}
	if len(cmdResp.Models) == 0 {
		t.Fatal("expected at least 1 Command Code model")
	}

	// Verify deepseek or qwen or claude model is present
	foundModel := false
	for _, m := range cmdResp.Models {
		if m.Value == "qwen/qwen3.8-omni-flash" || m.Value == "claude-sonnet-5-5" || m.Value == "deepseek/deepseek-v4.1-flash" {
			foundModel = true
			break
		}
	}
	if !foundModel {
		t.Errorf("expected sample model not found in Command Code models")
	}

	// 3. Test Pen.dev models
	reqPen := httptest.NewRequest("GET", "/api/models?executor=pen", nil)
	recPen := httptest.NewRecorder()
	mux.ServeHTTP(recPen, reqPen)

	if recPen.Code != http.StatusOK {
		t.Fatalf("expected 200 for pen models, got %d: %s", recPen.Code, recPen.Body.String())
	}

	var penResp ModelsResponse
	if err := json.Unmarshal(recPen.Body.Bytes(), &penResp); err != nil {
		t.Fatalf("unmarshal json: %v", err)
	}

	if penResp.Executor != "pen" {
		t.Fatalf("expected executor pen, got %s", penResp.Executor)
	}
	if len(penResp.Models) == 0 {
		t.Fatal("expected at least 1 pen.dev model")
	}

	// Verify Gemini and DeepSeek models are discovered
	hasGemini := false
	hasDeepSeek := false
	for _, m := range penResp.Models {
		if m.Value == "gemini:gemini-3.6-flash" {
			hasGemini = true
		}
		if m.Value == "deepseek:deepseek-flash" {
			hasDeepSeek = true
		}
	}
	if !hasGemini {
		t.Errorf("gemini:gemini-3.6-flash not found in pen models")
	}
	if !hasDeepSeek {
		t.Errorf("deepseek:deepseek-flash not found in pen models")
	}
}

// A catalog belongs to the node that reported it: keyed by executor alone, a
// workspace on one machine could be answered with another machine's list.
func TestModelsCacheIsKeyedPerNode(t *testing.T) {
	modelsCacheMu.Lock()
	modelsCache = map[string]cachedModels{}
	modelsCacheMu.Unlock()

	mac := ModelsResponse{Executor: "dsh", NodeID: "mac", Source: "probed", Models: []ModelOption{{Value: "a"}}}
	win := ModelsResponse{Executor: "dsh", NodeID: "windows", Source: "probed", Models: []ModelOption{{Value: "b"}}}
	modelsCache[modelsCacheKey("dsh", "", "mac")] = cachedModels{cachedAt: time.Now(), resp: mac}
	modelsCache[modelsCacheKey("dsh", "", "windows")] = cachedModels{cachedAt: time.Now(), resp: win}

	if got, ok := cachedFor(modelsCacheKey("dsh", "", "windows")); !ok || got.Models[0].Value != "b" {
		t.Fatalf("windows key returned %v/%v", got.Models, ok)
	}
	if got, ok := cachedFor(modelsCacheKey("dsh", "", "mac")); !ok || got.Models[0].Value != "a" {
		t.Fatalf("mac key returned %v/%v", got.Models, ok)
	}
	// The unreachable fallback may pick either node's list, but only within the
	// same executor and profile.
	if got, ok := cachedAnyNode("dsh", ""); !ok || got.Executor != "dsh" {
		t.Fatalf("cachedAnyNode returned %v/%v", got.Executor, ok)
	}
	if _, ok := cachedAnyNode("commandcode", ""); ok {
		t.Fatal("cachedAnyNode must not cross executors")
	}
}

// TestParseCommandCodeModels covers the CLI-output contract with a fixture.
// Executing the real CLI is what made the route test machine-dependent; parsing
// its output is a pure function and belongs in its own test.
func TestParseCommandCodeModels(t *testing.T) {
	out := []byte(`Available models

qwen/qwen3.8-omni-flash    Qwen 3.8 Omni Flash
claude-sonnet-5-5    Claude Sonnet 5.5
deepseek/deepseek-v4.1-flash    DeepSeek V4.1 Flash
`)
	got := parseCommandCodeModels(out)
	if len(got) != 3 {
		t.Fatalf("parsed %d models, want 3: %+v", len(got), got)
	}
	if got[0].Value != "qwen/qwen3.8-omni-flash" || got[0].Label != "Qwen 3.8 Omni Flash" {
		t.Errorf("first model = %+v", got[0])
	}
	for _, m := range got {
		if m.Pinned {
			t.Errorf("model %q is pinned; a CLI listing declares no pins", m.Value)
		}
	}
}
