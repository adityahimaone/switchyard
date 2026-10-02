package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"kanban-board/internal/kanban"
)

// Profile routes: agent profile CRUD, avatars, activation.
func registerProfilesRoutes(mux *http.ServeMux) {
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
	mux.HandleFunc("POST /api/profiles/{name}/activate", func(w http.ResponseWriter, r *http.Request) {
		if err := kanban.SetActiveProfile(r.PathValue("name")); err != nil {
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
}
