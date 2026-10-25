package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"

	"kanban-board/internal/kanban"
)

// Canvas Studio HTTP surface. See internal/kanban/canvas.go for the model and
// the mitigations; this file is the thin authenticated API plus the token-gated
// reverse proxy that serves each session's dev server.

func withCanvasView(s *kanban.CanvasSession) *kanban.CanvasSession {
	base := kanban.CanvasViewBase(s.ID)
	switch s.Framework {
	case "next":
		s.ViewURL = base + "canvas"
	case "vite":
		s.ViewURL = base + "canvas/"
	default:
		s.ViewURL = base
	}
	return s
}

func registerCanvasRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/canvas/sessions", func(w http.ResponseWriter, r *http.Request) {
		list, err := kanban.ListCanvasSessions()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		for i := range list {
			withCanvasView(&list[i])
		}
		writeJSON(w, http.StatusOK, list)
	})

	mux.HandleFunc("POST /api/canvas/sessions", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			WorkspaceID string `json:"workspace_id"`
			Title       string `json:"title"`
			Brief       string `json:"brief"`
			Executor    string `json:"executor"`
			Model       string `json:"model"`
			DialKit     bool   `json:"dialkit"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		s, err := kanban.CreateCanvasSession(body.WorkspaceID, body.Title, body.Executor, body.Model, body.DialKit, nil)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(body.Brief) != "" {
			_ = kanban.SendCanvasMessage(s.ID, body.Brief)
			s, _ = kanban.GetCanvasSession(s.ID)
		}
		writeJSON(w, http.StatusCreated, withCanvasView(s))
	})

	mux.HandleFunc("GET /api/canvas/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		s, err := kanban.GetCanvasSession(r.PathValue("id"))
		if err != nil {
			fail(w, fmt.Errorf("canvas session not found"), http.StatusNotFound)
			return
		}
		msgs, _ := kanban.CanvasMessages(s.ID)
		writeJSON(w, http.StatusOK, map[string]any{"session": withCanvasView(s), "messages": msgs})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.SendCanvasMessage(r.PathValue("id"), body.Message); err != nil {
			fail(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "working"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/start", func(w http.ResponseWriter, r *http.Request) {
		s, err := kanban.StartCanvasServer(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, withCanvasView(s))
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/stop", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.StopCanvasServer(r.PathValue("id")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/fork", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
		s, err := kanban.ForkCanvasSession(r.PathValue("id"), body.Title)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, withCanvasView(s))
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/discard", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DiscardCanvasSession(r.PathValue("id")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "discarded"})
	})

	mux.HandleFunc("POST /api/canvas/sessions/{id}/promote", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Board string `json:"board"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body)
		if strings.TrimSpace(body.Board) == "" {
			fail(w, fmt.Errorf("board required"), http.StatusBadRequest)
			return
		}
		id, err := kanban.PromoteCanvasSession(r.PathValue("id"), body.Board)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"task_id": id, "board": body.Board})
	})

	// Token-gated proxy. It sits outside /api/ on purpose: the sandboxed iframe
	// has an opaque origin and sends no cookie, so the URL token is the
	// credential. The token only grants this one session's dev server.
	mux.HandleFunc("GET /canvas-view/{id}/{token}/{rest...}", canvasProxyHandler)
}

func canvasProxyHandler(w http.ResponseWriter, r *http.Request) {
	id, token := r.PathValue("id"), r.PathValue("token")
	if !kanban.CanvasViewTokenValid(id, token) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	s, err := kanban.GetCanvasSession(id)
	if err != nil || s.Status == "discarded" || s.Server != "running" {
		http.Error(w, "canvas dev server is not running", http.StatusServiceUnavailable)
		return
	}
	upstream, err := kanban.CanvasUpstream(s)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	kanban.TouchCanvasSession(id)

	prefix := strings.TrimSuffix(kanban.CanvasViewBase(id), "/")
	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = "http"
			req.URL.Host = upstream
			req.Host = upstream
			if s.Framework != "vite" { // vite serves under its --base, next does not
				p := strings.TrimPrefix(req.URL.Path, prefix)
				if p == "" {
					p = "/"
				}
				req.URL.Path, req.URL.RawPath = p, ""
			}
			req.Header.Del("Cookie") // never forward the board session to canvas code
			req.Header.Set("Accept-Encoding", "identity")
		},
		ModifyResponse: func(resp *http.Response) error {
			h := resp.Header
			h.Del("Content-Security-Policy")
			h.Set("X-Frame-Options", "SAMEORIGIN")
			h.Set("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-modals allow-popups; frame-ancestors 'self'")
			if s.Framework == "next" && isRewritableType(h.Get("Content-Type")) {
				raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
				resp.Body.Close()
				if err != nil {
					return err
				}
				raw = rewriteNextPaths(raw, prefix)
				resp.Body = io.NopCloser(bytes.NewReader(raw))
				h.Set("Content-Length", strconv.Itoa(len(raw)))
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			http.Error(w, "canvas upstream error: "+err.Error(), http.StatusBadGateway)
		},
	}
	rp.ServeHTTP(w, r)
}

func isRewritableType(ct string) bool {
	ct = strings.ToLower(ct)
	return strings.Contains(ct, "text/html") || strings.Contains(ct, "javascript") || strings.Contains(ct, "text/css")
}

// rewriteNextPaths prefixes Next's absolute /_next/ asset URLs so they resolve
// through the proxy. Next.js cannot take a base path from the command line, and
// changing next.config would be an edit outside the canvas allow list.
func rewriteNextPaths(body []byte, prefix string) []byte {
	out := body
	for _, lead := range []string{`"`, `'`, "(", "`"} {
		out = bytes.ReplaceAll(out, []byte(lead+"/_next/"), []byte(lead+prefix+"/_next/"))
	}
	return out
}
