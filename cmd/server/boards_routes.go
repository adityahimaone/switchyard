package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"kanban-board/internal/kanban"
)

// runControlError maps a domain-layer run-control refusal to its HTTP status.
// A RunControlError already carries the code the caller should see (409 for a
// task that is running, 404 for a missing one), so a refusal is not flattened
// into a 500.
func runControlError(w http.ResponseWriter, err error) {
	if e, ok := err.(*kanban.RunControlError); ok {
		fail(w, e.Err, e.Code)
		return
	}
	fail(w, err, http.StatusInternalServerError)
}

// Board routes: the board list, task CRUD, and the review gate entry points.
func registerBoardsRoutes(mux *http.ServeMux) {
	// Re-run a task's quality gate without re-running the agent. Useful after a
	// flaky test, or when the gate command itself was wrong.
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/gate", func(w http.ResponseWriter, r *http.Request) {
		slug, id := r.PathValue("slug"), r.PathValue("id")
		task, err := kanban.LoadGateTask(slug, id)
		if err != nil {
			runControlError(w, err)
			return
		}
		if strings.TrimSpace(task.GateCommand) == "" {
			fail(w, fmt.Errorf("task has no quality gate command"), http.StatusBadRequest)
			return
		}
		if err := kanban.RunGateCommand(slug, id, task.WorkspacePath, task.Title, task.GateCommand); err != nil {
			runControlError(w, err)
			return
		}
		status, output, err := kanban.GateResult(slug, id)
		if err != nil {
			runControlError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"task_id": id, "gate_status": status, "gate_output": output,
		})
	})
	// Start a task now instead of waiting for the next dispatcher poll. The
	// claim happens here; execution still belongs to the dispatch loop, so this
	// wakes it rather than starting a second one.
	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/start", func(w http.ResponseWriter, r *http.Request) {
		res, err := kanban.StartTaskNow(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			runControlError(w, err)
			return
		}
		// A refusal is a conflict, not a server fault: the card is valid, its
		// turn has simply not come.
		if !res.Started && res.Rejected != "" {
			// writeJSON sets the status, so it is the only one that may.
			writeJSON(w, http.StatusConflict, res)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})
	// Active path leases for the board header: which task currently holds which
	// declared scope. Read-only; leases are acquired by the claim transaction
	// and released when a task leaves running/review/blocked.
	mux.HandleFunc("GET /api/boards/{slug}/leases", func(w http.ResponseWriter, r *http.Request) {
		leases, err := kanban.ActiveLeasesBoard(r.PathValue("slug"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, http.StatusOK, leases)
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
		// MaxBytesReader, not LimitReader: a truncated body can still decode
		// successfully on a valid JSON prefix, which would silently drop the
		// tail of the prompt instead of rejecting an oversized request.
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&t); err != nil {
			fail(w, err, 400)
			return
		}
		if err := kanban.CreateTask(r.PathValue("slug"), &t); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, http.StatusCreated, t)
	})
	// Dry run: the same validation the real create applies, writing nothing.
	// Sharing the validator is what stops the form's advice from drifting from
	// the server's actual rejection.
	mux.HandleFunc("POST /api/boards/{slug}/tasks/validate", func(w http.ResponseWriter, r *http.Request) {
		var t kanban.Task
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&t); err != nil {
			fail(w, err, 400)
			return
		}
		issues := kanban.ValidateNewTask(&t)
		if issues == nil {
			issues = []kanban.Issue{}
		}
		// A board that does not exist is a workspace-level problem, not a field
		// problem, so it is reported here rather than surfacing as a create
		// failure later.
		if _, statErr := os.Stat(kanban.BoardDBPath(r.PathValue("slug"))); statErr != nil {
			issues = append(issues, kanban.Issue{
				Code:    kanban.CodeWorkspaceMissing,
				Message: fmt.Sprintf("board %q not found", r.PathValue("slug")),
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     len(issues) == 0,
			"issues": issues,
		})
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
				if loadErr != nil || t.Transport != "node-agent" {
					fail(w, fmt.Errorf("review->done requires a clean workspace"), 400)
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
}
