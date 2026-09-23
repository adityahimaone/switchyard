# Focused Git Review Prompt Implementation Plan

> **For AI agents:** Implement with TDD. Track each checkbox.

**Goal:** Keep simple Git review comments focused, ordered, and low-token while preserving rich continuation prompts for code-review work.

**Architecture:** Add one pure prompt-classification/assembly helper in `internal/kanban`. Use it only when comment text contains supported Git inspection operations. Existing continuation assembly remains fallback. Add unit coverage for focused and normal comments.

**Tech stack:** Go, existing SQLite/kanban test helpers.

---

### Task 1: Focused prompt helper

**Files:**
- Modify: `internal/kanban/comments.go`
- Test: `internal/kanban/comments_test.go`

- [ ] Add failing tests for `git pull` + `git log 5 last commit` producing ordered, read-only focused instructions.
- [ ] Run targeted test and confirm failure because helper does not exist.
- [ ] Implement minimum classifier/renderer. Support `git log`, `git status`, `git pull`, and branch switch. Keep unknown comments on existing path.
- [ ] Run targeted tests and full `internal/kanban` tests.

### Task 2: Dispatcher integration

**Files:**
- Modify: `internal/kanban/dataops.go` or current continuation assembly caller found during implementation.
- Test: `internal/kanban/dataops_test.go`.

- [ ] Route focused comments through compact helper before executor dispatch.
- [ ] Verify normal review comments retain existing continuation wrapper.
- [ ] Run Go tests, vet, and diff checks.

### Task 3: Verification

- [ ] Run `go test ./...`.
- [ ] Run `go vet ./...`.
- [ ] Update progress evidence.
- [ ] Commit focused prompt slice only.
