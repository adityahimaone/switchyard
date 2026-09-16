package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// TestAttachmentAuthE2E verifies production auth middleware plus attachment routes.
func TestAttachmentAuthE2E(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatal(err)
	}
	if _, err := kanban.EnsureAttachmentsDBPublic(); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	registerAttachmentRoutes(mux)
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
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login status %d", resp.StatusCode)
	}
	cookies := resp.Cookies()
	resp.Body.Close()
	if len(cookies) == 0 {
		t.Fatal("login returned no session cookie")
	}
	cookie := cookies[0]

	do := func(method, path string, body io.Reader) *http.Response {
		req, err := http.NewRequest(method, srv.URL+path, body)
		if err != nil {
			t.Fatal(err)
		}
		req.AddCookie(cookie)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}

	// Upload real multipart payload.
	var multipart strings.Builder
	multipart.WriteString("--e2e\r\nContent-Disposition: form-data; name=\"file\"; filename=\"e2e.png\"\r\nContent-Type: image/png\r\n\r\n")
	multipart.WriteString("\x89PNG\r\n\x1a\nauth-e2e")
	multipart.WriteString("\r\n--e2e--\r\n")
	req, _ := http.NewRequest("POST", srv.URL+"/api/attachments", strings.NewReader(multipart.String()))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=e2e")
	req.AddCookie(cookie)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("upload status %d: %s", resp.StatusCode, body)
	}
	var att kanban.Attachment
	if err := json.Unmarshal(body, &att); err != nil {
		t.Fatal(err)
	}
	if att.ID == "" || att.MIME != "image/png" {
		t.Fatalf("bad attachment %+v", att)
	}

	resp = do("GET", "/api/attachments/"+att.ID, nil)
	if resp.StatusCode != http.StatusOK || resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("inline status=%d type=%s", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	resp.Body.Close()
	resp = do("GET", "/api/attachments/"+att.ID+"/download", nil)
	if resp.StatusCode != http.StatusOK || !strings.Contains(resp.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("download status=%d disposition=%s", resp.StatusCode, resp.Header.Get("Content-Disposition"))
	}
	resp.Body.Close()

	resp, err = http.Get(srv.URL + "/api/attachments/" + att.ID)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauth status %d", resp.StatusCode)
	}
	resp.Body.Close()

	link := `{"attachment_id":"` + att.ID + `"}`
	resp = do("POST", "/api/boards/default/tasks/t1/attachments", strings.NewReader(link))
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("link status %d", resp.StatusCode)
	}
	resp = do("DELETE", "/api/attachments/"+att.ID, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("linked delete status %d", resp.StatusCode)
	}
	resp = do("DELETE", "/api/boards/default/tasks/t1/attachments/"+att.ID, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unlink status %d", resp.StatusCode)
	}
	resp = do("DELETE", "/api/attachments/"+att.ID, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("delete status %d", resp.StatusCode)
	}
	resp = do("GET", "/api/attachments/"+att.ID, nil)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("deleted fetch status %d", resp.StatusCode)
	}
}
