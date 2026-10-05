package kanban

import (
	"fmt"
	"path"
	"strings"
	"unicode"
)

// Create-time validation.
//
// ValidateNewTask is the single source of truth for "is this task well formed".
// Both POST /tasks (the real create) and POST /tasks/validate (the dry run) call
// it, so the advice the form shows before submit cannot drift from the rejection
// the server would issue. That is the whole reason this is one function rather
// than two.
//
// Field caps exist because the board is reachable by automation (MCP tools, the
// CLI) as well as by hand, and nothing else bounds growth. A task is a unit of
// work, not a file transfer.

// Error codes. The UI and any MCP client branch on these rather than on message
// text, so they are part of the API contract.
const (
	CodeBadRequest       = "bad_request"
	CodePathLimit        = "path_limit"
	CodeDepsNotDone      = "deps_not_done"
	CodeLeaseConflict    = "lease_conflict"
	CodeExecutorUnavail  = "executor_unavailable"
	CodeWorkspaceMissing = "workspace_not_found"
	CodeGateRunning      = "gate_running"
	CodeNotRetryable     = "not_retryable"
	CodeDependentStarted = "dependent_started"
)

const (
	maxTitleBytes   = 256
	maxBodyBytes    = 32 << 10
	maxPathsPerTask = 64
	maxPathBytes    = 1024
	maxGateBytes    = 4 << 10
	// A design source is a repo-relative path, not a command, so it is capped
	// like a path rather than like shell text.
	maxDesignSourceBytes = 256
	maxActiveLeases      = 1024
)

// Issue is one validation problem. Issues are returned as a list rather than
// failing fast, so the form can show everything that is wrong at once.
type Issue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// Field names the input, so the form can attach the message to the right
	// control instead of showing one undifferentiated list.
	Field string `json:"field,omitempty"`
}

func (i Issue) Error() string { return i.Code + ": " + i.Message }

// hasControlChars reports whether s contains characters that would corrupt a
// terminal, a log line, or an SSE frame. Tab, newline and carriage return are
// allowed because a prompt legitimately contains them.
func hasControlChars(s string) bool {
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' {
			continue
		}
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

// ValidateNewTask checks a prospective task and returns every problem found.
//
// It writes nothing and touches no database, so it is safe to call from the
// dry-run endpoint. Lease conflicts are deliberately NOT checked here: they
// need the claim transaction to be meaningful, and reporting them from a read
// would be advice the claim could contradict a moment later.
func ValidateNewTask(t *Task) []Issue {
	var issues []Issue
	add := func(code, field, format string, args ...any) {
		issues = append(issues, Issue{Code: code, Field: field, Message: fmt.Sprintf(format, args...)})
	}

	// Title.
	title := strings.TrimSpace(t.Title)
	switch {
	case title == "":
		add(CodeBadRequest, "title", "title required")
	case len(title) > maxTitleBytes:
		add(CodeBadRequest, "title", "title is %d bytes, maximum is %d", len(title), maxTitleBytes)
	case hasControlChars(title):
		add(CodeBadRequest, "title", "title must not contain control characters")
	}

	// Prompt / body.
	if len(t.Body) > maxBodyBytes {
		add(CodeBadRequest, "body", "prompt is %d bytes, maximum is %d", len(t.Body), maxBodyBytes)
	} else if hasControlChars(t.Body) {
		add(CodeBadRequest, "body", "prompt must not contain control characters")
	}

	// Declared paths.
	if len(t.Paths) > maxPathsPerTask {
		add(CodePathLimit, "paths", "%d paths declared, maximum is %d", len(t.Paths), maxPathsPerTask)
	}
	for _, p := range t.Paths {
		if len(p) > maxPathBytes {
			add(CodePathLimit, "paths", "path %q is %d bytes, maximum is %d", p, len(p), maxPathBytes)
			continue
		}
		if msg, ok := validateScopedPath(p); !ok {
			add(CodePathLimit, "paths", "%s", msg)
		}
	}

	// Quality gate command.
	if len(t.GateCommand) > maxGateBytes {
		add(CodeBadRequest, "gate_command", "gate command is %d bytes, maximum is %d", len(t.GateCommand), maxGateBytes)
	}
	if t.GateStatus != "" && t.GateStatus != "running" && t.GateStatus != "passed" && t.GateStatus != "failed" {
		add(CodeBadRequest, "gate_status", "gate_status %q is not one of running/passed/failed", t.GateStatus)
	}

	// Start mode.
	if t.StartMode != "" && t.StartMode != "manual" && t.StartMode != "now" {
		add(CodeBadRequest, "start_mode", "start_mode %q is not one of manual/now", t.StartMode)
	}

	// Isolation. A worktree needs a workspace to make a worktree of, and it
	// needs that workspace to be a git repository — which cannot be checked
	// here, because git only exists on the worker. So this catches the
	// obviously-wrong case and the dispatch step catches the rest.
	if t.Isolation != "" && t.Isolation != "workspace" && t.Isolation != "worktree" {
		add(CodeBadRequest, "isolation", "isolation %q is not one of workspace/worktree", t.Isolation)
	}
	if t.Isolation == "worktree" && strings.TrimSpace(t.WorkspacePath) == "" {
		add(CodeBadRequest, "isolation",
			"worktree isolation needs a workspace: there is no repository to make a worktree of")
	}

	// Verification profile. "" is the auto case, not a rung of its own: routing
	// resolves it from the diff, and a non-UI diff resolves to none.
	if t.VerifyProfile != "" && !ValidVerifyProfiles[t.VerifyProfile] {
		add(CodeBadRequest, "verify_profile", "verify_profile %q is not one of %s",
			t.VerifyProfile, strings.Join(VerifyProfileLadder, "/"))
	}
	// Design source. A path, not a command, so it gets a path-sized cap and a
	// traversal check rather than the gate's shell treatment. It is passed to
	// the worker as an argument, so a "../" here would read outside the repo.
	if len(t.DesignSource) > maxDesignSourceBytes {
		add(CodeBadRequest, "design_source", "design source is %d bytes, maximum is %d", len(t.DesignSource), maxDesignSourceBytes)
	}
	if hasControlChars(t.DesignSource) {
		add(CodeBadRequest, "design_source", "design source contains control characters")
	}
	if t.DesignSource != "" && (strings.HasPrefix(t.DesignSource, "/") || strings.Contains(t.DesignSource, "..")) {
		add(CodeBadRequest, "design_source",
			"design source must be a repo-relative path like design/task-card.pen, not %q", t.DesignSource)
	}

	// Existing rules, restated so the dry run reports them with the same codes
	// rather than as a bare error string.
	if t.Executor == "shell" && t.ExecutionMode == "direct" && strings.TrimSpace(t.Command) == "" {
		add(CodeBadRequest, "command", "shell executor requires a command in direct mode")
	}
	if t.Executor != "" && !ValidExecutors[t.Executor] {
		add(CodeBadRequest, "executor", "unknown executor %q", t.Executor)
	}
	if t.Status != "" && t.Status == "running" {
		add(CodeBadRequest, "status", "status 'running' is dispatcher-owned; use todo or ready")
	}
	return issues
}

// validateScopedPath enforces that a declared glob stays inside the workspace.
//
// A glob is a claim about the working tree, so an absolute path or a ".."
// segment either escapes the workspace or means something the operator did not
// intend. Both are rejected rather than normalized away: silently rewriting
// "src/../../etc/passwd" into a plausible-looking path would hide a mistake.
func validateScopedPath(p string) (string, bool) {
	trimmed := strings.TrimSpace(p)
	if trimmed == "" {
		return "path must not be empty", false
	}
	if hasControlChars(trimmed) {
		return fmt.Sprintf("path %q must not contain control characters", p), false
	}
	slashed := strings.ReplaceAll(trimmed, `\`, "/")
	if path.IsAbs(slashed) || strings.HasPrefix(slashed, "/") {
		return fmt.Sprintf("path %q must be relative to the workspace", p), false
	}
	// A Windows drive letter is absolute too, and a UNC path starts with a
	// separator once backslashes are converted.
	if len(slashed) >= 2 && slashed[1] == ':' {
		return fmt.Sprintf("path %q must be relative to the workspace", p), false
	}
	for _, seg := range strings.Split(slashed, "/") {
		if seg == ".." {
			return fmt.Sprintf("path %q must not escape the workspace with '..'", p), false
		}
	}
	if strings.HasPrefix(trimmed, "-") {
		// Leading dash would be read as a flag by any tool that consumes the
		// path, e.g. when a glob is handed to a shell command.
		return fmt.Sprintf("path %q must not start with '-'", p), false
	}
	return "", true
}

// ValidateNewTaskError collapses issues into a single error for callers that
// only need pass/fail, such as CreateTask.
func ValidateNewTaskError(t *Task) error {
	issues := ValidateNewTask(t)
	if len(issues) == 0 {
		return nil
	}
	// Report the first issue as the headline but count the rest, so the log
	// shows there was more than one thing wrong.
	first := issues[0]
	if len(issues) == 1 {
		return first
	}
	return fmt.Errorf("%s (%d validation issues, first: %s)", first.Message, len(issues), first.Message)
}
