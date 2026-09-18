package kanban

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func localWS(root string) Workspace { return Workspace{ID: "local", Path: root, Host: "localhost"} }

func TestCreateAndAtomicEditWorkspaceFile(t *testing.T) {
	root := t.TempDir()
	ws := localWS(root)
	if err := CreateWorkspaceFile(ws, "notes.txt", "hello"); err != nil {
		t.Fatal(err)
	}
	if err := AtomicEditWorkspaceFile(ws, "notes.txt", "world"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "notes.txt"))
	if err != nil || string(raw) != "world" {
		t.Fatalf("edit not persisted: %q err=%v", raw, err)
	}
	if _, err := os.Stat(filepath.Join(root, "notes.txt.tmp")); !os.IsNotExist(err) {
		t.Fatal("temp file left behind after atomic edit")
	}
}

func TestWorkspaceMutationsGuardRoot(t *testing.T) {
	root := t.TempDir()
	ws := localWS(root)
	for name, op := range map[string]func(){
		"create": func() { _ = CreateWorkspaceFile(ws, "../escape.txt", "x") },
		"edit":   func() { _ = AtomicEditWorkspaceFile(ws, "../escape.txt", "x") },
		"mkdir":  func() { _ = MkdirWorkspaceFile(ws, "/abs") },
		"rename": func() { _ = RenameWorkspaceFile(ws, "a", "../b") },
		"delete": func() { _ = DeleteWorkspaceFile(ws, "../../etc/passwd") },
	} {
		op()
		if _, err := os.Stat(filepath.Join(root, "..", "escape.txt")); !os.IsNotExist(err) {
			t.Fatalf("%s escaped root", name)
		}
	}
}

func TestUploadWorkspaceFileEnforcesSizeCap(t *testing.T) {
	root := t.TempDir()
	ws := localWS(root)
	if err := UploadWorkspaceFile(ws, "big.bin", bytes.NewReader(bytes.Repeat([]byte{1}, 2048)), 1024); err == nil {
		t.Fatal("oversize upload accepted")
	}
	if err := UploadWorkspaceFile(ws, "ok.bin", bytes.NewReader([]byte("ok")), 1024); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "ok.bin"))
	if err != nil || string(raw) != "ok" {
		t.Fatalf("upload not persisted: %q err=%v", raw, err)
	}
}

func TestRemoteWorkspaceMutationFailsClosed(t *testing.T) {
	ws := Workspace{ID: "mac", Path: "/Users/adit/project", Host: "mac-tailscale"}
	if err := AtomicEditWorkspaceFile(ws, "x.txt", "y"); err == nil || !strings.Contains(err.Error(), "node-agent") {
		t.Fatalf("expected node-agent refusal, got %v", err)
	}
}
