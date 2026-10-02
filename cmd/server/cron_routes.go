package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"kanban-board/internal/kanban"
)

// Cron routes: schedule management, backed by the hermes CLI.
func registerCronRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/cron/jobs", func(w http.ResponseWriter, r *http.Request) {
		jobs, err := kanban.ListCronJobs(r.URL.Query().Get("all") == "1")
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, jobs)
	})
	mux.HandleFunc("GET /api/cron/jobs/{id}/runs", func(w http.ResponseWriter, r *http.Request) {
		limit := 20
		if raw := r.URL.Query().Get("limit"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				fail(w, fmt.Errorf("invalid limit"), 400)
				return
			}
			limit = n
		}
		runs, err := kanban.CronRuns(r.PathValue("id"), limit)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, runs)
	})
	mux.HandleFunc("GET /api/cron/status", func(w http.ResponseWriter, r *http.Request) {
		status, err := kanban.CronStatus()
		if err != nil {
			fail(w, err, 502)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"output": status})
	})
	mux.HandleFunc("GET /api/cron/doctor", func(w http.ResponseWriter, r *http.Request) {
		output, err := kanban.CronDoctor()
		if err != nil {
			fail(w, err, 502)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"output": output})
	})
	mux.HandleFunc("POST /api/cron/jobs", func(w http.ResponseWriter, r *http.Request) {
		var req kanban.CronCreateRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.CreateCronJob(req); err != nil {
			fail(w, err, 400)
			return
		}
		jobs, err := kanban.ListCronJobs(true)
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusCreated, jobs)
	})
	mux.HandleFunc("PATCH /api/cron/jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req kanban.CronEditRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.EditCronJob(r.PathValue("id"), req); err != nil {
			fail(w, err, 400)
			return
		}
		job, err := kanban.GetCronJob(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, job)
	})
	mux.HandleFunc("POST /api/cron/jobs/{id}/pause", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.PauseCronJob(r.PathValue("id")); err != nil {
			fail(w, err, 400)
			return
		}
		job, err := kanban.GetCronJob(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, job)
	})
	mux.HandleFunc("POST /api/cron/jobs/{id}/resume", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.ResumeCronJob(r.PathValue("id")); err != nil {
			fail(w, err, 400)
			return
		}
		job, err := kanban.GetCronJob(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, job)
	})
	mux.HandleFunc("POST /api/cron/jobs/{id}/run", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.RunCronJob(r.PathValue("id")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]bool{"ok": true})
	})
	mux.HandleFunc("DELETE /api/cron/jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DeleteCronJob(r.PathValue("id")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	// hermes logs (read-only, whitelisted files, bounded tail)
}
