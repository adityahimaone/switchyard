package kanban

// The post-create field editor.
//
// Tasks were only editable after creation for assignee, status and
// dependencies — every other field was fixed at create time. That is the right
// default for a card and the wrong one for verify_profile: a human's answer to
// "how hard should this be checked?" often depends on the diff, which only
// exists after the agent has run.
//
// This is one route and one narrow allowlist rather than a generic PATCH. A
// generic field editor would be a way to mutate gate_run_id, status or attempt
// from the UI, and every one of those is dispatcher-owned.

import (
	"database/sql"
	"fmt"
	"strings"
)

// TaskFields is the editable subset of a task.
//
// A field is a *string so "unset" and "set to empty" are distinguishable: the
// UI must be able to clear verify_profile back to auto-routing, which is not
// the same operation as leaving it out of the request.
type TaskFields struct {
	VerifyProfile *string `json:"verify_profile,omitempty"`
	DesignSource  *string `json:"design_source,omitempty"`
}

// UpdateTaskFields applies an edit to a task's post-create fields.
//
// Each field is validated exactly as it would be at create time, so a value that
// the create dialog would reject cannot be written through this back door.
func UpdateTaskFields(slug, taskID string, f TaskFields) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()

	sets := []string{}
	args := []any{}
	changed := []string{}

	if f.VerifyProfile != nil {
		profile := strings.ToLower(strings.TrimSpace(*f.VerifyProfile))
		if profile != "" && !ValidVerifyProfiles[profile] {
			return &RunControlError{Code: 400, Err: fmt.Errorf(
				"verify_profile %q is not one of %s", profile, strings.Join(VerifyProfileLadder, "/"))}
		}
		sets = append(sets, "verify_profile=?")
		args = append(args, profile)
		changed = append(changed, "verify_profile")
	}
	if f.DesignSource != nil {
		source := strings.TrimSpace(*f.DesignSource)
		// Reuse the create-time rules: cap, control characters, and the
		// repo-relative shape. A path that escapes the repo must not become
		// reachable merely because it arrived by a different route.
		probe := &Task{DesignSource: source}
		for _, issue := range ValidateNewTask(probe) {
			if issue.Field == "design_source" {
				return &RunControlError{Code: 400, Err: fmt.Errorf("%s", issue.Message)}
			}
		}
		sets = append(sets, "design_source=?")
		args = append(args, source)
		changed = append(changed, "design_source")
	}
	if len(sets) == 0 {
		return &RunControlError{Code: 400, Err: fmt.Errorf("no editable field in request")}
	}

	args = append(args, taskID)
	if _, err := db.Exec(`UPDATE tasks SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		return err
	}
	// An edited requirement invalidates the old verdict. Leaving a pass earned
	// under different rules on a card that now declares a different requirement
	// would be a lie the approve button then trusts.
	if err := resetVerifyState(db, taskID); err != nil {
		return err
	}
	return insertEvent(db, taskID, "task_fields_updated", map[string]any{
		"source": "board-ui", "fields": changed,
	})
}

// resetVerifyState clears a task's verify verdict.
//
// Called when the requirement itself changes: the next attempt must not inherit
// a pass that was earned under different rules.
func resetVerifyState(db *sql.DB, taskID string) error {
	_, err := db.Exec(`UPDATE tasks SET verify_status='', verify_output='', verify_run_id=NULL,
		verify_profile_effective='' WHERE id=?`, taskID)
	return err
}
