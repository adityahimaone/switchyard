package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func createAvatarTestProfile(t *testing.T) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "profiles", "avatar-test")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte("model:\n  default: test\n  provider: custom\n"), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestProfileAvatarRoutesUseStoredRevisionAndCache(t *testing.T) {
	createAvatarTestProfile(t)
	gif := []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", "avatar.gif")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(gif); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	registerProfilesRoutes(mux)
	req := httptest.NewRequest(http.MethodPost, "/api/profiles/avatar-test/avatar", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	upload := httptest.NewRecorder()
	mux.ServeHTTP(upload, req)
	if upload.Code != http.StatusOK {
		t.Fatalf("upload returned %d: %s", upload.Code, upload.Body.String())
	}
	var profile kanban.AgentProfile
	if err := json.Unmarshal(upload.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(profile.AvatarURL, "?v=") {
		t.Fatalf("response avatar URL not revisioned: %q", profile.AvatarURL)
	}

	fetch := httptest.NewRecorder()
	mux.ServeHTTP(fetch, httptest.NewRequest(http.MethodGet, profile.AvatarURL, nil))
	if fetch.Code != http.StatusOK || fetch.Header().Get("Content-Type") != "image/gif" {
		t.Fatalf("fetch status=%d mime=%q", fetch.Code, fetch.Header().Get("Content-Type"))
	}
	if fetch.Header().Get("Cache-Control") != "private, max-age=31536000, immutable" {
		t.Fatalf("cache policy = %q", fetch.Header().Get("Cache-Control"))
	}
	if !bytes.Equal(fetch.Body.Bytes(), gif) {
		t.Fatal("served profile image differs from upload")
	}

	remove := httptest.NewRecorder()
	mux.ServeHTTP(remove, httptest.NewRequest(http.MethodDelete, "/api/profiles/avatar-test/avatar", nil))
	if remove.Code != http.StatusOK {
		t.Fatalf("delete returned %d: %s", remove.Code, remove.Body.String())
	}
}

func TestProfileAvatarURLRouteRejectsUnsafeURL(t *testing.T) {
	createAvatarTestProfile(t)
	mux := http.NewServeMux()
	registerProfilesRoutes(mux)
	body := strings.NewReader(`{"url":"https://127.0.0.1/avatar.png"}`)
	req := httptest.NewRequest(http.MethodPut, "/api/profiles/avatar-test/avatar-url", body)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, req)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("unsafe URL returned %d: %s", response.Code, response.Body.String())
	}
	read, err := kanban.GetProfile("avatar-test")
	if err != nil {
		t.Fatal(err)
	}
	if read.AvatarURL != "" {
		t.Fatalf("failed import changed profile avatar: %q", read.AvatarURL)
	}
}
