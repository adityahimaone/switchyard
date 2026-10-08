package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"kanban-board/internal/kanban"
)

// Overview routes: the dashboard aggregates.
func registerOverviewRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/overview", func(w http.ResponseWriter, r *http.Request) {
		o, err := kanban.OverviewData()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, struct {
			kanban.Overview
			AppVersion string `json:"app_version"`
		}{Overview: o, AppVersion: version})
	})
	mux.HandleFunc("GET /api/overview/activity", func(w http.ResponseWriter, r *http.Request) {
		days := 180
		if s := r.URL.Query().Get("days"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 {
				days = n
			}
		}
		data, err := kanban.ActivitySummary(days)
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, data)
	})
	mux.HandleFunc("GET /api/overview/review", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, kanban.ReviewMetricsSummary())
	})
	mux.HandleFunc("GET /api/overview/queue-trend", func(w http.ResponseWriter, r *http.Request) {
		days := 30
		if s := r.URL.Query().Get("days"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 {
				days = n
			}
		}
		data, err := kanban.QueueTrend(days)
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, data)
	})
	mux.HandleFunc("POST /api/flow/seed", func(w http.ResponseWriter, r *http.Request) {
		var tasks []kanban.FlowTask
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&tasks); err != nil {
			fail(w, err, 400)
			return
		}
		kanban.FlowSeed(tasks)
		writeJSON(w, http.StatusOK, map[string]string{"seeded": fmt.Sprintf("%d", len(tasks))})
	})
	// remote task dispatch via node-agent (mac/windows workspaces)
	mux.HandleFunc("POST /api/remote/dispatch", func(w http.ResponseWriter, r *http.Request) {
		var req kanban.NodeDispatchRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		res, err := kanban.DispatchRemote(req, 10*time.Minute)
		if err != nil {
			fail(w, err, 502)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	// cron jobs (Hermes CLI-backed control plane)
}
