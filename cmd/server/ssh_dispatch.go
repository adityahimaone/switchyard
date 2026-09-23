package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	syscall "syscall"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

// StartSSHDispatcher polls all boards every 30s for todo tasks with
// workspace_transport='ssh' and runs them via hermes chat on VPS,
// using SSH to access remote Mac filesystem. No local Mac hermes needed.
// This is the SINGLE dispatcher (gateway dispatch_in_gateway=false): every
// success lands in 'review', never 'done' — approval via /approve only.
func StartSSHDispatcher() {
	go func() {
		kanban.AutoReleaseStaleTasks()
		dispatchSSHTasks()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			kanban.AutoReleaseStaleTasks()
			dispatchSSHTasks()
		}
	}()
	log.Println("ssh-dispatcher: started (poll 30s)")
}

var activeRuns = struct {
	sync.Mutex
	cancels map[string]context.CancelFunc
	stopped map[string]bool
}{cancels: map[string]context.CancelFunc{}, stopped: map[string]bool{}}

func beginTaskRun(taskID string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(context.Background())
	activeRuns.Lock()
	activeRuns.cancels[taskID] = cancel
	if activeRuns.stopped[taskID] {
		cancel()
	}
	activeRuns.Unlock()
	return ctx, func() {
		activeRuns.Lock()
		delete(activeRuns.cancels, taskID)
		delete(activeRuns.stopped, taskID)
		activeRuns.Unlock()
	}
}

func requestTaskStop(taskID string) bool {
	activeRuns.Lock()
	defer activeRuns.Unlock()
	activeRuns.stopped[taskID] = true
	cancel := activeRuns.cancels[taskID]
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

func taskStopRequested(taskID string) bool {
	activeRuns.Lock()
	defer activeRuns.Unlock()
	return activeRuns.stopped[taskID]
}

// hardGuardTransport is the permanent exit-code-3 killer: any todo task whose
// workspace path can't exist on this VPS (/Users/..., C:\...) but has no ssh
// transport gets auto-fixed to ssh BEFORE anything spawns. If a path looks
// remote and transport is already 'node-agent' or 'ssh', it is left alone.
func hardGuardTransport(db *sql.DB, id, ws, transport, target string) (string, string) {
	remote := strings.HasPrefix(ws, "/Users/") || strings.HasPrefix(ws, "C:\\") || strings.HasPrefix(ws, "C:/")
	if !remote || transport == "ssh" || transport == "node-agent" {
		return transport, target
	}
	tgt := target
	if tgt == "" {
		tgt = "mac-tailscale"
	}
	_, _ = db.Exec(`UPDATE tasks SET workspace_transport='ssh', workspace_ssh_target=? WHERE id=?`, tgt, id)
	log.Printf("ssh-dispatcher: hard guard fixed %s transport %q->ssh (remote path %s)", id, transport, ws)
	return "ssh", tgt
}

func dispatchSSHTasks() {
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
		rows, err := db.Query(`SELECT id, title, COALESCE(body,''), COALESCE(result,''), workspace_path, COALESCE(workspace_transport,''), COALESCE(workspace_ssh_target,''), COALESCE(executor,'auto'), COALESCE(assignee,''), COALESCE(command,''), COALESCE(last_failure_error,''), COALESCE(execution_mode,'direct'), COALESCE(max_iterations,1) FROM tasks WHERE status IN ('todo','ready') AND workspace_path IS NOT NULL AND workspace_path != '' LIMIT 1`)
		if err != nil {
			db.Close()
			continue
		}
		type row struct {
			id, title, body, result, ws, transport, sshTarget, executor, assignee, command, lastError, executionMode string
			maxIterations                                                                                            int
		}
		var pending []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.title, &r.body, &r.result, &r.ws, &r.transport, &r.sshTarget, &r.executor, &r.assignee, &r.command, &r.lastError, &r.executionMode, &r.maxIterations); err == nil && r.ws != "" {
				pending = append(pending, r)
			}
		}
		rows.Close()

		claimed := false
		for _, r := range pending {
			// hard guard runs before claim: never spawn local for remote paths
			r.transport, r.sshTarget = hardGuardTransport(db, r.id, r.ws, r.transport, r.sshTarget)
			if r.transport != "ssh" {
				// local path without ssh transport: not this dispatcher's job
				continue
			}

			// Build continuation before claim while result and comments remain queryable.
			var binding kanban.HarnessBinding
			var sessionContinuation bool
			if r.executor == "dsh" {
				var err error
				binding, sessionContinuation, err = kanban.ResolveHarnessBinding(db, b.Slug, r.id, r.ws)
				if err != nil {
					log.Printf("ssh-dispatcher: %s binding failed: %v", r.id, err)
					continue
				}
			}
			dshSessionID := binding.HarnessSessionID
			msg := r.body
			if msg == "" {
				msg = r.title
			}
			var lastCommentID *int64
			if r.executor == "dsh" {
				commentCursor := binding.LastCommentID
				lastCommentID = &commentCursor
				comments, err := kanban.TaskCommentsAfter(db, r.id, binding.LastCommentID)
				if err != nil {
					log.Printf("ssh-dispatcher: %s comment lookup failed: %v", r.id, err)
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
					msg = "[CONTINUATION] Resume the existing DSH session and apply only the new task feedback below.\n\n" + msg
				}
			}
			if !sessionContinuation && r.result != "" {
				if strings.HasPrefix(r.lastError, "node_agent_job_timeout:") || strings.HasPrefix(r.lastError, "dispatch_wait_timeout:") {
					_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status IN ('todo','ready')`, time.Now().Unix(), "repeated timeout on continuation — needs a fresh single-shot run", r.id)
					log.Printf("ssh-dispatcher: blocked continuation %s after repeated timeout", r.id)
					continue
				}
				if continuationNeedsExplicitExecutor(r.executor, r.result) {
					_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=? AND status IN ('todo','ready')`, time.Now().Unix(), "continuation requires explicit executor (codex or shell); auto/hermes retry disabled", r.id)
					log.Printf("ssh-dispatcher: blocked continuation %s: explicit executor required", r.id)
					continue
				}
				trunc := r.result
				if len(trunc) > 800 {
					trunc = trunc[:800] + "\n... [truncated]"
				}
				msg = fmt.Sprintf("[CONTINUATION] This task was previously completed and requeued for follow-up.\n\n--- Previous Result ---\n%s\n--- End Previous Result ---\n\nUser comments requested a follow-up. Continue from where you left off:\n\n%s", trunc, msg)
			}
			// A resumed DSH session already contains older board comments; send only
			// the newest one. Legacy tasks without a session retain the five-comment fallback.
			commentLimit := 5
			if r.executor == "dsh" {
				commentLimit = 0
			}
			if cr, _ := db.Query(`SELECT author, body FROM task_comments WHERE task_id=? ORDER BY id DESC LIMIT ?`, r.id, commentLimit); cr != nil {
				var cmt []string
				for cr.Next() {
					var author, body string
					if err := cr.Scan(&author, &body); err == nil {
						cmt = append(cmt, fmt.Sprintf("@%s: %s", author, body))
					}
				}
				cr.Close()
				if len(cmt) > 0 {
					for i, j := 0, len(cmt)-1; i < j; i, j = i+1, j-1 {
						cmt[i], cmt[j] = cmt[j], cmt[i]
					}
					msg += "\n\n--- Recent Comments ---\n" + strings.Join(cmt, "\n")
				}
			}

			model, modelErr := kanban.ProfileModel(r.assignee)
			if modelErr != nil && r.executor == "dsh" {
				_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=?`, time.Now().Unix(), modelErr.Error(), r.id)
				log.Printf("ssh-dispatcher: %s blocked: %v", r.id, modelErr)
				continue
			}
			// claim: persist start time so every UI surface measures same run
			// ponytail: don't reset consecutive_failures here (preserve retry count)
			// reset only on success below; otherwise todo->running->fail loops never hit blocked
			runID, runClaimed, err := kanban.ClaimTaskRun(db, r.id)
			if err != nil {
				log.Printf("ssh-dispatcher: %s claim failed: %v", r.id, err)
				continue
			}
			if !runClaimed {
				continue
			}
			claimed = true
			identity := kanban.IdentifyTask(context.Background(), r.title, r.body)
			msg = kanban.PrepareTaskExecutionMessage(r.id, msg, identity)
			if err := kanban.PersistTaskIdentity(db, r.id, identity); err != nil {
				log.Printf("ssh-dispatcher: could not persist JEV identity for %s: %v", r.id, err)
			}
			db.Close()
			target := r.sshTarget
			if target == "" {
				target = "mac-tailscale"
			}

			log.Printf("ssh-dispatcher: running %s (%s) executor=%s target=%s workspace_id=%q session_id=%q last_turn_seq=%d continuation=%t", r.id, b.Slug, r.executor, target, binding.HarnessWorkspaceID, dshSessionID, binding.LastTurnSeq, sessionContinuation)
			// sync Flow view: orchestrator (VPS hermes) -> mac lane while running
			node := "mac"
			if target == "windows-tailscale" {
				node = "windows"
			}
			kanban.FlowTrackExecutor(r.id, r.title, b.Slug, node, r.executor, kanban.FlowRunning)

			var output string
			var success bool
			if r.executor == "shell" && r.executionMode != "agentic" {
				cmd := strings.TrimSpace(r.command)
				if cmd == "" {
					now := time.Now().Unix()
					db2, _ := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
					if db2 != nil {
						_, _ = db2.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=? WHERE id=?`, now, "shell executor requires command (set Command, not Body)", r.id)
						db2.Close()
					}
					kanban.FlowTrackExecutor(r.id, r.title, b.Slug, node, r.executor, kanban.FlowFailed)
					log.Printf("ssh-dispatcher: %s blocked: missing command for shell executor", r.id)
					continue
				}
				res, err := kanban.DispatchRemote(kanban.NodeDispatchRequest{
					TaskID: runID, CardID: r.id, Title: r.title, Board: b.Slug, Message: msg,
					Workspace: r.ws, Executor: "shell", Command: cmd, ExecutionMode: "direct", MaxIterations: 1, RunID: runID,
				}, kanban.RemoteDispatchWaitFor(r.executionMode))
				if err != nil {
					output = err.Error()
				} else if res != nil {
					output, success = res.Output, res.Success
					if !success && res.Error != "" {
						output += "\n" + res.Error
					}
				}
			} else if r.executor == "shell" && r.executionMode == "agentic" {
				res, err := kanban.DispatchRemote(kanban.NodeDispatchRequest{
					TaskID: runID, CardID: r.id, Title: r.title, Board: b.Slug, Message: msg,
					Workspace: r.ws, Executor: "shell", ExecutionMode: "agentic", MaxIterations: r.maxIterations, Acceptance: strings.TrimSpace(r.title + "\n" + r.body), RunID: runID,
				}, kanban.RemoteDispatchWaitFor(r.executionMode))
				if err != nil {
					output = err.Error()
				} else if res != nil {
					output, success = res.Output, res.Success
					if !success && res.Error != "" {
						output += "\n" + res.Error
					}
				}
			} else if r.executor != "" && r.executor != "auto" {
				req := kanban.NodeDispatchRequest{
					TaskID: runID, CardID: r.id, Title: r.title, Board: b.Slug, Message: msg,
					Workspace: r.ws, Model: model, Provider: r.assignee, Executor: r.executor, Command: r.command,
					DSHWorkspaceID: binding.HarnessWorkspaceID, DSHSessionID: dshSessionID, SessionContinuation: sessionContinuation, RunID: runID,
				}
				if r.executor == "dsh" {
					req.LastTurnSeq = &binding.LastTurnSeq
					req.LastCommentID = lastCommentID
				}
				res, err := kanban.DispatchRemote(req, kanban.RemoteDispatchWait())
				if err != nil {
					output = err.Error()
				} else if res != nil {
					output, success = res.Output, res.Success
					if !success && res.Error != "" {
						output += "\n" + res.Error
					}
				}
			} else {
				// auto and any other: dispatch via node-agent so Mac worker resolves executor
				// (prevents VPS-local hermes with wrong workspace and lost provenance)
				res, err := kanban.DispatchRemote(kanban.NodeDispatchRequest{
					TaskID: runID, CardID: r.id, Title: r.title, Board: b.Slug, Message: msg,
					Workspace: r.ws, Executor: "auto", Command: r.command, RunID: runID,
				}, kanban.RemoteDispatchWait())
				if err != nil {
					output = err.Error()
				} else if res != nil {
					output, success = res.Output, res.Success
					if !success && res.Error != "" {
						output += "\n" + res.Error
					}
				}
			}
			stopped := taskStopRequested(r.id)

			// reopen DB for result write
			db2, err := sql.Open("sqlite", "file:"+dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
			if err != nil {
				continue
			}
			now := time.Now().Unix()
			if stopped {
				_, _ = db2.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=?, current_run_id=NULL WHERE id=? AND current_run_id=?`, now, "stopped by user", r.id, runID)
				kanban.FlowTrackExecutor(r.id, r.title, b.Slug, node, r.executor, kanban.FlowFailed)
				log.Printf("ssh-dispatcher: %s stopped by user", r.id)
			} else if success {
				// DispatchRemote normally owns this write; guard fallback against stale runs.
				_, _ = db2.Exec(`UPDATE tasks SET status='review', completed_at=?, result=?, consecutive_failures=0, last_failure_error='', current_run_id=NULL WHERE id=? AND status='running' AND current_run_id=?`, now, output, r.id, runID)
				kanban.FlowTrackExecutor(r.id, r.title, b.Slug, node, r.executor, kanban.FlowDone)
				log.Printf("ssh-dispatcher: %s completed -> review", r.id)
			} else {
				failures := 1
				_ = db2.QueryRow(`SELECT COALESCE(consecutive_failures,0)+1 FROM tasks WHERE id=?`, r.id).Scan(&failures)
				newStatus := "blocked"
				// DSH preflight/session failures are deterministic. Retrying while
				// DSH Web is disabled only requeues same broken run and obscures root cause.
				if failures < 3 && !strings.Contains(output, "dispatch_wait_timeout:") && !strings.Contains(output, "dsh_unavailable:") && !strings.Contains(output, "dsh_session_missing:") {
					newStatus = "todo" // retry transient failures
				}
				_, _ = db2.Exec(`UPDATE tasks SET status=?, consecutive_failures=?, last_failure_error=?, completed_at=? WHERE id=? AND status='blocked' AND current_run_id IS NULL`,
					newStatus, failures, truncate(output, 500), now, r.id)
				kanban.FlowTrackExecutor(r.id, r.title, b.Slug, node, r.executor, kanban.FlowFailed)
				log.Printf("ssh-dispatcher: %s failed (attempt %d): %s", r.id, failures, truncate(output, 200))
			}
			db2.Close()
		}
		if !claimed {
			db.Close()
		}
	}
}

func continuationNeedsExplicitExecutor(executor, result string) bool {
	return strings.TrimSpace(result) != "" && (executor == "" || executor == "auto")
}

func runHemesViaSSH(taskID, title, message, workspacePath, sshTarget, board string) (string, bool) {
	ctx, cleanup := beginTaskRun(taskID)
	defer cleanup()
	systemPrompt := fmt.Sprintf(`You are a coding agent running on a VPS. The project files are on a remote Mac accessible via SSH.

WORKSPACE: %s (on Mac, SSH target: %s)
TASK: %s

RULES:
1. To read/edit/search files, use: ssh -o BatchMode=yes -o ConnectTimeout=10 %s "<command>"
   Example: ssh %s "cat %s/gadjian/app/controller/Tagihan.php | head -50"
   Example: ssh %s "cd %s && grep -rn 'notes_log' gadjian/"
2. Always prefix file paths with the workspace path when running commands on Mac.
3. If you need to edit a file, use: ssh %s "sed -i '' 's/old/new/g' %s/path/to/file"
4. Before starting, check if FILE_INDEX.json exists: ssh %s "cat %s/FILE_INDEX.json 2>/dev/null | head -100"
   This is the codegraph index — use it to understand project structure.
5. Work step by step: read codegraph -> find relevant files -> read files -> make changes -> verify.
6. Do NOT commit or push — changes stay uncommitted in the working tree; a human reviews and approves.
7. When done, summarize what you changed.

Be concise. Do the work. Don't ask questions.`,
		workspacePath, sshTarget, message,
		sshTarget, sshTarget, workspacePath,
		sshTarget, workspacePath,
		sshTarget, workspacePath,
		sshTarget, workspacePath,
	)

	fullPrompt := fmt.Sprintf("%s\n\nTask details:\n%s", systemPrompt, message)

	// Run hermes chat on VPS (oneshot: answer and exit, no TTY hang)
	cmd := exec.CommandContext(ctx, "hermes", "chat", "-q", fullPrompt, "--oneshot", "--cli")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Timeout: 25 minutes max per task (coding tasks need many tool calls)
	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	select {
	case err := <-done:
		output := stdout.String()
		if output == "" {
			output = stderr.String()
		}
		if err != nil {
			return fmt.Sprintf("hermes chat error: %v\n%s", err, output), false
		}
		return output, true
	case <-time.After(25 * time.Minute):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		return "timeout after 25 minutes", false
	}
}

// sshRun executes one command on the given SSH target and returns combined
// output. Used by the diff/approve endpoints. BatchMode: no prompts ever.
func sshRun(target, workdir, script string) (string, int) {
	if workdir != "" {
		script = "cd " + workdir + " && " + script
	}
	cmd := exec.Command("ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", target, script)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	code := 0
	if err != nil {
		code = 1
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		}
	}
	return out.String(), code
}

// taskSSHTarget resolves the ssh target for a task row (default mac-tailscale).
func taskSSHTarget(target string) string {
	if target == "" {
		return "mac-tailscale"
	}
	if os.Getenv("KANBAN_SSH_TARGET") != "" {
		return os.Getenv("KANBAN_SSH_TARGET")
	}
	return target
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}
