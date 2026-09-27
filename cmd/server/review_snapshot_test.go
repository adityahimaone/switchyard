package main

import (
	"strings"
	"testing"
)

func TestParseReviewSnapshot(t *testing.T) {
	raw := "__STAT__\n1 file changed\n__NAMES__\na\n__CLEAN__\n1\n__DIFF__\ndiff --git a/a b/a\n+line\n"
	got := parseReviewSnapshot(raw)
	if got.stat != "1 file changed" || got.diff != "diff --git a/a b/a\n+line" || len(got.names) != 1 || got.names[0] != "a" || !got.clean {
		t.Fatalf("unexpected snapshot: %+v", got)
	}
}

func TestReviewSnapshotErrAcceptsRealSnapshot(t *testing.T) {
	raw := "__STAT__\n\n__NAMES__\n\n__CLEAN__\n1\n__DIFF__\n"
	if err := reviewSnapshotErr(raw, 0); err != nil {
		t.Fatalf("clean snapshot rejected: %v", err)
	}
}

// Regression: a misrouted dispatch returned only "workspace not found: ...".
// parseReviewSnapshot turned that into an empty file list with clean=false, so
// the card rendered as a review with no changes instead of an error.
func TestReviewSnapshotErrRejectsTransportFailure(t *testing.T) {
	err := reviewSnapshotErr("workspace not found: /Users/x/habbit-tracking-next", 255)
	if err == nil {
		t.Fatal("expected error for output with no __CLEAN__ marker")
	}
	if !strings.Contains(err.Error(), "workspace not found") {
		t.Fatalf("error should carry the remote detail, got %v", err)
	}
}

func TestReviewSnapshotErrRejectsEmptyOutput(t *testing.T) {
	if err := reviewSnapshotErr("   \n", 255); err == nil {
		t.Fatal("expected error for empty output")
	}
}

// Regression: node-agent prepends a provenance line that echoes the whole
// command, including the literal printf '__STAT__\n' / '__NAMES__\n' markers.
// The parser anchored on the first occurrence, so it parsed the echoed command
// instead of the real output and returned an empty checklist with the command
// tail as the "diff" body.
func TestParseReviewSnapshotIgnoresProvenanceEcho(t *testing.T) {
	raw := "provenance executor=shell requested=shell bin=bash args=[\"-lc\" \"... printf '__STAT__\\n'; " +
		"git diff --name-only HEAD -- \\\"$scope\\\"; printf '__NAMES__\\n'; printf '__CLEAN__\\n'; ...\"] " +
		"ws=/Users/adityahimawan/Development/habbit-tracking-next\n" +
		"__STAT__\n package-lock.json | 35 +++---\n 1 file changed\n" +
		"__NAMES__\npackage-lock.json\n.codegraph/.gitignore\n" +
		"__CLEAN__\n0\n__DIFF__\ndiff --git a/package-lock.json b/package-lock.json\n+real line\n"

	got := parseReviewSnapshot(raw)
	if got.clean {
		t.Error("clean should be false; the echo's __CLEAN__ was parsed instead of the real one")
	}
	if len(got.names) != 2 || got.names[0] != "package-lock.json" || got.names[1] != ".codegraph/.gitignore" {
		t.Fatalf("names = %v, want the two real changed files", got.names)
	}
	if !strings.Contains(got.stat, "1 file changed") {
		t.Errorf("stat = %q, want the real --stat output", got.stat)
	}
	if !strings.Contains(got.diff, "+real line") {
		t.Errorf("diff = %q, want the real diff body", got.diff)
	}
	if strings.Contains(got.diff, "git diff --name-only") {
		t.Error("diff leaked the echoed command text")
	}
}
