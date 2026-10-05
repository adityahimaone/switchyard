package main

import (
	"strings"
	"testing"
)

func TestAppendDesignReference(t *testing.T) {
	tests := []struct {
		name         string
		msg          string
		designSource string
		wantSubstr   []string
		wantAbsent   string
	}{
		{
			name:         "no design source leaves the prompt untouched",
			msg:          "implement the button",
			designSource: "",
			wantAbsent:   "Design Reference",
		},
		{
			name:         "blank design source is treated as none",
			msg:          "implement the button",
			designSource: "   ",
			wantAbsent:   "Design Reference",
		},
		{
			name:         "a design source names the committed mock",
			msg:          "implement the button",
			designSource: "design/board.pen",
			wantSubstr:   []string{"--- Design Reference ---", "design/board.pen", "--- End Design Reference ---"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := appendDesignReference(tt.msg, tt.designSource)
			for _, want := range tt.wantSubstr {
				if !strings.Contains(got, want) {
					t.Errorf("prompt missing %q:\n%s", want, got)
				}
			}
			if tt.wantAbsent != "" && strings.Contains(got, tt.wantAbsent) {
				t.Errorf("prompt should not mention %q:\n%s", tt.wantAbsent, got)
			}
			if !strings.Contains(got, tt.msg) {
				t.Errorf("prompt lost the original message:\n%s", got)
			}
		})
	}
}
