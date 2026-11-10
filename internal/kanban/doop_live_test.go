package kanban

// Opt-in integration test against a real Doop instance.
//
// It is skipped unless an agent key is available (DOOP_AGENT_KEY, or a
// ~/.hermes/doop.env resolved through HERMES_HOME). The unit tests use a fake
// MCP server, which cannot prove the one thing most likely to break: the exact
// payload shape a beta Doop build returns for get_canvas / get_frame.

import (
	"context"
	"testing"
	"time"
)

func TestDoopLiveListCanvases(t *testing.T) {
	cfg := DoopConfigFromEnv()
	if !cfg.Configured() {
		t.Skip("no Doop agent key configured (set DOOP_AGENT_KEY or ~/.hermes/doop.env)")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client := NewDoopClient(cfg)

	canvases, err := client.ListCanvases(ctx)
	if err != nil {
		t.Fatalf("ListCanvases against %s: %v", cfg.MCPURL, err)
	}
	t.Logf("canvases=%d", len(canvases))
	for _, c := range canvases {
		t.Logf("  canvas id=%q name=%q", c.ID, c.Name)
	}
	if len(canvases) == 0 {
		t.Log("no canvases on this account; nothing further to check")
		return
	}

	// Scan every canvas: an account usually has several, and the picker must
	// find approved frames wherever they are.
	totalReady := 0
	for _, c := range canvases {
		frames, err := client.ListReadyFrames(ctx, c.ID)
		if err != nil {
			t.Errorf("ListReadyFrames(%s): %v", c.ID, err)
			continue
		}
		totalReady += len(frames)
		all, allErr := client.ListFrames(ctx, c.ID, "")
		if allErr != nil {
			t.Errorf("ListFrames(%s): %v", c.ID, allErr)
			continue
		}
		t.Logf("frames on %q: ready=%d all=%d", c.Name, len(frames), len(all))
		for _, f := range frames {
			t.Logf("  frame id=%q name=%q %dx%d version=%q status=%q", f.FrameID, f.Name, f.Width, f.Height, f.Version, f.ApprovalStatus)
		}
	}

	if totalReady == 0 {
		// Nothing is approved yet. Dump a truncated raw payload so the parser's
		// assumptions can be checked against what this Doop build really sends.
		raw, _, err := client.CallTool(ctx, "get_canvas", map[string]any{"canvas_id": canvases[0].ID})
		if err != nil {
			t.Fatalf("raw get_canvas: %v", err)
		}
		if len(raw) > 1500 {
			raw = raw[:1500] + "…"
		}
		t.Logf("no approved frames; raw get_canvas sample: %s", raw)
		return
	}

	for _, c := range canvases {
		frames, err := client.ListReadyFrames(ctx, c.ID)
		if err != nil || len(frames) == 0 {
			continue
		}
		frame, err := client.GetFrame(ctx, c.ID, frames[0].FrameID)
		if err != nil {
			t.Fatalf("GetFrame(%s): %v", frames[0].FrameID, err)
		}
		if frame.HTML == "" {
			t.Fatalf("GetFrame(%s) returned no HTML", frames[0].FrameID)
		}
		t.Logf("get_frame ok: %q html=%d bytes version=%q", frame.Name, len(frame.HTML), frame.Version)
		return
	}
}
