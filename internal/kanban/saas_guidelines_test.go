package kanban

import (
	"strings"
	"testing"
)

func TestIsSAASWorkspace(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		labels []string
		want   bool
	}{
		{
			name:   "Mac Gadjian by path",
			path:   "/Users/adityahimawan/Development/saas/gadjian",
			labels: nil,
			want:   true,
		},
		{
			name:   "Windows Gadjian by path",
			path:   `D:\xampp\htdocs\portal-gadjian`,
			labels: nil,
			want:   true,
		},
		{
			name:   "Windows Hadirr by path",
			path:   `D:\xampp\htdocs\portal-hadirr`,
			labels: nil,
			want:   true,
		},
		{
			name:   "Windows Baktiku by path",
			path:   `D:\xampp\htdocs\baktiku-portal`,
			labels: nil,
			want:   true,
		},
		{
			name:   "Match by label work",
			path:   "/some/custom/path",
			labels: []string{"work"},
			want:   true,
		},
		{
			name:   "Match by label saas",
			path:   "/some/other/path",
			labels: []string{"saas"},
			want:   true,
		},
		{
			name:   "Unrelated nextjs workspace",
			path:   "/Users/adityahimawan/Development/habbit-tracking-next",
			labels: nil,
			want:   false,
		},
		{
			name:   "Unrelated portfolio workspace",
			path:   "/Users/adityahimawan/Development/next-portfolio-blog",
			labels: []string{"personal"},
			want:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsSAASWorkspace(tt.path, tt.labels)
			if got != tt.want {
				t.Errorf("IsSAASWorkspace(%q, %v) = %v; want %v", tt.path, tt.labels, got, tt.want)
			}
		})
	}
}

func TestAugmentSAASPrompt(t *testing.T) {
	orig := "Refactor employee attendance list view"

	// Non-SAAS workspace: untouched
	res := AugmentSAASPrompt(orig, "/Users/dev/my-blog", nil)
	if res != orig {
		t.Fatalf("expected non-SAAS prompt to be untouched, got %q", res)
	}

	// SAAS workspace: guidelines injected
	resSAAS := AugmentSAASPrompt(orig, "/Users/adityahimawan/Development/saas/gadjian", []string{"work"})
	if !strings.Contains(resSAAS, "[FAST-8 SAAS FRONTEND DEVELOPMENT GUIDELINES]") {
		t.Fatalf("expected guidelines in augmented prompt, got %q", resSAAS)
	}
	if !strings.Contains(resSAAS, "Step 5 (Cache-Busting Version Bump)") {
		t.Fatalf("expected cache-busting instructions, got %q", resSAAS)
	}

	// Idempotency check: calling again must not duplicate guidelines
	resTwice := AugmentSAASPrompt(resSAAS, "/Users/adityahimawan/Development/saas/gadjian", []string{"work"})
	if strings.Count(resTwice, "[FAST-8 SAAS FRONTEND DEVELOPMENT GUIDELINES]") != 1 {
		t.Fatalf("expected exactly 1 instance of guidelines in prompt, got %d", strings.Count(resTwice, "[FAST-8 SAAS FRONTEND DEVELOPMENT GUIDELINES]"))
	}
}
