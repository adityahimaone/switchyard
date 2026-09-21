package main

import "testing"

func TestParseReviewSnapshot(t *testing.T) {
	raw := "__STAT__\n1 file changed\n__NAMES__\na\n__CLEAN__\n1\n__DIFF__\ndiff --git a/a b/a\n+line\n"
	got := parseReviewSnapshot(raw)
	if got.stat != "1 file changed" || got.diff != "diff --git a/a b/a\n+line" || len(got.names) != 1 || got.names[0] != "a" || !got.clean {
		t.Fatalf("unexpected snapshot: %+v", got)
	}
}
