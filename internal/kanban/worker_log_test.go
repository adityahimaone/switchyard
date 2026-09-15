package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkerLogTailReadsIncrementalBytes(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	path := filepath.Join(boardDir("live"), "logs", "t_live.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("first\nsecond\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	first, err := WorkerLogTail("live", "t_live", 0)
	if err != nil {
		t.Fatal(err)
	}
	if first.Text != "first\nsecond\n" || first.Offset != int64(len(first.Text)) || !first.Available {
		t.Fatalf("unexpected first read: %+v", first)
	}
	if err := os.WriteFile(path, []byte("first\nsecond\nthird\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	second, err := WorkerLogTail("live", "t_live", first.Offset)
	if err != nil {
		t.Fatal(err)
	}
	if second.Text != "third\n" {
		t.Fatalf("expected incremental output, got %q", second.Text)
	}
}

func TestWorkerLogTailRejectsPathTraversal(t *testing.T) {
	if _, err := WorkerLogTail("live", "../secret", 0); err == nil {
		t.Fatal("expected invalid task id")
	}
}
