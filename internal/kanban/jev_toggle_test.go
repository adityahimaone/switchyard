package kanban

import "testing"

func TestJEVToggleRoundTrip(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	if !JEVEnabled() {
		t.Fatal("JEV should default enabled")
	}
	if err := SetJEVEnabled(false); err != nil {
		t.Fatal(err)
	}
	if JEVEnabled() {
		t.Fatal("JEV should be disabled after save")
	}
	if err := SetJEVEnabled(true); err != nil {
		t.Fatal(err)
	}
	if !JEVEnabled() {
		t.Fatal("JEV should be enabled after save")
	}
}
