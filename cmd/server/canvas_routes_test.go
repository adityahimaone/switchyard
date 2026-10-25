package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func TestRewriteNextPaths(t *testing.T) {
	in := []byte(`<script src="/_next/static/a.js"></script><link href='/_next/b.css'>url(/_next/c.png) "/other"`)
	got := string(rewriteNextPaths(in, "/canvas-view/cv_1/tok"))
	for _, want := range []string{`"/canvas-view/cv_1/tok/_next/static/a.js"`, `'/canvas-view/cv_1/tok/_next/b.css'`, `(/canvas-view/cv_1/tok/_next/c.png)`, `"/other"`} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %s", want, got)
		}
	}
}

func TestCanvasProxyRejectsBadToken(t *testing.T) {
	if kanban.CanvasViewTokenValid("cv_x", "nope") {
		t.Fatal("bad token accepted")
	}
}

func TestCanvasFilesRouteRejectsNonexistent(t *testing.T) {
	mux := http.NewServeMux()
	registerCanvasRoutes(mux)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/canvas/sessions/cv_dummy/files", nil)
	mux.ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for nonexistent session files, got %d", w.Code)
	}
}
