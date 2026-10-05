package kanban

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestVerifyFlowsFileIsReadable guards the routing policy file itself. If it
// cannot be parsed, every auto-routed card silently drops from e2e to ui — a
// weaker guarantee that produces no error anywhere, which is exactly the kind
// of failure this loop exists to prevent.
//
// It also checks that every listed path still exists. A dead entry is not a
// no-op: board code moved from components/board once already, and the stale
// line kept the e2e rung from ever firing for those surfaces.
func TestVerifyFlowsFileIsReadable(t *testing.T) {
	paths := LoadVerifyFlowPaths()
	if len(paths) == 0 {
		t.Fatalf("%s could not be read or parsed", VerifyFlowsRelPath)
	}
	root := verifyRepoRoot()
	for _, p := range paths {
		if p == "" {
			t.Fatal("the flow list contains an empty path")
		}
		if p[0] == '#' {
			t.Fatalf("a comment line survived parsing: %q", p)
		}
		if hasGlob(p) {
			// A glob has no directory to stat; TestEveryFlowPathMatchesSomething
			// proves it can match a real file instead.
			continue
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(p))); err != nil {
			t.Errorf("%s lists %q, which does not exist in the repo", VerifyFlowsRelPath, p)
		}
	}
}

func hasGlob(p string) bool {
	return strings.ContainsAny(p, "*?[")
}

// TestEveryFlowPathMatchesSomething proves each entry can actually match a
// file. A stat check cannot do this for a glob, and an entry that matches
// nothing is a promise the routing cannot keep.
func TestEveryFlowPathMatchesSomething(t *testing.T) {
	root := verifyRepoRoot()
	files := repoFiles(t, root)
	if len(files) == 0 {
		t.Fatal("no files found under web/src")
	}
	for _, owned := range LoadVerifyFlowPaths() {
		// A server-side entry legitimately has no file under web/src, and it
		// matches on the repo instead.
		if strings.HasPrefix(owned, "cmd/") {
			if !anyMatch(files, owned) {
				t.Errorf("flow entry %q matches no file in the repo", owned)
			}
			continue
		}
		var underSrc []string
		for _, f := range files {
			if strings.HasPrefix(f, "web/src/") {
				underSrc = append(underSrc, f)
			}
		}
		if !anyMatch(underSrc, owned) {
			t.Errorf("flow entry %q matches no file under web/src", owned)
		}
	}
}

func anyMatch(files []string, owned string) bool {
	for _, f := range files {
		if matchesFlowPath(f, []string{owned}) {
			return true
		}
	}
	return false
}

// repoFiles lists every tracked source file, repo-relative and slash-separated.
func repoFiles(t *testing.T, root string) []string {
	t.Helper()
	var out []string
	for _, dir := range []string{"web/src", "cmd/server"} {
		err := filepath.WalkDir(filepath.Join(root, filepath.FromSlash(dir)), func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil //nolint:nilerr // an unreadable entry is not this test's subject
			}
			rel, relErr := filepath.Rel(root, p)
			if relErr != nil {
				return nil
			}
			out = append(out, filepath.ToSlash(rel))
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v", dir, err)
		}
	}
	return out
}
