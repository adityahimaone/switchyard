package kanban

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNodeAgentHealthBroadcastsStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"nodes":[{"node_id":"mac-1","status":"online"}]}`))
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	ch := Hub.Subscribe()
	defer Hub.Unsubscribe(ch)
	status, err := NodeAgentHealth()
	if err != nil || status.Status != "up" {
		t.Fatalf("health = %+v, err = %v", status, err)
	}
	select {
	case event := <-ch:
		if event.Kind != "node_health" {
			t.Fatalf("event kind = %q, want node_health", event.Kind)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for node_health event")
	}
}

func TestNodeAgentHealthPreservesReportedStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"down","error":"no connected nodes"}`))
	}))
	defer server.Close()
	t.Setenv("KANBAN_NODE_AGENT", server.URL)

	status, err := NodeAgentHealth()
	if err != nil || status.Status != "down" {
		t.Fatalf("health = %+v, err = %v; explicit agent status must be preserved", status, err)
	}
}

func TestNodeDispatchCarriesDSHContinuation(t *testing.T) {
	raw, err := json.Marshal(NodeDispatchRequest{
		TaskID: "task-1", Workspace: "/Users/example/repo", Executor: "dsh",
		DSHSessionID: "session-abc", SessionContinuation: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["dsh_session_id"] != "session-abc" || got["session_continuation"] != true {
		t.Fatalf("request = %s, missing durable continuation identity", raw)
	}
}

func TestDSHSessionProofAcceptsOutputFormats(t *testing.T) {
	for _, output := range []string{
		`dsh_session_id=session-proof`,
		`session_id: session-colon`,
		`Session=session-equals`,
	} {
		if !dshSessionProof.MatchString(output) {
			t.Fatalf("session proof did not match %q", output)
		}
	}
}
