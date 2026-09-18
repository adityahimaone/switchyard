package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteProfileMemoryScopedAtomic(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := os.MkdirAll(filepath.Join(home, "profiles", "base", "memories"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := WriteProfileMemory("base", "memory", "hello\n"); err != nil {
		t.Fatal(err)
	}
	got, mtime, err := ReadProfileMemory("base", "memory")
	if err != nil || got != "hello\n" || mtime == nil {
		t.Fatalf("got=%q mtime=%v err=%v", got, mtime, err)
	}
	if err := WriteProfileMemory("base", "memory", string(make([]byte, 1<<20))); err == nil {
		t.Fatal("oversized memory accepted")
	}
	if err := WriteProfileMemory("../escape", "memory", "bad"); err == nil {
		t.Fatal("invalid profile accepted")
	}
}

func TestWriteProfileMemoryScopesUserAndMemory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := WriteProfileMemory("base", "user", "user"); err != nil {
		t.Fatal(err)
	}
	if err := WriteProfileMemory("other", "memory", "other"); err != nil {
		t.Fatal(err)
	}
	got, _, err := ReadProfileMemory("base", "user")
	if err != nil || got != "user" {
		t.Fatalf("base user: %q %v", got, err)
	}
	if _, _, err := ReadProfileMemory("base", "memory"); !os.IsNotExist(err) {
		t.Fatalf("unexpected base memory: %v", err)
	}
}
