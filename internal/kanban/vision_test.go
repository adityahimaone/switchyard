package kanban

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAnalyzeAttachmentRejectsUnsupportedModel(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	a, err := StoreAttachmentBytes([]byte("\x89PNG\r\n\x1a\nfakepng"), "image.png")
	if err != nil {
		t.Fatal(err)
	}
	_, err = AnalyzeAttachment(context.Background(), a.ID, "text-only-model", "")
	if err == nil || !strings.Contains(err.Error(), "cannot analyze") {
		t.Fatalf("expected unsupported model error, got %v", err)
	}
}

func TestAnalyzeAttachmentCallsProvider(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	cfg := filepath.Join(home, "config.yaml")
	if err := os.WriteFile(cfg, []byte("custom_providers:\n- name: 9router\n  base_url: http://127.0.0.1:9999/v1\n  api_key: sk-test\n  models:\n    gpt-4o: {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"vision result"}}]}`))
	}))
	defer srv.Close()
	cfgContent := "custom_providers:\n- name: 9router\n  base_url: " + srv.URL + "\n  api_key: sk-test\n  models:\n    gpt-4o: {}\n"
	if err := os.WriteFile(cfg, []byte(cfgContent), 0o600); err != nil {
		t.Fatal(err)
	}
	a, err := StoreAttachmentBytes([]byte("\x89PNG\r\n\x1a\nfakepng"), "image.png")
	if err != nil {
		t.Fatal(err)
	}
	got, err := AnalyzeAttachment(context.Background(), a.ID, "gpt-4o", "describe")
	if err != nil {
		t.Fatal(err)
	}
	if got != "vision result" {
		t.Fatalf("unexpected result %q", got)
	}
}
