package main

import (
	"testing"

	"kanban-board/internal/kanban"
)

func TestDispatchDSHSessionIDOnlyResumesExistingBinding(t *testing.T) {
	binding := kanban.HarnessBinding{HarnessSessionID: "switchyard-card-real"}
	if got := dispatchDSHSessionID(binding, false); got != "" {
		t.Fatalf("initial dispatch session=%q, want empty", got)
	}
	if got := dispatchDSHSessionID(binding, true); got != binding.HarnessSessionID {
		t.Fatalf("continuation session=%q, want %q", got, binding.HarnessSessionID)
	}
}

func TestContinuationNeedsExplicitExecutor(t *testing.T) {
	cases := []struct {
		name     string
		executor string
		result   string
		want     bool
	}{
		{"auto with prior result refuses auto", "auto", "previous result", true},
		{"empty executor with prior result refuses empty", "", "previous result", true},
		{"codex with prior result allowed", "codex", "previous result", false},
		{"shell with prior result allowed", "shell", "previous result", false},
		{"auto without prior result allowed", "auto", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := continuationNeedsExplicitExecutor(c.executor, c.result); got != c.want {
				t.Fatalf("got %v want %v", got, c.want)
			}
		})
	}
}

// A remote workspace must never fall back to the legacy SSH transport, and a
// task created through the CLI starts with an empty transport. Leaking SSH
// here is what made identically-shaped cards end up on different dispatchers
// with different reliability (t_02ccffe9 node-agent vs t_cd4f2f6e ssh).
func TestRemoteTransportForPathPrefersNodeAgent(t *testing.T) {
	cases := []struct {
		name          string
		ws            string
		transport     string
		target        string
		wantTransport string
		wantTarget    string
		wantChanged   bool
	}{
		{"mac path with no transport routes to node-agent", "/Users/adit/Development/blog", "", "", "node-agent", "mac-tailscale", true},
		{"mac path keeps explicit target", "/Users/adit/Development/blog", "", "mac-tailscale", "node-agent", "mac-tailscale", true},
		{"windows path routes to windows node", `C:\Development\saas`, "", "", "node-agent", "windows-tailscale", true},
		{"windows path keeps explicit target", `C:\Development\saas`, "", "windows-tailscale", "node-agent", "windows-tailscale", true},
		{"node-agent transport is left alone", "/Users/adit/Development/blog", "node-agent", "mac-tailscale", "node-agent", "mac-tailscale", false},
		{"explicit ssh transport is left alone", "/Users/adit/Development/blog", "ssh", "mac-tailscale", "ssh", "mac-tailscale", false},
		{"local path is untouched", "/home/adit/apps/kanban-board", "", "", "", "", false},
		{"relative path is untouched", "scratch/foo", "", "", "", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotTransport, gotTarget, gotChanged := remoteTransportForPath(c.ws, c.transport, c.target)
			if gotTransport != c.wantTransport || gotTarget != c.wantTarget || gotChanged != c.wantChanged {
				t.Fatalf("got (%q,%q,%v) want (%q,%q,%v)",
					gotTransport, gotTarget, gotChanged, c.wantTransport, c.wantTarget, c.wantChanged)
			}
		})
	}
}
