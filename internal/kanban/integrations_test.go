package kanban

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// The database must store the same verdict the Overview renders, otherwise a
// device column and its stored row disagree. These cases are the Overview's,
// mirrored one for one.
func TestIntegrationRowStateMirrorsOverview(t *testing.T) {
	cases := []struct {
		name          string
		nodeStatus    string
		integrationID string
		raw           string
		wantOK        bool
		wantStatus    string
		wantVersion   string
	}{
		{"release", "idle", "codegraph", "1.6.0", true, "connected", "1.6.0"},
		{"empty is not installed", "idle", "pen-dev", "", false, "not installed", ""},
		{"probe failed without reason", "idle", "e2e", "probe failed", false, "probe failed", ""},
		{
			// Windows Command Code exits 0 while printing a Node upgrade
			// walkthrough. That is not a release, so it must not read healthy.
			"probe failed keeps reason", "idle", "commandcode",
			"probe failed: Command Code needs Node.js 22 or newer — you're on v14.15.1.",
			false, "probe failed", "Command Code needs Node.js 22 or newer — you're on v14.15.1.",
		},
		{"offline worker", "offline", "git", "2.50.1", false, "worker offline", ""},
		{"agent down", "down", "git", "2.50.1", false, "worker offline", ""},
		{"tailscale running", "idle", "tailscale", "1.102.4 (Running)", true, "connected", "1.102.4 (Running)"},
		{"tailscale stopped", "idle", "tailscale", "1.102.4 (Stopped)", false, "not connected", "1.102.4 (Stopped)"},
		{"first line wins", "idle", "git", "git version 2.46.0.windows.1\nmore prose", true, "connected", "git version 2.46.0.windows.1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := integrationRowState(tc.nodeStatus, tc.integrationID, tc.raw)
			if got.OK != tc.wantOK || got.Status != tc.wantStatus || got.Version != tc.wantVersion {
				t.Fatalf("state = %+v, want ok=%v status=%q version=%q", got, tc.wantOK, tc.wantStatus, tc.wantVersion)
			}
		})
	}
}

func TestSaveNodeSnapshotPersistsVersions(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	st := &NodeAgentStatus{Status: "up", Nodes: []NodeAgentNode{
		{
			NodeID: "mac", Hostname: "mac", Status: "idle", LastSeen: "2026-10-09T17:00:00Z",
			Versions: map[string]string{
				"codegraph": "1.6.0",
				"tailscale": "1.102.4 (Running)",
				"e2e":       "",
				"pen-dev":   "probe failed",
			},
		},
		{
			NodeID: "windows", Hostname: "windows", Status: "idle", LastSeen: "2026-10-09T17:00:05Z",
			Versions: map[string]string{"git": "git version 2.46.0.windows.1"},
		},
	}}
	saved, err := SaveNodeSnapshot(st)
	if err != nil {
		t.Fatalf("SaveNodeSnapshot: %v", err)
	}
	if saved.Nodes != 2 || saved.Rows != 5 {
		t.Fatalf("saved = %+v, want 2 nodes / 5 rows", saved)
	}

	view, err := SavedIntegrations()
	if err != nil {
		t.Fatalf("SavedIntegrations: %v", err)
	}
	if len(view.Nodes) != 2 || len(view.Items) != 5 {
		t.Fatalf("view = %d nodes / %d items, want 2 / 5", len(view.Nodes), len(view.Items))
	}
	if view.SavedAt == 0 {
		t.Fatal("saved_at must be set so the Overview can show when versions were stored")
	}
	byKey := map[string]SavedIntegration{}
	for _, it := range view.Items {
		byKey[it.NodeID+"/"+it.IntegrationID] = it
	}
	if it := byKey["mac/codegraph"]; !it.OK || it.Version != "1.6.0" {
		t.Fatalf("mac/codegraph = %+v, want connected 1.6.0", it)
	}
	if it := byKey["mac/tailscale"]; !it.OK || it.Status != "connected" {
		t.Fatalf("mac/tailscale = %+v, want connected", it)
	}
	if it := byKey["mac/e2e"]; it.OK || it.Status != "not installed" {
		t.Fatalf("mac/e2e = %+v, want not installed", it)
	}
	if it := byKey["mac/pen-dev"]; it.OK || it.Status != "probe failed" {
		t.Fatalf("mac/pen-dev = %+v, want probe failed", it)
	}
	for _, n := range view.Nodes {
		if n.NodeID == "mac" && (n.Connected != 2 || n.Total != 4) {
			t.Fatalf("mac counts = %d/%d, want 2/4", n.Connected, n.Total)
		}
	}

	// A second save must update in place, not duplicate rows: the Overview
	// refetches /api/nodes every 10s and would otherwise grow forever.
	st.Nodes[0].Versions["codegraph"] = "1.7.0"
	if _, err := SaveNodeSnapshot(st); err != nil {
		t.Fatalf("second SaveNodeSnapshot: %v", err)
	}
	view, err = SavedIntegrations()
	if err != nil {
		t.Fatalf("SavedIntegrations (2): %v", err)
	}
	if len(view.Items) != 5 {
		t.Fatalf("items = %d after re-save, want 5 (upsert, no duplicates)", len(view.Items))
	}
	for _, it := range view.Items {
		if it.NodeID == "mac" && it.IntegrationID == "codegraph" && it.Version != "1.7.0" {
			t.Fatalf("codegraph version = %q, want updated 1.7.0", it.Version)
		}
	}
}

// The refresh button must report what node-agent accepted, and must not pretend
// a failed request succeeded — the Overview surfaces that message.
func TestRequestVersionRefreshParsesRequested(t *testing.T) {
	want := 2
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/nodes/refresh" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		requests++
		_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "requested": want})
	}))
	defer srv.Close()

	t.Setenv("KANBAN_NODE_AGENT", srv.URL)
	got, err := requestVersionRefresh()
	if err != nil {
		t.Fatalf("requestVersionRefresh: %v", err)
	}
	if got != want {
		t.Fatalf("requested = %d, want %d", got, want)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
}

func TestRequestVersionRefreshSurfacesFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "authentication required", http.StatusUnauthorized)
	}))
	defer srv.Close()
	t.Setenv("KANBAN_NODE_AGENT", srv.URL)
	if _, err := requestVersionRefresh(); err == nil {
		t.Fatal("a 401 from node-agent must be an error, not a silent success")
	}
}

// A ping run is recorded either way, so the Overview can show when versions
// were last refreshed even when node-agent was unreachable.
func TestRecordPingStoresOutcome(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	start := time.Now().Add(-2 * time.Second)
	recordPing(start, time.Now(), 2, 22, true, "2 worker(s) re-probed, 22 version row(s) saved")

	view, err := SavedIntegrations()
	if err != nil {
		t.Fatalf("SavedIntegrations: %v", err)
	}
	if view.LastPing == nil {
		t.Fatal("last ping missing")
	}
	if !view.LastPing.OK || view.LastPing.Nodes != 2 || view.LastPing.Updated != 22 {
		t.Fatalf("last ping = %+v", *view.LastPing)
	}
	if view.LastPing.Message == "" {
		t.Fatal("last ping must carry a message for the UI tooltip")
	}
}
