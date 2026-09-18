package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveWorkspaceFileRejectsUnsafePaths(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0600); err != nil {
		t.Fatal(err)
	}
	ws := Workspace{ID: "local", Path: root, Host: "localhost"}
	for _, path := range []string{"", "../secret.txt", "..\\secret.txt", "/etc/passwd"} {
		if _, err := ResolveWorkspaceFile(ws, path); err == nil {
			t.Fatalf("ResolveWorkspaceFile(%q) accepted unsafe path", path)
		}
	}
}

func TestResolveWorkspaceFileRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveWorkspaceFile(Workspace{ID: "local", Path: root, Host: "localhost"}, "link/secret.txt"); err == nil {
		t.Fatal("symlink escape accepted")
	}
}

func TestResolveWorkspaceFileKeepsRemotePathsOutOfLocalFilesystem(t *testing.T) {
	resolved, err := ResolveWorkspaceFile(Workspace{ID: "mac", Path: "/Users/adit/project", Host: "mac-tailscale"}, "src/main.go")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Transport != "node-agent" || resolved.Host != "mac-tailscale" || resolved.Path != "src/main.go" {
		t.Fatalf("unexpected remote resolution: %+v", resolved)
	}
}
