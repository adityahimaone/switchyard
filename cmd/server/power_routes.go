package main

import (
	"encoding/json"
	"fmt"
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
	mux.HandleFunc("GET /api/nodes/{id}/power/metrics", func(w http.ResponseWriter, r *http.Request) {
		raw, err := kanban.PowerMetrics(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
	})
	// Remote-access readiness for a node: whether it answers and whether its
	// remote-desktop port is open. Read-only, same shape as the metrics route.
	mux.HandleFunc("GET /api/nodes/{id}/power/remote", func(w http.ResponseWriter, r *http.Request) {
		raw, err := kanban.PowerRemote(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
	})
	// Streaming variant: relays the script's output line by line as SSE so the
	// boot log animates. Each line is a `data:` frame; the terminal frame is an
	// `event: done` carrying the exit status.
	mux.HandleFunc("GET /api/nodes/{id}/power/stream", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			fail(w, fmt.Errorf("streaming unsupported"), http.StatusInternalServerError)
			return
		}
		action := r.URL.Query().Get("action")
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, ": connected\n\n")
		fl.Flush()

		err := kanban.PowerActionStream(r.Context(), r.PathValue("id"), action, func(line string) {
			fmt.Fprintf(w, "data: %s\n\n", sseSafe(line))
			fl.Flush()
		})
		if err != nil {
			fmt.Fprintf(w, "event: done\ndata: %s\n\n", sseSafe("error: "+err.Error()))
			fl.Flush()
			return
		}
		fmt.Fprint(w, "event: done\ndata: ok\n\n")
		fl.Flush()
	})
}

// sseSafe keeps a log line on one SSE frame: newlines would split the frame and
// carriage returns are dropped by the wire anyway.
func sseSafe(s string) string {
	out := make([]rune, 0, len(s))
	for _, c := range s {
		switch c {
		case '\n', '\r':
			out = append(out, ' ')
		default:
			out = append(out, c)
		}
	}
	return string(out)
}
