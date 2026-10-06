package kanban

import (
	"testing"
	"time"
)

func TestRemoteTimeoutConfiguration(t *testing.T) {
	t.Setenv("KANBAN_NODE_AGENT_JOB_TIMEOUT", "17")
	if got := RemoteJobTimeout(); got != 17*time.Second {
		t.Fatalf("RemoteJobTimeout = %s, want 17s", got)
	}
	if got := RemoteDispatchWait(); got != 2*time.Minute+17*time.Second {
		t.Fatalf("RemoteDispatchWait = %s, want 2m17s", got)
	}
}

func TestRemoteDispatchWaitForAgentic(t *testing.T) {
	t.Setenv("KANBAN_NODE_AGENT_SHELL_AGENTIC_TIMEOUT", "1200")
	if got, want := RemoteDispatchWaitFor("agentic"), 22*time.Minute; got != want {
		t.Fatalf("RemoteDispatchWaitFor(agentic) = %s, want %s", got, want)
	}
}

// TestRemoteJobTimeoutFor pins the per-dispatch timeout the
// dispatcher stamps onto every request: the node-agent's job
// deadline must be the control plane's configured budget, not
// the node's own 600s default, or a job the control plane is
// still willing to wait for dies at the node's deadline.
func TestRemoteJobTimeoutFor(t *testing.T) {
	t.Setenv("KANBAN_NODE_AGENT_JOB_TIMEOUT", "17")
	t.Setenv("KANBAN_NODE_AGENT_SHELL_AGENTIC_TIMEOUT", "1200")
	if got := RemoteJobTimeoutFor("direct"); got != 17*time.Second {
		t.Fatalf("RemoteJobTimeoutFor(direct) = %s, want 17s", got)
	}
	if got := RemoteJobTimeoutFor("agentic"); got != 20*time.Minute {
		t.Fatalf("RemoteJobTimeoutFor(agentic) = %s, want 20m", got)
	}
	if got := RemoteJobTimeoutFor("  AGENTIC "); got != 20*time.Minute {
		t.Fatalf("RemoteJobTimeoutFor(AGENTIC) = %s, want 20m", got)
	}
}

func TestTaskHealthFromActivityThresholds(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	cases := []struct {
		name string
		age  time.Duration
		want string
	}{
		{"healthy", 4*time.Minute + 59*time.Second, "healthy"},
		{"silent", 5 * time.Minute, "silent"},
		{"stuck", 10*time.Minute + time.Second, "stuck"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyHealth("running", now.Add(-tc.age), now, false)
			if got != tc.want {
				t.Fatalf("classifyHealth() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestTaskHealthNonRunning(t *testing.T) {
	if got := classifyHealth("done", time.Time{}, time.Now(), false); got != "not_running" {
		t.Fatalf("classifyHealth() = %q, want not_running", got)
	}
}

func TestTaskHealthLostNode(t *testing.T) {
	if got := classifyHealth("running", time.Now(), time.Now(), true); got != "lost" {
		t.Fatalf("classifyHealth() = %q, want lost", got)
	}
}
