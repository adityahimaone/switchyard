package kanban

import (
	"encoding/base64"
	"strings"
	"testing"
)

// The node-agent frames shell output with a provenance line on
// top and an EXECUTOR_PROOF + provenance pair underneath; the
// base64 payload sits between them, wrapped at 76 columns.
func framedDesignExport(png string) string {
	b64 := base64.StdEncoding.EncodeToString([]byte(png))
	var wrapped strings.Builder
	for i := 0; i < len(b64); i += 76 {
		end := i + 76
		if end > len(b64) {
			end = len(b64)
		}
		wrapped.WriteString(b64[i:end])
		wrapped.WriteString("\n")
	}
	return "provenance executor=shell requested=shell bin=bash args=[\"-lc\" \"f=\\\"design/exports/habit-home.png\\\"; [ -f \\\"$f\\\" ] || f=\\\"design/habit-home.png\\\"; [ -f \\\"$f\\\" ] || exit 9; echo \\\"DESIGN_EXPORT:$f\\\"; base64 < \\\"$f\\\"\"] ws=/Users/adityahimawan/Development/habbit-tracking-next\n" +
		"DESIGN_EXPORT:design/exports/habit-home.png\n" +
		wrapped.String() +
		"EXECUTOR_PROOF=shell\n" +
		"provenance executor=shell requested=shell bin=bash args=[\"-lc\" \"f=\\\"design/exports/habit-home.png\\\"\"] ws=/Users/adityahimawan/Development/habbit-tracking-next\n"
}

func TestParseDesignExportOutput(t *testing.T) {
	png := "\x89PNG\r\n\x1a\n" + strings.Repeat("habit-tracker-design", 40)
	out := framedDesignExport(png)

	gotPath, gotData, ok := parseDesignExportOutput(out)
	if !ok {
		t.Fatal("parse failed on a framed design export")
	}
	if gotPath != "design/exports/habit-home.png" {
		t.Fatalf("path = %q", gotPath)
	}
	if string(gotData) != png {
		t.Fatalf("bytes mismatch: got %d bytes, want %d", len(gotData), len(png))
	}
}

func TestParseDesignExportOutputRejectsUnmarkerable(t *testing.T) {
	if _, _, ok := parseDesignExportOutput("provenance executor=shell\nsome output\n"); ok {
		t.Fatal("parsed an output with no marker")
	}
}

func TestParseDesignExportOutputRejectsEmptyPayload(t *testing.T) {
	out := "provenance executor=shell\nDESIGN_EXPORT:design/exports/habit-home.png\nEXECUTOR_PROOF=shell\nprovenance executor=shell\n"
	if _, _, ok := parseDesignExportOutput(out); ok {
		t.Fatal("parsed a marker with no payload")
	}
}

func TestDesignExportCandidates(t *testing.T) {
	got := designExportCandidates("design/habit-home.pen")
	want := []string{"design/exports/habit-home.png", "design/habit-home.png"}
	if len(got) != len(want) {
		t.Fatalf("candidates = %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("candidates[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	if designExportCandidates("  ") != nil {
		t.Fatal("blank source should yield no candidates")
	}
}

func TestDesignPathValid(t *testing.T) {
	for _, bad := range []string{"", "/abs.pen", "../escape", "a;b", "a b", "a`b", "a$b", "a|b"} {
		if designPathValid(bad) {
			t.Fatalf("designPathValid(%q) = true", bad)
		}
	}
	for _, good := range []string{"design/exports/habit-home.png", "design/a_b-c.pen"} {
		if !designPathValid(good) {
			t.Fatalf("designPathValid(%q) = false", good)
		}
	}
}
