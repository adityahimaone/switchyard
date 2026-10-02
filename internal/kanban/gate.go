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

// StartTaskNow attempts to move a task into the dispatch queue and, if it can be
// claimed, hand it straight to the dispatcher rather than waiting for the poll.
//
// It returns a 409-shaped rejection rather than an error when the task is simply
// not its turn — unmet dependencies, or an overlapping lease — so the UI can
// explain the wait instead of showing a failure.
func StartTaskNow(slug, taskID string) (StartableResult, error) {
	db, err := openDB(slug)
	if err != nil {
		return StartableResult{}, err
	}
	defer db.Close()

	var status, ws, target string
	err = db.QueryRow(`SELECT status, COALESCE(workspace_path,''), COALESCE(workspace_ssh_target,'') FROM tasks WHERE id=?`, taskID).
		Scan(&status, &ws, &target)
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
	claim, err := ClaimTaskRunGuarded(db, taskID, project)
	if err != nil {
		if IsRejection(err) {
			rej := err.(*ClaimRejection)
			// Record the wait so the board shows why the card is not moving.
			_ = insertEvent(db, taskID, "start_deferred", map[string]any{
				"source": "board-ui", "code": rej.Code, "message": rej.Error(),
			})
			return StartableResult{TaskID: taskID, Status: status, Started: false,
				Rejected: rej.Code, Message: rej.Error()}, nil
		}
		return StartableResult{}, err
	}
	if !claim.Claimed {
		return StartableResult{TaskID: taskID, Status: status, Started: false,
			Rejected: CodeNotRetryable, Message: "another dispatcher claimed it first"}, nil
	}

	// Hand the claimed run to the dispatch loop. The loop owns execution, so
	// this does not start a second dispatcher: it just wakes the existing one
	// rather than waiting up to 30s for its next poll.
	pendingStarts.Enqueue(slug, taskID, claim.RunID)
	if err := insertEvent(db, taskID, "started", map[string]any{
		"source": "board-ui", "run_id": claim.RunID,
	}); err != nil {
		log.Printf("start: %s: could not record event: %v", taskID, err)
	}
	return StartableResult{TaskID: taskID, Status: "running", Started: true}, nil
}

// startQueue carries explicitly-started runs to the dispatch loop, so "Start now"
// is a wake-up rather than a second execution path.
var pendingStarts = &startQueue{items: make(chan startItem, 64)}

type startItem struct {
	slug  string
	task  string
	runID string
}

type startQueue struct {
	items chan startItem
}

func (q *startQueue) Enqueue(slug, task, runID string) {
	select {
	case q.items <- startItem{slug: slug, task: task, runID: runID}:
	default:
		// The queue is full, which means the loop is far behind. The run is
		// already claimed and leased, so it will be picked up by the normal poll
		// instead; dropping the hint costs latency, not correctness.
		log.Printf("start: queue full, %s will be picked up by the next poll", task)
	}
}

// Take returns the next explicitly-started run, if any.
func (q *startQueue) Take() (startItem, bool) {
	select {
	case it := <-q.items:
		return it, true
	default:
		return startItem{}, false
	}
}

// DrainStarts hands every queued explicit start to fn, and reports how many it
// processed. The dispatcher calls this at the top of each pass.
func DrainStarts(fn func(startItem)) int {
	n := 0
	for {
		it, ok := pendingStarts.Take()
		if !ok {
			return n
		}
		fn(it)
		n++
	}
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
