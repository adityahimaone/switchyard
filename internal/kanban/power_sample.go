package kanban

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// Power sampling.
//
// Tuya Cloud keeps only a rolling ~28h of `cur_power` history on this plan, so
// any range longer than a day has to come from our own store. This file records
// the plug's instantaneous draw on a fixed interval into power.db; the
// aggregation in power_energy.go integrates it. It is forward-only: nothing
// backfills the weeks before the sampler shipped.

// powerDBPath is the sampler store, alongside the other board state.
func powerDBPath() string {
	return filepath.Join(hermesHome(), "kanban", "power.db")
}

// openPowerDB opens (creating if needed) the sampler store and ensures its
// schema. Callers own the returned handle.
func openPowerDB() (*sql.DB, error) {
	p := powerDBPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", p))
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS power_samples (
		node_id TEXT    NOT NULL,
		ts      INTEGER NOT NULL,
		watts   REAL    NOT NULL,
		PRIMARY KEY (node_id, ts)
	) WITHOUT ROWID`); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// RecordPowerSample stores one instantaneous reading, keyed (node, second) so a
// retry inside the same second overwrites rather than duplicating.
func RecordPowerSample(nodeID string, ts int64, watts float64) error {
	db, err := openPowerDB()
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT OR REPLACE INTO power_samples(node_id, ts, watts) VALUES(?,?,?)`,
		nodeID, ts, watts)
	return err
}

// StartPowerSampler records the plug's draw every interval so ranges beyond
// Tuya's ~28h retention have data. It records once immediately (not after the
// first full interval) and returns at once when no target declares a `sample`
// script, so an install without a plug pays nothing.
func StartPowerSampler(ctx context.Context, interval time.Duration) {
	cfg, err := loadPowerConfig()
	if err != nil {
		log.Printf("power sampler: %v", err)
		return
	}
	var nodes []string
	for _, t := range cfg.Targets {
		if t.Sample != "" {
			nodes = append(nodes, t.NodeID)
		}
	}
	if len(nodes) == 0 {
		return
	}

	sample := func() {
		for _, nodeID := range nodes {
			watts, err := readPlugWatts(nodeID)
			if err != nil {
				log.Printf("power sampler %s: %v", nodeID, err)
				continue
			}
			if err := RecordPowerSample(nodeID, time.Now().Unix(), watts); err != nil {
				log.Printf("power sampler %s: store: %v", nodeID, err)
			}
		}
	}

	sample()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			sample()
		}
	}
}

// readPlugWatts runs a target's `sample` script and returns the instantaneous
// draw in watts.
func readPlugWatts(nodeID string) (float64, error) {
	out, err := PowerAction(nodeID, "sample")
	if err != nil {
		return 0, err
	}
	var blob struct {
		PowerW float64 `json:"power_w"`
	}
	if err := json.Unmarshal([]byte(out), &blob); err != nil {
		return 0, fmt.Errorf("sample script for node %q: %w", nodeID, err)
	}
	return blob.PowerW, nil
}
