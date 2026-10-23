package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestModelsRoutes(t *testing.T) {
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
	if len(dshResp.Models) < 100 {
		t.Fatalf("expected at least 100 DSH models (got %d), adit-9router catalog must not be limited", len(dshResp.Models))
	}

	// Verify empty patch file falls back to full catalog
	emptyParsed := parseCordisPatchModels([]byte("[]"))
	if len(emptyParsed) < 100 {
		t.Fatalf("expected fallback catalog with > 100 models, got %d", len(emptyParsed))
	}

	// Verify official and pinned models are present
	hasOfficial := false
	hasPremium := false
	for _, m := range dshResp.Models {
		if m.Value == "deepseek-account:DeepSeek-V4.1-Flash" {
			hasOfficial = true
			if !m.Pinned {
				t.Errorf("expected deepseek-account:DeepSeek-V4.1-Flash to be pinned")
			}
		}
		if m.Value == "adit-9router/premium" {
			hasPremium = true
			if !m.Pinned {
				t.Errorf("expected premium to be pinned")
			}
		}
	}
	if !hasOfficial {
		t.Errorf("deepseek-account:DeepSeek-V4.1-Flash not found in DSH models")
	}
	if !hasPremium {
		t.Errorf("adit-9router/premium not found in DSH models")
	}

	// 2. Test Command Code models
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
}
