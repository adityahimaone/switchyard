package kanban

import "testing"

func TestDefaultExecutorSettingsEnableEverything(t *testing.T) {
	s := DefaultExecutorSettings()
	if s.DefaultExecutionMode != ExecutionModeDirect {
		t.Fatalf("default mode = %q, want direct", s.DefaultExecutionMode)
	}
	for _, e := range knownExecutors {
		if !ExecutorEnabled(e, s) {
			t.Fatalf("%q must be enabled by default", e)
		}
	}
	if len(s.Order) != len(knownExecutors) {
		t.Fatalf("order = %v, want %v", s.Order, knownExecutors)
	}
	if s.Order[0] != "auto" {
		t.Fatalf("auto must stay first in the picker, got %q", s.Order[0])
	}
	if !ExecutorEnabled("claude", s) {
		t.Fatal("Claude must be enabled by default for explicit selection")
	}
}

func TestExecutorEnabledHidesDisabledButKeepsAuto(t *testing.T) {
	s := DefaultExecutorSettings()
	s.Disabled = []string{"dsh", "auto"}
	s = NormalizeExecutorSettings(s)
	if ExecutorEnabled("dsh", s) {
		t.Fatal("dsh should be disabled")
	}
	if !ExecutorEnabled("codex", s) {
		t.Fatal("codex should stay enabled")
	}
	// auto is the compatibility fallback and can never be disabled.
	if !ExecutorEnabled("auto", s) {
		t.Fatal("auto must never be disabled")
	}
	// An executor this build does not know about must stay selectable.
	if !ExecutorEnabled("brand-new-executor", s) {
		t.Fatal("unknown executors must default to enabled")
	}
}

// A hand-edited or partial file must not break the task dialog: every known
// executor has to survive normalization, and the mode must fall back.
func TestNormalizeExecutorSettingsRepairsPartialInput(t *testing.T) {
	s := NormalizeExecutorSettings(ExecutorSettings{
		Order:                []string{"shell", "dsh", "shell", "nonsense", ""},
		Disabled:             []string{"dsh", "bogus"},
		DefaultExecutionMode: "not-a-mode",
	})
	if len(s.Order) != len(knownExecutors) {
		t.Fatalf("known executors dropped: %v", s.Order)
	}
	// The explicit order leads; the rest are appended in canonical order.
	want := []string{"shell", "dsh", "auto", "hermes", "codex", "commandcode", "claude", "omp"}
	if len(s.Order) != len(want) {
		t.Fatalf("order = %v, want %v", s.Order, want)
	}
	for i := range want {
		if s.Order[i] != want[i] {
			t.Fatalf("order = %v, want %v", s.Order, want)
		}
	}
	if s.DefaultExecutionMode != ExecutionModeDirect {
		t.Fatalf("bad mode must fall back to direct, got %q", s.DefaultExecutionMode)
	}
	for _, d := range s.Disabled {
		if d == "bogus" {
			t.Fatalf("unknown executor must not be stored as disabled: %v", s.Disabled)
		}
	}
}

func TestNormalizeExecutorSettingsKeepsAgenticMode(t *testing.T) {
	s := NormalizeExecutorSettings(ExecutorSettings{DefaultExecutionMode: " agentic "})
	if s.DefaultExecutionMode != ExecutionModeAgentic {
		t.Fatalf("mode = %q, want agentic", s.DefaultExecutionMode)
	}
}

func TestSaveAndLoadExecutorSettingsRoundTrip(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	want, err := SaveExecutorSettings(ExecutorSettings{
		Order:                []string{"dsh", "commandcode", "auto", "hermes", "codex", "omp", "shell"},
		Disabled:             []string{"hermes"},
		DefaultExecutionMode: ExecutionModeAgentic,
	})
	if err != nil {
		t.Fatal(err)
	}
	got := LoadExecutorSettings()
	if got.DefaultExecutionMode != want.DefaultExecutionMode {
		t.Fatalf("mode = %q, want %q", got.DefaultExecutionMode, want.DefaultExecutionMode)
	}
	if len(got.Order) != len(knownExecutors) || got.Order[0] != "dsh" || got.Order[1] != "commandcode" || got.Order[2] != "auto" {
		t.Fatalf("order not persisted: %v", got.Order)
	}
	if ExecutorEnabled("hermes", got) {
		t.Fatalf("hermes should be disabled after reload, disabled=%v", got.Disabled)
	}
	if !ExecutorEnabled("dsh", got) {
		t.Fatal("dsh should still be enabled after reload")
	}
}

func TestLoadExecutorSettingsFallsBackWhenMissing(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	got := LoadExecutorSettings()
	if len(got.Order) != len(knownExecutors) || got.DefaultExecutionMode != ExecutionModeDirect {
		t.Fatalf("missing file must yield defaults, got %+v", got)
	}
}
