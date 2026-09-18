package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"kanban-board/internal/kanban"
)

var version = "v0.1.0"

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func fail(w http.ResponseWriter, err error, code int) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

func main() {
	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Println(version)
		return
	}
	addr := envOr("KANBAN_ADDR", "127.0.0.1:8790")
	dist := envOr("KANBAN_WEB_DIST", "web/dist")
	if err := kanban.EnsureAuthSeed(); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		ok, err := kanban.ValidateSession(readAuthCookie(r))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": ok})
	})
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		ok, err := kanban.VerifyPassword(req.Password)
		if err != nil {
			fail(w, err, 500)
			return
		}
		if !ok {
			fail(w, fmt.Errorf("invalid password"), http.StatusUnauthorized)
			return
		}
		token, err := kanban.CreateSession()
		if err != nil {
			fail(w, err, 500)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kanban_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 14 * 24 * 60 * 60})
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
	})
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie("kanban_session"); err == nil {
			_ = kanban.DeleteSession(c.Value)
		}
		http.SetCookie(w, &http.Cookie{Name: "kanban_session", Value: "", Path: "/", HttpOnly: true, MaxAge: -1})
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
	})
	mux.HandleFunc("POST /api/auth/password", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Current  string `json:"current"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.ChangePassword(req.Current, req.Password); err != nil {
			fail(w, err, 400)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kanban_session", Value: "", Path: "/", HttpOnly: true, MaxAge: -1})
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
	})

	mux.HandleFunc("GET /api/boards", func(w http.ResponseWriter, r *http.Request) {
		boards, err := kanban.ListBoards()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, boards)
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks", func(w http.ResponseWriter, r *http.Request) {
		q := kanban.TaskQuery{
			Status:     r.URL.Query().Get("status"),
			Assignee:   r.URL.Query().Get("assignee"),
			Q:          r.URL.Query().Get("q"),
			Unassigned: r.URL.Query().Get("unassigned") == "1",
		}
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				fail(w, fmt.Errorf("invalid limit"), 400)
				return
			}
			q.Limit = n
		}
		if v := r.URL.Query().Get("offset"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				fail(w, fmt.Errorf("invalid offset"), 400)
				return
			}
			q.Offset = n
		}
		tasks, total, err := kanban.ListTasksQuery(r.PathValue("slug"), q)
		if err != nil {
			fail(w, err, 400)
			return
		}
		w.Header().Set("X-Total-Count", strconv.Itoa(total))
		writeJSON(w, http.StatusOK, tasks)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/reorder", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Order []string `json:"order"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.ReorderTasks(r.PathValue("slug"), req.Order); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/bulk", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			IDs      []string `json:"ids"`
			Action   string   `json:"action"`
			Status   string   `json:"status"`
			Assignee string   `json:"assignee"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		switch req.Action {
		case "archive":
			req.Status = "archived"
			fallthrough
		case "move":
			moved, skipped, err := kanban.BulkTransition(r.PathValue("slug"), req.IDs, req.Status)
			if err != nil {
				fail(w, err, 400)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"moved": moved, "skipped": skipped})
		case "assign":
			if err := kanban.BulkAssign(r.PathValue("slug"), req.IDs, req.Assignee); err != nil {
				fail(w, err, 400)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		default:
			fail(w, fmt.Errorf("unknown action %q", req.Action), 400)
		}
	})
	mux.HandleFunc("GET /api/boards/{slug}/export", func(w http.ResponseWriter, r *http.Request) {
		snap, err := kanban.ExportBoard(r.PathValue("slug"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s-export.json", r.PathValue("slug")))
		writeJSON(w, http.StatusOK, snap)
	})
	mux.HandleFunc("POST /api/boards/import", func(w http.ResponseWriter, r *http.Request) {
		var snap kanban.BoardSnapshot
		if err := json.NewDecoder(io.LimitReader(r.Body, 64<<20)).Decode(&snap); err != nil {
			fail(w, err, 400)
			return
		}
		created, ids, err := kanban.ImportBoard(&snap)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"created": created, "imported": len(ids)})
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks", func(w http.ResponseWriter, r *http.Request) {
		var t kanban.Task
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&t); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.CreateTask(r.PathValue("slug"), &t); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, t)
	})
	mux.HandleFunc("PATCH /api/boards/{slug}/tasks/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		// review gate: review->done only via /approve (commit / commit&push)
		if req.Status == "done" {
			if cur, err := kanban.TaskStatus(r.PathValue("slug"), r.PathValue("id")); err == nil && cur == "review" {
				t, loadErr := loadReviewTask(r.PathValue("slug"), r.PathValue("id"))
				if loadErr != nil || t.Transport != "ssh" {
					fail(w, fmt.Errorf("review->done requires a clean ssh workspace"), 400)
					return
				}
				clean, _, statusCode := reviewWorkspaceClean(t)
				if statusCode != 0 || !clean {
					fail(w, fmt.Errorf("review has changes; approve with commit or commit_push"), 400)
					return
				}
			}
		}
		if cur, err := kanban.TaskStatus(r.PathValue("slug"), r.PathValue("id")); err == nil && cur == "running" {
			fail(w, fmt.Errorf("running task can only be stopped via stop endpoint"), 400)
			return
		}
		if err := kanban.StatusTransition(r.PathValue("slug"), r.PathValue("id"), req.Status); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": req.Status})
	})
	mux.HandleFunc("DELETE /api/boards/{slug}/tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.ArchiveTask(r.PathValue("slug"), r.PathValue("id")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "archived"})
	})
	mux.HandleFunc("POST /api/boards", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Slug  string `json:"slug"`
			Name  string `json:"name"`
			Icon  string `json:"icon"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		b, err := kanban.CreateBoard(req.Slug, req.Name, req.Icon, req.Color)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, b)
	})
	mux.HandleFunc("PATCH /api/boards/{slug}", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name     string `json:"name"`
			Icon     string `json:"icon"`
			Color    string `json:"color"`
			Archived *bool  `json:"archived"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		var b *kanban.Board
		var err error
		if req.Archived != nil {
			err = kanban.SetBoardArchived(r.PathValue("slug"), *req.Archived)
			if err == nil {
				b, err = kanban.PatchBoard(r.PathValue("slug"), req.Name, req.Icon, req.Color)
			}
		} else {
			b, err = kanban.PatchBoard(r.PathValue("slug"), req.Name, req.Icon, req.Color)
		}
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, b)
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/runs", func(w http.ResponseWriter, r *http.Request) {
		events, err := kanban.TaskEvents(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, kanban.GroupTaskRuns(events))
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/dependencies", func(w http.ResponseWriter, r *http.Request) {
		deps, err := kanban.ListTaskDependencies(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, deps)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/dependencies", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			DependsOnID string `json:"depends_on_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.AddTaskDependency(r.PathValue("slug"), r.PathValue("id"), req.DependsOnID); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"task_id": r.PathValue("id"), "depends_on_id": req.DependsOnID})
	})
	mux.HandleFunc("DELETE /api/boards/{slug}/tasks/{id}/dependencies/{dependsOnID}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.RemoveTaskDependency(r.PathValue("slug"), r.PathValue("id"), r.PathValue("dependsOnID")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		events, err := kanban.TaskEvents(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, events)
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/worker-log", func(w http.ResponseWriter, r *http.Request) {
		offset := int64(0)
		if raw := r.URL.Query().Get("offset"); raw != "" {
			parsed, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || parsed < 0 {
				fail(w, fmt.Errorf("invalid offset"), http.StatusBadRequest)
				return
			}
			offset = parsed
		}
		log, err := kanban.WorkerLogTail(r.PathValue("slug"), r.PathValue("id"), offset)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, log)
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/comments", func(w http.ResponseWriter, r *http.Request) {
		comments, err := kanban.ListComments(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, comments)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/comments", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Author string `json:"author,omitempty"`
			Body   string `json:"body"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		c, err := kanban.AddComment(r.PathValue("slug"), r.PathValue("id"), req.Author, req.Body)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, c)
	})

	// run control: retry/release/clone are guarded in the domain layer.
	runControlError := func(w http.ResponseWriter, err error) {
		if e, ok := err.(*kanban.RunControlError); ok {
			fail(w, e.Err, e.Code)
			return
		}
		fail(w, err, http.StatusInternalServerError)
	}
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/run", func(w http.ResponseWriter, r *http.Request) {
		t, err := kanban.RunTask(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			runControlError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, t)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/retry", func(w http.ResponseWriter, r *http.Request) {
		t, err := kanban.RetryTask(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			runControlError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, t)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/release", func(w http.ResponseWriter, r *http.Request) {
		t, err := kanban.ReleaseStaleTask(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			runControlError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, t)
	})
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/clone", func(w http.ResponseWriter, r *http.Request) {
		t, err := kanban.CloneTask(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			runControlError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, t)
	})
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/health", func(w http.ResponseWriter, r *http.Request) {
		h, err := kanban.TaskHealthFor(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, h)
	})
	mux.HandleFunc("GET /api/boards/{slug}/health", func(w http.ResponseWriter, r *http.Request) {
		m, err := kanban.BoardTaskHealth(r.PathValue("slug"))
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, m)
	})

	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/stop", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		cur, err := kanban.TaskStatus(r.PathValue("slug"), id)
		if err != nil {
			fail(w, err, 404)
			return
		}
		if cur != "running" {
			fail(w, fmt.Errorf("task is not running (status=%s)", cur), 400)
			return
		}
		if requestTaskStop(id) {
			writeJSON(w, http.StatusAccepted, map[string]string{"status": "stopping"})
			return
		}
		// Force-stop for node-agent dispatches that bypass activeRuns.
		if err := kanban.ForceStopTask(r.PathValue("slug"), id); err != nil {
			fail(w, err, http.StatusConflict)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "force-stopped"})
	})

	// review gate: diff + approve (commit / commit&push) — only path review->done
	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/diff", handleTaskDiff)
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/approve", handleTaskApprove)

	// workspaces (shared source of truth: ~/.hermes/workspaces.json)
	mux.HandleFunc("GET /api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		ws, err := kanban.ListWorkspaces()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, ws)
	})
	mux.HandleFunc("POST /api/workspaces", func(w http.ResponseWriter, r *http.Request) {
		var ws kanban.Workspace
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&ws); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.SaveWorkspace(&ws); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, ws)
	})
	mux.HandleFunc("PUT /api/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		var ws kanban.Workspace
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&ws); err != nil {
			fail(w, err, 400)
			return
		}
		ws.ID = id
		if err := kanban.SaveWorkspace(&ws); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, ws)
	})
	mux.HandleFunc("DELETE /api/workspaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DeleteWorkspace(r.PathValue("id")); err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"deleted": r.PathValue("id")})
	})
	mux.HandleFunc("GET /api/workspaces/{id}/codegraph", func(w http.ResponseWriter, r *http.Request) {
		ws, err := kanban.ListWorkspaces()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, e := range ws {
			if e.ID == r.PathValue("id") {
				report, err := kanban.CodeGraphReportForWorkspace(&e)
				if err != nil {
					fail(w, err, 502)
					return
				}
				writeJSON(w, http.StatusOK, report)
				return
			}
		}
		fail(w, http.ErrMissingFile, 404)
	})
	mux.HandleFunc("POST /api/workspaces/{id}/codegraph/index", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		ws, err := kanban.ListWorkspaces()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, e := range ws {
			if e.ID == r.PathValue("id") {
				job, err := kanban.CodeGraphIndex(&e, req.Path)
				if err != nil {
					fail(w, err, 400)
					return
				}
				writeJSON(w, http.StatusAccepted, job)
				return
			}
		}
		fail(w, http.ErrMissingFile, 404)
	})
	mux.HandleFunc("GET /api/workspaces/{id}/codegraph/jobs/{jobID}", func(w http.ResponseWriter, r *http.Request) {
		job, ok := kanban.CodeGraphJob(r.PathValue("jobID"))
		if !ok {
			fail(w, http.ErrMissingFile, 404)
			return
		}
		writeJSON(w, http.StatusOK, job)
	})
	mux.HandleFunc("POST /api/workspaces/ping", func(w http.ResponseWriter, r *http.Request) {
		out, err := kanban.PingAll()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, out)
	})
	mux.HandleFunc("GET /api/workspaces/{id}/ping", func(w http.ResponseWriter, r *http.Request) {
		ws, err := kanban.ListWorkspaces()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, e := range ws {
			if e.ID == r.PathValue("id") {
				raw := kanban.PingWorkspace(&e)
				eff := kanban.DebouncedStatus(raw.ID, raw)
				kanban.AppendPingHistory(raw.ID, raw) // raw fail goes to history/EKG
				kanban.BroadcastEvent("workspace_ping", map[string]any{"workspace_id": raw.ID, "status": eff.Status, "status_message": eff.StatusMsg, "ping_ms": eff.PingMs})
				writeJSON(w, http.StatusOK, eff)
				return
			}
		}
		fail(w, http.ErrMissingFile, 404)
	})
	mux.HandleFunc("GET /api/workspaces/{id}/history", func(w http.ResponseWriter, r *http.Request) {
		pts, err := kanban.GetPingHistory(r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, pts)
	})
	mux.HandleFunc("GET /api/workspaces/{id}/logs", func(w http.ResponseWriter, r *http.Request) {
		ws, err := kanban.ListWorkspaces()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, e := range ws {
			if e.ID == r.PathValue("id") {
				logs, err := kanban.WorkspaceLogs(&e, 80)
				if err != nil {
					fail(w, err, 500)
					return
				}
				writeJSON(w, http.StatusOK, logs)
				return
			}
		}
		fail(w, http.ErrMissingFile, 404)
	})

	mux.HandleFunc("GET /api/profiles", func(w http.ResponseWriter, r *http.Request) {
		profiles, err := kanban.ListProfiles()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, profiles)
	})
	mux.HandleFunc("PATCH /api/boards/{slug}/tasks/{id}/assignee", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Assignee string `json:"assignee"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.Assign(r.PathValue("slug"), r.PathValue("id"), req.Assignee); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"assignee": req.Assignee})
	})
	// profiles: full CRUD (mirrors hermes-webui spaces/profile UI)
	mux.HandleFunc("GET /api/profiles-full", func(w http.ResponseWriter, r *http.Request) {
		profiles, err := kanban.ListProfilesFull()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, profiles)
	})
	mux.HandleFunc("GET /api/profiles/{name}/avatar", func(w http.ResponseWriter, r *http.Request) {
		data, mime, ok := kanban.ProfileAvatar(r.PathValue("name"))
		if !ok {
			fail(w, http.ErrMissingFile, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=300")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})
	mux.HandleFunc("PUT /api/profiles/{name}/avatar-url", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.SetProfileAvatarURL(r.PathValue("name"), req.URL); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		p, err := kanban.GetProfile(r.PathValue("name"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, p)
	})
	mux.HandleFunc("POST /api/profiles/{name}/avatar", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2*1024*1024 + 512); err != nil {
			fail(w, fmt.Errorf("invalid avatar upload: %w", err), http.StatusBadRequest)
			return
		}
		file, header, err := r.FormFile("avatar")
		if err != nil {
			fail(w, fmt.Errorf("avatar file required"), http.StatusBadRequest)
			return
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, 2*1024*1024+1))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.SetProfileAvatar(r.PathValue("name"), header.Header.Get("Content-Type"), data); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		p, err := kanban.GetProfile(r.PathValue("name"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, p)
	})
	mux.HandleFunc("DELETE /api/profiles/{name}/avatar", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.RemoveProfileAvatar(r.PathValue("name")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/profiles/{name}", func(w http.ResponseWriter, r *http.Request) {
		p, err := kanban.GetProfile(r.PathValue("name"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, p)
	})
	mux.HandleFunc("POST /api/profiles", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name         string   `json:"name"`
			Model        string   `json:"model"`
			Provider     string   `json:"provider"`
			SystemPrompt string   `json:"system_prompt"`
			Skills       []string `json:"skills"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		in := kanban.ProfileInput{Model: req.Model, Provider: req.Provider, Skills: req.Skills}
		sp := req.SystemPrompt
		// treat empty string as "no prompt" only if key missing; JSON can't tell — assume always present
		in.SystemPrompt = &sp
		if err := kanban.CreateProfile(req.Name, in); err != nil {
			fail(w, err, 400)
			return
		}
		p, _ := kanban.GetProfile(req.Name)
		writeJSON(w, http.StatusCreated, p)
	})
	mux.HandleFunc("PUT /api/profiles/{name}", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Model        *string   `json:"model"`
			Provider     *string   `json:"provider"`
			SystemPrompt *string   `json:"system_prompt"`
			Skills       *[]string `json:"skills"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		in := kanban.ProfileInput{}
		if req.Model != nil {
			in.Model = *req.Model
		}
		if req.Provider != nil {
			in.Provider = *req.Provider
		}
		in.SystemPrompt = req.SystemPrompt
		if req.Skills != nil {
			in.Skills = *req.Skills
			in.SkillsSet = true
		}
		if err := kanban.PatchProfile(r.PathValue("name"), in); err != nil {
			fail(w, err, 400)
			return
		}
		p, _ := kanban.GetProfile(r.PathValue("name"))
		writeJSON(w, http.StatusOK, p)
	})
	mux.HandleFunc("DELETE /api/profiles/{name}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DeleteProfile(r.PathValue("name")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"deleted": r.PathValue("name")})
	})
	mux.HandleFunc("GET /api/providers", func(w http.ResponseWriter, r *http.Request) {
		providers, err := kanban.ListProviders()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, providers)
	})
	mux.HandleFunc("POST /api/providers", func(w http.ResponseWriter, r *http.Request) {
		var input kanban.ProviderInput
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&input); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.UpsertProvider(input); err != nil {
			fail(w, err, 400)
			return
		}
		providers, err := kanban.ListProviders()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, provider := range providers {
			if provider.Name == input.Name {
				writeJSON(w, http.StatusOK, provider)
				return
			}
		}
		fail(w, fmt.Errorf("provider not found after save"), 500)
	})
	mux.HandleFunc("PUT /api/providers/{name}", func(w http.ResponseWriter, r *http.Request) {
		var input kanban.ProviderInput
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&input); err != nil {
			fail(w, err, 400)
			return
		}
		input.Name = r.PathValue("name")
		if err := kanban.UpsertProvider(input); err != nil {
			fail(w, err, 400)
			return
		}
		providers, err := kanban.ListProviders()
		if err != nil {
			fail(w, err, 500)
			return
		}
		for _, provider := range providers {
			if provider.Name == input.Name {
				writeJSON(w, http.StatusOK, provider)
				return
			}
		}
		fail(w, fmt.Errorf("provider not found after save"), 500)
	})
	mux.HandleFunc("DELETE /api/providers/{name}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DeleteProvider(r.PathValue("name")); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"deleted": r.PathValue("name")})
	})
	mux.HandleFunc("POST /api/providers/{name}/models/discover", func(w http.ResponseWriter, r *http.Request) {
		models, err := kanban.DiscoverConfiguredProviderModels(r.PathValue("name"))
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"name": r.PathValue("name"), "models": models})
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

	registerChatRoutes(mux)
	registerWorkspaceFileRoutes(mux)

	// attachments + vision (R2 when configured, local fallback)
	if err := kanban.ConfigureAttachmentStore(); err != nil {
		log.Fatalf("attachment storage configuration failed: %v", err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		log.Printf("warning: attachments db init: %v", err)
	}
	registerAttachmentRoutes(mux)

	mux.HandleFunc("GET /api/overview", func(w http.ResponseWriter, r *http.Request) {
		o, err := kanban.OverviewData()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, o)
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
	mux.HandleFunc("GET /api/logs", func(w http.ResponseWriter, r *http.Request) {
		tail, err := kanban.ReadLogTail(r.URL.Query().Get("file"), r.URL.Query().Get("tail"))
		if err != nil {
			fail(w, err, 400)
			return
		}
		// optional server-side filter: keep lines containing q (case-insensitive)
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			lq := strings.ToLower(q)
			kept := make([]string, 0, len(tail.Lines))
			for _, l := range tail.Lines {
				if strings.Contains(strings.ToLower(l), lq) {
					kept = append(kept, l)
				}
			}
			tail.Lines = kept
		}
		writeJSON(w, http.StatusOK, tail)
	})

	// skills (read-only registry from ~/.hermes/skills)
	mux.HandleFunc("GET /api/skills", func(w http.ResponseWriter, r *http.Request) {
		skills, err := kanban.ListSkills()
		if err != nil {
			fail(w, err, 500)
			return
		}
		if q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))); q != "" {
			kept := skills[:0]
			for _, s := range skills {
				if strings.Contains(strings.ToLower(s.Name), q) || strings.Contains(strings.ToLower(s.Description), q) {
					kept = append(kept, s)
				}
			}
			skills = kept
		}
		writeJSON(w, http.StatusOK, skills)
	})
	mux.HandleFunc("GET /api/skills/content", func(w http.ResponseWriter, r *http.Request) {
		c, err := kanban.SkillContent(r.URL.Query().Get("name"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, http.StatusOK, c)
	})
	mux.HandleFunc("GET /api/profiles/{profile}/skills", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListProfileSkills(r.PathValue("profile"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("GET /api/profiles/{profile}/skills/{skill}", func(w http.ResponseWriter, r *http.Request) {
		content, err := kanban.ReadProfileSkill(r.PathValue("profile"), r.PathValue("skill"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"profile": r.PathValue("profile"), "skill": r.PathValue("skill"), "content": content})
	})
	mux.HandleFunc("PUT /api/profiles/{profile}/skills/{skill}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.WriteProfileSkill(r.PathValue("profile"), r.PathValue("skill"), body.Content); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
	})

	// memory (read-only snapshot MEMORY.md / USER.md / SOUL.md)
	mux.HandleFunc("GET /api/memory", func(w http.ResponseWriter, r *http.Request) {
		mem, err := kanban.ReadMemory()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, mem)
	})
	mux.HandleFunc("GET /api/profiles/{profile}/memory/{scope}", func(w http.ResponseWriter, r *http.Request) {
		content, mtime, err := kanban.ReadProfileMemory(r.PathValue("profile"), r.PathValue("scope"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"profile": r.PathValue("profile"), "scope": r.PathValue("scope"), "content": content, "mtime": mtime})
	})
	mux.HandleFunc("PUT /api/profiles/{profile}/memory/{scope}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10)).Decode(&body); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.WriteProfileMemory(r.PathValue("profile"), r.PathValue("scope"), body.Content); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
	})

	mux.Handle("/", spa(dist))

	kanban.StartFlowSync()
	StartSSHDispatcher()
	log.Printf("kanban-board listening on %s (dist=%s)", addr, dist)
	log.Fatal(http.ListenAndServe(addr, authHandler(mux)))
}

func authHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/auth/status" || r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/logout" || r.URL.Path == "/api/auth/password" {
			next.ServeHTTP(w, r)
			return
		}
		ok, err := kanban.ValidateSession(readAuthCookie(r))
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		if !ok {
			fail(w, fmt.Errorf("authentication required"), http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func readAuthCookie(r *http.Request) string {
	c, err := r.Cookie("kanban_session")
	if err != nil {
		return ""
	}
	return c.Value
}

// spa serves the built frontend with index.html fallback for client routes.
func spa(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		cleaned := filepath.Clean(r.URL.Path)
		rel := strings.TrimPrefix(cleaned, "/")
		p := filepath.Join(dir, rel)
		if st, err := os.Stat(p); err == nil {
			if !st.IsDir() {
				fs.ServeHTTP(w, r)
				return
			}
			idx := filepath.Join(p, "index.html")
			if _, err := os.Stat(idx); err == nil {
				http.ServeFile(w, r, idx)
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}
