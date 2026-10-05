package kanban

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// verifyBoard creates a board with one task for the verify tests, in review —
// the only state verification applies to.
func verifyBoard(t *testing.T, task Task) {
	t.Helper()
	t.Setenv("HERMES_HOME", t.TempDir())
	if err := EnsureImportSchemaPublic("default"); err != nil {
		t.Fatalf("schema: %v", err)
	}
	if task.Status == "" {
		task.Status = "review"
	}
	if err := CreateTask("default", &task); err != nil {
		t.Fatalf("create: %v", err)
	}
}

func verifyDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := openDB("default")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// testFlowPaths mirrors web/e2e-flows.txt, including the glob entry.
var testFlowPaths = []string{
	"web/src/features/board/",
	"web/src/features/chat/",
	"web/src/App.tsx",
	"cmd/server/auth*.go",
}

func TestVerifyProfileRouting(t *testing.T) {
	cases := []struct {
		name    string
		declare string
		files   []string
		want    string
	}{
		{
			name:  "no files means nothing to check",
			files: nil,
			want:  VerifyNone,
		},
		{
			name:  "a go-only change is not a UI change",
			files: []string{"internal/kanban/gate.go", "cmd/server/review.go"},
			want:  VerifyNone,
		},
		{
			name:  "a change outside web/src is not a UI change either",
			files: []string{"web/package.json", "web/playwright.config.ts"},
			want:  VerifyNone,
		},
		{
			name:  "a web/src change outside the flow list escalates to ui",
			files: []string{"web/src/components/feedback/attachment-chip.tsx"},
			want:  VerifyUI,
		},
		{
			name:  "a flow-owning path escalates to e2e",
			files: []string{"web/src/features/chat/ChatPage.tsx"},
			want:  VerifyE2E,
		},
		{
			name:  "an exact file in the flow list matches",
			files: []string{"web/src/App.tsx"},
			want:  VerifyE2E,
		},
		{
			name:  "the highest rung wins across several files",
			files: []string{"web/src/features/board/TaskDetail.tsx", "web/src/features/chat/Send.tsx"},
			want:  VerifyE2E,
		},
		{
			name:  "a non-flow web/src file stays at ui",
			files: []string{"web/src/components/ui/button.tsx"},
			want:  VerifyUI,
		},
		{
			// The flow list lists a Go path on purpose: the auth flow is owned
			// by both halves, and only the frontend half would match a web/src
			// prefix rule.
			name:  "a flow-owning Go file escalates to e2e",
			files: []string{"cmd/server/auth.go"},
			want:  VerifyE2E,
		},
		{
			name:  "a glob flow entry does not match unrelated Go files",
			files: []string{"cmd/server/review.go"},
			want:  VerifyNone,
		},
		{
			name:    "an explicit profile wins over the diff",
			files:   []string{"internal/kanban/gate.go"},
			declare: VerifyUI,
			want:    VerifyUI,
		},
		{
			name:    "an explicit none wins over a UI diff",
			files:   []string{"web/src/App.tsx"},
			declare: VerifyNone,
			want:    VerifyNone,
		},
		{
			name:    "an explicit fast caps a flow path",
			files:   []string{"web/src/features/chat/Send.tsx"},
			declare: VerifyFast,
			want:    VerifyFast,
		},
		{
			name:  "a leading ./ does not defeat the prefix match",
			files: []string{"./web/src/App.tsx"},
			want:  VerifyE2E,
		},
		{
			name:  "a windows separator is normalised",
			files: []string{`web\src\App.tsx`},
			want:  VerifyE2E,
		},
		{
			name:    "an unknown profile falls through to routing",
			files:   []string{"web/src/App.tsx"},
			declare: "gibberish",
			want:    VerifyE2E,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := VerifyProfileFor(tc.declare, tc.files, testFlowPaths)
			if got != tc.want {
				t.Fatalf("VerifyProfileFor(%q, %v) = %q, want %q", tc.declare, tc.files, got, tc.want)
			}
		})
	}
}

// TestVerifyProfileRoutingWithoutFlowList pins the degradation path: with no
// flow list readable, routing must still escalate to ui rather than silently
// dropping to none.
func TestVerifyProfileRoutingWithoutFlowList(t *testing.T) {
	t.Setenv("KANBAN_VERIFY_FLOWS", "/nonexistent/e2e-flows.txt")
	if got := VerifyProfileFor("", []string{"web/src/App.tsx"}, nil); got != VerifyUI {
		t.Fatalf("without a flow list, want ui, got %q", got)
	}
}

// TestVerifyProfileNeverDowngradesWithinRouting proves the escalate-only rule
// over the aggregate: once the diff as a whole reaches e2e, adding another
// non-flow file to the same diff must not pull it back to ui.
func TestVerifyProfileNeverDowngradesWithinRouting(t *testing.T) {
	diff := []string{"web/src/features/chat/B.tsx"}
	if got := VerifyProfileFor("", diff, testFlowPaths); got != VerifyE2E {
		t.Fatalf("a flow-path diff = %q, want e2e", got)
	}
	// A non-flow UI file lands in the same diff. It does not downgrade it.
	diff = append(diff, "web/src/components/ui/C.tsx")
	if got := VerifyProfileFor("", diff, testFlowPaths); got != VerifyE2E {
		t.Fatalf("adding a non-flow file downgraded the ladder to %q", got)
	}
	// A Go file alongside a flow path likewise changes nothing.
	diff = append(diff, "internal/kanban/verify.go")
	if got := VerifyProfileFor("", diff, testFlowPaths); got != VerifyE2E {
		t.Fatalf("adding a Go file downgraded the ladder to %q", got)
	}
}

func TestVerifyCommandFor(t *testing.T) {
	if got := VerifyCommandFor(VerifyNone); got != "" {
		t.Fatalf("none should run no command, got %q", got)
	}
	for _, tc := range []struct{ profile, want string }{
		{VerifyFast, "pnpm verify:fast"},
		{VerifyUI, "pnpm verify:ui"},
		{VerifyE2E, "pnpm verify:e2e"},
	} {
		if got := VerifyCommandFor(tc.profile); got != tc.want {
			t.Fatalf("VerifyCommandFor(%q) = %q, want %q", tc.profile, got, tc.want)
		}
	}
}

// TestVerifyCommandIsCumulative pins the ladder property where it actually
// lives: each package script chains the one below it, so a card routed to e2e
// also runs the fast and UI checks.
//
// It reads web/package.json rather than comparing the Go strings, because
// VerifyCommandFor only names a script — the chaining is the script's job, and
// asserting on the mapping alone would pass even if the scripts stopped nesting.
func TestVerifyCommandIsCumulative(t *testing.T) {
	root := verifyRepoRoot()
	raw, err := os.ReadFile(filepath.Join(root, "web", "package.json"))
	if err != nil {
		t.Fatalf("read web/package.json: %v", err)
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		t.Fatalf("parse web/package.json: %v", err)
	}
	for _, rung := range [][2]string{
		{"verify:ui", "verify:fast"},
		{"verify:e2e", "verify:ui"},
	} {
		upper, lower := rung[0], rung[1]
		body, ok := pkg.Scripts[upper]
		if !ok {
			t.Fatalf("%s is missing from web/package.json", upper)
		}
		if !strings.Contains(body, "pnpm "+lower) {
			t.Fatalf("%s (%q) does not chain %s; the ladder is not cumulative", upper, body, lower)
		}
	}
}

func TestBeginVerifyRequiresReview(t *testing.T) {
	for _, status := range []string{"todo", "blocked", "done"} {
		t.Run(status, func(t *testing.T) {
			verifyBoard(t, Task{ID: "t1", Title: "x", Status: status})
			db := verifyDB(t)
			if _, err := BeginVerify(db, "t1"); err == nil {
				t.Fatalf("BeginVerify succeeded for a task in %s", status)
			}
		})
	}
}

func TestBeginVerifyIsExclusive(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	db := verifyDB(t)
	first, err := BeginVerify(db, "t1")
	if err != nil {
		t.Fatalf("first BeginVerify: %v", err)
	}
	if _, err := BeginVerify(db, "t1"); err == nil {
		t.Fatal("a second concurrent verify was allowed")
	}
	// The first run's generation is still the live one, so its result must land.
	if err := FinishVerify(db, "t1", first, true, "ok"); err != nil {
		t.Fatalf("FinishVerify: %v", err)
	}
	var status string
	if err := db.QueryRow(`SELECT verify_status FROM tasks WHERE id='t1'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "passed" {
		t.Fatalf("verify_status = %q, want passed", status)
	}
}

// TestFinishVerifyDiscardsStaleGeneration is the fence itself: a slow result
// from a superseded run must not overwrite a newer verdict.
func TestFinishVerifyDiscardsStaleGeneration(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	db := verifyDB(t)
	stale, err := BeginVerify(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a re-run taking over: a new generation lands on the same task.
	if _, err := db.Exec(`UPDATE tasks SET verify_run_id='verify_new', verify_status='running' WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}
	if err := FinishVerify(db, "t1", stale, false, "stale failure"); err != nil {
		t.Fatalf("FinishVerify: %v", err)
	}
	var status, output string
	if err := db.QueryRow(`SELECT verify_status, verify_output FROM tasks WHERE id='t1'`).Scan(&status, &output); err != nil {
		t.Fatal(err)
	}
	if status != "running" {
		t.Fatalf("a stale result overwrote the live run: status = %q, output = %q", status, output)
	}
}

func TestVerifyOutputIsTailCapped(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	db := verifyDB(t)
	runID, err := BeginVerify(db, "t1")
	if err != nil {
		t.Fatal(err)
	}
	huge := strings.Repeat("x", gateOutputTailBytes*2)
	if err := FinishVerify(db, "t1", runID, false, huge); err != nil {
		t.Fatal(err)
	}
	var output string
	if err := db.QueryRow(`SELECT verify_output FROM tasks WHERE id='t1'`).Scan(&output); err != nil {
		t.Fatal(err)
	}
	if len(output) > gateOutputTailBytes+200 {
		t.Fatalf("verify_output is %d bytes, want roughly the %d-byte tail cap", len(output), gateOutputTailBytes)
	}
	if !strings.Contains(output, "truncated") {
		t.Fatal("a truncated verify_output must say so")
	}
}

func TestVerifyEnabledRespectsTheFlag(t *testing.T) {
	t.Setenv("KANBAN_VERIFY_ENABLED", "0")
	if VerifyEnabled() {
		t.Fatal("KANBAN_VERIFY_ENABLED=0 should disable the hook")
	}
	t.Setenv("KANBAN_VERIFY_ENABLED", "1")
	if !VerifyEnabled() {
		t.Fatal("the hook should be on by default and with =1")
	}
}

// TestMissingVerifyProfileMeansNone is the backward-compatibility guarantee: a
// card created before this feature existed must route to none, not fast, or
// every existing card on the board would suddenly start paying for a gate.
func TestMissingVerifyProfileMeansNone(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	if got := VerifyProfileFor("", []string{"internal/kanban/verify.go"}, testFlowPaths); got != VerifyNone {
		t.Fatalf("a card with no diff must resolve to none, got %q", got)
	}
}

// TestVerifyFieldsRoundTrip proves the new columns survive a create and a read
// through the same positional select/scan pair the board listing uses.
func TestVerifyFieldsRoundTrip(t *testing.T) {
	verifyBoard(t, Task{
		ID: "t1", Title: "x",
		VerifyProfile: VerifyUI,
		DesignSource:  "design/task-card.pen",
	})
	tasks, err := ListTasks("default")
	if err != nil {
		t.Fatal(err)
	}
	var found *Task
	for i := range tasks {
		if tasks[i].ID == "t1" {
			found = &tasks[i]
		}
	}
	if found == nil {
		t.Fatal("task not listed")
	}
	if found.VerifyProfile != VerifyUI {
		t.Fatalf("verify_profile = %q, want %q", found.VerifyProfile, VerifyUI)
	}
	if found.DesignSource != "design/task-card.pen" {
		t.Fatalf("design_source = %q, want design/task-card.pen", found.DesignSource)
	}
	// The verdict is not the author's to set.
	if found.VerifyProfileEffective != "" || found.VerifyStatus != "" {
		t.Fatalf("a new card must not carry a verdict: effective=%q status=%q",
			found.VerifyProfileEffective, found.VerifyStatus)
	}
}

func TestUpdateTaskFieldsValidates(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	bad := "nonsense"
	if err := UpdateTaskFields("default", "t1", TaskFields{VerifyProfile: &bad}); err == nil {
		t.Fatal("an unknown verify_profile was accepted")
	}
	// Clearing is a distinct operation from omitting, and must be allowed:
	// clearing is how a card returns to auto-routing.
	empty := ""
	if err := UpdateTaskFields("default", "t1", TaskFields{VerifyProfile: &empty}); err != nil {
		t.Fatalf("clearing verify_profile: %v", err)
	}
	ok := VerifyE2E
	if err := UpdateTaskFields("default", "t1", TaskFields{VerifyProfile: &ok}); err != nil {
		t.Fatalf("setting verify_profile: %v", err)
	}
	state, err := VerifyState("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if state.Profile != VerifyE2E {
		t.Fatalf("verify_profile = %q, want %q", state.Profile, VerifyE2E)
	}
}

// TestUpdateTaskFieldsRejectsEscapingDesignSource matters because the design
// source is handed to the worker as an argument; a path that escapes the repo
// must not become reachable through the PATCH route.
func TestUpdateTaskFieldsRejectsEscapingDesignSource(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	for _, bad := range []string{"../secrets.pen", "/etc/passwd", "design/../../x.pen"} {
		src := bad
		err := UpdateTaskFields("default", "t1", TaskFields{DesignSource: &src})
		if err == nil {
			t.Fatalf("design_source %q was accepted", bad)
		}
	}
	good := "design/task-card.pen"
	if err := UpdateTaskFields("default", "t1", TaskFields{DesignSource: &good}); err != nil {
		t.Fatalf("a repo-relative design source was rejected: %v", err)
	}
}

// TestUpdateTaskFieldsClearsTheVerdict proves an edited requirement does not
// leave the previous attempt's pass on screen.
func TestUpdateTaskFieldsClearsTheVerdict(t *testing.T) {
	verifyBoard(t, Task{ID: "t1", Title: "x"})
	db := verifyDB(t)
	if _, err := db.Exec(`UPDATE tasks SET verify_status='passed', verify_output='ok',
		verify_profile_effective='ui' WHERE id='t1'`); err != nil {
		t.Fatal(err)
	}
	profile := VerifyE2E
	if err := UpdateTaskFields("default", "t1", TaskFields{VerifyProfile: &profile}); err != nil {
		t.Fatal(err)
	}
	state, err := VerifyState("default", "t1")
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != "" || state.Output != "" || state.ProfileEffective != "" {
		t.Fatalf("the old verdict survived an edit: %+v", state)
	}
	if state.Profile != VerifyE2E {
		t.Fatalf("verify_profile = %q, want %q", state.Profile, VerifyE2E)
	}
}

func TestTaskValidateRejectsBadVerifyFields(t *testing.T) {
	if issues := ValidateNewTask(&Task{Title: "x", VerifyProfile: "nope"}); len(issues) == 0 {
		t.Fatal("an unknown verify_profile produced no validation issue")
	}
	for _, bad := range []string{"../x.pen", "/abs.pen", "a\x00b.pen"} {
		if issues := ValidateNewTask(&Task{Title: "x", DesignSource: bad}); len(issues) == 0 {
			t.Fatalf("design_source %q produced no validation issue", bad)
		}
	}
	if issues := ValidateNewTask(&Task{Title: "x", DesignSource: "design/a.pen"}); len(issues) != 0 {
		t.Fatalf("a valid design_source was rejected: %+v", issues)
	}
}

func TestArtifactNameValid(t *testing.T) {
	for _, ok := range []string{"shot.png", "board-light.png", "axe-report.json", "a_b-1.png"} {
		if !artifactNameValid(ok) {
			t.Fatalf("%q should be a valid artifact name", ok)
		}
	}
	// Everything here is a traversal or an injection attempt, and rejecting
	// rather than sanitising keeps a node bug from becoming a path escape.
	for _, bad := range []string{
		"", ".", "..", "../etc/passwd", "a/b.png", `a\b.png`,
		"a b.png", "a\nb.png", "a\x00.png", "shot.png;rm", strings.Repeat("a", 129),
	} {
		if artifactNameValid(bad) {
			t.Fatalf("%q should be rejected as an artifact name", bad)
		}
	}
}

func TestMimeExt(t *testing.T) {
	if got := mimeExt("image/png"); got != ".png" {
		t.Fatalf("mimeExt(image/png) = %q", got)
	}
	// Anything outside the attachment store's allowlist is not worth guessing at.
	if got := mimeExt("application/zip"); got != "" {
		t.Fatalf("mimeExt(application/zip) = %q, want empty", got)
	}
}
