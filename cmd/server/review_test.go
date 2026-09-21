package main

import (
	"reflect"
	"testing"
)

func TestParseChangedFilesRaw(t *testing.T) {
	out := "  cmd/server/review.go \n\ninternal/kanban/nodeagent.go\ncmd/server/review.go\nweb/src/api.ts\n"
	got := parseChangedFilesRaw(out)
	want := []string{"cmd/server/review.go", "internal/kanban/nodeagent.go", "web/src/api.ts"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseChangedFilesRaw(%q) = %v, want %v", out, got, want)
	}
}

func TestParseChangedFilesRawEmpty(t *testing.T) {
	if got := parseChangedFilesRaw("\n  \n"); len(got) != 0 {
		t.Fatalf("expected no files, got %v", got)
	}
}
