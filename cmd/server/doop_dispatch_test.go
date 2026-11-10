package main

// The dispatcher half of the Doop loop: an immutable snapshot must travel in
// the prompt as a self-contained contract, and a missing snapshot must fail
// loud instead of letting the agent invent a UI.

import (
	"fmt"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

func saveTestSlice(t *testing.T, ref kanban.DoopRef, html string, selectors []string) {
	t.Helper()
	slice := &kanban.DesignSlice{
		Key:            ref.Key(),
		Slug:           "default",
		DesignRef:      ref.Canonical(),
		DesignSource:   ref.DesignSourcePath(),
		CanvasID:       ref.CanvasID,
		FrameID:        ref.FrameID,
		FrameName:      "Pricing",
		Version:        ref.Version,
		ApprovalStatus: "ready_for_dev",
		Selectors:      selectors,
		Width:          1440,
		Height:         900,
		Guidelines:     "One accent. 8pt rhythm.",
	}
	if err := kanban.SaveDesignSlice(slice, html, []byte("PNG")); err != nil {
		t.Fatalf("SaveDesignSlice: %v", err)
	}
}

func TestAppendDoopDesignReferenceInlinesTheSnapshot(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ref := kanban.DoopRef{CanvasID: "canvas-1", FrameID: "frame-9", Version: "v7"}
	saveTestSlice(t, ref, `<section id="hero">Hello</section>`, []string{"#hero", ".price"})

	got := appendDoopDesignReference("Build the pricing screen", "default", ref.Canonical(), false)
	for _, want := range []string{
		"Build the pricing screen",
		"--- Design Reference (Doop frame, immutable snapshot) ---",
		ref.Canonical(),
		`<section id="hero">Hello</section>`,
		"Do NOT call Doop",
		"#hero, .price",
		"One accent. 8pt rhythm.",
		"verify:ui",
		"--- End Design Reference ---",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("prompt missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "pen.dev") || strings.Contains(got, "pen --out") {
		t.Errorf("doop prompt picked up pen.dev generator instructions:\n%s", got)
	}
}

func TestAppendDoopDesignReferenceFailsLoud(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	missing := appendDoopDesignReference("Build it", "default", "doop://c/f@v1", false)
	if !strings.Contains(missing, "missing from the control-plane store") || !strings.Contains(missing, "Do NOT") {
		t.Errorf("missing snapshot did not fail loud: %s", missing)
	}
	invalid := appendDoopDesignReference("Build it", "default", "https://doop.design/c/x", false)
	if !strings.Contains(invalid, "invalid") || !strings.Contains(invalid, "Do NOT invent") {
		t.Errorf("invalid ref did not fail loud: %s", invalid)
	}
}

// TestAppendDoopDesignReferenceContinuationSkipsMarkup pins the cost rule: a
// review continuation must not re-send a design the agent already has.
func TestAppendDoopDesignReferenceContinuationSkipsMarkup(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ref := kanban.DoopRef{CanvasID: "canvas-1", FrameID: "frame-9", Version: "v7"}
	html := `<section id="hero">Hello</section>`
	saveTestSlice(t, ref, html, []string{"#hero"})

	got := appendDoopDesignReference("Address the review comment", "default", ref.Canonical(), true)
	if strings.Contains(got, html) || strings.Contains(got, "--- frame.html ---") {
		t.Errorf("continuation re-sent the frame markup:\n%s", got)
	}
	for _, want := range []string{"unchanged from your previous turn", ref.Canonical(), "--- End Design Reference ---"} {
		if !strings.Contains(got, want) {
			t.Errorf("continuation prompt missing %q:\n%s", want, got)
		}
	}
}

// TestAppendDoopDesignReferenceDigestsOversizedFrames proves a frame above the
// inline budget gets a structural digest, never a silent mid-document cut.
func TestAppendDoopDesignReferenceDigestsOversizedFrames(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ref := kanban.DoopRef{CanvasID: "canvas-1", FrameID: "big", Version: "v1"}
	var b strings.Builder
	b.WriteString(`<main id="pricing">`)
	for i := 0; b.Len() < maxInlineDesignHTML+1024; i++ {
		fmt.Fprintf(&b, `<div class="card tier-%d" id="tier-%d">Plan %d includes seats</div>`, i%7, i, i)
	}
	b.WriteString(`</main>`)
	saveTestSlice(t, ref, b.String(), nil)

	got := appendDoopDesignReference("Build pricing", "default", ref.Canonical(), false)
	if strings.Contains(got, "--- frame.html ---") {
		t.Error("oversized frame was inlined instead of digested")
	}
	if !strings.Contains(got, "--- design digest ---") {
		t.Error("no digest block for an oversized frame")
	}
	if !strings.Contains(got, "ids: #pricing, #tier-0") {
		t.Errorf("digest did not list element ids:\n%.400s", got)
	}
	if !strings.Contains(got, "too large to inline") {
		t.Error("prompt did not explain why it got a digest")
	}
	if strings.Contains(got, "truncated for the dispatch prompt") {
		t.Error("prompt still contains the old silent-truncation marker")
	}
}
