package kanban

import (
	"strings"
	"testing"
)

func TestParseDoopRef(t *testing.T) {
	ref, err := ParseDoopRef("doop://canvas-1/frame_2@v7")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if ref.CanvasID != "canvas-1" || ref.FrameID != "frame_2" || ref.Version != "v7" {
		t.Fatalf("parsed %+v", ref)
	}
	if got := ref.Canonical(); got != "doop://canvas-1/frame_2@v7" {
		t.Errorf("Canonical() = %q", got)
	}
	noVersion, err := ParseDoopRef("doop://c/f")
	if err != nil || noVersion.Version != "" {
		t.Fatalf("version-less ref: %+v, %v", noVersion, err)
	}
	for _, bad := range []string{"", "https://doop.design/c/abc", "doop://c/f/../escape", "doop://c"} {
		if _, err := ParseDoopRef(bad); err == nil {
			t.Errorf("ParseDoopRef(%q) accepted an invalid ref", bad)
		}
	}
}

func TestDoopRefKeyIsStableAndVersioned(t *testing.T) {
	a := DoopRef{CanvasID: "c", FrameID: "f", Version: "v1"}
	b := DoopRef{CanvasID: "c", FrameID: "f", Version: "v1"}
	c := DoopRef{CanvasID: "c", FrameID: "f", Version: "v2"}
	if a.Key() != b.Key() {
		t.Errorf("same identity produced two keys: %s vs %s", a.Key(), b.Key())
	}
	if a.Key() == c.Key() {
		t.Errorf("different frame versions collided on key %s", a.Key())
	}
	if !designSliceKeyPattern.MatchString(a.Key()) {
		t.Errorf("key %q is not a safe path segment", a.Key())
	}
	if strings.Contains(a.DesignSourcePath(), "..") || strings.HasPrefix(a.DesignSourcePath(), "/") {
		t.Errorf("design source path %q is not repo-relative", a.DesignSourcePath())
	}
}

func TestValidateDesignRef(t *testing.T) {
	if err := ValidateDesignRef(DesignProviderDoop, "doop://c/f@v1"); err != nil {
		t.Fatalf("valid doop ref rejected: %v", err)
	}
	if err := ValidateDesignRef(DesignProviderDoop, ""); err == nil {
		t.Error("doop card with no ref was accepted")
	}
	if err := ValidateDesignRef(DesignProviderDoop, "not-a-ref"); err == nil {
		t.Error("malformed doop ref was accepted")
	}
	if err := ValidateDesignRef(DesignProviderFigmaLink, "https://figma.com/design/abc?node-id=1-2"); err != nil {
		t.Fatalf("figma provenance URL rejected: %v", err)
	}
	if err := ValidateDesignRef("", strings.Repeat("x", 600)); err == nil {
		t.Error("oversized ref was accepted")
	}
	if err := ValidateDesignRef("doop", "doop://c/f\nrm -rf /"); err == nil {
		t.Error("control characters in a ref were accepted")
	}
}

// TestCreateTaskDoopProviderRoundTrip proves the new columns survive a real
// create → list cycle and that a Doop card derives its design_source from the
// immutable ref instead of inventing a pen.dev path.
func TestCreateTaskDoopProviderRoundTrip(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	ref := DoopRef{CanvasID: "canvas-1", FrameID: "frame-9", Version: "v7"}
	task := &Task{
		Title:          "Implement pricing frame",
		Body:           "Build to the attached Doop frame.",
		WorkspacePath:  "/tmp",
		DesignProvider: DesignProviderDoop,
		DesignRef:      ref.Canonical(),
	}
	if err := CreateTask("default", task); err != nil {
		t.Fatalf("create doop card: %v", err)
	}
	tasks, err := ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	var found *Task
	for i := range tasks {
		if tasks[i].Title == task.Title {
			found = &tasks[i]
		}
	}
	if found == nil {
		t.Fatal("doop card was not persisted")
	}
	if found.DesignProvider != DesignProviderDoop {
		t.Errorf("design_provider = %q", found.DesignProvider)
	}
	if found.DesignRef != ref.Canonical() {
		t.Errorf("design_ref = %q, want %q", found.DesignRef, ref.Canonical())
	}
	if found.DesignSource != ref.DesignSourcePath() {
		t.Errorf("design_source = %q, want %q", found.DesignSource, ref.DesignSourcePath())
	}
	if found.DesignScope != "design_and_code" {
		t.Errorf("design_scope = %q, want design_and_code", found.DesignScope)
	}
	if found.DesignTool != "" {
		t.Errorf("a doop card picked up a pen.dev generator: %q", found.DesignTool)
	}

	if err := CreateTask("default", &Task{Title: "bad", WorkspacePath: "/tmp", DesignProvider: "nope"}); err == nil {
		t.Error("unknown design_provider was accepted")
	}
	if err := CreateTask("default", &Task{Title: "bad", WorkspacePath: "/tmp", DesignProvider: DesignProviderDoop}); err == nil {
		t.Error("doop card with no design_ref was accepted")
	}
}

// TestDesignProviderColumnsAreAdditive proves an existing board gains the two
// new columns and that re-running the migration is harmless — the VPS runs it
// on every startup against boards that predate this change.
func TestDesignProviderColumnsAreAdditive(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	db, err := openDB("default")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()
	if err := ensureTaskExecutionColumns(db); err != nil {
		t.Fatalf("second migration: %v", err)
	}
	rows, err := db.Query(`PRAGMA table_info(tasks)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	seen := map[string]bool{}
	for rows.Next() {
		var cid, notNull, pk int
		var name, kind string
		var dflt any
		if err := rows.Scan(&cid, &name, &kind, &notNull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		seen[name] = true
	}
	for _, col := range []string{"design_provider", "design_ref"} {
		if !seen[col] {
			t.Errorf("tasks table is missing column %q", col)
		}
	}
}
