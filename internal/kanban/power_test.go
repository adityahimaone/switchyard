package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writePowerConfig points HERMES_HOME at a temp dir and drops a power config.
func writePowerConfig(t *testing.T, body string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "kanban")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "power-targets.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPowerTargetsListsConfiguredActions(t *testing.T) {
	writePowerConfig(t, `{"targets":[
		{"node_id":"windows","label":"Windows PC","on":"~/bin/pc-on","off":"~/bin/pc-off","cycle":"~/bin/pc-cycle","status":"~/bin/win-status"},
		{"node_id":"empty","label":"Nothing"}
	]}`)
	targets, err := PowerTargets()
	if err != nil {
		t.Fatal(err)
	}
	if len(targets) != 1 {
		t.Fatalf("want 1 target (empty one skipped), got %d: %+v", len(targets), targets)
	}
	got := targets[0]
	if got.NodeID != "windows" || got.Label != "Windows PC" {
		t.Fatalf("unexpected target: %+v", got)
	}
	if len(got.Actions) != 4 {
		t.Fatalf("want 4 actions, got %v", got.Actions)
	}
}

func TestPowerTargetsNoConfigIsEmpty(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	targets, err := PowerTargets()
	if err != nil {
		t.Fatalf("missing config should not error: %v", err)
	}
	if len(targets) != 0 {
		t.Fatalf("want no targets, got %+v", targets)
	}
}

func TestPowerActionUnknownNode(t *testing.T) {
	writePowerConfig(t, `{"targets":[{"node_id":"windows","on":"~/bin/pc-on"}]}`)
	if _, err := PowerAction("ghost", "on"); err == nil {
		t.Fatal("expected error for unknown node")
	}
}

func TestPowerActionUnknownAction(t *testing.T) {
	writePowerConfig(t, `{"targets":[{"node_id":"windows","on":"~/bin/pc-on"}]}`)
	if _, err := PowerAction("windows", "nuke"); err == nil {
		t.Fatal("expected error for unknown action")
	}
}

func TestPowerActionUnconfiguredAction(t *testing.T) {
	writePowerConfig(t, `{"targets":[{"node_id":"windows","on":"~/bin/pc-on"}]}`)
	if _, err := PowerAction("windows", "off"); err == nil {
		t.Fatal("expected error for action with no script")
	}
}

func TestPowerActionRunsScriptAndReturnsOutput(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "kanban")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(home, "fake-pc-on")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho POWER_ON_OK\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := `{"targets":[{"node_id":"windows","on":"` + script + `"}]}`
	if err := os.WriteFile(filepath.Join(dir, "power-targets.json"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := PowerAction("windows", "on")
	if err != nil {
		t.Fatal(err)
	}
	if got := out; got == "" || !strings.Contains(got, "POWER_ON_OK") {
		t.Fatalf("want script output, got %q", got)
	}
}
