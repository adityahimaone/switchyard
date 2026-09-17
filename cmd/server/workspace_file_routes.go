package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"kanban-board/internal/kanban"
)

func workspaceByID(id string) (kanban.Workspace, error) {
	items, err := kanban.ListWorkspaces()
	if err != nil {
		return kanban.Workspace{}, err
	}
	for _, item := range items {
		if item.ID == id {
			return item, nil
		}
	}
	return kanban.Workspace{}, fmt.Errorf("workspace not found")
}

func registerWorkspaceFileRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/workspaces/{id}/files", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		depth, entries := 3, 200
		if v, e := strconv.Atoi(r.URL.Query().Get("depth")); e == nil && r.URL.Query().Get("depth") != "" {
			depth = v
		}
		if v, e := strconv.Atoi(r.URL.Query().Get("entries")); e == nil && r.URL.Query().Get("entries") != "" {
			entries = v
		}
		files, err := kanban.ListWorkspaceFiles(ws, r.URL.Query().Get("path"), depth, entries)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"workspace_id": ws.ID, "transport": "local", "files": files})
	})
	mux.HandleFunc("GET /api/workspaces/{id}/files/preview", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		limit := 256 << 10
		if v, e := strconv.Atoi(r.URL.Query().Get("max_bytes")); e == nil && r.URL.Query().Get("max_bytes") != "" {
			limit = v
		}
		preview, err := kanban.PreviewWorkspaceFile(ws, r.URL.Query().Get("path"), limit)
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, preview)
	})
	mux.HandleFunc("GET /api/workspaces/{id}/files/download", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		resolved, err := kanban.DownloadWorkspaceFile(ws, r.URL.Query().Get("path"))
		if err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		name := strings.ReplaceAll(r.URL.Query().Get("path"), "\"", "")
		if i := strings.LastIndexAny(name, "/\\"); i >= 0 {
			name = name[i+1:]
		}
		w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
		http.ServeFile(w, r, resolved.LocalPath)
	})
	mux.HandleFunc("PUT /api/workspaces/{id}/files/edit", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		var req kanban.WorkspaceFileRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := kanban.AtomicEditWorkspaceFile(ws, req.Path, req.Content); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"path": req.Path, "status": "saved"})
	})
	mux.HandleFunc("POST /api/workspaces/{id}/files/upload", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 20<<20)
		if err := r.ParseMultipartForm(20 << 20); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		path := r.FormValue("path")
		file, _, err := r.FormFile("file")
		if err != nil {
			fail(w, fmt.Errorf("file required"), http.StatusBadRequest)
			return
		}
		defer file.Close()
		if err := kanban.UploadWorkspaceFile(ws, path, file, 16<<20); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"path": path, "status": "uploaded"})
	})
	mux.HandleFunc("POST /api/workspaces/{id}/files/mkdir", workspaceMutation(func(ws kanban.Workspace, req kanban.WorkspaceFileRequest) error {
		return kanban.MkdirWorkspaceFile(ws, req.Path)
	}))
	mux.HandleFunc("POST /api/workspaces/{id}/files/rename", workspaceMutation(func(ws kanban.Workspace, req kanban.WorkspaceFileRequest) error {
		return kanban.RenameWorkspaceFile(ws, req.Path, req.Content)
	}))
	mux.HandleFunc("DELETE /api/workspaces/{id}/files", func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		if err := kanban.DeleteWorkspaceFile(ws, r.URL.Query().Get("path")); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	})
}

func workspaceMutation(fn func(kanban.Workspace, kanban.WorkspaceFileRequest) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ws, err := workspaceByID(r.PathValue("id"))
		if err != nil {
			fail(w, err, http.StatusNotFound)
			return
		}
		var req kanban.WorkspaceFileRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		if err := fn(ws, req); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
