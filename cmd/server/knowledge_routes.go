package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"kanban-board/internal/kanban"
)

// Knowledge routes: logs, skills, and per-profile memory.
func registerKnowledgeRoutes(mux *http.ServeMux) {
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
}
