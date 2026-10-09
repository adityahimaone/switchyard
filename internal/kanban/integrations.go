package kanban

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Integration versions are the Overview's "Connected to kanban" data: one row
// per integration per device, with the version the worker reported.
//
// The live grid comes from node-agent, but every read is also written here.
// Two reasons: a worker that goes offline must still show the version it last
// reported, and the "ping all versions" button needs a durable record of what
// it ran and what changed. The registry in node-agent is in-memory, so without
// this table a node-agent restart erased every version the Overview had.

func integrationsDBPath() string {
	return filepath.Join(hermesHome(), "kanban", "integrations.db")
}

func ensureIntegrationsDB() (*sql.DB, error) {
	p := integrationsDBPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", p))
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS nodes (
  node_id    TEXT PRIMARY KEY,
  hostname   TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  last_seen  TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS node_integrations (
  node_id        TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  version        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT '',
  ok             INTEGER NOT NULL DEFAULT 0,
  checked_at     INTEGER NOT NULL,
  PRIMARY KEY (node_id, integration_id)
);
CREATE TABLE IF NOT EXISTS integration_pings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER NOT NULL DEFAULT 0,
  nodes       INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  ok          INTEGER NOT NULL DEFAULT 0,
  message     TEXT NOT NULL DEFAULT ''
);`); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// IntegrationStateRow is the verdict stored per device/integration. It mirrors
// the Overview's client-side rule (OverviewPage's integrationDeviceState) so
// the database holds the same answer the UI renders instead of a raw probe
// string only the frontend can interpret.
type IntegrationStateRow struct {
	OK      bool   `json:"ok"`
	Status  string `json:"status"`
	Version string `json:"version"`
}

// integrationRowState classifies one probe result.
//
// The rules are the Overview's, not approximations of them:
//   - no worker contact → worker offline
//   - empty probe output → the tool is not installed
//   - "probe failed[: reason]" → the probe answered with something that is not
//     a release (a Node upgrade walkthrough, say); "it printed something" is
//     not health
//   - tailscale only counts when its backend says Running; the version exists
//     whether or not the node is on the tailnet
func integrationRowState(nodeStatus, integrationID, raw string) IntegrationStateRow {
	if nodeStatus == "offline" || nodeStatus == "down" {
		return IntegrationStateRow{Status: "worker offline"}
	}
	raw = strings.TrimSpace(raw)
	switch {
	case raw == "":
		return IntegrationStateRow{Status: "not installed"}
	case raw == "probe failed":
		return IntegrationStateRow{Status: "probe failed"}
	case strings.HasPrefix(raw, "probe failed:"):
		return IntegrationStateRow{Status: "probe failed", Version: strings.TrimSpace(strings.TrimPrefix(raw, "probe failed:"))}
	}
	version := ""
	for _, line := range strings.Split(raw, "\n") {
		if v := strings.TrimSpace(line); v != "" {
			version = v
			break
		}
	}
	if integrationID == "tailscale" && !strings.HasSuffix(strings.ToLower(version), "(running)") {
		return IntegrationStateRow{Status: "not connected", Version: version}
	}
	return IntegrationStateRow{OK: true, Status: "connected", Version: version}
}

// SnapshotSave reports what a persisted snapshot wrote.
type SnapshotSave struct {
	At    int64 `json:"at"`
	Nodes int   `json:"nodes"`
	Rows  int   `json:"rows"`
}

// SaveNodeSnapshot writes a live node-agent snapshot to SQLite. It is called on
// every Overview read and by the refresh button. A nil/down snapshot still
// updates node status, so the stored view shows a worker going offline.
func SaveNodeSnapshot(st *NodeAgentStatus) (SnapshotSave, error) {
	if st == nil {
		return SnapshotSave{}, fmt.Errorf("nil snapshot")
	}
	db, err := ensureIntegrationsDB()
	if err != nil {
		return SnapshotSave{}, err
	}
	defer db.Close()
	now := time.Now().Unix()
	tx, err := db.Begin()
	if err != nil {
		return SnapshotSave{}, err
	}
	defer tx.Rollback()
	saved := SnapshotSave{At: now}
	for _, n := range st.Nodes {
		if n.NodeID == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO nodes(node_id, hostname, status, last_seen, updated_at) VALUES(?,?,?,?,?)
			ON CONFLICT(node_id) DO UPDATE SET hostname=excluded.hostname, status=excluded.status, last_seen=excluded.last_seen, updated_at=excluded.updated_at`,
			n.NodeID, n.Hostname, n.Status, n.LastSeen, now); err != nil {
			return SnapshotSave{}, err
		}
		saved.Nodes++
		for id, raw := range n.Versions {
			row := integrationRowState(n.Status, id, raw)
			ok := 0
			if row.OK {
				ok = 1
			}
			if _, err := tx.Exec(`INSERT INTO node_integrations(node_id, integration_id, version, status, ok, checked_at) VALUES(?,?,?,?,?,?)
				ON CONFLICT(node_id, integration_id) DO UPDATE SET version=excluded.version, status=excluded.status, ok=excluded.ok, checked_at=excluded.checked_at`,
				n.NodeID, id, row.Version, row.Status, ok, now); err != nil {
				return SnapshotSave{}, err
			}
			saved.Rows++
		}
	}
	if err := tx.Commit(); err != nil {
		return SnapshotSave{}, err
	}
	return saved, nil
}

// SavedIntegration is one stored device/integration row.
type SavedIntegration struct {
	NodeID        string `json:"node_id"`
	Hostname      string `json:"hostname"`
	IntegrationID string `json:"integration_id"`
	Version       string `json:"version"`
	Status        string `json:"status"`
	OK            bool   `json:"ok"`
	CheckedAt     int64  `json:"checked_at"`
}

// IntegrationPing records one "ping all versions" run.
type IntegrationPing struct {
	ID         int64  `json:"id"`
	StartedAt  int64  `json:"started_at"`
	FinishedAt int64  `json:"finished_at"`
	Nodes      int    `json:"nodes"`
	Updated    int    `json:"updated"`
	OK         bool   `json:"ok"`
	Message    string `json:"message"`
}

// SavedIntegrationsView is GET /api/nodes/integrations.
type SavedIntegrationsView struct {
	SavedAt  int64                  `json:"saved_at"`
	Nodes    []SavedIntegrationNode `json:"nodes"`
	Items    []SavedIntegration     `json:"items"`
	LastPing *IntegrationPing       `json:"last_ping,omitempty"`
}

// SavedIntegrationNode is the device list the Overview needs for its columns,
// with the stored "N of M connected" count so the count is not recomputed from
// a response that may already be stale.
type SavedIntegrationNode struct {
	NodeID    string `json:"node_id"`
	Hostname  string `json:"hostname"`
	Status    string `json:"status"`
	LastSeen  string `json:"last_seen"`
	UpdatedAt int64  `json:"updated_at"`
	Connected int    `json:"connected"`
	Total     int    `json:"total"`
}

// SavedIntegrations reads the persisted snapshot back. This is what a device
// column falls back to while its worker is offline.
func SavedIntegrations() (*SavedIntegrationsView, error) {
	db, err := ensureIntegrationsDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	view := &SavedIntegrationsView{Nodes: []SavedIntegrationNode{}, Items: []SavedIntegration{}}

	nodeRows, err := db.Query(`SELECT node_id, hostname, status, last_seen, updated_at FROM nodes ORDER BY node_id`)
	if err != nil {
		return nil, err
	}
	defer nodeRows.Close()
	byNode := map[string]int{}
	for nodeRows.Next() {
		var n SavedIntegrationNode
		if err := nodeRows.Scan(&n.NodeID, &n.Hostname, &n.Status, &n.LastSeen, &n.UpdatedAt); err != nil {
			return nil, err
		}
		view.Nodes = append(view.Nodes, n)
		// Index, not pointer: appending the next node can reallocate the
		// backing array and leave a stored pointer aimed at the old copy,
		// silently dropping the connected counts below.
		byNode[n.NodeID] = len(view.Nodes) - 1
	}
	if err := nodeRows.Err(); err != nil {
		return nil, err
	}

	itemRows, err := db.Query(`SELECT node_id, integration_id, version, status, ok, checked_at FROM node_integrations ORDER BY node_id, integration_id`)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var it SavedIntegration
		var ok int
		if err := itemRows.Scan(&it.NodeID, &it.IntegrationID, &it.Version, &it.Status, &ok, &it.CheckedAt); err != nil {
			return nil, err
		}
		it.OK = ok == 1
		view.Items = append(view.Items, it)
		if it.CheckedAt > view.SavedAt {
			view.SavedAt = it.CheckedAt
		}
		if idx, found := byNode[it.NodeID]; found {
			view.Nodes[idx].Total++
			if it.OK {
				view.Nodes[idx].Connected++
			}
		}
	}
	if err := itemRows.Err(); err != nil {
		return nil, err
	}

	if ping, err := lastPing(db); err == nil {
		view.LastPing = ping
	}
	return view, nil
}

func lastPing(db *sql.DB) (*IntegrationPing, error) {
	var p IntegrationPing
	var ok int
	err := db.QueryRow(`SELECT id, started_at, finished_at, nodes, updated, ok, message FROM integration_pings ORDER BY id DESC LIMIT 1`).
		Scan(&p.ID, &p.StartedAt, &p.FinishedAt, &p.Nodes, &p.Updated, &ok, &p.Message)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.OK = ok == 1
	return &p, nil
}

// recordPing stores one ping attempt, success or failure.
func recordPing(started, finished time.Time, nodes, updated int, ok bool, message string) {
	db, err := ensureIntegrationsDB()
	if err != nil {
		return
	}
	defer db.Close()
	flag := 0
	if ok {
		flag = 1
	}
	_, _ = db.Exec(`INSERT INTO integration_pings(started_at, finished_at, nodes, updated, ok, message) VALUES(?,?,?,?,?,?)`,
		started.Unix(), finished.Unix(), nodes, updated, flag, message)
}

// RefreshResult is POST /api/nodes/refresh.
type RefreshResult struct {
	OK        bool             `json:"ok"`
	Requested int              `json:"requested"`
	Nodes     int              `json:"nodes"`
	Saved     int              `json:"saved"`
	Changed   bool             `json:"changed"`
	ElapsedMs int64            `json:"elapsed_ms"`
	Message   string           `json:"message"`
	Status    *NodeAgentStatus `json:"status,omitempty"`
}

// NodeAgentRefresh is the Overview's "ping all versions" button.
//
// It asks node-agent to have every worker re-probe its tools, waits (bounded)
// for a version to actually change, then persists the snapshot. Workers that
// are offline are not skipped: node-agent keeps their flag queued and the
// worker re-registers on its next heartbeat, so a press is never lost.
func NodeAgentRefresh(wait time.Duration) (*RefreshResult, error) {
	started := time.Now()
	if wait <= 0 {
		wait = 18 * time.Second
	}
	before := ""
	if st, err := fetchNodeAgentHealth(); err == nil {
		before = versionFingerprint(st)
	}
	requested, err := requestVersionRefresh()
	if err != nil {
		recordPing(started, time.Now(), 0, 0, false, "node-agent unreachable: "+err.Error())
		return nil, err
	}
	deadline := time.Now().Add(wait)
	var last *NodeAgentStatus
	changed := false
	for time.Now().Before(deadline) {
		time.Sleep(time.Second)
		st, err := fetchNodeAgentHealth()
		if err != nil || st == nil {
			continue
		}
		last = st
		if versionFingerprint(st) != before {
			changed = true
			break
		}
	}
	if last == nil {
		last, _ = fetchNodeAgentHealth()
	}
	res := &RefreshResult{
		OK:        true,
		Requested: requested,
		Changed:   changed,
		ElapsedMs: time.Since(started).Milliseconds(),
		Status:    last,
	}
	if last != nil {
		res.Nodes = len(last.Nodes)
	}
	if last != nil {
		saved, err := SaveNodeSnapshot(last)
		if err != nil {
			res.OK = false
			res.Message = "probe asked for but snapshot not saved: " + err.Error()
			recordPing(started, time.Now(), res.Nodes, 0, false, res.Message)
			return res, nil
		}
		res.Saved = saved.Rows
		res.Status.SavedAt = saved.At
	}
	switch {
	case res.OK && changed:
		res.Message = fmt.Sprintf("%d worker(s) re-probed, %d version row(s) saved", res.Requested, res.Saved)
	case res.OK && res.Requested == 0:
		res.Message = "no worker registered — nothing to probe"
	default:
		res.Message = fmt.Sprintf("%d worker(s) asked to re-probe, versions unchanged within %ds (workers answer on their next heartbeat)", res.Requested, int(wait.Seconds()))
	}
	recordPing(started, time.Now(), res.Nodes, res.Saved, res.OK, res.Message)
	return res, nil
}

// requestVersionRefresh posts to node-agent's refresh endpoint and reports how
// many workers were marked.
func requestVersionRefresh() (int, error) {
	req, err := http.NewRequest("POST", nodeAgentBase()+"/api/nodes/refresh", nil)
	if err != nil {
		return 0, err
	}
	if tok := nodeAgentToken(); tok != "" {
		req.Header.Set("X-Node-Agent-Token", tok)
	}
	c := &http.Client{Timeout: 10 * time.Second}
	resp, err := c.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode >= 300 {
		return 0, fmt.Errorf("node-agent refresh: %d %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out struct {
		Requested int `json:"requested"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return 0, fmt.Errorf("node-agent refresh: %w", err)
	}
	return out.Requested, nil
}

// versionFingerprint is the comparable form of a snapshot's versions. Order is
// irrelevant and only versions count: heartbeats change status and last_seen
// constantly, and those must not read as "the versions changed".
func versionFingerprint(st *NodeAgentStatus) string {
	if st == nil {
		return ""
	}
	var parts []string
	for _, n := range st.Nodes {
		for id, v := range n.Versions {
			parts = append(parts, n.NodeID+"|"+id+"|"+strings.TrimSpace(v))
		}
	}
	sort.Strings(parts)
	return strings.Join(parts, "\n")
}
