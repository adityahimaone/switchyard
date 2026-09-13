package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"kanban-board/internal/kanban"
)

var chatRuns = struct {
	sync.Mutex
	cancel map[string]context.CancelFunc
}{cancel: map[string]context.CancelFunc{}}

func registerChatRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/chat/sessions", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListChatSessions()
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("POST /api/chat/sessions", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Title, Agent, Profile, Workspace, Model string }
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		s, err := kanban.CreateChatSession(req.Title, req.Agent, req.Profile, req.Workspace, req.Model)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 201, s)
	})
	mux.HandleFunc("GET /api/chat/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		s, err := kanban.GetChatSession(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, 200, s)
	})
	mux.HandleFunc("GET /api/chat/sessions/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListChatMessages(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, 200, items)
	})
	mux.HandleFunc("PATCH /api/chat/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Title, Agent, Profile, Workspace, Model *string }
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		s, err := kanban.UpdateChatSession(r.PathValue("id"), req.Title, req.Agent, req.Profile, req.Workspace, req.Model)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 200, s)
	})
	mux.HandleFunc("DELETE /api/chat/sessions/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.DeleteChatSession(r.PathValue("id")); err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("POST /api/chat/sessions/{id}/messages", func(w http.ResponseWriter, r *http.Request) {
		var req struct{ Content, Agent, Profile, Workspace, Model string }
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		if strings.TrimSpace(req.Content) == "" {
			fail(w, fmt.Errorf("content required"), 400)
			return
		}
		s, err := kanban.GetChatSession(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		if req.Agent == "" {
			req.Agent = s.Agent
		}
		if req.Profile == "" {
			req.Profile = s.Profile
		}
		if req.Workspace == "" {
			req.Workspace = s.Workspace
		}
		if req.Model == "" {
			req.Model = s.Model
		}
		if err := kanban.ValidateChatModel(req.Profile, req.Model); err != nil {
			fail(w, err, 400)
			return
		}
		m, err := kanban.CreateChatMessage(s.ID, "user", req.Content, "")
		if err != nil {
			fail(w, err, 400)
			return
		}
		run, err := kanban.CreateChatRun(s.ID, m.ID, req.Agent, req.Profile, req.Workspace, req.Model, req.Content)
		if err != nil {
			fail(w, err, 400)
			return
		}
		ctx, cancel := context.WithCancel(context.Background())
		chatRuns.Lock()
		chatRuns.cancel[run.ID] = cancel
		chatRuns.Unlock()
		go func() {
			defer func() { chatRuns.Lock(); delete(chatRuns.cancel, run.ID); chatRuns.Unlock() }()
			kanban.RunChat(ctx, run.ID, req.Agent, req.Profile, req.Workspace, req.Model, req.Content)
		}()
		writeJSON(w, 202, map[string]any{"message": m, "run": run})
	})
	mux.HandleFunc("GET /api/chat/runs/{id}", func(w http.ResponseWriter, r *http.Request) {
		run, err := kanban.GetChatRun(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, 200, run)
	})
	mux.HandleFunc("GET /api/chat/runs/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		events, err := kanban.ListChatRunEvents(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		writeJSON(w, 200, events)
	})
	mux.HandleFunc("POST /api/chat/runs/{id}/stop", func(w http.ResponseWriter, r *http.Request) {
		chatRuns.Lock()
		cancel := chatRuns.cancel[r.PathValue("id")]
		chatRuns.Unlock()
		if cancel == nil {
			fail(w, fmt.Errorf("run is not active"), 409)
			return
		}
		cancel()
		_ = kanban.UpdateChatRunState(r.PathValue("id"), "cancelled", "", "stopped by user")
		writeJSON(w, 202, map[string]string{"state": "cancelled"})
	})
	mux.HandleFunc("POST /api/chat/runs/{id}/retry", func(w http.ResponseWriter, r *http.Request) {
		old, err := kanban.GetChatRun(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		m, err := kanban.CreateChatMessage(old.SessionID, "user", old.Prompt, "")
		if err != nil {
			fail(w, err, 400)
			return
		}
		run, err := kanban.CreateChatRun(old.SessionID, m.ID, old.Agent, old.Profile, old.Workspace, old.Model, old.Prompt)
		if err != nil {
			fail(w, err, 400)
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		chatRuns.Lock()
		chatRuns.cancel[run.ID] = cancel
		chatRuns.Unlock()
		go func() {
			defer func() { chatRuns.Lock(); delete(chatRuns.cancel, run.ID); chatRuns.Unlock() }()
			kanban.RunChat(ctx, run.ID, old.Agent, old.Profile, old.Workspace, old.Model, old.Prompt)
		}()
		writeJSON(w, 202, run)
	})
}
