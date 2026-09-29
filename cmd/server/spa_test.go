package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newSpaDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"index.html":               "<html>shell</html>",
		"assets/index-GuJ23SU8.js": "console.log(1)",
		"assets/Work-5U7Foemc.css": "body{}",
		"manifest.webmanifest":     "{}",
	}
	for rel, body := range files {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(rel)), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func serve(t *testing.T, dir, path string) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	spa(dir).ServeHTTP(w, httptest.NewRequest("GET", path, nil))
	return w
}

// A chunk deleted by a redeploy must 404. Answering with the HTML shell returns
// 200, which the service worker caches under the .js URL as immutable, so the
// chunk fails to parse on every later load and no deploy can recover it.
func TestSpaMissingAssetReturns404NotShell(t *testing.T) {
	dir := newSpaDir(t)
	for _, path := range []string{
		"/assets/WorkspacesPage-CxeKwLT6.js",
		"/assets/does-not-exist.js",
		"/assets/nested/missing.js",
		"/sw-orphan.js",
		"/styles-missing.css",
	} {
		w := serve(t, dir, path)
		if w.Code != 404 {
			t.Errorf("%s: status = %d, want 404", path, w.Code)
		}
		if ct := w.Header().Get("Content-Type"); strings.HasPrefix(ct, "text/html") {
			t.Errorf("%s: Content-Type = %q, must not be the HTML shell", path, ct)
		}
		if body := w.Body.String(); strings.Contains(body, "shell") {
			t.Errorf("%s: body served the SPA shell: %q", path, body)
		}
	}
}

// A 404 must not be cached, or the browser keeps asking for a deleted chunk.
func TestSpaMissingAssetIsNotCacheable(t *testing.T) {
	w := serve(t, newSpaDir(t), "/assets/WorkspacesPage-CxeKwLT6.js")
	if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
}

func TestSpaServesLiveAssetsImmutable(t *testing.T) {
	dir := newSpaDir(t)
	for _, path := range []string{"/assets/index-GuJ23SU8.js", "/assets/Work-5U7Foemc.css"} {
		w := serve(t, dir, path)
		if w.Code != 200 {
			t.Fatalf("%s: status = %d, want 200", path, w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
			t.Errorf("%s: Cache-Control = %q, want immutable", path, cc)
		}
	}
}

// Client routes still resolve to the shell, otherwise deep links break.
func TestSpaServesShellForClientRoutes(t *testing.T) {
	dir := newSpaDir(t)
	for _, path := range []string{"/", "/workspaces", "/board/f8-gadjian"} {
		w := serve(t, dir, path)
		if w.Code != 200 {
			t.Errorf("%s: status = %d, want 200", path, w.Code)
		}
		if !strings.Contains(w.Body.String(), "shell") {
			t.Errorf("%s: did not serve the SPA shell", path)
		}
		if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "no-cache") {
			t.Errorf("%s: Cache-Control = %q, want revalidated", path, cc)
		}
	}
}

func TestSpaAPIPathsNotFound(t *testing.T) {
	w := serve(t, newSpaDir(t), "/api/boards")
	if w.Code != 404 {
		t.Errorf("status = %d, want 404", w.Code)
	}
}
