package kanban

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestValidateProviderBaseURLRejectsUnsafeTargets(t *testing.T) {
	unsafe := []string{
		"http://169.254.169.254/v1",
		"http://10.0.0.4/v1",
		"http://[::1]/v1",
		"file:///etc/passwd",
	}
	for _, baseURL := range unsafe {
		if err := validateProviderBaseURL(baseURL); err == nil {
			t.Fatalf("validateProviderBaseURL(%q) accepted unsafe target", baseURL)
		}
	}
}

func TestValidateProviderBaseURLAllowsHTTPSAndLoopbackHTTP(t *testing.T) {
	for _, baseURL := range []string{
		"https://api.example.com/v1",
		"http://127.0.0.1:8080/v1",
		"http://localhost:8080/v1",
	} {
		if err := validateProviderBaseURL(baseURL); err != nil {
			t.Fatalf("validateProviderBaseURL(%q): %v", baseURL, err)
		}
	}
}

func TestDiscoverProviderModelsRedactsAndBoundsResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("path = %q, want /v1/models", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"model-b"},{"id":"model-a"}]}`))
	}))
	defer srv.Close()

	models, err := discoverProviderModels(context.Background(), srv.URL+"/v1", "test-key", 1<<20, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(models), 2; got != want {
		t.Fatalf("model count = %d, want %d", got, want)
	}
	if models[0] != "model-a" || models[1] != "model-b" {
		t.Fatalf("models = %#v, want sorted IDs", models)
	}
}

func TestDiscoverProviderModelsRejectsMalformedPayload(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"name":"missing-id"}]}`))
	}))
	defer srv.Close()

	if _, err := discoverProviderModels(context.Background(), srv.URL, "", 1024, time.Second); err == nil {
		t.Fatal("discoverProviderModels accepted malformed payload")
	}
}
