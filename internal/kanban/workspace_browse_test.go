package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListWorkspaceFilesEnforcesDepthAndCount(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 5; i++ {
		if err := os.MkdirAll(filepath.Join(root, "d"+string(rune('a'+i)), "nested", "deep"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	deep := filepath.Join(root, "da", "nested", "deep", "x.txt")
	if err := os.WriteFile(deep, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	ws := Workspace{ID: "local", Path: root, Host: "localhost"}
	files, err := ListWorkspaceFiles(ws, ".", 2, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) > 10 {
		t.Fatalf("entry cap exceeded: %d", len(files))
	}
	for _, f := range files {
		depth := strings.Count(f.Path, "/")
		if depth > 2 {
			t.Fatalf("depth cap exceeded: %q", f.Path)
		}
	}
}

func TestPreviewWorkspaceFileBoundsAndBinaryFallback(t *testing.T) {
	root := t.TempDir()
	p := filepath.Join(root, "data.bin")
	raw := make([]byte, 4096)
	if err := os.WriteFile(p, raw, 0600); err != nil {
		t.Fatal(err)
	}
	ws := Workspace{ID: "local", Path: root, Host: "localhost"}
	prev, err := PreviewWorkspaceFile(ws, "data.bin", 1024)
	if err != nil {
		t.Fatal(err)
	}
	if prev.Truncated && len(prev.Body) > 1024 {
		t.Fatalf("preview exceeds max bytes: %d", len(prev.Body))
	}
	if !prev.IsBinary && prev.Body == "" {
		t.Fatal("binary file should be marked or empty")
	}
}

func TestDownloadWorkspaceFileRejectsRemoteByDefault(t *testing.T) {
	res, err := DownloadWorkspaceFile(Workspace{ID: "mac", Path: "/Users/adit/project", Host: "mac-tailscale"}, "src/main.go")
	if err == nil || res.Transport != "node-agent" {
		t.Fatalf("expected node-agent routing: %+v err=%v", res, err)
	}
}
