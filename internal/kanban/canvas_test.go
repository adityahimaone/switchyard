package kanban

import (
	"reflect"
	"strings"
	"testing"
)

func TestCanvasPathAllowed(t *testing.T) {
	cases := []struct {
		p       string
		dialkit bool
		want    bool
	}{
		{"canvas/registry.ts", false, true},
		{"app/canvas/page.tsx", false, true},
		{"src/app/canvas/page.tsx", false, true},
		{"src/pages/canvas.tsx", false, true},
		{"app/page.tsx", false, false},
		{"components/Button.tsx", false, false},
		{"next.config.js", false, false},
		{"package.json", false, false},
		{"package.json", true, true},
		{"pnpm-lock.yaml", true, true},
		{".env", true, false},
		{"node_modules", false, true},
		{".next/cache/x", false, true},
		{"../escape", false, false},
		{"/etc/passwd", false, false},
		{"canvas/../app/page.tsx", false, false},
		{"canvasX/evil.ts", false, false}, // prefix "canvas/" requires the slash
	}
	for _, c := range cases {
		got := CanvasPathAllowed(c.p, c.dialkit)
		if got != c.want {
			t.Errorf("CanvasPathAllowed(%q, dialkit=%v) = %v, want %v", c.p, c.dialkit, got, c.want)
		}
	}
}

func TestParsePorcelainZ(t *testing.T) {
	out := " M app/page.tsx\x00?? canvas/new.ts\x00R  old.ts\x00new.ts\x00"
	got := ParsePorcelainZ(out)
	want := []string{"app/page.tsx", "canvas/new.ts", "old.ts", "new.ts"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ParsePorcelainZ = %v, want %v", got, want)
	}
	bad := CanvasViolations(got, false)
	if !reflect.DeepEqual(bad, []string{"app/page.tsx", "old.ts", "new.ts"}) {
		t.Fatalf("violations = %v", bad)
	}
}

func TestAllocCanvasPort(t *testing.T) {
	p, err := AllocCanvasPort(map[int]bool{4300: true, 4301: true})
	if err != nil || p != 4302 {
		t.Fatalf("got %d, %v", p, err)
	}
	used := map[int]bool{}
	for i := CanvasPortStart; i <= CanvasPortEnd; i++ {
		used[i] = true
	}
	if _, err := AllocCanvasPort(used); err == nil {
		t.Fatal("expected exhaustion error")
	}
}

func TestCanvasWorkerPathRejectsWindows(t *testing.T) {
	for _, ws := range []Workspace{{Path: `C:\Users\me\app`}, {Path: "/x", OS: "windows"}, {Path: ""}} {
		w := ws
		if err := canvasWorkerPath(&w); err == nil {
			t.Errorf("expected rejection for %+v", ws)
		}
	}
	ok := Workspace{Path: "/Users/me/app", OS: "darwin"}
	if err := canvasWorkerPath(&ok); err != nil {
		t.Errorf("unexpected: %v", err)
	}
}

func TestCanvasViewToken(t *testing.T) {
	tok := CanvasViewToken("cv_1")
	if !CanvasViewTokenValid("cv_1", tok) || CanvasViewTokenValid("cv_2", tok) || CanvasViewTokenValid("cv_1", "bad") {
		t.Fatal("token validation wrong")
	}
	if !strings.HasPrefix(CanvasViewBase("cv_1"), "/canvas-view/cv_1/"+tok) {
		t.Fatal("base should embed token")
	}
}

func TestCanvasMandateDialKit(t *testing.T) {
	s := &CanvasSession{Title: "Hero", Branch: "switchyard/canvas-x"}
	if m := CanvasMandate(s, "try dark"); !strings.Contains(m, "DialKit is disabled") || !strings.Contains(m, "/create-canvas") {
		t.Errorf("mandate: %s", m)
	}
	s.DialKit = true
	if m := CanvasMandate(s, "x"); !strings.Contains(m, "DialKit is enabled") {
		t.Errorf("mandate: %s", m)
	}
}

func TestCanvasScriptsQuoteAndScope(t *testing.T) {
	s := &CanvasSession{ID: "cv_a", WorktreePath: "/r/.switchyard/canvas-cv_a", WorkspacePath: "/r", Port: 4300, Title: "it's", DialKit: false}
	if sc := canvasCommitScript(s); strings.Contains(sc, "package.json") || !strings.Contains(sc, `'canvas: it'\''s'`) {
		t.Errorf("commit script: %s", sc)
	}
	s.DialKit = true
	if sc := canvasCommitScript(s); !strings.Contains(sc, "package.json") {
		t.Errorf("dialkit commit script should include package.json: %s", sc)
	}
	if sc := canvasRevertScript(s, []string{"a b.ts"}); !strings.Contains(sc, "'a b.ts'") {
		t.Errorf("revert script must quote paths: %s", sc)
	}
}
