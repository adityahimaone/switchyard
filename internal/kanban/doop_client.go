package kanban

// A small, dependency-free client for Doop's stateless streamable-HTTP MCP
// server. Doop's /mcp endpoint is POST-only, answers with plain JSON (not SSE),
// and authenticates headless clients with an agent key sent as a bearer token.
//
// The client is intentionally tolerant about result shapes: Doop is beta and
// tool payloads move between releases. A tool result may arrive as
// `structuredContent`, as a text content block holding JSON, or as bare text.
// All three are normalised into one raw JSON/text payload before parsing.
//
// Credentials live only on the control plane. Nothing in this file is ever
// embedded in a dispatch prompt, job payload or log line.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultDoopMCPURL = "https://doop.design/mcp"
	doopRequestTimeout = 20 * time.Second
	maxDoopPayloadBytes = 4 << 20
)

// DoopConfig is resolved from the environment once per call site.
type DoopConfig struct {
	MCPURL   string
	RESTURL  string
	AgentKey string
}

// DoopConfigFromEnv reads the control-plane-only Doop credentials. Staging is a
// URL change: hosted `https://doop.design/mcp` first, local tailnet `:4400/mcp`
// later. The card contract does not change when that flips.
//
// An unset variable falls back to ~/.hermes/doop.env, the same one-file-per-
// credential pattern node-agent already uses for its token. That fallback is
// not a convenience: adding a secret to a live PM2 process with
// `pm2 restart --update-env` replaces the process environment with the calling
// shell's, which would drop the HERMES_* vars the service was started with. A
// 0600 env file can be added and picked up on the next request instead.
func DoopConfigFromEnv() DoopConfig {
	cfg := DoopConfig{
		MCPURL:   doopSetting("DOOP_MCP_URL"),
		RESTURL:  doopSetting("DOOP_REST_URL"),
		AgentKey: doopSetting("DOOP_AGENT_KEY"),
	}
	if cfg.MCPURL == "" {
		cfg.MCPURL = DefaultDoopMCPURL
	}
	if cfg.RESTURL == "" {
		cfg.RESTURL = doopRESTBase(cfg.MCPURL)
	}
	return cfg
}

// DoopEnvFilePath is the credential file an operator can write without
// restarting the service.
func DoopEnvFilePath() string { return filepath.Join(hermesHome(), "doop.env") }

// doopSetting prefers the process environment, then the env file. The file is
// read on every call (it is a few hundred bytes) so a key added after startup
// takes effect on the next request rather than the next deploy.
func doopSetting(key string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return doopEnvFile()[key]
}

func doopEnvFile() map[string]string {
	out := map[string]string{}
	raw, err := os.ReadFile(DoopEnvFilePath())
	if err != nil || len(raw) > 64<<10 {
		return out
	}
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		eq := strings.IndexByte(line, '=')
		if eq <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		value := strings.TrimSpace(line[eq+1:])
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		out[key] = value
	}
	return out
}

func (c DoopConfig) Configured() bool { return c.AgentKey != "" }

func doopRESTBase(mcpURL string) string {
	base := strings.TrimSuffix(strings.TrimSpace(mcpURL), "/")
	base = strings.TrimSuffix(base, "/mcp")
	return strings.TrimSuffix(base, "/")
}

// DoopFrame is the subset of a Doop frame the design picker and snapshot need.
type DoopFrame struct {
	CanvasID       string `json:"canvas_id"`
	FrameID        string `json:"frame_id"`
	Name           string `json:"name"`
	ApprovalStatus string `json:"approval_status"`
	Version        string `json:"version"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	HTML           string `json:"html,omitempty"`
	PreviewURL     string `json:"preview_url,omitempty"`
}

// DoopCanvas is one canvas returned by list_canvases.
type DoopCanvas struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// DoopClient talks to one Doop instance.
type DoopClient struct {
	cfg  DoopConfig
	http *http.Client
}

func NewDoopClient(cfg DoopConfig) *DoopClient {
	return &DoopClient{cfg: cfg, http: &http.Client{Timeout: doopRequestTimeout}}
}

// mcpEnvelope models the parts of a JSON-RPC tool result we consume.
type mcpEnvelope struct {
	Result struct {
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text"`
			Data     string `json:"data"`
			MimeType string `json:"mimeType"`
		} `json:"content"`
		StructuredContent json.RawMessage `json:"structuredContent"`
		IsError           bool            `json:"isError"`
	} `json:"result"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// CallTool invokes one MCP tool and returns its normalised payload. The text
// form is only used when structuredContent is absent; image blocks are exposed
// separately through imageData.
func (c *DoopClient) CallTool(ctx context.Context, name string, args map[string]any) (text string, image []byte, err error) {
	if !c.cfg.Configured() {
		return "", nil, fmt.Errorf("doop is not configured: set DOOP_AGENT_KEY on the control plane")
	}
	if args == nil {
		args = map[string]any{}
	}
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/call",
		"params":  map[string]any{"name": name, "arguments": args},
	})
	if err != nil {
		return "", nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.MCPURL, strings.NewReader(string(body)))
	if err != nil {
		return "", nil, fmt.Errorf("doop %s: %w", name, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.AgentKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("doop %s: %w", name, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxDoopPayloadBytes))
	if err != nil {
		return "", nil, fmt.Errorf("doop %s: read: %w", name, err)
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", nil, fmt.Errorf("doop %s: agent key rejected (HTTP %d)", name, resp.StatusCode)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", nil, fmt.Errorf("doop %s: HTTP %d: %s", name, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var env mcpEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return "", nil, fmt.Errorf("doop %s: invalid JSON-RPC response: %w", name, err)
	}
	if env.Error != nil {
		return "", nil, fmt.Errorf("doop %s: %s (code %d)", name, env.Error.Message, env.Error.Code)
	}
	if env.Result.IsError {
		return "", nil, fmt.Errorf("doop %s: tool reported an error", name)
	}
	if len(env.Result.StructuredContent) > 0 && string(env.Result.StructuredContent) != "null" {
		text = string(env.Result.StructuredContent)
	}
	var texts []string
	for _, part := range env.Result.Content {
		if part.Type == "image" && part.Data != "" {
			if decoded, decodeErr := base64.StdEncoding.DecodeString(part.Data); decodeErr == nil {
				image = decoded
			}
			continue
		}
		if part.Text != "" {
			texts = append(texts, part.Text)
		}
	}
	if text == "" {
		text = strings.Join(texts, "\n")
	}
	return strings.TrimSpace(text), image, nil
}

// asObject extracts a JSON object from a tool payload, walking one level into
// the common wrappers Doop uses (frame, canvas, result, data).
func asObject(payload string) map[string]any {
	payload = strings.TrimSpace(payload)
	var obj map[string]any
	if json.Unmarshal([]byte(payload), &obj) == nil {
		return obj
	}
	var arr []any
	if json.Unmarshal([]byte(payload), &arr) == nil && len(arr) > 0 {
		if first, ok := arr[0].(map[string]any); ok {
			return map[string]any{"items": arr, "_first": first}
		}
	}
	return nil
}

func nested(obj map[string]any, key string) map[string]any {
	if obj == nil {
		return nil
	}
	if child, ok := obj[key].(map[string]any); ok {
		return child
	}
	return nil
}

func stringField(obj map[string]any, keys ...string) string {
	if obj == nil {
		return ""
	}
	for _, key := range keys {
		if v, ok := obj[key].(string); ok && v != "" {
			return v
		}
		if v, ok := obj[key].(float64); ok {
			// updatedAt is a millisecond epoch. %v would render it as
			// 1.793862752615e+12, which is a legal but ugly design_ref version
			// and unstable across JSON round-trips.
			if v == math.Trunc(v) {
				return strconv.FormatInt(int64(v), 10)
			}
			return strconv.FormatFloat(v, 'f', -1, 64)
		}
	}
	return ""
}

func intField(obj map[string]any, keys ...string) int {
	if obj == nil {
		return 0
	}
	for _, key := range keys {
		switch v := obj[key].(type) {
		case float64:
			return int(v)
		case int:
			return v
		case string:
			var n int
			if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
				return n
			}
		}
	}
	return 0
}

func itemArray(obj map[string]any, keys ...string) []any {
	if obj == nil {
		return nil
	}
	for _, key := range keys {
		if arr, ok := obj[key].([]any); ok {
			return arr
		}
	}
	if arr, ok := obj["items"].([]any); ok {
		return arr
	}
	return nil
}

// ListCanvases returns the canvases on this Doop instance.
func (c *DoopClient) ListCanvases(ctx context.Context) ([]DoopCanvas, error) {
	payload, _, err := c.CallTool(ctx, "list_canvases", nil)
	if err != nil {
		return nil, err
	}
	obj := asObject(payload)
	out := []DoopCanvas{}
	for _, raw := range itemArray(obj, "canvases", "items") {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := stringField(item, "id", "canvas_id", "canvasId")
		if id == "" {
			continue
		}
		out = append(out, DoopCanvas{ID: id, Name: stringField(item, "name", "title")})
	}
	return out, nil
}

// ListReadyFrames returns frames marked ready_for_dev. approval_status is a
// Doop get_canvas filter, so the human sign-off is enforced before a card can
// be created from a frame.
func (c *DoopClient) ListReadyFrames(ctx context.Context, canvasID string) ([]DoopFrame, error) {
	return c.ListFrames(ctx, canvasID, "ready_for_dev")
}

// ListFrames reads a canvas's frames, optionally filtered by approval status.
// An empty status returns every frame — used by the picker's explicit
// "no approved frames yet" fallback, never as a silent default.
//
// The real payload is {"canvas": {...}, "frames": [...]} — frames is a SIBLING
// of canvas, not a child. Doop is beta and a build may nest it, so both shapes
// are accepted; the top-level array is checked first because that is what the
// live API returns.
func (c *DoopClient) ListFrames(ctx context.Context, canvasID, approvalStatus string) ([]DoopFrame, error) {
	args := map[string]any{"canvas_id": canvasID}
	if strings.TrimSpace(approvalStatus) != "" {
		args["approval_status"] = approvalStatus
	}
	payload, _, err := c.CallTool(ctx, "get_canvas", args)
	if err != nil {
		return nil, err
	}
	obj := asObject(payload)
	if obj == nil {
		return []DoopFrame{}, nil
	}
	rawFrames := itemArray(obj, "frames")
	if rawFrames == nil {
		for _, key := range []string{"canvas", "result", "data"} {
			if child := nested(obj, key); child != nil {
				if arr := itemArray(child, "frames"); arr != nil {
					rawFrames = arr
					break
				}
			}
		}
	}
	out := []DoopFrame{}
	for _, raw := range rawFrames {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := stringField(item, "id", "frame_id", "frameId")
		if id == "" {
			continue
		}
		if empty, ok := item["empty"].(bool); ok && empty {
			continue
		}
		out = append(out, DoopFrame{
			CanvasID:       canvasID,
			FrameID:        id,
			Name:           stringField(item, "name", "title"),
			ApprovalStatus: stringField(item, "approvalStatus", "approval_status"),
			Version:        stringField(item, "version", "updatedAt", "updated_at"),
			Width:          intField(item, "width", "w"),
			Height:         intField(item, "height", "h"),
			PreviewURL:     stringField(item, "image_url", "imageUrl"),
		})
	}
	return out, nil
}

// GetFrame reads one frame including its HTML.
func (c *DoopClient) GetFrame(ctx context.Context, canvasID, frameID string) (DoopFrame, error) {
	payload, _, err := c.CallTool(ctx, "get_frame", map[string]any{
		"canvas_id": canvasID,
		"frame_id":  frameID,
	})
	if err != nil {
		return DoopFrame{}, err
	}
	frame := DoopFrame{CanvasID: canvasID, FrameID: frameID}
	obj := asObject(payload)
	if obj == nil {
		// A bare string payload is the frame HTML itself.
		frame.HTML = payload
		return frame, nil
	}
	for _, key := range []string{"frame", "result", "data"} {
		if child := nested(obj, key); child != nil {
			obj = child
			break
		}
	}
	frame.HTML = stringField(obj, "html", "frameHtml", "frame_html", "content")
	if frame.HTML == "" {
		frame.HTML = payload
	}
	frame.Name = stringField(obj, "name", "title")
	frame.ApprovalStatus = stringField(obj, "approvalStatus", "approval_status")
	frame.Version = stringField(obj, "version", "updatedAt", "updated_at")
	frame.Width = intField(obj, "width", "w")
	frame.Height = intField(obj, "height", "h")
	return frame, nil
}

// Screenshot returns a scale-1 PNG of a frame. It prefers the MCP tool and
// falls back to the documented REST renderer when the tool returns no image.
func (c *DoopClient) Screenshot(ctx context.Context, frameID string) ([]byte, error) {
	_, image, err := c.CallTool(ctx, "get_frame_screenshot", map[string]any{
		"frame_id": frameID,
		"scale":    1,
	})
	if err == nil && len(image) > 0 {
		return image, nil
	}
	endpoint := c.cfg.RESTURL + "/api/frames/" + url.PathEscape(frameID) + "/screenshot.png?scale=1"
	req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if reqErr != nil {
		return nil, fmt.Errorf("doop screenshot: %w", reqErr)
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.AgentKey)
	resp, doErr := c.http.Do(req)
	if doErr != nil {
		if err != nil {
			return nil, fmt.Errorf("doop screenshot: MCP: %v; REST: %w", err, doErr)
		}
		return nil, fmt.Errorf("doop screenshot: %w", doErr)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("doop screenshot: REST HTTP %d", resp.StatusCode)
	}
	data, readErr := io.ReadAll(io.LimitReader(resp.Body, maxDoopPayloadBytes))
	if readErr != nil {
		return nil, fmt.Errorf("doop screenshot: %w", readErr)
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("doop screenshot: empty PNG")
	}
	return data, nil
}

// GetGuidelines is best-effort: a missing style guide must not fail a snapshot.
func (c *DoopClient) GetGuidelines(ctx context.Context, canvasID string) string {
	payload, _, err := c.CallTool(ctx, "get_guidelines", map[string]any{"canvas_id": canvasID})
	if err != nil {
		return ""
	}
	return payload
}
