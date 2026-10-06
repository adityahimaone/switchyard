package main

// HTTP surface for the verification gate: read the verdict, re-run it, and edit
// the fields that decide it.

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"kanban-board/internal/kanban"
)

// verifyResponse is what the review UI renders: the requirement, what routing
// decided, the verdict, and the evidence.
//
// profile and profile_effective are both returned because "the card asked for
// auto" and "routing chose ui" are different facts, and the reviewer needs the
// second one to know what was actually checked.
type verifyResponse struct {
	TaskID           string              `json:"task_id"`
	Profile          string              `json:"profile"`
	ProfileEffective string              `json:"profile_effective"`
	Status           string              `json:"status"`
	Output           string              `json:"output"`
	Ladder           []string            `json:"ladder"`
	Attachments      []kanban.Attachment `json:"attachments"`
}

func handleTaskVerify(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	task, err := kanban.LoadVerifyTask(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	state, err := kanban.VerifyState(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	// An empty list rather than null: the review UI maps over this, and null
	// would put a branch in the render path for "no evidence", which is the
	// common case for a Go-only card.
	atts, err := kanban.ListTaskAttachments(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	if atts == nil {
		atts = []kanban.Attachment{}
	}
	writeJSON(w, http.StatusOK, verifyResponse{
		TaskID:           task.ID,
		Profile:          state.Profile,
		ProfileEffective: state.ProfileEffective,
		Status:           state.Status,
		Output:           state.Output,
		Ladder:           kanban.VerifyProfileLadder,
		Attachments:      atts,
	})
}

// handleTaskVerifyRun re-runs verification on a card already in review.
func handleTaskVerifyRun(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	task, err := kanban.LoadVerifyTask(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	if task.WorkspacePath == "" {
		fail(w, fmt.Errorf("task has no workspace to verify in"), http.StatusBadRequest)
		return
	}
	if err := kanban.RunVerify(slug, id, task.WorkspacePath, task.Title, task.VerifyProfile, task.DesignSource); err != nil {
		// A failed run is still a recorded verdict, not a failed request: the
		// reviewer wants the output, which the GET returns.
		if _, _, verr := kanban.VerifyResult(slug, id); verr == nil {
			writeJSON(w, http.StatusOK, map[string]string{"task_id": id, "error": err.Error()})
			return
		}
		runControlError(w, err)
		return
	}
	status, output, err := kanban.VerifyResult(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"task_id": id, "verify_status": status, "verify_output": output,
	})
}

// handleTaskFields edits a task's post-create verification fields.
//
// The body is decoded strictly and only the two fields are applied: a generic
// field PATCH would be a way to rewrite dispatcher-owned columns such as
// gate_run_id or attempt.
func handleTaskFields(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err != nil {
		fail(w, err, http.StatusBadRequest)
		return
	}
	var fields kanban.TaskFields
	if err := json.Unmarshal(body, &fields); err != nil {
		fail(w, fmt.Errorf("invalid body: %v", err), http.StatusBadRequest)
		return
	}
	if err := kanban.UpdateTaskFields(slug, id, fields); err != nil {
		runControlError(w, err)
		return
	}
	task, err := kanban.GetTask(slug, id)
	if err != nil {
		runControlError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}
