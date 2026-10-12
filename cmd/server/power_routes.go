package main

import (
	"encoding/json"
	"io"
	"net/http"

	"kanban-board/internal/kanban"
)

// Power routes: cycle a worker node's power (smart plug / WOL relay).
// The scripts live on the always-on VPS and are declared in
// ~/.hermes/kanban/power-targets.json; see internal/kanban/power.go.
func registerPowerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/power/targets", func(w http.ResponseWriter, r *http.Request) {
		targets, err := kanban.PowerTargets()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"targets": targets})
	})
	mux.HandleFunc("POST /api/nodes/{id}/power", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<12)).Decode(&req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		out, err := kanban.PowerAction(r.PathValue("id"), req.Action)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "output": out})
	})
}
