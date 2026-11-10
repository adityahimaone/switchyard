package main

// The dispatcher half of the Doop loop: an immutable snapshot must travel in
// the prompt as a self-contained contract, and a missing snapshot must fail
// loud instead of letting the agent invent a UI.

import (
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

	got := appendDoopDesignReference("Build the pricing screen", "default", ref.Canonical())
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
	missing := appendDoopDesignReference("Build it", "default", "doop://c/f@v1")
	if !strings.Contains(missing, "missing from the control-plane store") || !strings.Contains(missing, "Do NOT") {
		t.Errorf("missing snapshot did not fail loud: %s", missing)
	}
	invalid := appendDoopDesignReference("Build it", "default", "https://doop.design/c/x")
	if !strings.Contains(invalid, "invalid") || !strings.Contains(invalid, "Do NOT invent") {
		t.Errorf("invalid ref did not fail loud: %s", invalid)
	}
}
