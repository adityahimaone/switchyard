package kanban

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func executorSettingPath() string { return filepath.Join(hermesHome(), "executors.json") }

// ExecutorConfig is the per-executor half of the Execution settings menu.
//
// It seeds the create-task dialog; it never rewrites a card that already exists.
// A card stores the choice it was created with, so changing a default here can
// not silently move work to another model or profile mid-flight.
type ExecutorConfig struct {
	// Enabled overrides membership of Disabled. Kept so the API and the UI can
	// speak in "enable this executor" terms, while Normalize keeps the legacy
	// Disabled list authoritative.
	Enabled *bool `json:"enabled,omitempty"`
	// DefaultModel is pre-selected in the picker. It must be a value the node
	// reports; a stale value is ignored at seed time rather than trusted.
	DefaultModel string `json:"default_model,omitempty"`
	// DefaultProvider travels with DefaultModel: dsh needs both, and a model
	// value alone cannot distinguish two providers that share a model id.
	DefaultProvider string `json:"default_provider,omitempty"`
	// DefaultEffort is the reasoning effort pre-selected for agentic runs.
	DefaultEffort string `json:"default_effort,omitempty"`
	// ModelProfile is the dsh profile whose catalog the picker should ask for.
	// Empty means "the profile dispatch uses" (headless).
	ModelProfile string `json:"model_profile,omitempty"`
	// Options carries executor-specific switches (for example a Command Code
	// mode) so a new knob does not need a schema change.
	Options map[string]string `json:"options,omitempty"`
}

// ExecutorSettings controls which executors a task may use and how the task
// dialog offers them. Disabled executors are filtered from the picker only:
// tasks that already carry an executor keep working, so a bad setting change
// can never strand a card that is mid-review.
type ExecutorSettings struct {
	// Order lists executors in the sequence the task dialog shows them.
	Order []string `json:"order"`
	// Disabled holds executors hidden from the picker. "auto" is never
	// disabled: it is the compatibility fallback every board relies on.
	Disabled []string `json:"disabled"`
	// DefaultExecutionMode is the execution mode pre-selected for new tasks.
	DefaultExecutionMode string `json:"default_execution_mode"`
	// Executors holds the per-executor defaults. Absent keys are enabled with no
	// defaults, which is what every pre-existing file means.
	Executors map[string]ExecutorConfig `json:"executors,omitempty"`
}

// knownExecutors is the canonical display order. It is derived from
// ValidExecutors so a newly added executor is never silently missing.
var knownExecutors = []string{"auto", "hermes", "codex", "commandcode", "claude", "dsh", "omp", "shell"}

// IsValidExecutionMode guards the stored default against a hand-edited file.
func IsValidExecutionMode(mode string) bool {
	return mode == ExecutionModeDirect || mode == ExecutionModeAgentic
}

const (
	ExecutionModeDirect  = "direct"
	ExecutionModeAgentic = "agentic"
)

// DefaultExecutorSettings returns every known executor enabled, in the canonical
// order, defaulting to direct execution.
func DefaultExecutorSettings() ExecutorSettings {
	// Copy: callers normalize into a fresh slice and must never be able to
	// append onto the shared package-level order.
	order := make([]string, len(knownExecutors))
	copy(order, knownExecutors)
	return ExecutorSettings{
		Order:                order,
		Disabled:             []string{},
		DefaultExecutionMode: ExecutionModeDirect,
	}
}

// NormalizeExecutorSettings fills in gaps and drops unknown entries so a partial
// or hand-edited file can never hide a valid executor or break the task dialog.
func NormalizeExecutorSettings(s ExecutorSettings) ExecutorSettings {
	out := DefaultExecutorSettings()
	if IsValidExecutionMode(strings.TrimSpace(s.DefaultExecutionMode)) {
		out.DefaultExecutionMode = strings.TrimSpace(s.DefaultExecutionMode)
	}
	valid := map[string]bool{}
	for _, e := range knownExecutors {
		valid[e] = true
	}
	// Build the order into a fresh slice: a stored order is a full replacement,
	// not an addition, so it must not be appended onto the default list.
	order := make([]string, 0, len(knownExecutors))
	seen := map[string]bool{}
	for _, e := range s.Order {
		e = strings.TrimSpace(strings.ToLower(e))
		if !valid[e] || seen[e] {
			continue
		}
		seen[e] = true
		order = append(order, e)
	}
	// Any executor missing from a stored order keeps its canonical position.
	for _, e := range knownExecutors {
		if !seen[e] {
			order = append(order, e)
		}
	}
	out.Order = order
	disabled := make([]string, 0, len(s.Disabled))
	seenDisabled := map[string]bool{}
	for _, e := range s.Disabled {
		e = strings.TrimSpace(strings.ToLower(e))
		if !valid[e] || e == "auto" || seenDisabled[e] {
			continue
		}
		seenDisabled[e] = true
		disabled = append(disabled, e)
	}
	out.Disabled = disabled

	// Per-executor configs: known executors only, and Enabled folded into the
	// legacy Disabled list so one rule decides whether the picker shows an
	// executor. Two sources of truth here would let the UI and the picker
	// disagree, which is precisely the class of bug this file exists to avoid.
	if len(s.Executors) > 0 {
		configs := make(map[string]ExecutorConfig, len(s.Executors))
		disabledSet := map[string]bool{}
		for _, d := range disabled {
			disabledSet[d] = true
		}
		for name, cfg := range s.Executors {
			name = strings.TrimSpace(strings.ToLower(name))
			if !valid[name] {
				continue
			}
			cfg.DefaultModel = strings.TrimSpace(cfg.DefaultModel)
			cfg.DefaultProvider = strings.TrimSpace(cfg.DefaultProvider)
			cfg.DefaultEffort = strings.ToLower(strings.TrimSpace(cfg.DefaultEffort))
			cfg.ModelProfile = strings.TrimSpace(cfg.ModelProfile)
			if cfg.Enabled != nil && name != "auto" {
				if *cfg.Enabled {
					delete(disabledSet, name)
				} else {
					disabledSet[name] = true
				}
			}
			configs[name] = cfg
		}
		out.Executors = configs
		rebuilt := make([]string, 0, len(disabledSet))
		for _, e := range order {
			if disabledSet[e] {
				rebuilt = append(rebuilt, e)
			}
		}
		out.Disabled = rebuilt
	}
	return out
}

// ExecutorDefaults returns the stored config for one executor.
func ExecutorDefaults(settings ExecutorSettings, executor string) ExecutorConfig {
	if settings.Executors == nil {
		return ExecutorConfig{}
	}
	return settings.Executors[strings.TrimSpace(strings.ToLower(executor))]
}

// LoadExecutorSettings reads the stored config, falling back to defaults.
func LoadExecutorSettings() ExecutorSettings {
	raw, err := os.ReadFile(executorSettingPath())
	if err != nil {
		return DefaultExecutorSettings()
	}
	var s ExecutorSettings
	if json.Unmarshal(raw, &s) != nil {
		return DefaultExecutorSettings()
	}
	return NormalizeExecutorSettings(s)
}

// SaveExecutorSettings validates and persists the config.
func SaveExecutorSettings(s ExecutorSettings) (ExecutorSettings, error) {
	normalized := NormalizeExecutorSettings(s)
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return normalized, err
	}
	raw, err := json.Marshal(normalized)
	if err != nil {
		return normalized, err
	}
	if err := os.WriteFile(executorSettingPath(), raw, 0o600); err != nil {
		return normalized, fmt.Errorf("save executor settings: %w", err)
	}
	return normalized, nil
}

// ExecutorEnabled reports whether an executor may be selected in the picker.
// Unknown executors are treated as enabled so a brand-new backend release does
// not hide its own executor behind a stale settings file.
func ExecutorEnabled(executor string, settings ExecutorSettings) bool {
	executor = strings.TrimSpace(strings.ToLower(executor))
	if executor == "" || executor == "auto" {
		return true
	}
	for _, d := range settings.Disabled {
		if d == executor {
			return false
		}
	}
	return true
}
