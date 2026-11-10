package main

// HTTP-level proof of the create-time boundary: a POST freezes the frame, the
// card fields come back ready to store, and the PNG is served from the local
// store. No worker or agent is involved in any of this.

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func doopSliceTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params struct {
				Name string `json:"name"`
			} `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		result := map[string]any{"content": []any{}}
		switch req.Params.Name {
		case "list_canvases":
			result["structuredContent"] = map[string]any{"canvases": []any{map[string]any{"id": "c1", "name": "Site"}}}
		case "get_canvas":
			result["structuredContent"] = map[string]any{"frames": []any{
				map[string]any{"id": "f1", "name": "Home", "approvalStatus": "ready_for_dev", "version": "v3", "width": 1280, "height": 800},
			}}
		case "get_frame":
			result["content"] = []any{map[string]any{"type": "text", "text": `{"frame":{"html":"<main>Home</main>","name":"Home","approvalStatus":"ready_for_dev","version":"v3","width":1280,"height":800}}`}}
		case "get_frame_screenshot":
			result["content"] = []any{map[string]any{"type": "image", "mimeType": "image/png", "data": base64.StdEncoding.EncodeToString([]byte("PNG-DATA"))}}
		case "get_guidelines":
			result["content"] = []any{map[string]any{"type": "text", "text": "Use tokens."}}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	}))
}

func TestDesignSliceRoutesEndToEnd(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	srv := doopSliceTestServer(t)
	defer srv.Close()
	t.Setenv("DOOP_MCP_URL", srv.URL+"/mcp")
	t.Setenv("DOOP_REST_URL", srv.URL)
	t.Setenv("DOOP_AGENT_KEY", "dpk_test")

	mux := http.NewServeMux()
	registerDesignSliceRoutes(mux)

	// The picker only offers frames a human approved.
	listReq := httptest.NewRequest(http.MethodGet, "/api/boards/default/design-frames", nil)
	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("design-frames: HTTP %d: %s", listRec.Code, listRec.Body.String())
	}
	var listed struct {
		Configured bool `json:"configured"`
		Frames     []struct {
			FrameID        string `json:"frame_id"`
			ApprovalStatus string `json:"approval_status"`
		} `json:"frames"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &listed); err != nil {
		t.Fatalf("decode frames: %v", err)
	}
	if !listed.Configured || len(listed.Frames) != 1 || listed.Frames[0].FrameID != "f1" {
		t.Fatalf("design-frames payload = %+v", listed)
	}

	// Freeze the frame.
	body := `{"provider":"doop","canvas_id":"c1","frame_id":"f1","selectors":["#hero"]}`
	postReq := httptest.NewRequest(http.MethodPost, "/api/boards/default/design-slices", strings.NewReader(body))
	postRec := httptest.NewRecorder()
	mux.ServeHTTP(postRec, postReq)
	if postRec.Code != http.StatusCreated {
		t.Fatalf("design-slices: HTTP %d: %s", postRec.Code, postRec.Body.String())
	}
	var created struct {
		Slice struct {
			Key          string   `json:"key"`
			DesignSource string   `json:"design_source"`
			Selectors    []string `json:"selectors"`
		} `json:"slice"`
		DesignRef      string `json:"design_ref"`
		DesignSource   string `json:"design_source"`
		DesignProvider string `json:"design_provider"`
		PreviewURL     string `json:"preview_url"`
		Cached         bool   `json:"cached"`
	}
	if err := json.Unmarshal(postRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode slice: %v", err)
	}
	if created.DesignProvider != "doop" || !strings.HasPrefix(created.DesignRef, "doop://c1/f1@") {
		t.Fatalf("card fields = %+v", created)
	}
	if !strings.HasPrefix(created.DesignSource, "design/doop/") || created.Slice.Key == "" {
		t.Fatalf("design_source = %q, key = %q", created.DesignSource, created.Slice.Key)
	}
	if len(created.Slice.Selectors) != 1 || created.Slice.Selectors[0] != "#hero" {
		t.Errorf("selectors = %v", created.Slice.Selectors)
	}
	if created.Cached {
		t.Error("first snapshot reported a cache hit")
	}

	// The PNG is served locally, never proxied through Doop.
	pngReq := httptest.NewRequest(http.MethodGet, created.PreviewURL, nil)
	pngRec := httptest.NewRecorder()
	mux.ServeHTTP(pngRec, pngReq)
	if pngRec.Code != http.StatusOK || pngRec.Body.String() != "PNG-DATA" {
		t.Errorf("PNG: HTTP %d, body %q", pngRec.Code, pngRec.Body.String())
	}
	if got := pngRec.Header().Get("Content-Type"); got != "image/png" {
		t.Errorf("PNG Content-Type = %q", got)
	}

	// Frame HTML is untrusted authored markup; it must ship with a sandbox CSP.
	htmlReq := httptest.NewRequest(http.MethodGet, "/api/boards/default/design-slices/"+created.Slice.Key+"/frame.html", nil)
	htmlRec := httptest.NewRecorder()
	mux.ServeHTTP(htmlRec, htmlReq)
	if htmlRec.Code != http.StatusOK || !strings.Contains(htmlRec.Body.String(), "<main>Home</main>") {
		t.Errorf("HTML: HTTP %d, body %q", htmlRec.Code, htmlRec.Body.String())
	}
	if !strings.Contains(htmlRec.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Error("frame.html is served without a sandbox CSP")
	}

	// A second identical request is a cache hit and does not re-render.
	postReq2 := httptest.NewRequest(http.MethodPost, "/api/boards/default/design-slices", strings.NewReader(body))
	postRec2 := httptest.NewRecorder()
	mux.ServeHTTP(postRec2, postReq2)
	if postRec2.Code != http.StatusCreated || !strings.Contains(postRec2.Body.String(), `"cached":true`) {
		t.Errorf("second snapshot was not cached: HTTP %d, %s", postRec2.Code, postRec2.Body.String())
	}
}

func TestDesignSliceRoutesUnconfigured(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("DOOP_AGENT_KEY", "")
	t.Setenv("DOOP_MCP_URL", "http://127.0.0.1:1/mcp")
	mux := http.NewServeMux()
	registerDesignSliceRoutes(mux)

	listRec := httptest.NewRecorder()
	mux.ServeHTTP(listRec, httptest.NewRequest(http.MethodGet, "/api/boards/default/design-frames", nil))
	if listRec.Code != http.StatusOK || !strings.Contains(listRec.Body.String(), `"configured":false`) {
		t.Errorf("unconfigured list = HTTP %d, %s", listRec.Code, listRec.Body.String())
	}
	postRec := httptest.NewRecorder()
	mux.ServeHTTP(postRec, httptest.NewRequest(http.MethodPost, "/api/boards/default/design-slices",
		strings.NewReader(`{"canvas_id":"c","frame_id":"f"}`)))
	if postRec.Code != http.StatusServiceUnavailable {
		t.Errorf("unconfigured snapshot = HTTP %d, want 503", postRec.Code)
	}
}
