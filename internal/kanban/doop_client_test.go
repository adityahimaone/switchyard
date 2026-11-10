package kanban

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// fakeDoopMCP is a stateless /mcp endpoint that answers the four tools the
// design flow uses. It deliberately returns different result shapes —
// structuredContent, a text block holding JSON, and an image block — because
// Doop is beta and the client must not depend on one exact envelope.
func fakeDoopMCP(t *testing.T, withImage bool) (*httptest.Server, *[]string) {
	t.Helper()
	seen := &[]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("MCP call used %s, want POST", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer dpk_test" {
			t.Errorf("Authorization = %q, want the agent key", got)
		}
		if !strings.HasSuffix(r.URL.Path, "/mcp") {
			t.Errorf("MCP path = %q", r.URL.Path)
		}
		var req struct {
			Method string `json:"method"`
			Params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			} `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		*seen = append(*seen, req.Params.Name)
		if req.Method != "tools/call" {
			t.Errorf("method = %q, want tools/call", req.Method)
		}

		content := []map[string]any{}
		var structured any
		switch req.Params.Name {
		case "list_canvases":
			structured = map[string]any{"canvases": []any{
				map[string]any{"id": "canvas-1", "name": "Marketing"},
			}}
		case "get_canvas":
			if req.Params.Arguments["approval_status"] != "ready_for_dev" {
				t.Errorf("get_canvas did not filter on ready_for_dev: %v", req.Params.Arguments)
			}
			structured = map[string]any{"canvas": map[string]any{"frames": []any{
				map[string]any{"id": "frame-9", "name": "Pricing", "approvalStatus": "ready_for_dev", "version": "v7", "width": 1440, "height": 900},
			}}}
		case "get_frame":
			// A text block holding JSON exercises the non-structuredContent path.
			content = append(content, map[string]any{"type": "text", "text": `{"frame":{"id":"frame-9","name":"Pricing","html":"<section id=\"hero\">Hello</section>","approvalStatus":"ready_for_dev","version":"v7","width":1440,"height":900}}`})
		case "get_frame_screenshot":
			if withImage {
				content = append(content, map[string]any{
					"type": "image", "mimeType": "image/png",
					"data": base64.StdEncoding.EncodeToString([]byte("PNG-BYTES")),
				})
			} else {
				content = append(content, map[string]any{"type": "text", "text": "no image in this build"})
			}
		case "get_guidelines":
			content = append(content, map[string]any{"type": "text", "text": "One accent. 8pt rhythm."})
		default:
			t.Errorf("unexpected tool %q", req.Params.Name)
		}
		result := map[string]any{"content": content}
		if structured != nil {
			result["structuredContent"] = structured
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	}))
	return srv, seen
}

func TestDoopClientToolShapes(t *testing.T) {
	srv, _ := fakeDoopMCP(t, true)
	defer srv.Close()
	cfg := DoopConfig{MCPURL: srv.URL + "/mcp", RESTURL: srv.URL, AgentKey: "dpk_test"}
	client := NewDoopClient(cfg)
	ctx := context.Background()

	canvases, err := client.ListCanvases(ctx)
	if err != nil || len(canvases) != 1 || canvases[0].ID != "canvas-1" {
		t.Fatalf("ListCanvases = %+v, %v", canvases, err)
	}
	frames, err := client.ListReadyFrames(ctx, "canvas-1")
	if err != nil || len(frames) != 1 {
		t.Fatalf("ListReadyFrames = %+v, %v", frames, err)
	}
	if frames[0].FrameID != "frame-9" || frames[0].Width != 1440 || frames[0].ApprovalStatus != "ready_for_dev" {
		t.Errorf("frame parsed incorrectly: %+v", frames[0])
	}
	frame, err := client.GetFrame(ctx, "canvas-1", "frame-9")
	if err != nil {
		t.Fatalf("GetFrame: %v", err)
	}
	if !strings.Contains(frame.HTML, `id="hero"`) {
		t.Errorf("GetFrame lost the HTML: %q", frame.HTML)
	}
	if frame.Version != "v7" || frame.Height != 900 {
		t.Errorf("GetFrame metadata = %+v", frame)
	}
	png, err := client.Screenshot(ctx, "frame-9")
	if err != nil || string(png) != "PNG-BYTES" {
		t.Errorf("Screenshot = %q, %v", png, err)
	}
	if got := client.GetGuidelines(ctx, "canvas-1"); !strings.Contains(got, "8pt") {
		t.Errorf("GetGuidelines = %q", got)
	}
}

// TestDoopListFramesRealShape pins the payload shape the live API actually
// returns: frames is a SIBLING of canvas, and get_frame is flat (no "frame"
// wrapper). The nested shape is covered by fakeDoopMCP; this one is the
// regression guard for the shape that shipped and broke the picker.
func TestDoopListFramesRealShape(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			} `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var structured any
		switch req.Params.Name {
		case "get_canvas":
			frames := []any{
				map[string]any{"id": "f1", "name": "Home", "width": 1280, "height": 800, "image_url": "https://doop.design/i/f1.png", "empty": false},
				map[string]any{"id": "f2", "name": "Empty", "empty": true},
			}
			// The real filter returns no frames when nothing is approved.
			if req.Params.Arguments["approval_status"] == "ready_for_dev" {
				frames = []any{}
			}
			structured = map[string]any{
				"canvas": map[string]any{"id": "c1", "name": "Site", "url": "https://doop.design/c/c1"},
				"frames": frames,
			}
		case "get_frame":
			structured = map[string]any{
				"id": "f1", "name": "Home", "html": "<main>Home</main>",
				"approvalStatus": "ready_for_dev", "updatedAt": float64(1793862752615),
				"width": 1280, "height": 800,
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"structuredContent": structured}})
	}))
	defer srv.Close()
	client := NewDoopClient(DoopConfig{MCPURL: srv.URL, AgentKey: "dpk_test"})
	ctx := context.Background()

	ready, err := client.ListReadyFrames(ctx, "c1")
	if err != nil {
		t.Fatalf("ListReadyFrames: %v", err)
	}
	if len(ready) != 0 {
		t.Errorf("ready frames = %d, want 0 for an unapproved canvas", len(ready))
	}

	all, err := client.ListFrames(ctx, "c1", "")
	if err != nil {
		t.Fatalf("ListFrames: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("frames = %d, want 1 (empty frames are skipped)", len(all))
	}
	if all[0].FrameID != "f1" || all[0].Width != 1280 || all[0].PreviewURL == "" {
		t.Errorf("frame parsed incorrectly: %+v", all[0])
	}

	frame, err := client.GetFrame(ctx, "c1", "f1")
	if err != nil {
		t.Fatalf("GetFrame: %v", err)
	}
	if frame.HTML != "<main>Home</main>" {
		t.Errorf("flat get_frame HTML = %q", frame.HTML)
	}
	if frame.Version != "1793862752615" {
		t.Errorf("version = %q, want the integer-formatted updatedAt", frame.Version)
	}
	if frame.ApprovalStatus != "ready_for_dev" {
		t.Errorf("approval = %q", frame.ApprovalStatus)
	}
}

func TestDoopClientScreenshotRESTFallback(t *testing.T) {
	srv, _ := fakeDoopMCP(t, false)
	defer srv.Close()
	// The REST renderer lives on the same origin; the fake MCP handler answers
	// it with a PNG body.
	client := NewDoopClient(DoopConfig{MCPURL: srv.URL + "/mcp", RESTURL: srv.URL, AgentKey: "dpk_test"})
	// Point the fallback at a dedicated server so the MCP stub is not asked to
	// serve a binary response.
	rest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/frames/frame-9/screenshot.png" || r.URL.Query().Get("scale") != "1" {
			t.Errorf("REST screenshot path = %s?%s", r.URL.Path, r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("REST-PNG"))
	}))
	defer rest.Close()
	client.cfg.RESTURL = rest.URL
	png, err := client.Screenshot(context.Background(), "frame-9")
	if err != nil || string(png) != "REST-PNG" {
		t.Fatalf("Screenshot fallback = %q, %v", png, err)
	}
}

func TestDoopClientAuthAndErrors(t *testing.T) {
	unconfigured := NewDoopClient(DoopConfig{MCPURL: "http://127.0.0.1:1/mcp"})
	if _, err := unconfigured.ListCanvases(context.Background()); err == nil || !strings.Contains(err.Error(), "DOOP_AGENT_KEY") {
		t.Errorf("unconfigured client error = %v", err)
	}
	deny := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer deny.Close()
	client := NewDoopClient(DoopConfig{MCPURL: deny.URL, AgentKey: "dpk_test"})
	if _, err := client.ListCanvases(context.Background()); err == nil || !strings.Contains(err.Error(), "rejected") {
		t.Errorf("401 handling = %v", err)
	}
}

// TestDoopConfigFromEnvFile covers the no-restart credential path: a key added
// to ~/.hermes/doop.env is picked up on the next request, and a real
// environment variable still wins over the file.
func TestDoopConfigFromEnvFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("DOOP_AGENT_KEY", "")
	t.Setenv("DOOP_MCP_URL", "")
	t.Setenv("DOOP_REST_URL", "")

	if err := os.WriteFile(DoopEnvFilePath(), []byte("# doop\nDOOP_AGENT_KEY=\"dpk_file\"\nexport DOOP_MCP_URL=http://100.80.1.2:4400/mcp\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := DoopConfigFromEnv()
	if cfg.AgentKey != "dpk_file" {
		t.Errorf("agent key = %q, want the env-file value", cfg.AgentKey)
	}
	if cfg.MCPURL != "http://100.80.1.2:4400/mcp" {
		t.Errorf("mcp url = %q", cfg.MCPURL)
	}
	if cfg.RESTURL != "http://100.80.1.2:4400" {
		t.Errorf("rest url = %q, want it derived from the file's MCP url", cfg.RESTURL)
	}

	t.Setenv("DOOP_AGENT_KEY", "dpk_env")
	if got := DoopConfigFromEnv().AgentKey; got != "dpk_env" {
		t.Errorf("process env did not win over the file: %q", got)
	}
}

func TestDoopRESTBaseDerivation(t *testing.T) {
	cases := map[string]string{
		"https://doop.design/mcp":       "https://doop.design",
		"http://100.80.1.2:4400/mcp":    "http://100.80.1.2:4400",
		"https://doop.example.com/mcp/": "https://doop.example.com",
	}
	for in, want := range cases {
		if got := doopRESTBase(in); got != want {
			t.Errorf("doopRESTBase(%q) = %q, want %q", in, got, want)
		}
	}
}
