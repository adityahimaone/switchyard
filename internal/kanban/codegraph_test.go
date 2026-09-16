package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setCodeGraphTestHome(t *testing.T) {
	t.Helper()
	t.Setenv("HERMES_HOME", t.TempDir())
}

func TestValidRelativeCodeGraphPath(t *testing.T) {
	cases := map[string]bool{
		"gadjian": true, "a/b": true, "a b": true, ".": true,
		"": false, "..": false, "../etc": false, "/abs": false, "a\\b": false,
	}
	for in, want := range cases {
		if got := validRelativeCodeGraphPath(in); got != want {
			t.Errorf("validRelativeCodeGraphPath(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestCodeGraphStatusHealthy(t *testing.T) {
	if !codeGraphStatusHealthy("✓ Index is up to date") {
		t.Error("healthy status not recognized")
	}
	for _, output := range []string{"Not initialized", "index is truncated", "Pending Changes:", ""} {
		if codeGraphStatusHealthy(output) {
			t.Errorf("unhealthy status recognized: %q", output)
		}
	}
}

// Only folders with their OWN .codegraph dir become scan candidates; plain
// project markers (package.json/go.mod/...) no longer create entries.
func TestCodeGraphScanRequiresCodegraphDir(t *testing.T) {
	setCodeGraphTestHome(t)
	root := t.TempDir()
	// marker-only apps must NOT appear
	for app, marker := range map[string]string{
		"gadjian-app": "package.json",
		"hadirr-app":  "go.mod",
		"baktiku-app": "composer.json",
		"rusty-app":   "Cargo.toml",
		"pyy-app":     "pyproject.toml",
	} {
		if err := os.MkdirAll(filepath.Join(root, app), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, app, marker), []byte("{}"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// noise inside denylisted dirs must not leak
	if err := os.MkdirAll(filepath.Join(root, "node_modules", "junk"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "node_modules", "junk", ".codegraph"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	w := Workspace{ID: "saas", Path: root}
	rep, err := CodeGraphReportForWorkspace(&w)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Apps) != 0 {
		t.Errorf("marker-only or denylisted dirs leaked into apps: %v", rep.Apps)
	}
}

func TestCodeGraphScanLocal(t *testing.T) {
	setCodeGraphTestHome(t)
	root := t.TempDir()
	// healthy: .codegraph dir present (status will report Not initialized on a
	// bare dir, but scan detection itself is dir-based; state asserted below)
	for _, app := range []string{"gadjian", "baktiku", "hadirr"} {
		if err := os.MkdirAll(filepath.Join(root, app, ".codegraph"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	w := Workspace{ID: "saas", Path: root}
	rep, err := CodeGraphReportForWorkspace(&w)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]CodeGraphEntry{}
	for _, a := range rep.Apps {
		got[a.Path] = a
	}
	if len(got) != 0 {
		t.Errorf("bare .codegraph dirs must not be listed as healthy apps: %v", got)
	}
}

func TestCodeGraphManualAndHidden(t *testing.T) {
	setCodeGraphTestHome(t)
	root := t.TempDir()
	// hidden-app: exists on disk but user hid it — must stay out of apps
	if err := os.MkdirAll(filepath.Join(root, "hidden-app", ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}
	// manual-app without .codegraph: user asked for it explicitly, still only
	// listed when its own index dir exists
	if err := os.MkdirAll(filepath.Join(root, "manual-app"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "manual-app", ".codegraph"), 0o755); err != nil {
		t.Fatal(err)
	}

	w := Workspace{ID: "w", Path: root,
		CodeGraphApps:   []CodeGraphApp{{Path: "manual-app", Name: "Manual App"}},
		CodeGraphHidden: []string{"hidden-app"}}
	rep, err := CodeGraphReportForWorkspace(&w)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, a := range rep.Apps {
		names = append(names, a.Path)
	}
	joined := strings.Join(names, ",")
	if strings.Contains(joined, "manual-app") || strings.Contains(joined, "hidden-app") {
		t.Errorf("unhealthy or hidden app leaked: %v", names)
	}
	if rep.Hidden[0] != "hidden-app" {
		t.Errorf("hidden list = %v", rep.Hidden)
	}
}

func TestCodeGraphIndexRejectsBadPath(t *testing.T) {
	setCodeGraphTestHome(t)
	w := Workspace{ID: "w", Path: t.TempDir()}
	if _, err := CodeGraphIndex(&w, "../escape"); err == nil {
		t.Error("want rejection for ../escape")
	}
	if _, err := CodeGraphIndex(&w, "/abs"); err == nil {
		t.Error("want rejection for /abs")
	}
	if _, err := CodeGraphIndex(&w, "missing"); err == nil {
		t.Error("want rejection for missing dir")
	}
}
