package kanban

import (
	"context"
	"encoding/json"
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
		{"node_id":"windows","label":"Windows PC","hosts":["windows-tailscale"],"on":"~/bin/pc-on","off":"~/bin/pc-off","cycle":"~/bin/pc-cycle","status":"~/bin/win-status"},
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
	if len(got.Hosts) != 1 || got.Hosts[0] != "windows-tailscale" {
		t.Fatalf("want hosts surfaced, got %v", got.Hosts)
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

func TestPowerActionStreamRelaysLinesInOrder(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "kanban")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(home, "fake-boot")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho boot 1\necho boot 2\necho boot 3\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := `{"targets":[{"node_id":"windows","cycle":"` + script + `"}]}`
	if err := os.WriteFile(filepath.Join(dir, "power-targets.json"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	var lines []string
	if err := PowerActionStream(context.Background(), "windows", "cycle", func(l string) { lines = append(lines, l) }); err != nil {
		t.Fatal(err)
	}
	want := []string{"boot 1", "boot 2", "boot 3"}
	if len(lines) != len(want) {
		t.Fatalf("want %d lines, got %d: %v", len(want), len(lines), lines)
	}
	for i := range want {
		if lines[i] != want[i] {
			t.Fatalf("line %d: want %q got %q", i, want[i], lines[i])
		}
	}
}

func TestPowerActionStreamUnknownActionErrors(t *testing.T) {
	writePowerConfig(t, `{"targets":[{"node_id":"windows","on":"~/bin/pc-on"}]}`)
	if err := PowerActionStream(context.Background(), "windows", "cycle", func(string) {}); err == nil {
		t.Fatal("expected error for unconfigured action")
	}
}

func TestPowerMetricsReturnsValidJSON(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "kanban")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(home, "fake-metrics")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho '{\"live\":{\"power_w\":184.2},\"today_kwh\":0.65}'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := `{"targets":[{"node_id":"windows","metrics":"` + script + `"}]}`
	if err := os.WriteFile(filepath.Join(dir, "power-targets.json"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	raw, err := PowerMetrics("windows")
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Live struct {
			PowerW float64 `json:"power_w"`
		} `json:"live"`
		TodayKWh float64 `json:"today_kwh"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("metrics payload not JSON: %v (%s)", err, raw)
	}
	if got.Live.PowerW != 184.2 || got.TodayKWh != 0.65 {
		t.Fatalf("unexpected payload: %s", raw)
	}
}

// A metrics script that prints junk must fail, not hand the browser invalid JSON.
func TestPowerMetricsRejectsNonJSON(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "kanban")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	script := filepath.Join(home, "broken-metrics")
	if err := os.WriteFile(script, []byte("#!/bin/sh\necho not-json\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := `{"targets":[{"node_id":"windows","metrics":"` + script + `"}]}`
	if err := os.WriteFile(filepath.Join(dir, "power-targets.json"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := PowerMetrics("windows"); err == nil {
		t.Fatal("expected error for non-JSON metrics output")
	}
}

// Metrics is read-only: it must not appear in the action list the UI gates
// buttons on, or the Workspaces panel would grow a button that does nothing.
func TestPowerTargetsExcludesMetricsFromActions(t *testing.T) {
	writePowerConfig(t, `{"targets":[{"node_id":"windows","label":"Windows PC","on":"~/bin/pc-on","metrics":"~/bin/plug-energy"}]}`)
	targets, err := PowerTargets()
	if err != nil {
		t.Fatal(err)
	}
	if len(targets) != 1 {
		t.Fatalf("want 1 target, got %+v", targets)
	}
	for _, a := range targets[0].Actions {
		if a == "metrics" {
			t.Fatalf("metrics leaked into actions: %v", targets[0].Actions)
		}
	}
}
