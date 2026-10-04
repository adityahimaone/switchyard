package main

import (
	"encoding/json"
	"net/http"

	"kanban-board/internal/kanban"
)

// Ecosystem routes: MCP servers, extensions, and gateway status.
//
// Hermes owns MCP configuration in ~/.hermes/config.yaml; these routes read
// the live agent state rather than a parallel registry.
func registerEcosystemRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ecosystem/mcp", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListMCPServers(profileQuery(r))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("POST /api/ecosystem/mcp", func(w http.ResponseWriter, r *http.Request) {
		var item kanban.MCPServer
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&item); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		items, err := kanban.UpsertMCPServer(profileQuery(r), item)
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("DELETE /api/ecosystem/mcp/{id}", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.DeleteMCPServer(profileQuery(r), r.PathValue("id"))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("GET /api/ecosystem/extensions", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListExtensions(profileQuery(r))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("POST /api/ecosystem/extensions", func(w http.ResponseWriter, r *http.Request) {
		var item kanban.ExtensionManifest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&item); err != nil {
			fail(w, err, http.StatusBadRequest)
			return
		}
		items, err := kanban.UpsertExtension(profileQuery(r), item)
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("DELETE /api/ecosystem/extensions/{id}", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.DeleteExtension(profileQuery(r), r.PathValue("id"))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("GET /api/ecosystem/gateway", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, kanban.GatewayStatusReport())
	})

	// Hermes owns MCP configuration in ~/.hermes/config.yaml; these routes read
	// the live agent state rather than a parallel registry.
	mux.HandleFunc("GET /api/ecosystem/mcp/servers", func(w http.ResponseWriter, r *http.Request) {
		items, err := kanban.ListHermesMCPServers(profileQuery(r))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, items)
	})
	mux.HandleFunc("GET /api/ecosystem/mcp/toolsets", func(w http.ResponseWriter, r *http.Request) {
		toolsets, err := kanban.HermesMCPToolsetReport(profileQuery(r))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, toolsets)
	})
	mux.HandleFunc("POST /api/ecosystem/mcp/{id}/test", func(w http.ResponseWriter, r *http.Request) {
		health, err := kanban.TestHermesMCPServer(r.Context(), profileQuery(r), r.PathValue("id"))
		if err != nil {
			fail(w, err, ecosystemStatus(err))
			return
		}
		writeJSON(w, http.StatusOK, health)
	})
}
