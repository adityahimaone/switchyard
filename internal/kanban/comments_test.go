package kanban

import (
	"strings"
	"testing"
)

func TestReviewCommentRequeuesWithoutMention(t *testing.T) {
	slug := testBoard(t)
	task := Task{Title: "review me", Status: "review", Assignee: "agent"}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	comment, err := AddComment(slug, task.ID, "reviewer", "please fix the failing test")
	if err != nil {
		t.Fatal(err)
	}
	if !comment.Requeued {
		t.Fatal("review comment was not marked requeued")
	}
	if got, err := TaskStatus(slug, task.ID); err != nil || got != "todo" {
		t.Fatalf("status = %q, err=%v; want todo", got, err)
	}
}

func TestDoneCommentStillRequiresMention(t *testing.T) {
	slug := testBoard(t)
	task := Task{Title: "done task", Status: "done", Assignee: "agent"}
	if err := CreateTask(slug, &task); err != nil {
		t.Fatal(err)
	}
	comment, err := AddComment(slug, task.ID, "reviewer", "unrelated note")
	if err != nil {
		t.Fatal(err)
	}
	if comment.Requeued {
		t.Fatal("done task reopened without an assignee mention")
	}
}

func TestFocusedGitReviewPrompt(t *testing.T) {
	got, ok := FocusedGitReviewPrompt("go to main branch then git pull\n@board-ui: @default git log 5 last commit")
	if !ok {
		t.Fatal("expected focused git prompt")
	}
	for _, want := range []string{
		"Switch to main branch.",
		"Pull latest changes.",
		"Show last 5 commits.",
		"Do not modify files.",
		"Return command output only.",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt %q missing %q", got, want)
		}
	}
	if strings.Contains(got, "Recent Comments") || strings.Contains(got, "Resume the existing DSH session") {
		t.Fatalf("focused prompt retained broad continuation context: %q", got)
	}
}

func TestFocusedGitReviewPromptRejectsCodeFeedback(t *testing.T) {
	if got, ok := FocusedGitReviewPrompt("fix failing contact form and update validation"); ok || got != "" {
		t.Fatalf("expected normal review feedback fallback, got %q, focused=%t", got, ok)
	}
}

func TestRenderReviewCommentAttributesTaskAndPreservesBody(t *testing.T) {
	got := RenderReviewComments("t_91399069", "Fix harness", []TaskComment{{Author: "reviewer", Body: "keep same session"}})
	for _, want := range []string{
		`[Switchyard review comment — task t_91399069, card "Fix harness"]`,
		"Reviewer: reviewer",
		"Comment:\nkeep same session",
		"do not restart the task from scratch",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt %q missing %q", got, want)
		}
	}
}
