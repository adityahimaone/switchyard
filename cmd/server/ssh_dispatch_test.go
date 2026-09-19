package main

import "testing"

func TestContinuationNeedsExplicitExecutor(t *testing.T) {
	cases := []struct {
		name     string
		executor string
		result   string
		want     bool
	}{
		{"auto with prior result refuses auto", "auto", "previous result", true},
		{"empty executor with prior result refuses empty", "", "previous result", true},
		{"codex with prior result allowed", "codex", "previous result", false},
		{"shell with prior result allowed", "shell", "previous result", false},
		{"auto without prior result allowed", "auto", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := continuationNeedsExplicitExecutor(c.executor, c.result); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}
