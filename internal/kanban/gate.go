package kanban

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

// Starting a task on demand, and the quality gate that runs before a human may
// approve one.

// StartableResult reports the outcome of a start attempt.
type StartableResult struct {
	TaskID   string `json:"task_id"`
	Status   string `json:"status"`
	Started  bool   `json:"started"`
	Rejected string `json:"code,omitempty"`
	Message  string `json:"message,omitempty"`
}

// StartTaskNow asks the dispatcher to run a queued task now.
//
// It does not claim the card: the dispatcher owns claiming, so an
// explicit start is a wake-up. The pass the poke triggers claims and
// dispatches the card — typically within a second — instead of the
// card sitting queued for up to 30s for the next poll. Claiming here
// would strand the card as running with no worker attached, because
// only the dispatcher ever dispatches a claimed run.
//
// The claim rules still run first, as a dry run inside a transaction
// that is rolled back, so an unmet dependency or an overlapping lease
// is reported as the same 409-shaped rejection the dispatcher's own
// claim would produce — the UI can explain the wait instead of
// showing a failure.
func StartTaskNow(slug, taskID string) (StartableResult, error) {
	db, err := openDB(slug)
	if err != nil {
		return StartableResult{}, err
	}
	defer db.Close()

	var status, ws, target, paths string
	err = db.QueryRow(`SELECT status, COALESCE(workspace_path,''), COALESCE(workspace_ssh_target,''), COALESCE(paths,'[]') FROM tasks WHERE id=?`, taskID).
		Scan(&status, &ws, &target, &paths)
	if err == sql.ErrNoRows {
		return StartableResult{}, &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	}
	if err != nil {
		return StartableResult{}, err
	}

	if status != "todo" && status != "ready" {
		// Already running, or already past the point where starting applies.
		return StartableResult{TaskID: taskID, Status: status, Started: false,
			Rejected: CodeNotRetryable,
			Message:  fmt.Sprintf("task is %s, not queued", status)}, nil
	}

	project := LeaseProjectFor(Workspace{Path: ws, Host: target})
	if rej := preflightClaim(db, taskID, project, paths); rej != nil {
		// Record the wait so the board shows why the card is not moving.
		_ = insertEvent(db, taskID, "start_deferred", map[string]any{
			"source": "board-ui", "code": rej.Code, "message": rej.Error(),
		})
		return StartableResult{TaskID: taskID, Status: status, Started: false,
			Rejected: rej.Code, Message: rej.Error()}, nil
	}

	_ = insertEvent(db, taskID, "run_requested", map[string]any{"source": "board-ui"})
	WakeDispatcher()
	return StartableResult{TaskID: taskID, Status: status, Started: true}, nil
}

// preflightClaim checks a task against the claim rules without claiming
// it. The whole check runs in one transaction that is always rolled
// back, so the trial leases AcquireLeases takes never stick and the
// card stays queued for the dispatcher the poke wakes.
//
// A transient failure reports no rejection: an explicit start must not
// be blocked by a flaky read, and the dispatcher's own claim re-checks
// everything anyway.
func preflightClaim(db *sql.DB, taskID, project, pathsJSON string) *ClaimRejection {
	tx, err := db.Begin()
	if err != nil {
		return nil
	}
	defer tx.Rollback()

	pending, err := pendingDependencies(tx, taskID)
	if err != nil {
		return nil
	}
	if len(pending) > 0 {
		return &ClaimRejection{Code: CodeDepsNotDone, Err: fmt.Errorf("waiting for %v", pending)}
	}
	if err := AcquireLeases(tx, project, taskID, PathsParse(pathsJSON)); err != nil {
		if IsLeaseConflict(err) {
			return &ClaimRejection{Code: CodeLeaseConflict, Err: err}
		}
		return nil
	}
	return nil
}

// ---------------------------------------------------------------------------
// Quality gate
// ---------------------------------------------------------------------------

// Gate output is tail-capped: a failing test run's useful part is at the end,
// and an unbounded blob would bloat the task row and every response carrying it.
const gateOutputTailBytes = 64 << 10

// gateToneTail keeps the end of gate output, which is where a failure is.
func gateToneTail(s string, max int) string {
	if len(s) <= max {
		return s
	}
	// Note the cut, so the reader knows they are not seeing everything.
	return "... (truncated, showing the last " + itoa(max) + " bytes)\n" + s[len(s)-max:]
}

func itoa(n int) string { return fmt.Sprintf("%d", n) }

// GateInFlight reports whether a gate is already running for a task, so a second
// concurrent gate is refused rather than racing the first.
func GateInFlight(db *sql.DB, taskID string) (bool, error) {
	var status string
	err := db.QueryRow(`SELECT COALESCE(gate_status,'') FROM tasks WHERE id=?`, taskID).Scan(&status)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return status == "running", nil
}

// BeginGate marks a gate as running and returns its generation id.
//
// The generation is written BEFORE the command is dispatched, and the result is
// only applied if it still matches. Without that fence, a slow gate from a
// superseded run could overwrite the verdict of a newer one — the same
// staleness problem current_run_id already solves for executor runs.
//
// It refuses a task that is not in review. A gate verifies a finished change,
// so running one against a queued or still-running task would grade work that
// does not exist yet.
func BeginGate(db *sql.DB, taskID string) (string, error) {
	var status string
	err := db.QueryRow(`SELECT status FROM tasks WHERE id=?`, taskID).Scan(&status)
	if err == sql.ErrNoRows {
		return "", &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	}
	if err != nil {
		return "", err
	}
	if status != "review" {
		return "", &RunControlError{
			Code: 409,
			Err:  fmt.Errorf("task is %s; a quality gate only applies to a task in review", status),
		}
	}
	runID := fmt.Sprintf("gate_%x", time.Now().UnixNano())
	res, err := db.Exec(`UPDATE tasks SET gate_status='running', gate_run_id=?, gate_output=''
		WHERE id=? AND COALESCE(gate_status,'') <> 'running'`, runID, taskID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", &RunControlError{
			Code: 409,
			Err:  fmt.Errorf("%s: a gate is already running for this task", CodeGateRunning),
		}
	}
	return runID, nil
}

// FinishGate applies a gate result, but only if the generation still matches.
// A late result from a superseded run is discarded.
func FinishGate(db *sql.DB, taskID, gateRunID string, passed bool, output string) error {
	status := "failed"
	if passed {
		status = "passed"
	}
	_, err := db.Exec(`UPDATE tasks SET gate_status=?, gate_output=?, gate_run_id=NULL
		WHERE id=? AND gate_run_id=?`, status, gateToneTail(output, gateOutputTailBytes), taskID, gateRunID)
	return err
}

// SupersedeGate issues a new generation without requiring the previous one to
// have finished, and returns the previous generation id.
//
// This is how a re-run takes over from a gate whose worker never answered: the
// old generation is displaced rather than waited on, and its eventual result is
// discarded by the fence.
func SupersedeGate(db *sql.DB, taskID string) (previous string, err error) {
	runID := fmt.Sprintf("gate_%x", time.Now().UnixNano())
	if err = db.QueryRow(`SELECT COALESCE(gate_run_id,'') FROM tasks WHERE id=?`, taskID).Scan(&previous); err != nil {
		if err == sql.ErrNoRows {
			return "", &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
		}
		return "", err
	}
	_, err = db.Exec(`UPDATE tasks SET gate_status='running', gate_run_id=?, gate_output='' WHERE id=?`, runID, taskID)
	return previous, err
}

// GateResult reports a task's gate verdict for the approve guard.
func GateResult(slug, taskID string) (status, output string, err error) {
	db, err := openDB(slug)
	if err != nil {
		return "", "", err
	}
	defer db.Close()
	err = db.QueryRow(`SELECT COALESCE(gate_status,''), COALESCE(gate_output,'') FROM tasks WHERE id=?`, taskID).
		Scan(&status, &output)
	return status, output, err
}

// GateTask is the subset of a task the gate needs.
type GateTask struct {
	ID            string
	Title         string
	WorkspacePath string
	GateCommand   string
	Status        string
}

// LoadGateTask reads what a manual gate re-run needs.
func LoadGateTask(slug, taskID string) (GateTask, error) {
	db, err := openDB(slug)
	if err != nil {
		return GateTask{}, err
	}
	defer db.Close()
	var g GateTask
	err = db.QueryRow(`SELECT id, COALESCE(title,''), COALESCE(workspace_path,''),
		COALESCE(gate_command,''), COALESCE(status,'')
		FROM tasks WHERE id=?`, taskID).
		Scan(&g.ID, &g.Title, &g.WorkspacePath, &g.GateCommand, &g.Status)
	if err == sql.ErrNoRows {
		return GateTask{}, &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	}
	return g, err
}

// RecordGateOverride notes that a reviewer approved a task whose gate failed.
// Without this, "the gate was red and it shipped anyway" leaves no trace beyond
// the status change itself.
func RecordGateOverride(slug, taskID string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	return insertEvent(db, taskID, "gate_overridden", map[string]any{
		"source": "board-ui", "note": "approved despite a failed quality gate",
	})
}

// RunGateCommand executes a task's quality gate on its worker and records the
// verdict.
//
// The gate is a plain shell command run where the work happened, with RTK
// disabled so its output stays machine-readable — a rewritten test summary is
// useless for deciding whether to approve. It is dispatched as a shell task
// rather than an agent, because a gate must not be able to talk its way past.
//
// Two honest limits, both from what this repo can reach:
//
//   - The generation fence (BeginGate/FinishGate) is what prevents a slow result
//     from a superseded run overwriting a newer verdict.
//   - There is no process-group handle in the node-agent response, so a gate
//     that hangs is bounded by whatever timeout the worker applies. Killing the
//     process tree from here is not possible; the review gate has the same
//     property today.
func RunGateCommand(slug, taskID, workspacePath, title, command string) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}

	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()

	// BeginGate enforces that the task is in review and that no other gate is
	// already running, so there is no separate status check here.
	gateRunID, err := BeginGate(db, taskID)
	if err != nil {
		return err
	}
	if err := insertEvent(db, taskID, "gate_started", map[string]any{
		"source": "dispatcher", "command": command, "gate_run_id": gateRunID,
	}); err != nil {
		log.Printf("gate: %s: could not record start: %v", taskID, err)
	}

	res, err := DispatchRemoteRaw(NodeDispatchRequest{
		TaskID:    taskID,
		CardID:    taskID,
		Title:     title,
		Board:     slug,
		Workspace: workspacePath,
		Executor:  "shell",
		Command:   command,
		NoRTK:     true,
	}, RemoteDispatchWait())
	if err != nil {
		// A dispatch failure is a gate failure, not a gate that never ran: the
		// reviewer should see that verification could not be performed.
		_ = FinishGate(db, taskID, gateRunID, false, "gate could not be dispatched: "+err.Error())
		_ = insertEvent(db, taskID, "gate_failed", map[string]any{
			"source": "dispatcher", "error": err.Error(),
		})
		return err
	}

	output := res.Output
	if res.Error != "" {
		output += "\n" + res.Error
	}
	passed := res.Success
	if err := FinishGate(db, taskID, gateRunID, passed, output); err != nil {
		return err
	}
	event := "gate_failed"
	if passed {
		event = "gate_passed"
	}
	if err := insertEvent(db, taskID, event, map[string]any{
		"source": "dispatcher", "command": command, "gate_run_id": gateRunID,
	}); err != nil {
		log.Printf("gate: %s: could not record result: %v", taskID, err)
	}
	broadcastEvent(event, map[string]any{"board": slug, "task_id": taskID})
	log.Printf("gate: %s %s (%s)", taskID, event, command)
	return nil
}
