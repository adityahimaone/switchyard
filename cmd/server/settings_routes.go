package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"kanban-board/internal/kanban"
)

// Settings routes: executor config, JEV toggle, attachment-analysis config,
// prompt improvement, and execution-history maintenance.
func registerSettingsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("DELETE /api/settings/execution-history", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.ClearExecutionHistory(); err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/settings/jev", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, kanban.GetJEVStatus(r.Context()))
	})
	mux.HandleFunc("PUT /api/settings/jev", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Enabled *bool `json:"enabled"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&input); err != nil || input.Enabled == nil {
			fail(w, fmt.Errorf("enabled boolean required"), http.StatusBadRequest)
			return
		}
		if err := kanban.SetJEVEnabled(*input.Enabled); err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, kanban.GetJEVStatus(r.Context()))
	})
	mux.HandleFunc("GET /api/settings/executors", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, kanban.LoadExecutorSettings())
	})
	mux.HandleFunc("PUT /api/settings/executors", func(w http.ResponseWriter, r *http.Request) {
		var input kanban.ExecutorSettings
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&input); err != nil {
			fail(w, fmt.Errorf("invalid executor settings payload"), http.StatusBadRequest)
			return
		}
		saved, err := kanban.SaveExecutorSettings(input)
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		// Echo the normalized config so the client renders exactly what was stored.
		writeJSON(w, http.StatusOK, saved)
	})
	mux.HandleFunc("GET /api/settings/attachment-analysis", func(w http.ResponseWriter, r *http.Request) {
		cfg, err := kanban.LoadAttachmentAnalysisConfig()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, cfg)
	})
	mux.HandleFunc("PUT /api/settings/attachment-analysis", func(w http.ResponseWriter, r *http.Request) {
		var cfg kanban.AttachmentAnalysisConfig
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&cfg); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.SaveAttachmentAnalysisConfig(cfg); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, cfg)
	})
	mux.HandleFunc("POST /api/ai/improve-prompt", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Title string `json:"title"`
			Body  string `json:"body"`
			Mode  string `json:"mode"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if strings.TrimSpace(req.Body) == "" {
			fail(w, fmt.Errorf("body required"), 400)
			return
		}
		if req.Mode == "fast" {
			writeJSON(w, http.StatusOK, map[string]string{"improved": kanban.ImprovePromptFast(req.Title, req.Body), "mode": "fast"})
			return
		}
		improved, err := kanban.ImprovePrompt(req.Title, req.Body)
		if err != nil {
			fail(w, err, 502)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"improved": improved, "mode": "deep"})
	})
}
