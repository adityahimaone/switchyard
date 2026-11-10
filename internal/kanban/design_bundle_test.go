package kanban

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDesignSliceStoreRoundTripAndImmutability(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ref := DoopRef{CanvasID: "canvas-1", FrameID: "frame-9", Version: "v7"}
	key := ref.Key()
	slice := &DesignSlice{
		Key:            key,
		Slug:           "default",
		DesignRef:      ref.Canonical(),
		DesignSource:   ref.DesignSourcePath(),
		CanvasID:       ref.CanvasID,
		FrameID:        ref.FrameID,
		Version:        ref.Version,
		ApprovalStatus: "ready_for_dev",
		Selectors:      NormalizeSelectors([]string{"#hero", " .pricing ", "#hero"}),
		Width:          1440,
		Height:         900,
	}
	if err := SaveDesignSlice(slice, "<section id=\"hero\">Hello</section>", []byte("PNG")); err != nil {
		t.Fatalf("SaveDesignSlice: %v", err)
	}
	loaded, dir, err := LoadDesignSlice("default", key)
	if err != nil {
		t.Fatalf("LoadDesignSlice: %v", err)
	}
	if loaded.DesignRef != ref.Canonical() {
		t.Errorf("design_ref = %q, want %q", loaded.DesignRef, ref.Canonical())
	}
	if loaded.HTMLBytes <= 0 || loaded.PNGBytes <= 0 {
		t.Errorf("bundle sizes were not recorded: %d/%d", loaded.HTMLBytes, loaded.PNGBytes)
	}
	if len(loaded.Selectors) != 2 || loaded.Selectors[0] != "#hero" || loaded.Selectors[1] != ".pricing" {
		t.Errorf("selectors = %v", loaded.Selectors)
	}
	html, err := LoadDesignSliceHTML("default", key)
	if err != nil || !strings.Contains(html, `id="hero"`) {
		t.Fatalf("LoadDesignSliceHTML = %q, %v", html, err)
	}
	png, err := LoadDesignSlicePNG("default", key)
	if err != nil || string(png) != "PNG" {
		t.Fatalf("LoadDesignSlicePNG = %q, %v", png, err)
	}
	for _, name := range []string{DesignSliceHTMLFile, DesignSlicePNGFile, DesignSliceMetaFile} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("bundle missing %s: %v", name, err)
		}
	}

	// A snapshot is immutable. Re-resolving the same frame version with newer
	// HTML must keep the original bytes — otherwise a card could be graded
	// against a design that changed after it was created.
	if err := SaveDesignSlice(slice, "<section>CHANGED</section>", []byte("NEW-PNG")); err != nil {
		t.Fatalf("second save: %v", err)
	}
	html, _ = LoadDesignSliceHTML("default", key)
	if !strings.Contains(html, "Hello") || strings.Contains(html, "CHANGED") {
		t.Errorf("snapshot was overwritten: %q", html)
	}
}

func TestDesignSliceStoreRejectsPathTraversal(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	for _, key := range []string{"", "../escape", "abcdef0123456789/extra", "ABCDEF0123456789"} {
		if _, err := DesignSliceDir("default", key); err == nil {
			t.Errorf("DesignSliceDir accepted key %q", key)
		}
	}
	for _, slug := range []string{"", "..", "../other", "a/b"} {
		if _, err := DesignSliceDir(slug, "0123456789abcdef"); err == nil {
			t.Errorf("DesignSliceDir accepted slug %q", slug)
		}
	}
	if _, err := LoadDesignSlicePNG("default", "../etc"); err == nil {
		t.Error("LoadDesignSlicePNG accepted a traversal key")
	}
}

func TestNormalizeSelectorsBoundsAndDedupes(t *testing.T) {
	in := []string{" #a ", "", "#a", strings.Repeat("x", 300)}
	for i := 0; i < 50; i++ {
		in = append(in, "#s"+string(rune('A'+i)))
	}
	out := NormalizeSelectors(in)
	if len(out) != 32 {
		t.Errorf("NormalizeSelectors returned %d, want the 32-item cap", len(out))
	}
	if out[0] != "#a" {
		t.Errorf("first selector = %q", out[0])
	}
}

func TestResolveDesignSliceSnapshotsAndCaches(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	srv, seen := fakeDoopMCP(t, true)
	defer srv.Close()
	cfg := DoopConfig{MCPURL: srv.URL + "/mcp", RESTURL: srv.URL, AgentKey: "dpk_test"}
	req := DesignSliceRequest{
		Slug:      "default",
		CanvasID:  "canvas-1",
		FrameID:   "frame-9",
		Selectors: []string{"#hero"},
	}
	first, cached, err := ResolveDesignSlice(context.Background(), cfg, req)
	if err != nil {
		t.Fatalf("ResolveDesignSlice: %v", err)
	}
	if cached {
		t.Error("first resolve reported a cache hit")
	}
	if first.Ref != "doop://canvas-1/frame-9@v7" {
		t.Errorf("ref = %q", first.Ref)
	}
	if first.HTMLBytes <= 0 || first.PNGBytes <= 0 {
		t.Errorf("bundle sizes = %d/%d", first.HTMLBytes, first.PNGBytes)
	}
	second, cached, err := ResolveDesignSlice(context.Background(), cfg, req)
	if err != nil || !cached || second.Key != first.Key {
		t.Fatalf("second resolve = %+v, cached=%v, err=%v", second, cached, err)
	}
	// The cache hit must not have re-rendered the PNG.
	screenshotCalls := 0
	for _, name := range *seen {
		if name == "get_frame_screenshot" {
			screenshotCalls++
		}
	}
	if screenshotCalls != 1 {
		t.Errorf("get_frame_screenshot called %d times, want 1", screenshotCalls)
	}
}
