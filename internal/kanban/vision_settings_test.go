package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAttachmentAnalysisSettingsRoundTrip(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	want := AttachmentAnalysisConfig{
		Mode:              "auto",
		DedicatedModel:    "gemini-2.5-flash",
		DedicatedProvider: "9router",
		FallbackOnError:   true,
		Overrides: map[string]ModelCapability{
			"codex": {Vision: true, PDF: true},
		},
	}
	if err := SaveAttachmentAnalysisConfig(want); err != nil {
		t.Fatal(err)
	}
	got, err := LoadAttachmentAnalysisConfig()
	if err != nil {
		t.Fatal(err)
	}
	if got.DedicatedModel != want.DedicatedModel || got.DedicatedProvider != want.DedicatedProvider || !got.FallbackOnError || !got.Overrides["codex"].Vision {
		t.Fatalf("round trip mismatch: %#v", got)
	}
	if _, err := os.Stat(filepath.Join(home, "attachment-analysis.yaml")); err != nil {
		t.Fatal(err)
	}
}

func TestResolveAttachmentModelUsesDedicatedFallback(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := SaveAttachmentAnalysisConfig(AttachmentAnalysisConfig{
		Mode: "auto", DedicatedModel: "gemini-2.5-flash", DedicatedProvider: "9router", FallbackOnError: true,
	}); err != nil {
		t.Fatal(err)
	}
	got, err := ResolveAttachmentModel("text-only", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if got.Model != "gemini-2.5-flash" || got.Provider != "9router" {
		t.Fatalf("unexpected resolution: %#v", got)
	}
}
