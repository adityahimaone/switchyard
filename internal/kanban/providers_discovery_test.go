package kanban

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func writeProviderConfig(t *testing.T, home, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDiscoverConfiguredProviderModelsUsesNamedProvider(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"model-z"}]}`))
	}))
	defer srv.Close()
	config := "custom_providers:\n- name: demo\n  base_url: " + srv.URL + "\n  api_key: secret\n"
	writeProviderConfig(t, home, config)

	models, err := DiscoverConfiguredProviderModels("demo")
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 1 || models[0] != "model-z" {
		t.Fatalf("models = %#v", models)
	}
}

func TestDiscoverConfiguredProviderModelsDoesNotExposeUnknownProvider(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	writeProviderConfig(t, home, "custom_providers:\n- name: demo\n  base_url: https://example.com/v1\n")

	if _, err := DiscoverConfiguredProviderModels("missing"); err == nil {
		t.Fatal("unknown provider unexpectedly succeeded")
	}
}
