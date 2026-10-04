package kanban

import (
	"database/sql"
	"fmt"
	"log"
	"sort"
	"strings"
)

// Schema contract with Hermes.
//
// Switchyard reads and writes Hermes's kanban.db directly rather than through an
// API, so the two processes share a schema without either owning it. Hermes does
// not set SQLite's user_version (it is 0 on every board), so a version number
// cannot be compared. What can be compared is the set of columns and tables the
// server actually depends on: if Hermes renames or drops one, every query that
// touches it fails at runtime, usually as a 500 on a board the operator is
// trying to work on.
//
// The checks here are deliberately shape-based and additive-tolerant:
//
//   - A missing required column is an error, because a query using it cannot work.
//   - An extra column is ignored, because Hermes owns the table and is expected
//     to add fields; Switchyard must not fail when it does.
//   - ensureTaskExecutionColumns adds the columns Switchyard itself introduced,
//     so those are created rather than demanded.
//
// A contract failure logs loudly at startup but does not stop the server. A
// board that is mid-upgrade should still serve the ones that are healthy, and
// refusing to boot would turn a partial incompatibility into a full outage.

// requiredSchema lists the tables and columns Switchyard reads or writes.
//
// Keep it in sync with the queries in this package. When a query gains a column,
// add it here: that is the point of the file. The contract is asserted by
// TestSchemaContractMatchesUsage and by a fixture test against a real board.
var requiredSchema = map[string][]string{
	"tasks": {
		"id", "title", "body", "status", "priority", "assignee", "created_by",
		"created_at", "completed_at", "started_at", "workspace_kind",
		"workspace_path", "result", "consecutive_failures", "last_failure_error",
		"current_run_id", "workspace_transport", "workspace_ssh_target",
		// Added by Switchyard's own migration, so ensureTaskExecutionColumns
		// creates them when a board predates them.
		"executor", "command", "execution_mode", "max_iterations",
		"dsh_session_id", "position",
		// Declared edit scope and the quality gate.
		"paths", "gate_command", "gate_status", "gate_output", "gate_run_id",
		"start_mode", "attempt",
	},
	"task_events": {"id", "task_id", "kind", "payload", "created_at"},
	"path_leases": {"glob", "task_id", "project", "acquired_at"},
}

// SchemaReport is the outcome of a contract check.
type SchemaReport struct {
	Board string
	// MissingTables are tables Switchyard needs that do not exist.
	MissingTables []string
	// MissingColumns maps a table to the columns it lacks.
	MissingColumns map[string][]string
}

// OK reports whether the schema satisfies the contract.
func (r SchemaReport) OK() bool {
	return len(r.MissingTables) == 0 && len(r.MissingColumns) == 0
}

func (r SchemaReport) String() string {
	if r.OK() {
		return "ok"
	}
	var b strings.Builder
	for _, t := range r.MissingTables {
		fmt.Fprintf(&b, "\n  missing table %q", t)
	}
	tables := make([]string, 0, len(r.MissingColumns))
	for t := range r.MissingColumns {
		tables = append(tables, t)
	}
	sort.Strings(tables)
	for _, t := range tables {
		fmt.Fprintf(&b, "\n  table %q missing column(s): %s", t, strings.Join(r.MissingColumns[t], ", "))
	}
	return strings.TrimPrefix(b.String(), "\n")
}

// CheckBoardSchema verifies one board database against the contract. It applies
// the server's own column migrations first, so columns Switchyard introduced
// are created rather than reported missing.
func CheckBoardSchema(slug string) (SchemaReport, error) {
	report := SchemaReport{Board: slug, MissingColumns: map[string][]string{}}

	db, err := openDB(slug)
	if err != nil {
		return report, err
	}
	defer db.Close()

	// Create the columns this server added, so they are not reported as a
	// contract violation against a board that simply predates them.
	if err := ensureTaskExecutionColumns(db); err != nil {
		// A board whose schema is too far gone to migrate still deserves a
		// report, so this is recorded rather than returned immediately.
		log.Printf("schema-check: board %s: could not apply column migrations: %v", slug, err)
	}

	for table, cols := range requiredSchema {
		present, err := tableColumns(db, table)
		if err != nil {
			// A missing table surfaces here as an error from pragma_table_info
			// on some drivers, and as an empty set on others. Both mean the same
			// thing to this function.
			report.MissingTables = append(report.MissingTables, table)
			continue
		}
		if len(present) == 0 {
			report.MissingTables = append(report.MissingTables, table)
			continue
		}
		for _, col := range cols {
			if _, ok := present[col]; !ok {
				report.MissingColumns[table] = append(report.MissingColumns[table], col)
			}
		}
	}
	if len(report.MissingColumns) == 0 {
		report.MissingColumns = nil
	}
	sort.Strings(report.MissingTables)
	return report, nil
}

// tableColumns returns the set of column names for a table.
func tableColumns(db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		cols[name] = true
	}
	return cols, rows.Err()
}

// CheckAllBoardSchemas runs the contract check across every board.
//
// It reports rather than returns an error for an individual board, because one
// unhealthy board must not hide the state of the others. The error return is
// reserved for a failure that prevented any board from being checked.
func CheckAllBoardSchemas() ([]SchemaReport, error) {
	boards, err := ListBoards()
	if err != nil {
		return nil, err
	}
	var reports []SchemaReport
	for _, b := range boards {
		report, err := CheckBoardSchema(b.Slug)
		if err != nil {
			log.Printf("schema-check: board %s: %v", b.Slug, err)
			continue
		}
		if !report.OK() {
			log.Printf("schema-check: board %s is INCOMPATIBLE with this server: %s", b.Slug, report)
		}
		reports = append(reports, report)
	}
	return reports, nil
}
