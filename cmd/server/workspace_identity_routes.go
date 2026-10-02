package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"kanban-board/internal/kanban"
)

// Workspace-identity routes: the single active-workspace record and its avatar.
func registerWorkspaceIdentityRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspace", func(w http.ResponseWriter, r *http.Request) {
		view, err := kanban.GetWorkspaceIdentityView()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("PUT /api/workspace", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
			fail(w, fmt.Errorf("invalid workspace identity payload"), http.StatusBadRequest)
			return
		}
		// Name-only update on purpose: decoding into the full struct would let a
		// client that omits avatar_url silently clear the avatar.
		if _, err := kanban.SetWorkspaceName(in.Name); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		// Echo the view rather than the input: the stored name is normalized and
		// the resolved avatar URL is derived server-side, so the client renders
		// exactly what was written rather than what it hoped to write.
		view, err := kanban.GetWorkspaceIdentityView()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("GET /api/workspace/avatar", func(w http.ResponseWriter, r *http.Request) {
		data, mime, ok := kanban.WorkspaceAvatar()
		if !ok {
			fail(w, http.ErrMissingFile, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=300")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})
	mux.HandleFunc("PUT /api/workspace/avatar-url", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if _, err := kanban.SetWorkspaceAvatarURL(req.URL); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		view, err := kanban.GetWorkspaceIdentityView()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("POST /api/workspace/avatar", func(w http.ResponseWriter, r *http.Request) {
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
		if err := kanban.SetWorkspaceAvatar(header.Header.Get("Content-Type"), data); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		view, err := kanban.GetWorkspaceIdentityView()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("DELETE /api/workspace/avatar", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.RemoveWorkspaceAvatar(); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		view, err := kanban.GetWorkspaceIdentityView()
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
}
