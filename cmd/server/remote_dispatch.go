package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// dispatchHarnessSessionID returns the session id to put on the wire. A first
// run deliberately sends an empty id so the worker starts a real session and
// returns its own id, instead of failing on a placeholder that does not exist.
func dispatchHarnessSessionID(binding kanban.HarnessBinding, continuation bool) string {
	if !continuation {
		return ""
	}
	return binding.HarnessSessionID
}

// harnessLabel names the harness in a prompt so a continuation never claims
// to resume a "DSH session" when it is actually resuming another harness.
func harnessLabel(executor string) string {
	switch executor {
	case "commandcode":
		return "Command Code"
	case "omp":
		return "omp"
	}
	return "DSH"
}

func dispatchDSHSessionID(binding kanban.HarnessBinding, continuation bool) string {
	return dispatchHarnessSessionID(binding, continuation)
}

// startRemoteDispatcher polls all boards every 30s for todo tasks with
// workspace_transport='node-agent' and dispatches them via node-agent instead of
// letting the Hermes Python dispatcher try (and fail) to spawn locally.
//
// The context is the shutdown signal: cancelling it stops the poll loop so a
// draining server never claims a new task.
func startRemoteDispatcher(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Println("remote-dispatcher: stopped")
				return
			case <-time.After(30 * time.Second):
				dispatchPendingRemoteTasks()
			}
		}
	}()
	log.Println("remote-dispatcher: started (poll 30s)")
}

func dispatchPendingRemoteTasks() {
	boards, err := kanban.ListBoards()
	if err != nil {
		return
	}
	for _, b := range boards {
		dbPath := kanban.BoardDBPath(b.Slug)
		db, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
		if err != nil {
			continue
		}
		// workspace_ssh_target is the node-agent target and scopes path leases.
		// A column this query names must exist, so the board is migrated before
		// it is queried rather than relying on a claim-time migration to have
		// run first — otherwise "no such column" would silently stop dispatch.
		if _, mErr := kanban.MigrateBoardSchemaPublic(b.Slug); mErr != nil {
			log.Printf("remote-dispatcher: board %s: schema migration failed: %v", b.Slug, mErr)
			db.Close()
			continue
		}
		rows, err := db.Query(`SELECT id, title, COALESCE(body,''), COALESCE(result,''), COALESCE(last_failure_error,''), workspace_path, COALESCE(executor,'auto'), COALESCE(assignee,''), COALESCE(command,''), COALESCE(execution_mode,'direct'), COALESCE(max_iterations,1), COALESCE(workspace_ssh_target,''), COALESCE(gate_command,''), COALESCE(isolation,'workspace') FROM tasks WHERE status IN ('todo','ready') AND workspace_transport='node-agent' LIMIT 5`)
		if err != nil {
			log.Printf("remote-dispatcher: board %s: query failed: %v", b.Slug, err)
			db.Close()
			continue
		}
		type row struct {
			id, title, body, result, lastError, ws, executor, assignee, command, executionMode, sshTarget, gateCommand, isolation string
			maxIterations                                                                                                         int
		}
		var pending []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.title, &r.body, &r.result, &r.lastError, &r.ws, &r.executor, &r.assignee, &r.command, &r.executionMode, &r.maxIterations, &r.sshTarget, &r.gateCommand, &r.isolation); err == nil && r.ws != "" {
				pending = append(pending, r)
			}
		}
		rows.Close()

		for _, r := range pending {
			continuity := kanban.HarnessContinuityEnabled(r.executor)
			var binding kanban.HarnessBinding
			var sessionContinuation bool
			if continuity {
				var err error
				binding, sessionContinuation, err = kanban.ResolveHarnessBindingFor(db, b.Slug, r.id, r.ws, r.executor)
				if err != nil {
					log.Printf("remote-dispatcher: %s binding failed: %v", r.id, err)
					continue
				}
			}
			dshSessionID := dispatchHarnessSessionID(binding, sessionContinuation)
			msg := r.body
			focusedGitPrompt := false
			if msg == "" {
				msg = r.title
			}
			if r.result != "" && !sessionContinuation && (strings.HasPrefix(r.lastError, "node_agent_job_timeout:") || strings.HasPrefix(r.lastError, "dispatch_wait_timeout:")) {
				_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status IN ('todo','ready')`, time.Now().Unix(), "repeated timeout on continuation — needs a fresh single-shot run", r.id)
				continue
			}
			var lastCommentID *int64
			if continuity {
				commentCursor := binding.LastCommentID
				lastCommentID = &commentCursor
				comments, err := kanban.TaskCommentsAfter(db, r.id, binding.LastCommentID)
				if err != nil {
					log.Printf("remote-dispatcher: %s comment lookup failed: %v", r.id, err)
					continue
				}
				if len(comments) > 0 {
					id := comments[len(comments)-1].ID
					lastCommentID = &id
					feedback := kanban.RenderReviewComments(r.id, r.title, comments)
					if sessionContinuation {
						msg = feedback
					} else {
						msg += "\n\n" + feedback
					}
				} else if sessionContinuation {
					msg = fmt.Sprintf("[CONTINUATION] Resume the existing %s session and apply only the new task feedback below.\n\n%s", harnessLabel(r.executor), msg)
				}
			}
			if continuity {
				if compact, ok := kanban.FocusedGitReviewPrompt(msg); ok {
					msg, focusedGitPrompt = compact, true
				}
			}
			if !focusedGitPrompt && !sessionContinuation && r.result != "" {
				previous := r.result
				if len(previous) > 800 {
					previous = previous[:800] + "\n... [truncated]"
				}
				msg = fmt.Sprintf("[CONTINUATION] This task was requeued after review feedback.\n\n--- Previous Result ---\n%s\n--- End Previous Result ---\n\nContinue from the existing workspace and apply the user's feedback:\n\n%s", previous, msg)
			}
			commentLimit := 5
			if continuity {
				commentLimit = 0
			}
			if cr, _ := db.Query(`SELECT author, body FROM task_comments WHERE task_id=? ORDER BY id DESC LIMIT ?`, r.id, commentLimit); cr != nil {
				var recent []string
				for cr.Next() {
					var author, body string
					if err := cr.Scan(&author, &body); err == nil {
						recent = append(recent, fmt.Sprintf("@%s: %s", author, body))
					}
				}
				cr.Close()
				for i, j := 0, len(recent)-1; i < j; i, j = i+1, j-1 {
					recent[i], recent[j] = recent[j], recent[i]
				}
				if len(recent) > 0 {
					msg += "\n\n--- Recent Comments ---\n" + strings.Join(recent, "\n")
				}
			}
			command := r.command
			if r.executor == "shell" && r.executionMode != "agentic" && command == "" {
				log.Printf("remote-dispatcher: %s blocked: shell executor requires command", r.id)
				continue
			}
			identity := kanban.IdentifyTask(context.Background(), r.title, r.body)
			if !focusedGitPrompt {
				msg = kanban.PrepareTaskExecutionMessage(r.id, msg, identity)
			}
			model, modelErr := kanban.ProfileModel(r.assignee)
			if modelErr != nil && continuity {
				log.Printf("remote-dispatcher: %s blocked: %v", r.id, modelErr)
				continue
			}
			_ = kanban.PersistTaskIdentity(db, r.id, identity)
			req := kanban.NodeDispatchRequest{
				TaskID:              r.id,
				Title:               r.title,
				Board:               b.Slug,
				Message:             msg,
				Workspace:           r.ws,
				Model:               model,
				Provider:            r.assignee,
				Executor:            r.executor,
				Command:             command,
				ExecutionMode:       r.executionMode,
				MaxIterations:       r.maxIterations,
				Acceptance:          strings.TrimSpace(r.title + "\n" + r.body),
				DSHWorkspaceID:      binding.HarnessWorkspaceID,
				DSHSessionID:        dshSessionID,
				SessionContinuation: sessionContinuation,
			}
			if continuity {
				kanban.ApplyHarnessIdentity(&req, r.executor, dshSessionID)
			}
			if continuity {
				req.LastTurnSeq = &binding.LastTurnSeq
				req.LastCommentID = lastCommentID
			}
			// Claim under the declared-scope and dependency rules. A rejection
			// means "not this task's turn" — unmet dependencies, or another
			// task holding an overlapping path — so the card is left claimable
			// and retried on a later poll rather than counted as a failure.
			project := kanban.LeaseProjectFor(kanban.Workspace{Path: r.ws, Host: r.sshTarget})
			claim, err := kanban.ClaimTaskRunGuarded(db, r.id, project)
			if err != nil {
				if kanban.IsRejection(err) {
					log.Printf("remote-dispatcher: %s not claimed: %v", r.id, err)
					continue
				}
				log.Printf("remote-dispatcher: %s claim failed: %v", r.id, err)
				continue
			}
			if !claim.Claimed {
				continue
			}
			runID := claim.RunID
			req.CardID = r.id
			req.TaskID = runID
			req.RunID = runID

			// A worktree-isolated task gets its own checkout and branch before
			// anything is dispatched into it. The ordering is not stylistic: the
			// worker refuses a workspace directory that does not exist, so
			// creating the worktree after the dispatch would fail the run.
			//
			// From here on, every command for this task — the agent, the quality
			// gate, and the review gate — runs in the worktree rather than the
			// shared checkout, so the diff belongs to this task alone.
			workWorkspace := r.ws
			if r.isolation == "worktree" {
				wt, wtErr := kanban.EnsureTaskWorktree(db, r.id, r.ws)
				if wtErr != nil {
					// The worktree is the task's isolation; running it in the
					// shared checkout instead would be a silent downgrade, so the
					// run fails rather than risking interleaved edits.
					log.Printf("remote-dispatcher: %s worktree setup failed: %v", r.id, wtErr)
					_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=?, current_run_id=NULL
						WHERE id=? AND current_run_id=?`,
						time.Now().Unix(), "worktree setup failed: "+truncate(wtErr.Error(), 300), r.id, runID)
					continue
				}
				workWorkspace = wt
			}
			req.Workspace = workWorkspace

			log.Printf("remote-dispatcher: dispatching %s (%s) via node-agent workspace=%q isolation=%q workspace_id=%q session_id=%q last_turn_seq=%d continuation=%t",
				r.id, b.Slug, workWorkspace, r.isolation, binding.HarnessWorkspaceID, dshSessionID, binding.LastTurnSeq, sessionContinuation)
			_, err = kanban.DispatchRemote(req, kanban.RemoteDispatchWaitFor(r.executionMode))
			if err != nil {
				log.Printf("remote-dispatcher: %s failed: %v", r.id, err)
			} else {
				log.Printf("remote-dispatcher: %s completed", r.id)
				// The quality gate runs only after a successful executor run, and
				// only once the task has landed in review: the reviewer needs the
				// diff either way, and a failed gate is a fact about it rather
				// than a reason to withhold it. It runs in the worktree, so it
				// verifies the code the agent actually produced.
				runQualityGate(b.Slug, r.id, workWorkspace, r.title, r.gateCommand)
			}
		}
		db.Close()
	}
}

// runQualityGate runs a task's declared gate command on its worker.
//
// It is a no-op when no command is declared, so a card created without one pays
// nothing. A gate failure is recorded rather than fatal: the task still sits in
// review with its diff, and the failed verdict is what the approve button
// refuses — a human can still override it deliberately.
func runQualityGate(slug, taskID, workspace, title, command string) {
	if strings.TrimSpace(command) == "" {
		return
	}
	if err := kanban.RunGateCommand(slug, taskID, workspace, title, command); err != nil {
		log.Printf("gate: %s: %v", taskID, err)
	}
}
