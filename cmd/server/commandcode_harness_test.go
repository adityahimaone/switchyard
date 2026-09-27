package main

import (
	"encoding/json"
	"testing"

	"kanban-board/internal/kanban"
)

// A first run must send an empty session id so the worker mints a real session;
// a continuation must send the id the card is bound to.
func TestDispatchHarnessSessionIDEmptyOnFirstRun(t *testing.T) {
	binding := kanban.HarnessBinding{HarnessSessionID: "switchyard-commandcode-abc"}
	if got := dispatchHarnessSessionID(binding, false); got != "" {
		t.Fatalf("first run session id = %q, want empty", got)
	}
	if got := dispatchHarnessSessionID(binding, true); got != "switchyard-commandcode-abc" {
		t.Fatalf("continuation session id = %q", got)
	}
	// The dsh alias must keep behaving identically.
	if got := dispatchDSHSessionID(binding, false); got != "" {
		t.Fatalf("dsh alias first run = %q, want empty", got)
	}
}

func TestHarnessLabelNamesTheRightHarness(t *testing.T) {
	if got := harnessLabel("commandcode"); got != "Command Code" {
		t.Fatalf("commandcode label = %q", got)
	}
	if got := harnessLabel("dsh"); got != "DSH" {
		t.Fatalf("dsh label = %q", got)
	}
}

// commandcode requests must carry their own identity fields and must not borrow
// dsh workspace identity, which commandcode has no concept of.
func TestCommandCodeRequestOmitsDSHWorkspaceIdentity(t *testing.T) {
	raw, err := json.Marshal(kanban.NodeDispatchRequest{
		TaskID: "run-1", Executor: "commandcode", HarnessKind: "commandcode",
		CommandCodeSessionID: "cc-1", SessionContinuation: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["commandcode_session_id"] != "cc-1" || got["harness_kind"] != "commandcode" {
		t.Fatalf("request = %s, missing commandcode identity", raw)
	}
	if _, leaked := got["dsh_workspace_id"]; leaked {
		t.Fatalf("commandcode request leaked dsh workspace identity: %s", raw)
	}
}

// Stateless executors must never carry a harness cursor.
func TestStatelessExecutorRequestCarriesNoCursor(t *testing.T) {
	raw, err := json.Marshal(kanban.NodeDispatchRequest{TaskID: "run-1", Executor: "codex"})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"last_turn_seq", "last_comment_id", "commandcode_session_id", "harness_kind"} {
		if _, ok := got[key]; ok {
			t.Fatalf("codex request leaked %s: %s", key, raw)
		}
	}
}
