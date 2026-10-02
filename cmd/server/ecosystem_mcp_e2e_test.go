package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func ecosystemMCPMux() *http.ServeMux {
	mux := http.NewServeMux()
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
	return mux
}

func seedMCPServersConfig(t *testing.T, home string) {
	t.Helper()
	if err := os.MkdirAll(home, 0o700); err != nil {
		t.Fatal(err)
	}
	body := `model:
  default: test
mcp_servers:
  codegraph:
    command: codegraph
    args:
      - serve
      - --mcp
    enabled: true
  refero:
    url: https://api.refero.design/mcp
    enabled: false
    headers:
      Authorization: Bearer top-secret
`
	if err := os.WriteFile(filepath.Join(home, "config.yaml"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestEcosystemMCPAuthE2E(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatal(err)
	}
	seedMCPServersConfig(t, home)

	mux := ecosystemMCPMux()
	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		ok, err := kanban.VerifyPassword(req.Password)
		if err != nil || !ok {
			http.Error(w, "bad password", http.StatusUnauthorized)
			return
		}
		session, err := kanban.CreateSession()
		if err != nil {
			http.Error(w, "session error", http.StatusInternalServerError)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kanban_session", Value: session, Path: "/"})
	})
	srv := httptest.NewServer(authHandler(mux))
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/auth/login", "application/json", strings.NewReader(`{"password":"123456"}`))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login status = %d", resp.StatusCode)
	}
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		t.Fatal("no session cookie")
	}
	cookie := cookies[0]

	do := func(method, path string) (int, []byte) {
		req, err := http.NewRequest(method, srv.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(cookie)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		return res.StatusCode, body
	}

	// Unauthenticated access must be rejected.
	res, err := http.Get(srv.URL + "/api/ecosystem/mcp/servers")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated servers read = %d, want 401", res.StatusCode)
	}

	status, body := do("GET", "/api/ecosystem/mcp/servers")
	if status != http.StatusOK {
		t.Fatalf("servers status = %d body=%s", status, body)
	}
	var servers []kanban.HermesMCPServer
	if err := json.Unmarshal(body, &servers); err != nil {
		t.Fatal(err)
	}
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %#v", servers)
	}
	// The bearer token must never reach the client.
	if strings.Contains(string(body), "top-secret") {
		t.Fatalf("secret leaked in response: %s", body)
	}

	status, body = do("GET", "/api/ecosystem/mcp/toolsets")
	if status != http.StatusOK {
		t.Fatalf("toolsets status = %d body=%s", status, body)
	}

	// A disabled server is reported as disabled without spawning hermes.
	status, body = do("POST", "/api/ecosystem/mcp/refero/test")
	if status != http.StatusOK {
		t.Fatalf("test status = %d body=%s", status, body)
	}
	var health kanban.MCPServerHealth
	if err := json.Unmarshal(body, &health); err != nil {
		t.Fatal(err)
	}
	if health.State != "disabled" {
		t.Fatalf("expected disabled, got %#v", health)
	}

	// An unknown server is a 404, not a 400.
	status, _ = do("POST", "/api/ecosystem/mcp/nope/test")
	if status != http.StatusNotFound {
		t.Fatalf("unknown server status = %d, want 404", status)
	}
}

func TestEcosystemMCPRejectsUnknownProfile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	seedMCPServersConfig(t, home)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/api/ecosystem/mcp/servers?profile=missing", nil)
	ecosystemMCPMux().ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("unknown profile was accepted: %d", rec.Code)
	}
}

func TestEcosystemStatusMapsErrorClasses(t *testing.T) {
	if got := ecosystemStatus(kanban.ValidateMCPServer(kanban.MCPServer{ID: "x", Name: "x", Transport: "nope"})); got != http.StatusBadRequest {
		t.Fatalf("validation error mapped to %d, want 400", got)
	}
	if got := ecosystemStatus(&os.PathError{Op: "open", Path: "/x", Err: os.ErrNotExist}); got != http.StatusNotFound {
		t.Fatalf("not-exist mapped to %d, want 404", got)
	}
	if got := ecosystemStatus(&os.PathError{Op: "open", Path: "/x", Err: os.ErrPermission}); got != http.StatusForbidden {
		t.Fatalf("permission mapped to %d, want 403", got)
	}
	if got := ecosystemStatus(os.ErrDeadlineExceeded); got != http.StatusInternalServerError {
		t.Fatalf("unknown error mapped to %d, want 500", got)
	}
}
