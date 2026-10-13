package kanban

import "testing"

func TestRecordPowerSampleUpsertsAndReadsBack(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())

	if err := RecordPowerSample("windows", 1000, 175.5); err != nil {
		t.Fatalf("record: %v", err)
	}
	if err := RecordPowerSample("windows", 1060, 12.0); err != nil {
		t.Fatalf("record: %v", err)
	}
	// Same second twice: a retry inside the tick must overwrite, not duplicate.
	if err := RecordPowerSample("windows", 1060, 13.0); err != nil {
		t.Fatalf("record overwrite: %v", err)
	}

	db, err := openPowerDB()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM power_samples WHERE node_id='windows'`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("want 2 rows after upsert, got %d", n)
	}
	var w float64
	if err := db.QueryRow(`SELECT watts FROM power_samples WHERE node_id='windows' AND ts=1060`).Scan(&w); err != nil {
		t.Fatalf("read: %v", err)
	}
	if w != 13.0 {
		t.Fatalf("want overwritten value 13.0, got %v", w)
	}
}

func TestPowerSamplerNoTargetIsNoOp(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir()) // no power-targets.json -> feature off
	// Must return rather than block forever; run it synchronously.
	StartPowerSampler(t.Context(), 0)
}
