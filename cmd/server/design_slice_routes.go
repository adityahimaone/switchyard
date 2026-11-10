package main

// Create-time design resolution.
//
// These routes are the ONLY part of the server that talks to Doop. A frame is
// live and editable; a card must be graded against exactly the design that was
// approved when it was created. POST /design-slices freezes one frame into an
// immutable bundle, and the card stores only its identity. The dispatcher then
// reads that bundle from the local store — no worker ever contacts Doop.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"kanban-board/internal/kanban"
)

// A snapshot is a couple of HTTP calls to Doop plus a Chromium render. Bound it
// so a wedged Doop instance cannot pin a Create Task request open forever.
const designSliceHTTPTimeout = 45 * time.Second

var errDoopUnconfigured = errors.New("doop is not configured on the control plane: set DOOP_AGENT_KEY (and optionally DOOP_MCP_URL)")

func errBadDesignProvider(provider string) error {
	return fmt.Errorf("design-slices only resolves provider %q, got %q", kanban.DesignProviderDoop, provider)
}

func registerDesignSliceRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/boards/{slug}/design-frames", handleListDesignFrames)
	mux.HandleFunc("POST /api/boards/{slug}/design-slices", handleCreateDesignSlice)
	mux.HandleFunc("GET /api/boards/{slug}/design-slices/{key}/frame.png", handleServeDesignSlicePNG)
	mux.HandleFunc("GET /api/boards/{slug}/design-slices/{key}/frame.html", handleServeDesignSliceHTML)
}

// handleListDesignFrames powers the Create Task picker. Only frames a human
// marked ready_for_dev are offered, so an unapproved draft cannot silently
// become an implementation target.
func handleListDesignFrames(w http.ResponseWriter, r *http.Request) {
	cfg := kanban.DoopConfigFromEnv()
	resp := map[string]any{"configured": cfg.Configured(), "frames": []any{}, "canvases": []any{}}
	if !cfg.Configured() {
		resp["error"] = "Doop is not configured on the control plane: set DOOP_AGENT_KEY (and optionally DOOP_MCP_URL)."
		writeJSON(w, http.StatusOK, resp)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), designSliceHTTPTimeout)
	defer cancel()
	client := kanban.NewDoopClient(cfg)

	requested := strings.TrimSpace(r.URL.Query().Get("canvas_id"))
	canvases := []kanban.DoopCanvas{}
	if requested != "" {
		canvases = append(canvases, kanban.DoopCanvas{ID: requested, Name: requested})
	} else {
		listed, err := client.ListCanvases(ctx)
		if err != nil {
			resp["error"] = err.Error()
			writeJSON(w, http.StatusOK, resp)
			return
		}
		if len(listed) > 12 {
			listed = listed[:12]
		}
		canvases = listed
	}
	frames := []kanban.DoopFrame{}
	for _, canvas := range canvases {
		found, err := client.ListReadyFrames(ctx, canvas.ID)
		if err != nil {
			// One broken canvas must not hide the frames of every other one.
			resp["error"] = err.Error()
			continue
		}
		frames = append(frames, found...)
	}
	resp["canvases"] = canvases
	resp["frames"] = frames
	writeJSON(w, http.StatusOK, resp)
}

func handleCreateDesignSlice(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	var req kanban.DesignSliceRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		fail(w, err, http.StatusBadRequest)
		return
	}
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider != "" && provider != kanban.DesignProviderDoop {
		fail(w, errBadDesignProvider(provider), http.StatusBadRequest)
		return
	}
	req.Slug = slug
	cfg := kanban.DoopConfigFromEnv()
	if !cfg.Configured() {
		fail(w, errDoopUnconfigured, http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), designSliceHTTPTimeout)
	defer cancel()
	out, cached, err := kanban.ResolveDesignSlice(ctx, cfg, req)
	if err != nil {
		fail(w, err, http.StatusBadGateway)
		return
	}
	// The card stores these three values; nothing here is a live Doop URL the
	// agent could be tempted to fetch.
	writeJSON(w, http.StatusCreated, map[string]any{
		"slice":          out.DesignSlice,
		"cached":         cached,
		"preview_url":    out.PreviewURL,
		"design_ref":     out.Ref,
		"design_source":  out.DesignSource,
		"design_provider": kanban.DesignProviderDoop,
	})
}

func handleServeDesignSlicePNG(w http.ResponseWriter, r *http.Request) {
	slug, key := r.PathValue("slug"), r.PathValue("key")
	if _, err := kanban.DesignSliceDir(slug, key); err != nil {
		fail(w, err, http.StatusBadRequest)
		return
	}
	data, err := kanban.LoadDesignSlicePNG(slug, key)
	if err != nil {
		fail(w, err, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func handleServeDesignSliceHTML(w http.ResponseWriter, r *http.Request) {
	slug, key := r.PathValue("slug"), r.PathValue("key")
	if _, err := kanban.DesignSliceDir(slug, key); err != nil {
		fail(w, err, http.StatusBadRequest)
		return
	}
	html, err := kanban.LoadDesignSliceHTML(slug, key)
	if err != nil {
		fail(w, err, http.StatusNotFound)
		return
	}
	// Frame HTML is authored by an agent and may contain scripts. Serving it
	// from our origin without a sandbox would be stored XSS, so the preview is
	// opaque-origin and script-free by policy.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; sandbox")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(html))
}
