package kanban

import (
	"fmt"
	"strings"
	"testing"
)

func TestValidateNewTaskAcceptsAWellFormedTask(t *testing.T) {
	ok := []struct {
		name string
		task Task
	}{
		{"minimal", Task{Title: "Add OAuth module"}},
		{"with paths", Task{Title: "Add OAuth", Paths: []string{"src/auth/**", "src/main.rs"}}},
		{"repo-wide path", Task{Title: "Sweep", Paths: []string{"**"}}},
		{"with gate", Task{Title: "Refactor", GateCommand: "go test ./..."}},
		{"start now", Task{Title: "Urgent", StartMode: "now"}},
		{"shell agentic", Task{Title: "Script", Executor: "shell", ExecutionMode: "agentic"}},
		{"shell with command", Task{Title: "Script", Executor: "shell", ExecutionMode: "direct", Command: "ls"}},
		{"workspace isolation with a workspace", Task{Title: "X", WorkspacePath: "/tmp", Isolation: "workspace"}},
		{"worktree isolation with a workspace", Task{Title: "X", WorkspacePath: "/tmp", Isolation: "worktree"}},
		{"empty isolation is accepted and defaults later", Task{Title: "X", WorkspacePath: "/tmp"}},
		{"multiline prompt", Task{Title: "Doc", Body: "line one\nline two\ttabbed"}},
		{"unicode title", Task{Title: "Tambahkan OAuth — modul autentikasi"}},
		{"dot inside path", Task{Title: "X", Paths: []string{"src/./auth"}}},
		{"path with dash inside", Task{Title: "X", Paths: []string{"src/my-module/a.go"}}},
	}
	for _, tc := range ok {
		t.Run(tc.name, func(t *testing.T) {
			if issues := ValidateNewTask(&tc.task); len(issues) != 0 {
				t.Fatalf("expected no issues, got %+v", issues)
			}
		})
	}
}

func TestValidateNewTaskRejections(t *testing.T) {
	cases := []struct {
		name      string
		task      Task
		wantCode  string
		wantField string
	}{
		{"empty title", Task{}, CodeBadRequest, "title"},
		{"whitespace title", Task{Title: "   "}, CodeBadRequest, "title"},
		{"title too long", Task{Title: strings.Repeat("a", maxTitleBytes+1)}, CodeBadRequest, "title"},
		{"title with control char", Task{Title: "bad\x00title"}, CodeBadRequest, "title"},
		{"title with escape", Task{Title: "bad\x1b[31mred"}, CodeBadRequest, "title"},
		{"body too long", Task{Title: "ok", Body: strings.Repeat("x", maxBodyBytes+1)}, CodeBadRequest, "body"},
		{"body with NUL", Task{Title: "ok", Body: "bad\x00"}, CodeBadRequest, "body"},

		{"absolute path", Task{Title: "ok", Paths: []string{"/etc/passwd"}}, CodePathLimit, "paths"},
		{"windows absolute path", Task{Title: "ok", Paths: []string{`C:\Windows\System32`}}, CodePathLimit, "paths"},
		{"unc path", Task{Title: "ok", Paths: []string{`\\server\share\file`}}, CodePathLimit, "paths"},
		{"parent escape", Task{Title: "ok", Paths: []string{"src/../../etc/passwd"}}, CodePathLimit, "paths"},
		{"leading parent", Task{Title: "ok", Paths: []string{"../other-repo"}}, CodePathLimit, "paths"},
		{"empty path", Task{Title: "ok", Paths: []string{""}}, CodePathLimit, "paths"},
		{"path with control char", Task{Title: "ok", Paths: []string{"src/\x00auth"}}, CodePathLimit, "paths"},
		{"leading dash path", Task{Title: "ok", Paths: []string{"-rf"}}, CodePathLimit, "paths"},
		{"too many paths", Task{Title: "ok", Paths: manyPaths(maxPathsPerTask + 1)}, CodePathLimit, "paths"},
		{"path too long", Task{Title: "ok", Paths: []string{strings.Repeat("a", maxPathBytes+1)}}, CodePathLimit, "paths"},

		{"gate too long", Task{Title: "ok", GateCommand: strings.Repeat("g", maxGateBytes+1)}, CodeBadRequest, "gate_command"},
		{"bad gate status", Task{Title: "ok", GateStatus: "maybe"}, CodeBadRequest, "gate_status"},
		{"bad start mode", Task{Title: "ok", StartMode: "soon"}, CodeBadRequest, "start_mode"},
		{"running status", Task{Title: "ok", Status: "running"}, CodeBadRequest, "status"},
		{"unknown executor", Task{Title: "ok", Executor: "gpt"}, CodeBadRequest, "executor"},
		{"shell direct without command", Task{Title: "ok", Executor: "shell", ExecutionMode: "direct"}, CodeBadRequest, "command"},
		{"bad isolation value", Task{Title: "ok", WorkspacePath: "/tmp", Isolation: "container"}, CodeBadRequest, "isolation"},
		{"worktree with no workspace", Task{Title: "ok", Isolation: "worktree"}, CodeBadRequest, "isolation"},
		{"worktree with a blank workspace", Task{Title: "ok", WorkspacePath: "   ", Isolation: "worktree"}, CodeBadRequest, "isolation"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			issues := ValidateNewTask(&tc.task)
			if len(issues) == 0 {
				t.Fatalf("expected an issue for %+v", tc.task)
			}
			found := false
			for _, is := range issues {
				if is.Code == tc.wantCode && is.Field == tc.wantField {
					found = true
				}
			}
			if !found {
				t.Fatalf("no issue with code=%q field=%q; got %+v", tc.wantCode, tc.wantField, issues)
			}
			if issues[0].Message == "" {
				t.Error("issue has an empty message; the form would render nothing")
			}
		})
	}
}

// TestValidateNewTaskReportsEveryProblem proves the validator does not fail
// fast: a form that only ever sees one issue at a time is a form the user plays
// whack-a-mole with.
func TestValidateNewTaskReportsEveryProblem(t *testing.T) {
	issues := ValidateNewTask(&Task{
		Title:       "",
		Body:        strings.Repeat("x", maxBodyBytes+1),
		Paths:       []string{"/absolute"},
		GateCommand: strings.Repeat("g", maxGateBytes+1),
		StartMode:   "soon",
	})
	if len(issues) < 5 {
		t.Fatalf("expected at least 5 issues, got %d: %+v", len(issues), issues)
	}
	fields := map[string]bool{}
	for _, is := range issues {
		fields[is.Field] = true
	}
	for _, want := range []string{"title", "body", "paths", "gate_command", "start_mode"} {
		if !fields[want] {
			t.Errorf("no issue reported for field %q; got fields %v", want, keysOf(fields))
		}
	}
}

// TestValidateNewTaskIsSideEffectFree matters because the dry-run endpoint calls
// it on arbitrary client JSON, including a path list that would otherwise be
// written to disk.
func TestValidateNewTaskDoesNotMutate(t *testing.T) {
	task := &Task{
		Title:     "  spaced  ",
		Paths:     []string{"  src/auth/  ", "./src//b"},
		Body:      "prompt",
		StartMode: "",
	}
	before := *task
	beforePaths := append([]string(nil), task.Paths...)
	ValidateNewTask(task)

	if task.Title != before.Title {
		t.Errorf("Title mutated: %q -> %q", before.Title, task.Title)
	}
	if task.Body != before.Body {
		t.Errorf("Body mutated: %q -> %q", before.Body, task.Body)
	}
	if task.StartMode != before.StartMode {
		t.Errorf("StartMode mutated: %q -> %q", before.StartMode, task.StartMode)
	}
	for i := range task.Paths {
		if task.Paths[i] != beforePaths[i] {
			t.Errorf("Paths[%d] mutated: %q -> %q", i, beforePaths[i], task.Paths[i])
		}
	}
}

func TestValidateNewTaskError(t *testing.T) {
	if err := ValidateNewTaskError(&Task{Title: "fine"}); err != nil {
		t.Fatalf("valid task returned an error: %v", err)
	}
	err := ValidateNewTaskError(&Task{Title: ""})
	if err == nil {
		t.Fatal("empty title returned no error")
	}
	// A single issue should be reported plainly.
	if !strings.Contains(err.Error(), "title required") {
		t.Errorf("single-issue error = %q", err)
	}
	// Several issues should be counted, not silently collapsed.
	err = ValidateNewTaskError(&Task{Title: "", StartMode: "soon"})
	if err == nil || !strings.Contains(err.Error(), "2 validation issues") {
		t.Errorf("multi-issue error = %q, want a count of 2", err)
	}
}

func TestIssueImplementsError(t *testing.T) {
	err := error(Issue{Code: CodeLeaseConflict, Message: `"src/auth/**" held by t1`})
	want := `lease_conflict: "src/auth/**" held by t1`
	if err.Error() != want {
		t.Errorf("Issue.Error() = %q, want %q", err.Error(), want)
	}
}

func manyPaths(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("src/pkg%d/file.go", i)
	}
	return out
}

func keysOf(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
