package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"kanban-board/internal/kanban"
)

// Runtime routes: node health, chat daemon health, notifications, the SSE stream, flow and manual dispatch.
func registerRuntimeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/nodes", func(w http.ResponseWriter, r *http.Request) {
		st, err := kanban.NodeAgentHealth()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, st)
	})
	mux.HandleFunc("GET /api/chat/daemon-health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, kanban.ChatDaemonHealth())
	})
	mux.HandleFunc("GET /api/notifications", func(w http.ResponseWriter, r *http.Request) {
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
		items, err := kanban.ListNotifications(r.URL.Query().Get("profile"), r.URL.Query().Get("unread") == "1", limit)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("POST /api/notifications/{id}/read", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.MarkNotificationRead(r.PathValue("id")); err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/notifications/read-all", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.MarkAllNotificationsRead(r.URL.Query().Get("profile")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/flow/active", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"tasks": kanban.FlowActive(), "retention_seconds": kanban.FlowRetentionSeconds()})
	})
	// live event stream (SSE): task + workspace mutations, auth-covered by middleware
	mux.HandleFunc("GET /api/events/stream", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			fail(w, fmt.Errorf("streaming unsupported"), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)
		ch := kanban.Hub.Subscribe()
		defer kanban.Hub.Unsubscribe(ch)
		heartbeat := time.NewTicker(20 * time.Second)
		defer heartbeat.Stop()
		fmt.Fprint(w, ": connected\n\n")
		fl.Flush()
		for {
			select {
			case ev := <-ch:
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Kind, kanban.SSEEnvelope(ev.Kind, ev.Data))
				fl.Flush()
			case <-heartbeat.C:
				fmt.Fprint(w, ": ping\n\n")
				fl.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}
