package kanban

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// writeExecutionsDB creates a small executions.db fixture.
func writeExecutionsDB(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "executions.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE executions (
		id TEXT, job_id TEXT, source TEXT, status TEXT, claimed_at TEXT,
		started_at TEXT, finished_at TEXT, error TEXT, delivery_outcome TEXT,
		scheduled_instant TEXT)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO executions VALUES
		('r1','job-a','schedule','ok','2026-01-01T00:00:00Z','2026-01-01T00:00:01Z','2026-01-01T00:00:09Z',NULL,'delivered','2026-01-01T00:00:00Z'),
		('r2','job-b','manual','failed','2026-01-02T00:00:00Z','2026-01-02T00:00:01Z','2026-01-02T00:00:05Z','boom','failed','2026-01-02T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadCronExecutionsFiltersByJob(t *testing.T) {
	path := writeExecutionsDB(t)

	all, err := readCronExecutions(path, "", 20)
	if err != nil {
		t.Fatalf("read all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("got %d rows, want 2", len(all))
	}
	// Newest first.
	if all[0].ID != "r2" {
		t.Fatalf("expected newest first, got %s", all[0].ID)
	}

	filtered, err := readCronExecutions(path, "job-a", 20)
	if err != nil {
		t.Fatalf("read filtered: %v", err)
	}
	if len(filtered) != 1 || filtered[0].ID != "r1" {
		t.Fatalf("filter returned %+v", filtered)
	}
	// NULL columns must become nil pointers, not empty strings, or the UI
	// renders "null" as a real value.
	if filtered[0].Error != nil {
		t.Fatalf("Error = %v, want nil for a NULL column", *filtered[0].Error)
	}
	if filtered[0].StartedAt == nil {
		t.Fatal("StartedAt should be set")
	}
}

// TestReadCronExecutionsJobIDIsBound proves the job id is treated as data, not
// SQL. The payload closes the literal, appends a tautology, and would return
// every row if the query were still interpolated.
func TestReadCronExecutionsJobIDIsBound(t *testing.T) {
	path := writeExecutionsDB(t)

	payload := "job-a' OR '1'='1"
	rows, err := readCronExecutions(path, payload, 20)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("injection returned %d rows; the job id is being interpolated into SQL", len(rows))
	}

	// A UNION payload must not execute either.
	union := "job-a' UNION SELECT 'x','y','z','w','v','u','t','s','r','q' --"
	rows, err = readCronExecutions(path, union, 20)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("UNION injection returned %d rows", len(rows))
	}
}

func TestReadCronExecutionsLimit(t *testing.T) {
	path := writeExecutionsDB(t)
	rows, err := readCronExecutions(path, "", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("limit 1 returned %d rows", len(rows))
	}
	// An out-of-range limit is clamped, not passed through to SQL.
	if _, err := readCronExecutions(path, "", 100000); err != nil {
		t.Fatal(err)
	}
}

func TestReadCronExecutionsMissingDB(t *testing.T) {
	rows, err := readCronExecutions(filepath.Join(t.TempDir(), "nope.db"), "", 20)
	if err != nil {
		t.Fatalf("a missing executions.db must not be an error: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("got %d rows for a missing db", len(rows))
	}
}

func TestValidateCronID(t *testing.T) {
	valid := []string{"job-a", "job_a", "job.a", "Job123", "a", "daily-report-2026"}
	for _, id := range valid {
		if err := validateCronID(id); err != nil {
			t.Errorf("validateCronID(%q) = %v, want nil", id, err)
		}
	}
	invalid := []string{
		"",
		"  ",
		"job a",              // space
		"job\ta",             // tab
		"job\na",             // newline
		"../etc/passwd",      // traversal
		"a/b",                // slash
		`a\b`,                // backslash
		"job'",               // quote
		`job"`,               // double quote
		"job;drop",           // semicolon
		".hidden",            // leading dot
		"..",                 // traversal
		"job\x00a",           // NUL
		"job%20a",            // percent
		"job' OR 1=1 --",     // injection
		"job;DROP TABLE x",   // injection
		"job\xff\xfeinvalid", // invalid UTF-8 bytes
	}
	for _, id := range invalid {
		if err := validateCronID(id); err == nil {
			t.Errorf("validateCronID(%q) = nil, want an error", id)
		}
	}
	// Dashes and dots are legitimate slug characters, so only a leading dot is
	// rejected, not the punctuation as a class. A slug like "daily--report" must
	// keep working.
	for _, id := range []string{"job--", "job-", "-job", "a..b", "v1.2.3"} {
		if err := validateCronID(id); err != nil {
			t.Errorf("validateCronID(%q) = %v, want nil", id, err)
		}
	}
	// Length is capped.
	long := ""
	for i := 0; i < 65; i++ {
		long += "a"
	}
	if err := validateCronID(long); err == nil {
		t.Error("a 65-character id must be rejected")
	}
}
