package main

import (
	"encoding/json"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"kanban-board/internal/kanban"
)

func registerAttachmentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/attachments", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			fail(w, fmt.Errorf("invalid multipart: %w", err), 400)
			return
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			fail(w, fmt.Errorf("file required"), 400)
			return
		}
		defer f.Close()
		data, err := io.ReadAll(io.LimitReader(f, 10<<20+1))
		if err != nil {
			fail(w, err, 400)
			return
		}
		// Re-wrap bytes for StoreAttachment (expects reader)
		att, err := kanban.StoreAttachmentBytes(data, hdr.Filename)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 201, att)
	})

	mux.HandleFunc("GET /api/attachments/{id}", func(w http.ResponseWriter, r *http.Request) {
		a, err := kanban.GetAttachment(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		data, err := kanban.ReadAttachment(a.ID)
		if err != nil {
			fail(w, err, 404)
			return
		}
		w.Header().Set("Content-Type", a.MIME)
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", a.Filename))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
		w.Header().Set("Cache-Control", "private, max-age=300")
		w.WriteHeader(200)
		_, _ = w.Write(data)
	})

	mux.HandleFunc("GET /api/attachments/{id}/download", func(w http.ResponseWriter, r *http.Request) {
		a, err := kanban.GetAttachment(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		data, err := kanban.ReadAttachment(a.ID)
		if err != nil {
			fail(w, err, 404)
			return
		}
		w.Header().Set("Content-Type", a.MIME)
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", a.Filename))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
		w.WriteHeader(200)
		_, _ = w.Write(data)
	})

	mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			AttachmentID string `json:"attachment_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil || req.AttachmentID == "" {
			fail(w, fmt.Errorf("attachment_id required"), 400)
			return
		}
		if err := kanban.LinkTaskAttachment(r.PathValue("slug"), r.PathValue("id"), req.AttachmentID); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
		list, err := kanban.ListTaskAttachments(r.PathValue("slug"), r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, 200, list)
	})

	mux.HandleFunc("POST /api/chat/messages/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			AttachmentID string `json:"attachment_id"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil || req.AttachmentID == "" {
			fail(w, fmt.Errorf("attachment_id required"), 400)
			return
		}
		if err := kanban.LinkChatAttachment(r.PathValue("id"), req.AttachmentID); err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 200, map[string]bool{"ok": true})
	})

	mux.HandleFunc("GET /api/chat/messages/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
		list, err := kanban.ListChatAttachments(r.PathValue("id"))
		if err != nil {
			fail(w, err, 500)
			return
		}
		writeJSON(w, 200, list)
	})

	mux.HandleFunc("POST /api/attachments/{id}/analyze", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		a, err := kanban.GetAttachment(r.PathValue("id"))
		if err != nil {
			fail(w, err, 404)
			return
		}
		if req.Model == "" {
			fail(w, fmt.Errorf("model required"), 400)
			return
		}
		if !kanban.CanAnalyze(req.Model, a.MIME) {
			fail(w, fmt.Errorf("model %q cannot analyze %s — use vision-capable model (gpt-4o, claude-3, gemini)", req.Model, a.MIME), 400)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
		defer cancel()
		result, err := kanban.AnalyzeAttachment(ctx, r.PathValue("id"), req.Model, req.Prompt)
		if err != nil {
			fail(w, err, 400)
			return
		}
		writeJSON(w, 200, map[string]string{"result": result, "model": req.Model, "mime": a.MIME})
	})
}
