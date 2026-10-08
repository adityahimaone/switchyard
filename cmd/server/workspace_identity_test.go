package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func workspaceMux() *http.ServeMux {
	mux := http.NewServeMux()
	registerWorkspaceIdentityRoutes(mux)
	// authHandler exempts /api/auth/login, so the mux has to actually serve it
	// for the session cookie to exist.
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
	return mux
}

func decodeView(t *testing.T, res *http.Response) kanban.WorkspaceIdentityView {
	t.Helper()
	var view kanban.WorkspaceIdentityView
	if err := json.NewDecoder(res.Body).Decode(&view); err != nil {
		t.Fatalf("decode view: %v", err)
	}
	res.Body.Close()
	return view
}

func TestWorkspaceIdentityAuthE2E(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(authHandler(workspaceMux()))
	defer srv.Close()

	// Unauthenticated: the identity is behind the same guard as the rest of the
	// API, so it must not leak the workspace name or avatar to a logged-out page.
	unauth, err := http.Get(srv.URL + "/api/workspace")
	if err != nil {
		t.Fatal(err)
	}
	unauth.Body.Close()
	if unauth.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET /api/workspace = %d, want 401", unauth.StatusCode)
	}

	login, err := http.Post(srv.URL+"/api/auth/login", "application/json",
		strings.NewReader(`{"password":"123456"}`))
	if err != nil {
		t.Fatal(err)
	}
	login.Body.Close()
	if login.StatusCode != http.StatusOK {
		t.Fatalf("login = %d", login.StatusCode)
	}
	jar := login.Cookies()
	if len(jar) == 0 {
		t.Fatal("no session cookie")
	}
	client := &http.Client{}
	do := func(method, path string, body io.Reader) *http.Response {
		t.Helper()
		req, err := http.NewRequest(method, srv.URL+path, body)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range jar {
			req.AddCookie(c)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}

	// An unconfigured workspace answers 200 with an empty record, not a 404:
	// the top bar renders before anyone has opened settings.
	res := do("GET", "/api/workspace", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET = %d", res.StatusCode)
	}
	if view := decodeView(t, res); view.Name != "" || view.ResolvedAvatarURL != "" {
		t.Fatalf("unconfigured view = %+v", view)
	}

	// Rename, and confirm the response echoes the normalized stored value.
	res = do("PUT", "/api/workspace", strings.NewReader(`{"name":"  Ops   Room  "}`))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("PUT = %d", res.StatusCode)
	}
	if view := decodeView(t, res); view.Name != "Ops Room" {
		t.Fatalf("name not normalized in response: %q", view.Name)
	}

	// An invalid name is refused with 400 rather than being silently truncated.
	res = do("PUT", "/api/workspace", strings.NewReader(`{"name":"bad\u0000name"}`))
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad name = %d, want 400", res.StatusCode)
	}

	// A URL that targets a local address is refused before any fetch occurs.
	res = do("PUT", "/api/workspace/avatar-url", strings.NewReader(`{"url":"https://127.0.0.1/x.png"}`))
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("private url = %d, want 400", res.StatusCode)
	}

	// The name-only PUT remains independent of legacy avatar metadata.
	if _, err := kanban.SaveWorkspaceIdentity(kanban.WorkspaceIdentity{Name: "Ops Room", AvatarURL: "https://example.com/a.png"}); err != nil {
		t.Fatal(err)
	}
	res = do("PUT", "/api/workspace", strings.NewReader(`{"name":"Renamed Room"}`))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("second PUT = %d", res.StatusCode)
	}
	if view := decodeView(t, res); view.ResolvedAvatarURL != "https://example.com/a.png" {
		t.Fatalf("rename cleared legacy avatar url: %+v", view)
	}

	res = do("DELETE", "/api/workspace/avatar", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete = %d", res.StatusCode)
	}
	if view := decodeView(t, res); view.ResolvedAvatarURL != "" {
		t.Fatalf("delete did not clear legacy avatar URL: %+v", view)
	}
}

// A real upload has to survive the multipart round trip, and the served bytes
// must come back with the sniffed type.
func TestWorkspaceAvatarUploadE2E(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	srv := httptest.NewServer(workspaceMux())
	defer srv.Close()

	gif := []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	// An explicit part header so the declared type is application/octet-stream,
	// the value a browser actually sends for an unknown blob. It must still be
	// accepted on the strength of the sniffed bytes.
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="avatar"; filename="a.gif"`)
	h.Set("Content-Type", "application/octet-stream")
	part, err := mw.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(gif); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	req, err := http.NewRequest("POST", srv.URL+"/api/workspace/avatar", &buf)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		t.Fatalf("upload = %d: %s", res.StatusCode, body)
	}
	view := decodeView(t, res)
	if !strings.HasPrefix(view.ResolvedAvatarURL, "/api/workspace/avatar?v=") || !view.HasUploadedAvatar {
		t.Fatalf("upload did not resolve to revisioned api path: %+v", view)
	}

	// And the bytes served back are the bytes uploaded.
	get, err := http.Get(srv.URL + view.ResolvedAvatarURL)
	if err != nil {
		t.Fatal(err)
	}
	defer get.Body.Close()
	if get.StatusCode != http.StatusOK {
		t.Fatalf("fetch = %d", get.StatusCode)
	}
	if ct := get.Header.Get("Content-Type"); ct != "image/gif" {
		t.Fatalf("content-type = %q, want image/gif", ct)
	}
	got, _ := io.ReadAll(get.Body)
	if !bytes.Equal(got, gif) {
		t.Fatal("served bytes differ from uploaded bytes")
	}

	// A non-image with an image filename is still refused, because the trust
	// boundary is the sniffed content.
	var bad bytes.Buffer
	mw2 := multipart.NewWriter(&bad)
	h2 := textproto.MIMEHeader{}
	h2.Set("Content-Disposition", `form-data; name="avatar"; filename="a.png"`)
	h2.Set("Content-Type", "image/png")
	p2, _ := mw2.CreatePart(h2)
	p2.Write([]byte(`<svg onload=alert(1)>`))
	mw2.Close()
	req2, _ := http.NewRequest("POST", srv.URL+"/api/workspace/avatar", &bad)
	req2.Header.Set("Content-Type", mw2.FormDataContentType())
	res2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	res2.Body.Close()
	if res2.StatusCode != http.StatusBadRequest {
		t.Fatalf("svg upload = %d, want 400", res2.StatusCode)
	}
}
