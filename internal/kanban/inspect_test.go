package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReadLogTail(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	logDir := filepath.Join(hermesHome(), "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(logDir, "agent.log"), []byte("line1\nline2\nline3\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	tail, err := ReadLogTail("agent", "100")
	if err != nil {
		t.Fatal(err)
	}
	if len(tail.Lines) != 3 || tail.Lines[0] != "line1" {
		t.Errorf("want 3 lines [line1 line2 line3], got %v", tail.Lines)
	}
	// tail 100 with 150 lines -> truncated to last 100 (whitelisted size)
	var many strings.Builder
	for i := 0; i < 150; i++ {
		many.WriteString(strings.Repeat("x", 10))
		many.WriteString("\n")
	}
	if err := os.WriteFile(filepath.Join(logDir, "agent.log"), []byte(many.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	tail, err = ReadLogTail("agent", "100")
	if err != nil || len(tail.Lines) != 100 {
		t.Errorf("want 100 lines for tail 100 with 150-line file, got %d err=%v", len(tail.Lines), err)
	}
	if _, err := ReadLogTail("../../etc/passwd", "100"); err == nil {
		t.Error("traversal key should be refused")
	}
	if _, err := ReadLogTail("unknown", "100"); err == nil {
		t.Error("unknown key should be refused")
	}
	// missing file → empty lines + hint, no error
	tail, err = ReadLogTail("errors", "100")
	if err != nil || len(tail.Lines) != 0 || tail.Hint == "" {
		t.Errorf("missing file: want empty+hint, got %v err=%v hint=%q", tail.Lines, err, tail.Hint)
	}
}

func TestNormalizeTail(t *testing.T) {
	if NormalizeTail("") != 200 || NormalizeTail("bogus") != 200 || NormalizeTail("333") != 200 {
		t.Error("bad tails should fall back to 200")
	}
	if NormalizeTail("500") != 500 {
		t.Error("500 should be allowed")
	}
}

func TestListSkillsAndContent(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	skillDir := filepath.Join(hermesHome(), "skills", "caveman", "nested")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := "---\nname: caveman\ndescription: Ultra-compressed mode.\n---\n\n# Caveman\nBody."
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	skills, err := ListSkills()
	if err != nil || len(skills) != 1 {
		t.Fatalf("want 1 skill, got %v err=%v", skills, err)
	}
	if skills[0].Name != "caveman" || skills[0].Category != "caveman" {
		t.Errorf("bad meta: %+v", skills[0])
	}
	if err := os.MkdirAll(filepath.Join(hermesHome(), "skills", ".hub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if hidden, err := ListSkills(); err != nil || len(hidden) != 1 {
		t.Fatalf("hidden skill directory leaked: %v err=%v", hidden, err)
	}
	got, err := SkillContent("caveman")
	if err != nil || !strings.Contains(got["content"], "Ultra-compressed") {
		t.Errorf("content lookup failed: %v err=%v", got, err)
	}
	if _, err := SkillContent("../secrets"); err == nil {
		t.Error("traversal name should be refused")
	}
}

func TestReadMemory(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := os.MkdirAll(filepath.Join(hermesHome(), "memories"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hermesHome(), "memories", "MEMORY.md"), []byte("mem body"), 0o600); err != nil {
		t.Fatal(err)
	}
	mem, err := ReadMemory()
	if err != nil {
		t.Fatal(err)
	}
	if mem.Memory != "mem body" || mem.User != "" {
		t.Errorf("bad snapshot: %+v", mem)
	}
	if mem.MemoryMtime == nil {
		t.Error("mtime should be set for existing file")
	}
}

func TestDispatchRemoteValidation(t *testing.T) {
	if _, err := DispatchRemote(NodeDispatchRequest{TaskID: "x"}, time.Second); err == nil || !strings.Contains(err.Error(), "workspace required") {
		t.Errorf("empty workspace should fail fast, got %v", err)
	}
}
