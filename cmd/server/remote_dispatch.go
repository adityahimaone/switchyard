package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"kanban-board/internal/kanban"

	_ "modernc.org/sqlite"
)

var (
	inFlightTasks  sync.Map // map[taskID string]bool
	migratedBoards sync.Map // map[boardSlug string]bool
	nodeSemMu      sync.Mutex
	nodeSemaphores = map[string]chan struct{}{}
	dispatchWG     sync.WaitGroup
)

func maxConcurrentPerNode() int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("KANBAN_MAX_CONCURRENT_PER_NODE"))); err == nil && v > 0 {
		return v
	}
	return 3
}

func nodeSemaphore(sshTarget string) chan struct{} {
	key := strings.TrimSpace(sshTarget)
	if key == "" {
		key = "default-node"
	}
	nodeSemMu.Lock()
	defer nodeSemMu.Unlock()
	sem, ok := nodeSemaphores[key]
	if !ok {
		sem = make(chan struct{}, maxConcurrentPerNode())
		nodeSemaphores[key] = sem
	}
	return sem
}

func ensureBoardMigratedOnce(slug string) error {
	if _, ok := migratedBoards.Load(slug); ok {
		return nil
	}
	if _, err := kanban.MigrateBoardSchemaPublic(slug); err != nil {
		return err
	}
	migratedBoards.Store(slug, true)
	return nil
}

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
	case "claude":
		return "Claude Code"
	}
	return "DSH"
}

func dispatchDSHSessionID(binding kanban.HarnessBinding, continuation bool) string {
	return dispatchHarnessSessionID(binding, continuation)
}

// startRemoteDispatcher polls all boards for todo tasks with
// workspace_transport='node-agent' and dispatches them via node-agent instead
// of letting the Hermes Python dispatcher try (and fail) to spawn locally.
//
// The context is the shutdown signal: cancelling it stops the poll loop so a
// draining server never claims a new task.
func startRemoteDispatcher(ctx context.Context) {
	go func() {
		// One pass at boot: cards created while the server was down
		// (or in the second before this loop started) dispatch now
		// rather than waiting out the first 30s tick.
		dispatchPendingRemoteTasks()
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("remote-dispatcher: stopped")
				return
			case <-ticker.C:
				dispatchPendingRemoteTasks()
			case <-kanban.DispatcherWake():
				// A state change made a card dispatchable — a
				// create, a comment requeue, a retry, a release,
				// an approval, or an explicit start — so run a
				// pass now instead of waiting for the next tick.
				dispatchPendingRemoteTasks()
			}
		}
	}()
	log.Println("remote-dispatcher: started (poll 30s, wake on change)")
}

// dispatchCandidate is one card the dispatch selection surfaced.
type dispatchCandidate struct {
	id, title, body, result, lastError, ws, executor, assignee, command, executionMode, sshTarget, gateCommand, isolation, verifyProfile, designSource, designTool string
	baseBranch, model, effort, commandCodeMode, designScope, penAgent, penModel                                                                                   string
	maxIterations                                                                                                                                                  int
}

// pendingDispatchCandidates runs the dispatch selection.
//
// Priority orders the queue — highest first, oldest first within a
// priority — and the NOT EXISTS excludes cards still waiting on a
// dependency, so a run of blocked cards cannot crowd out the free
// cards a bare LIMIT would never reach. The claim path re-checks
// both rules at claim time; this keeps the poll itself from even
// considering a card that cannot run.
func pendingDispatchCandidates(db *sql.DB) ([]dispatchCandidate, error) {
	rows, err := db.Query(`SELECT id, title, COALESCE(body,''), COALESCE(result,''), COALESCE(last_failure_error,''), workspace_path, COALESCE(executor,'auto'), COALESCE(assignee,''), COALESCE(command,''), COALESCE(execution_mode,'direct'), COALESCE(max_iterations,1), COALESCE(workspace_ssh_target,''), COALESCE(gate_command,''), COALESCE(isolation,'workspace'), COALESCE(base_branch,''), COALESCE(verify_profile,''), COALESCE(design_source,''), COALESCE(design_tool,''), COALESCE(model,''), COALESCE(effort,''), COALESCE(commandcode_mode,''), COALESCE(design_scope,'design_only'), COALESCE(pen_agent,'gemini'), COALESCE(pen_model,'') FROM tasks WHERE status IN ('todo','ready') AND workspace_transport='node-agent'
		AND NOT EXISTS (
			SELECT 1 FROM task_dependencies d
			LEFT JOIN tasks dt ON dt.id = d.depends_on_id
			WHERE d.task_id = tasks.id AND COALESCE(dt.status,'') <> 'done'
		)
		ORDER BY priority DESC, created_at ASC LIMIT 5`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pending []dispatchCandidate
	for rows.Next() {
		var r dispatchCandidate
		if err := rows.Scan(&r.id, &r.title, &r.body, &r.result, &r.lastError, &r.ws, &r.executor, &r.assignee, &r.command, &r.executionMode, &r.maxIterations, &r.sshTarget, &r.gateCommand, &r.isolation, &r.baseBranch, &r.verifyProfile, &r.designSource, &r.designTool, &r.model, &r.effort, &r.commandCodeMode, &r.designScope, &r.penAgent, &r.penModel); err != nil {
			return nil, err
		}
		if r.ws != "" {
			pending = append(pending, r)
		}
	}
	return pending, rows.Err()
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
		if mErr := ensureBoardMigratedOnce(b.Slug); mErr != nil {
			log.Printf("remote-dispatcher: board %s: schema migration failed: %v", b.Slug, mErr)
			db.Close()
			continue
		}
		pending, err := pendingDispatchCandidates(db)
		if err != nil {
			log.Printf("remote-dispatcher: board %s: query failed: %v", b.Slug, err)
			db.Close()
			continue
		}
		for _, r := range pending {
			if _, alreadyRunning := inFlightTasks.LoadOrStore(r.id, true); alreadyRunning {
				continue
			}
			sem := nodeSemaphore(r.sshTarget)
			select {
			case sem <- struct{}{}:
			default:
				inFlightTasks.Delete(r.id)
				continue
			}
			releaseSlot := func() {
				<-sem
				inFlightTasks.Delete(r.id)
			}

			continuity := kanban.HarnessContinuityEnabled(r.executor)
			var binding kanban.HarnessBinding
			var sessionContinuation bool
			if continuity {
				var err error
				binding, sessionContinuation, err = kanban.ResolveHarnessBindingFor(db, b.Slug, r.id, r.ws, r.executor)
				if err != nil {
					log.Printf("remote-dispatcher: %s binding failed: %v", r.id, err)
					releaseSlot()
					continue
				}
			}
			dshSessionID := dispatchHarnessSessionID(binding, sessionContinuation)
			msg := r.body
			focusedGitPrompt := false
			if msg == "" {
				msg = r.title
			}
			var lastCommentID *int64
			hasReviewFeedback := false
			if continuity {
				commentCursor := binding.LastCommentID
				lastCommentID = &commentCursor
				comments, err := kanban.TaskCommentsAfter(db, r.id, binding.LastCommentID)
				if err != nil {
					log.Printf("remote-dispatcher: %s comment lookup failed: %v", r.id, err)
					releaseSlot()
					continue
				}
				if len(comments) > 0 {
					hasReviewFeedback = true
					id := comments[len(comments)-1].ID
					lastCommentID = &id
					feedback := kanban.RenderReviewComments(r.id, r.title, comments)
					commentBodies := make([]string, 0, len(comments))
					for _, comment := range comments {
						commentBodies = append(commentBodies, comment.Body)
					}
					if compact, ok := kanban.FocusedGitReviewPrompt(strings.Join(commentBodies, "\n")); ok {
						msg, focusedGitPrompt = compact, true
					} else if sessionContinuation {
						msg = feedback
					} else {
						msg += "\n\n" + feedback
					}
				} else if sessionContinuation {
					msg = fmt.Sprintf("[CONTINUATION] Resume the existing %s session and apply only the new task feedback below.\n\n%s", harnessLabel(r.executor), msg)
				}
			}
			if continuity && !hasReviewFeedback {
				if compact, ok := kanban.FocusedGitReviewPrompt(msg); ok {
					msg, focusedGitPrompt = compact, true
				}
			}
			// WS-3: Lossless structured Context Pack for cold re-runs
			if !focusedGitPrompt && !sessionContinuation && (r.result != "" || hasReviewFeedback) {
				msg = kanban.BuildColdRerunContextPack(db, r.id, r.ws, r.title, r.body, r.result)
			}
			// Design Mock Mandate
			if strings.TrimSpace(r.designTool) == "" {
				msg = appendDesignReference(msg, r.designSource)
			}
			msg = appendDesignMandate(msg, r.designTool, r.designSource, r.title, r.designScope, r.penAgent, r.penModel)
			command := r.command
			if r.executor == "shell" && r.executionMode != "agentic" && command == "" {
				if r.designTool == "pen_cli" {
					command = buildDirectPenCommand(r.designSource, r.title, r.body, r.penAgent, r.penModel)
				} else {
					log.Printf("remote-dispatcher: %s blocked: shell executor requires command", r.id)
					releaseSlot()
					continue
				}
			}

			// WS-3: Cached Task Identity lookup
			var identity kanban.TaskIdentity
			if cached, err := kanban.LoadTaskIdentity(db, r.id); err == nil && cached != nil {
				identity = *cached
			} else {
				identity = kanban.IdentifyTask(context.Background(), r.title, r.body)
				_ = kanban.PersistTaskIdentity(db, r.id, identity)
			}
			if !focusedGitPrompt {
				msg = kanban.PrepareTaskExecutionMessage(r.id, msg, identity)
			}
			var wsLabels []string
			if wsObj, err := kanban.FindWorkspace(r.ws); err == nil && wsObj != nil {
				wsLabels = wsObj.Labels
			}
			msg = kanban.AugmentSAASPrompt(msg, r.ws, wsLabels)
			model, modelErr := kanban.ProfileModel(r.assignee)
			if strings.TrimSpace(r.model) != "" {
				model = strings.TrimSpace(r.model)
				modelErr = nil
			}
			if (r.executor == "commandcode" || r.executor == "cmd") && strings.EqualFold(strings.TrimSpace(model), "cheap") {
				model = "deepseek/deepseek-v4.1-flash"
			}
			if modelErr != nil && continuity {
				log.Printf("remote-dispatcher: %s blocked: %v", r.id, modelErr)
				releaseSlot()
				continue
			}
			req := kanban.NodeDispatchRequest{
				TaskID:              r.id,
				Title:               r.title,
				Board:               b.Slug,
				Message:             msg,
				Workspace:           r.ws,
				Model:               model,
				Effort:              strings.TrimSpace(r.effort),
				Provider:            r.assignee,
				Executor:            r.executor,
				Command:             command,
				ExecutionMode:       r.executionMode,
				MaxIterations:       r.maxIterations,
				Acceptance:          strings.TrimSpace(r.title + "\n" + r.body),
				DSHWorkspaceID:      binding.HarnessWorkspaceID,
				DSHSessionID:        dshSessionID,
				DSHPermissionMode:   "danger-full-access",
				CommandCodeMode:     strings.TrimSpace(r.commandCodeMode),
				SessionContinuation: sessionContinuation,
			}
			if continuity {
				kanban.ApplyHarnessIdentity(&req, r.executor, dshSessionID)
				req.LastTurnSeq = &binding.LastTurnSeq
				req.LastCommentID = lastCommentID
			}

			project := kanban.LeaseProjectFor(kanban.Workspace{Path: r.ws, Host: r.sshTarget})
			claim, err := kanban.ClaimTaskRunGuarded(db, r.id, project)
			if err != nil {
				if kanban.IsRejection(err) {
					log.Printf("remote-dispatcher: %s not claimed: %v", r.id, err)
					releaseSlot()
					continue
				}
				log.Printf("remote-dispatcher: %s claim failed: %v", r.id, err)
				releaseSlot()
				continue
			}
			if !claim.Claimed {
				releaseSlot()
				continue
			}
			runID := claim.RunID
			req.CardID = r.id
			req.TaskID = runID
			req.RunID = runID

			// WS-5: Auto-Isolation selection
			effectiveIsolation := strings.TrimSpace(r.isolation)
			if effectiveIsolation == "" || effectiveIsolation == "auto" {
				var otherActive int
				_ = db.QueryRow(`SELECT COUNT(1) FROM tasks WHERE id != ? AND workspace_path = ? AND status IN ('running', 'review')`, r.id, r.ws).Scan(&otherActive)
				if otherActive > 0 {
					effectiveIsolation = "worktree"
				} else {
					effectiveIsolation = "workspace"
				}
			}

			workWorkspace := r.ws
			if effectiveIsolation == "worktree" {
				wt, wtErr := kanban.EnsureTaskWorktree(db, r.id, r.ws, r.baseBranch)
				if wtErr != nil {
					log.Printf("remote-dispatcher: %s worktree setup failed: %v", r.id, wtErr)
					_, _ = db.Exec(`UPDATE tasks SET status='blocked', completed_at=?, last_failure_error=?, current_run_id=NULL
						WHERE id=? AND current_run_id=?`,
						time.Now().Unix(), "worktree setup failed: "+truncate(wtErr.Error(), 300), r.id, runID)
					releaseSlot()
					continue
				}
				workWorkspace = wt
			}
			req.Workspace = workWorkspace

			log.Printf("remote-dispatcher: dispatching %s (%s) via node-agent workspace=%q isolation=%q workspace_id=%q session_id=%q last_turn_seq=%d continuation=%t",
				r.id, b.Slug, workWorkspace, effectiveIsolation, binding.HarnessWorkspaceID, dshSessionID, binding.LastTurnSeq, sessionContinuation)

			req.TimeoutS = int(kanban.RemoteJobTimeoutForTask(r.executionMode, r.designTool).Seconds())
			effectiveDesignSource := strings.TrimSpace(r.designSource)
			if effectiveDesignSource == "" && (r.designTool == "pen_cli" || r.designTool == "pencil_mcp") {
				effectiveDesignSource = kanban.DesignPathForTitle(r.title)
			}

			// WS-1: Run dispatch + gate + verify in non-blocking goroutine
			dispatchWG.Add(1)
			go func(boardSlug string, cand dispatchCandidate, dispatchReq kanban.NodeDispatchRequest, targetWorkWS, effDesign string, nodeSem chan struct{}) {
				defer func() {
					dispatchWG.Done()
					<-nodeSem
					inFlightTasks.Delete(cand.id)
					kanban.WakeDispatcher()
				}()
				_, err := kanban.DispatchRemote(dispatchReq, kanban.RemoteDispatchWaitForTask(cand.executionMode, cand.designTool))
				if effDesign != "" {
					kanban.CaptureDesignExport(boardSlug, cand.id, targetWorkWS, effDesign)
				}
				if err != nil {
					log.Printf("remote-dispatcher: %s failed: %v", cand.id, err)
					return
				}
				log.Printf("remote-dispatcher: %s completed", cand.id)
				runQualityGate(boardSlug, cand.id, targetWorkWS, cand.title, cand.gateCommand)
				runTaskVerify(boardSlug, cand.id, targetWorkWS, cand.title, cand.verifyProfile, effDesign)
			}(b.Slug, r, req, workWorkspace, effectiveDesignSource, sem)
		}
		db.Close()
	}
	if testing.Testing() && os.Getenv("KANBAN_FORCE_ASYNC_DISPATCH") != "1" {
		dispatchWG.Wait()
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

// appendDesignReference adds the committed design mock to a task's
// dispatch prompt. The path is repository-relative — the worker's
// workspace is a checkout, so the .pen and its export resolve there.
// Empty (or blank) design_source returns the prompt untouched, which
// is the no-design-source card: pen is never mentioned, never invoked.
func appendDesignReference(msg, designSource string) string {
	if strings.TrimSpace(designSource) == "" {
		return msg
	}
	return msg + "\n\n--- Design Reference ---\n" +
		"A design mock for this card is committed at " + designSource + " in the repository.\n" +
		"Read the .pen file (plain JSON) and the PNG exported beside it, then implement to match the design.\n" +
		"The design is the reference this card is graded against — do not regenerate or move it.\n" +
		"--- End Design Reference ---"
}

// appendDesignMandate renders the design-tool switch into a task's
// dispatch prompt. A pen_cli card is told to generate its mock with
// the headless pen CLI — the only pen.dev surface that can create a
// new .pen file on a worker. When designScope is "design_only", it strictly
// forbids application code changes.
func appendDesignMandate(msg, designTool, designSource, title, designScope, penAgent, penModel string) string {
	tool := strings.ToLower(strings.TrimSpace(designTool))
	if tool != "pen_cli" && tool != "pencil_mcp" {
		return msg
	}
	out := strings.TrimSpace(designSource)
	if out == "" {
		out = kanban.DesignPathForTitle(title)
	}

	agent := strings.ToLower(strings.TrimSpace(penAgent))
	if agent == "" {
		agent = "gemini"
	}
	model := strings.TrimSpace(penModel)
	if strings.Contains(model, ":") {
		parts := strings.SplitN(model, ":", 2)
		agent = strings.ToLower(parts[0])
		model = parts[1]
	}
	modelArg := ""
	if model != "" {
		modelArg = " --model " + model
	}

	scope := strings.ToLower(strings.TrimSpace(designScope))
	if scope == "" {
		scope = "design_only"
	}

	if scope == "design_only" {
		return msg + "\n\n--- pen.dev Design Only (pen CLI) ---\n" +
			"CRITICAL: This card is strictly DESIGN ONLY. Do NOT create, edit, or modify application source code, components, routes, or styles.\n" +
			"Do NOT touch files in app/, features/, components/, or src/.\n" +
			"1. Generate the design mock using the pen.dev CLI:\n" +
			"   pen --out " + out + " --prompt \"<the design intent from this card's body>\" --export " + designExportPath(out) + " --export-scale 1 --agent " + agent + modelArg + "\n" +
			"2. Assert " + out + " parses as valid JSON and " + designExportPath(out) + " exists.\n" +
			"3. Register the surface in design/manifest.json (and optional design/system.md).\n" +
			"4. Commit only design artifacts (" + out + ", " + designExportPath(out) + ", design/manifest.json) and STOP immediately.\n" +
			"Your task is fully accomplished once the design files are produced and verified.\n" +
			"--- End pen.dev Design Only ---"
	}

	if tool == "pencil_mcp" {
		return msg + "\n\n--- pen.dev Design (pencil MCP / pen CLI) ---\n" +
			"This card requires a pen.dev design file at " + out + " (with PNG export at " + designExportPath(out) + ").\n" +
			"1. If " + out + " does not exist yet (or is empty), generate it first with the headless pen CLI:\n" +
			"   pen --out " + out + " --prompt \"<concise design intent from this card>\" --export " + designExportPath(out) + " --export-scale 1 --agent " + agent + modelArg + "\n" +
			"   (If the Pencil desktop MCP server has the document open, you may also inspect/edit it via MCP, but ensure " + out + " and " + designExportPath(out) + " are saved on disk.)\n" +
			"2. Verify " + out + " is valid JSON and " + designExportPath(out) + " exists.\n" +
			"3. Implement the application code to match the design.\n" +
			"--- End pen.dev Design ---"
	}
	return msg + "\n\n--- pen.dev Design & Code (pen CLI) ---\n" +
		"This card's design must be produced with the pen.dev CLI (pen), which is installed and\n" +
		"authenticated on the worker node. Do not use the desktop app or the pencil MCP to create\n" +
		"the file: the MCP edits only the document already open in the app and cannot save a new one.\n" +
		"1. Generate the mock:\n" +
		"   pen --out " + out + " --prompt \"<the design intent from this card's body>\" --export " + designExportPath(out) + " --export-scale 1 --agent " + agent + modelArg + "\n" +
		"   (the default claude agent may have no API key on the node; gemini is the reliable backend)\n" +
		"2. Assert " + out + " parses as JSON and " + designExportPath(out) + " exists.\n" +
		"3. Register the surface in design/manifest.json (route, export, viewport measured from the\n" +
		"   export, theme).\n" +
		"4. Commit only the design artifacts, then implement this card to the committed design.\n" +
		"If " + out + " already exists and is non-empty, keep it and implement to it — do not regenerate.\n" +
		"--- End pen.dev Design ---"
}

func buildDirectPenCommand(designSource, title, body, penAgent, penModel string) string {
	out := strings.TrimSpace(designSource)
	if out == "" {
		out = kanban.DesignPathForTitle(title)
	}
	export := designExportPath(out)
	prompt := strings.TrimSpace(body)
	if prompt == "" {
		prompt = strings.TrimSpace(title)
	}
	cleanPrompt := strings.ReplaceAll(prompt, `"`, `\"`)
	cleanPrompt = strings.ReplaceAll(cleanPrompt, "`", `\`+"`")
	cleanPrompt = strings.ReplaceAll(cleanPrompt, "$", `\$`)

	agent := strings.ToLower(strings.TrimSpace(penAgent))
	if agent == "" {
		agent = "gemini"
	}
	model := strings.TrimSpace(penModel)
	if strings.Contains(model, ":") {
		parts := strings.SplitN(model, ":", 2)
		agent = strings.ToLower(parts[0])
		model = parts[1]
	}
	modelArg := ""
	if model != "" {
		modelArg = " --model " + model
	}

	envPrefix := ""
	home, _ := os.UserHomeDir()
	if home != "" {
		agentAuthPath := filepath.Join(home, ".pencil", "agent-auth")
		if data, err := os.ReadFile(agentAuthPath); err == nil {
			var parsed map[string]struct {
				Type string `json:"type"`
				Key  string `json:"key"`
			}
			if err := json.Unmarshal(data, &parsed); err == nil {
				if entry, ok := parsed[agent]; ok && entry.Key != "" {
					envPrefix = fmt.Sprintf("PEN_AGENT_API_KEY=%q ", entry.Key)
				}
			}
		}
	}

	return fmt.Sprintf(`mkdir -p "$(dirname %q)" "$(dirname %q)" && %spen --out %q --prompt %q --export %q --export-scale 1 --agent %q%s`,
		out, export, envPrefix, out, cleanPrompt, export, agent, modelArg)
}

// designExportPath is where a design mock's PNG export lands:
// an exports/ directory beside the .pen, matching the layout the
// manifest and the verify artifact transport already use.
func designExportPath(penPath string) string {
	dir := ""
	if i := strings.LastIndex(penPath, "/"); i >= 0 {
		dir = penPath[:i+1]
	}
	base := strings.TrimSuffix(penPath, ".pen")
	if i := strings.LastIndex(base, "/"); i >= 0 {
		base = base[i+1:]
	}
	return dir + "exports/" + base + ".png"
}

// runTaskVerify resolves a task's verification rung from its diff and runs it.
//
// A no-op when the hook is disabled (KANBAN_VERIFY_ENABLED=0), which restores
// today's dispatcher exactly. Every other outcome is recorded rather than fatal:
// like the gate, a failed or skipped verify leaves the card in review with its
// diff, and the verdict is what the approve button refuses.
func runTaskVerify(slug, taskID, workspace, title, declaredProfile, designSource string) {
	if !kanban.VerifyEnabled() {
		return
	}
	if err := kanban.RunVerify(slug, taskID, workspace, title, declaredProfile, designSource); err != nil {
		log.Printf("verify: %s: %v", taskID, err)
	}
}
