package kanban

// The verification gate: a quality ladder that runs on the worker after a task's
// executor succeeds, alongside the quality gate.
//
// This is deliberately not a parallel system. Everything here is modelled on
// gate.go — the same generation fence, the same tail-capped output, the same
// blocking DispatchRemoteRaw, the same override event — so there is one
// mechanism with two owners rather than two mechanisms.
//
// What it adds over the gate is (a) a ladder whose rung is chosen from the diff
// rather than typed by a human, and (b) artifact transport, so a UI task arrives
// at review with screenshots attached instead of a line of text.

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// The ladder, in order. A rung includes every rung below it.
const (
	VerifyNone = "none" // nothing runs
	VerifyFast = "fast" // tsc + vitest + token-lint
	VerifyUI   = "ui"   // + playwright, light and dark, plus axe
	VerifyE2E  = "e2e"  // + deterministic flow tests
)

// VerifyProfileLadder is the ordered set of rungs, used for validation messages.
var VerifyProfileLadder = []string{VerifyNone, VerifyFast, VerifyUI, VerifyE2E}

// ValidVerifyProfiles is the set the field may name. Empty is deliberately
// absent: "" means auto, not none, and is resolved by routing rather than
// stored.
var ValidVerifyProfiles = map[string]bool{
	VerifyNone: true,
	VerifyFast: true,
	VerifyUI:   true,
	VerifyE2E:  true,
}

// verifyStatusUnavailable is the honest verdict for a node that cannot run the
// rung at all — no browser, no Playwright. It is distinct from "failed" and
// from "" so a card that was never verified is never mistaken for one that
// passed.
const verifyStatusUnavailable = "unavailable"

// VerifyEnabled reports whether the verify hook runs at all.
//
// The escape hatch is total: with it off, the dispatcher behaves exactly as it
// did before this existed. That matters because this hook sits on the path of
// every successful remote dispatch.
func VerifyEnabled() bool {
	return os.Getenv("KANBAN_VERIFY_ENABLED") != "0"
}

// VerifyCommandFor returns the command for a rung, run from the web/ directory
// so the package scripts resolve.
//
// These are the existing scripts, unchanged. verify:e2e is listed because the
// ladder is cumulative and a task routed to e2e is expected to run it; whether
// the `e2e` binary is installed on a given node is that node's problem and is
// reported as a failed run rather than silently skipped.
func VerifyCommandFor(profile string) string {
	switch profile {
	case VerifyFast:
		return "pnpm verify:fast"
	case VerifyUI:
		return "pnpm verify:ui"
	case VerifyE2E:
		return "pnpm verify:e2e"
	}
	return ""
}

// VerifyProfileFor decides which rung a task needs.
//
// Routing escalates only and never downgrades. An explicit verify_profile always
// wins, because the person who set it knows something the diff does not. When it
// is unset, the diff decides:
//
//	no web/ change          -> none
//	anything under web/src  -> ui
//	a flow-owning path      -> e2e
//
// The asymmetry is the point. A false positive costs seconds of a test suite; a
// false negative is a UI change reaching review with no evidence attached, which
// is the entire failure this loop exists to prevent.
//
// flowOwningPaths is the parsed web/e2e-flows.txt, because a path prefix cannot
// see every way a flow breaks — a shared hook, a provider, a role resolver can
// all change behaviour without touching a flow directory.
func VerifyProfileFor(declared string, changedFiles []string, flowOwningPaths []string) string {
	declared = strings.ToLower(strings.TrimSpace(declared))
	if declared != "" && ValidVerifyProfiles[declared] {
		return declared
	}
	profile := VerifyNone
	for _, f := range changedFiles {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		normalised := strings.TrimPrefix(path.Clean(strings.ReplaceAll(f, "\\", "/")), "./")
		// Flow ownership is checked first and independently of whether the file
		// is under web/. A listed path owns a user-visible flow even when it is
		// the server half of that flow, and skipping it first would leave
		// entries like cmd/server/auth*.go permanently dead.
		if matchesFlowPath(normalised, flowOwningPaths) {
			profile = VerifyE2E
			continue
		}
		// web/ itself (a lockfile, a config) is not a UI change; web/src is.
		if !strings.HasPrefix(normalised, "web/src/") {
			continue
		}
		if profile == VerifyNone {
			profile = VerifyUI
		}
	}
	return profile
}

// matchesFlowPath reports whether a changed file is owned by a flow.
//
// Three shapes are supported, because the list needs all three: a directory
// prefix (web/src/features/board/), an exact file (web/src/App.tsx), and a glob
// (cmd/server/auth*.go). The glob is matched with path.Match against the
// basename, which is what makes the entries in that file mean what their author
// intended rather than silently never firing.
func matchesFlowPath(file string, flowOwningPaths []string) bool {
	for _, owned := range flowOwningPaths {
		owned = strings.TrimSuffix(strings.TrimSpace(owned), "/")
		if owned == "" || strings.HasPrefix(owned, "#") {
			continue
		}
		if strings.ContainsAny(owned, "*?[") {
			// Split at the last separator so the pattern is just the basename,
			// and everything before it is the directory to anchor on. Anything
			// with no directory ("*.go") is unmatchable: a pattern that loose
			// would escalate every Go file in the repository.
			i := strings.LastIndex(owned, "/")
			if i <= 0 {
				continue
			}
			dir, pattern := owned[:i], owned[i+1:]
			// The file must be directly in that directory, not merely under it.
			// path.Dir/Base rather than strings.Cut, which splits on the FIRST
			// separator and would leave base as "server/auth.go".
			if path.Dir(file) != dir {
				continue
			}
			if matched, err := path.Match(pattern, path.Base(file)); err == nil && matched {
				return true
			}
			continue
		}
		if file == owned || strings.HasPrefix(file, owned+"/") {
			return true
		}
	}
	return false
}

// LoadVerifyFlowPaths reads the flow-owning path list.
//
// The list lives in the control plane's own repository, not on the worker: it is
// a routing policy for this process, and every node must agree on it, so reading
// a copy off whichever workspace a card happens to use would let a card route
// differently depending on where it ran.
//
// A missing or unreadable file is not an error. It degrades routing from e2e to
// ui — a weaker guarantee, never a broken card.
func LoadVerifyFlowPaths() []string {
	var candidates []string
	if v := os.Getenv("KANBAN_VERIFY_FLOWS"); v != "" {
		candidates = append(candidates, v)
	}
	if root := verifyRepoRoot(); root != "" {
		candidates = append(candidates, filepath.Join(root, filepath.FromSlash(VerifyFlowsRelPath)))
	}
	var raw []byte
	for _, c := range candidates {
		if b, err := os.ReadFile(c); err == nil {
			raw = b
			break
		}
	}
	if raw == nil {
		return nil
	}
	var out []string
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, line)
	}
	return out
}

// verifyRepoRoot locates this checkout, which is where the flow list lives.
//
// Derived from this source file's own path rather than a config value, so it
// follows the binary's repo in a normal build and needs nothing set in a
// container where the flag would otherwise be forgotten.
func verifyRepoRoot() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return ""
	}
	// internal/kanban/verify.go -> repo root is two levels up.
	return filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
}

// VerifyFlowsRelPath locates the flow list inside the repository, relative to
// its root. Overridable with KANBAN_VERIFY_FLOWS for a deployment whose policy
// file lives elsewhere.
const VerifyFlowsRelPath = "web/e2e-flows.txt"

// remoteProbeWait bounds the control plane's wait for a remote probe —
// a trivial shell command (like the git diff below) that should return
// in seconds once the node picks it up. The full job budget would be
// wrong here: a slow node would stall the dispatcher's poll loop for
// the entire budget, wedging every other board. A probe that misses
// this window fails the verify honestly (verify_unavailable) instead.
const remoteProbeWait = 90 * time.Second

// verifyChangedFiles runs git in the task's workdir and returns the paths the
// reviewer is about to see.
//
// It reuses the review gate's own definition of the diff — working tree against
// HEAD, scoped to the workspace, including untracked files — rather than
// inventing a second definition. Routing against a different file set than the
// one the reviewer looks at is how a gate ends up green on a diff nobody graded.
func verifyChangedFiles(workspacePath, title, slug string) ([]string, string, error) {
	res, err := DispatchRemoteRaw(NodeDispatchRequest{
		TaskID:    fmt.Sprintf("verify-files-%s-%d", strings.TrimSpace(title), time.Now().UnixNano()),
		Title:     title,
		Board:     slug,
		Workspace: workspacePath,
		Executor:  "shell",
		Command:   `git diff --name-only HEAD -- . && git ls-files --others --exclude-standard -- .`,
		NoRTK:     true,
	}, remoteProbeWait)
	if err != nil {
		return nil, "", err
	}
	if res == nil {
		return nil, "", fmt.Errorf("node-agent returned no result")
	}
	if !res.Success {
		msg := res.Error
		if msg == "" {
			msg = res.Output
		}
		return nil, "", fmt.Errorf("could not read the changed files: %s", strings.TrimSpace(msg))
	}
	var files []string
	for _, line := range strings.Split(res.Output, "\n") {
		line = strings.TrimSpace(line)
		// node-agent echoes a provenance line with the whole argv; a stray
		// quoted blob would otherwise be read as a filename.
		if line == "" || strings.ContainsAny(line, " \t\"'") {
			continue
		}
		files = append(files, line)
	}
	return files, res.Output, nil
}

// RunVerify resolves a task's rung, runs it on the worker, and records the
// verdict and any artifacts.
//
// A task with no rung is not a no-op — it records verify_skipped. Without that
// record, "nothing ran because nothing needed running" and "the hook silently
// failed" are the same empty string, and only one of them is true.
func RunVerify(slug, taskID, workspacePath, title, declaredProfile, designSource string) error {
	if !VerifyEnabled() {
		return nil
	}
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()

	// The design export is card evidence rather than a verify artifact,
	// so it is captured before the rung resolves: a card whose diff
	// routes to "none" still shows the design it was graded against.
	// Idempotent — the blobstore dedups by SHA and the link is
	// INSERT OR IGNORE — so a manual re-run never duplicates it.
	designAtts := captureDesignExport(slug, taskID, workspacePath, designSource)

	// The file set is what routing needs, and collecting it costs one remote
	// round trip. A declared profile does not need it — but collecting it anyway
	// keeps the effective column meaningful for every card.
	files, _, fileErr := verifyChangedFiles(workspacePath, title, slug)
	profile := declaredProfile
	if fileErr != nil {
		// Without a diff there is nothing to route on. A declared profile can
		// still run; an auto card is recorded as unverified rather than
		// silently passing as "no UI involved".
		log.Printf("verify: %s: could not read the diff: %v", taskID, fileErr)
		if strings.TrimSpace(declaredProfile) == "" {
			return recordVerifyUnavailable(db, slug, taskID, "could not read the diff: "+fileErr.Error())
		}
	}
	profile = VerifyProfileFor(declaredProfile, files, LoadVerifyFlowPaths())

	command := VerifyCommandFor(profile)
	if command == "" {
		return recordVerifySkipped(db, slug, taskID, profile)
	}

	// fenced exactly like BeginGate, on its own run-id column so a verify run
	// and a gate run can be in flight on one task without colliding.
	verifyRunID, err := BeginVerify(db, taskID)
	if err != nil {
		return err
	}
	if err := setVerifyEffective(db, taskID, profile); err != nil {
		log.Printf("verify: %s: could not record routed profile: %v", taskID, err)
	}
	if err := insertEvent(db, taskID, "verify_started", map[string]any{
		"source": "dispatcher", "profile": profile, "command": command,
		"verify_run_id": verifyRunID,
	}); err != nil {
		log.Printf("verify: %s: could not record start: %v", taskID, err)
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
		// A dispatch failure is a failure to verify, not a verify that never ran:
		// the reviewer must see that the checks could not be performed.
		_ = FinishVerify(db, taskID, verifyRunID, false, "verify could not be dispatched: "+err.Error())
		_ = insertEvent(db, taskID, "verify_failed", map[string]any{
			"source": "dispatcher", "profile": profile, "error": err.Error(),
		})
		return err
	}

	output := res.Output
	if res.Error != "" {
		output += "\n" + res.Error
	}
	// Artifacts are pulled before the verdict is written, so a card that reached
	// review with passing tests but no screenshots is not representable.
	linked := ingestNodeArtifacts(slug, taskID, res.Artifacts)
	if len(designAtts) > 0 {
		linked = append(linked, designAtts...)
		output += "\nDesign export attached."
	}
	if len(linked) > 0 {
		output += fmt.Sprintf("\n\n%d verification artifact(s) attached.", len(linked))
	}
	if err := FinishVerify(db, taskID, verifyRunID, res.Success, output); err != nil {
		return err
	}
	event := "verify_failed"
	if res.Success {
		event = "verify_passed"
	}
	payload := map[string]any{
		"source": "dispatcher", "profile": profile, "command": command,
		"verify_run_id": verifyRunID,
	}
	if len(linked) > 0 {
		payload["attachments"] = linked
	}
	if err := insertEvent(db, taskID, event, payload); err != nil {
		log.Printf("verify: %s: could not record result: %v", taskID, err)
	}
	broadcastEvent(event, map[string]any{"board": slug, "task_id": taskID})
	log.Printf("verify: %s %s profile=%s", taskID, event, profile)
	return nil
}

// designExportCandidates maps a committed design source to the PNG
// exports pen.dev ships for it: the repo convention is an exports/
// directory beside the .pen, and the fallback is the PNG beside the
// .pen itself.
func designExportCandidates(designSource string) []string {
	source := strings.TrimSpace(designSource)
	if source == "" {
		return nil
	}
	stem := strings.TrimSuffix(path.Base(source), path.Ext(source))
	dir := path.Dir(source)
	return []string{
		path.Join(dir, "exports", stem+".png"),
		path.Join(dir, stem+".png"),
	}
}

// designPathValid allowlists a repo-relative design path before it is
// interpolated into a shell command. Task validation already rejects
// control characters and traversal, but a path is interpolated into a
// command here, so the allowlist is the real guard.
func designPathValid(p string) bool {
	if p == "" || strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return false
	}
	for _, r := range p {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '.' || r == '_' || r == '-' || r == '/':
		default:
			return false
		}
	}
	return true
}

// captureDesignExport pulls the design's exported PNG from the worker
// and links it to the card, so a reviewer sees the design the card was
// graded against beside the screenshots of what was built.
//
// A missing export is not an error: a design that was never exported
// simply leaves nothing to show, and the card is no less verified.
// Every failure path logs and returns nil rather than failing the run.
func captureDesignExport(slug, taskID, workspacePath, designSource string) []string {
	candidates := designExportCandidates(designSource)
	if len(candidates) == 0 {
		return nil
	}
	var picks []string
	for _, c := range candidates {
		if !designPathValid(c) {
			log.Printf("verify: %s: rejecting unsafe design export path %q", taskID, c)
			return nil
		}
		picks = append(picks, c)
	}
	// The marker line anchors the parse: the node-agent prepends
	// provenance noise to shell output, so the base64 is everything
	// after the marker, never everything in the output.
	var cmd strings.Builder
	cmd.WriteString("f=" + strconv.Quote(picks[0]))
	for _, p := range picks[1:] {
		cmd.WriteString(`; [ -f "$f" ] || f=` + strconv.Quote(p))
	}
	cmd.WriteString(`; [ -f "$f" ] || exit 9; echo "DESIGN_EXPORT:$f"; base64 < "$f"`)
	res, err := DispatchRemoteRaw(NodeDispatchRequest{
		TaskID:    fmt.Sprintf("design-%s-%d", strings.TrimSpace(taskID), time.Now().UnixNano()),
		Title:     "design export",
		Board:     slug,
		Workspace: workspacePath,
		Executor:  "shell",
		Command:   cmd.String(),
		NoRTK:     true,
	}, RemoteDispatchWait())
	if err != nil {
		log.Printf("verify: %s: design export dispatch: %v", taskID, err)
		return nil
	}
	if res == nil || !res.Success {
		return nil
	}
	exportPath, data, ok := parseDesignExportOutput(res.Output)
	if !ok {
		log.Printf("verify: %s: design export: no parseable export in output", taskID)
		return nil
	}
	att, err := StoreAttachmentBytes(data, "design-"+path.Base(exportPath))
	if err != nil {
		log.Printf("verify: %s: design export store: %v", taskID, err)
		return nil
	}
	if err := LinkTaskAttachment(slug, taskID, att.ID); err != nil {
		log.Printf("verify: %s: design export link: %v", taskID, err)
		return nil
	}
	return []string{att.ID}
}

// parseDesignExportOutput splits a design-export command's output into
// the export's path and its bytes. The node-agent frames shell output
// with a provenance line on top and an EXECUTOR_PROOF + provenance
// pair underneath, so the base64 region is bounded: it starts after
// the marker line and ends at the first line that is not base64.
func parseDesignExportOutput(out string) (string, []byte, bool) {
	lines := strings.Split(out, "\n")
	marker := -1
	exportPath := ""
	for i, line := range lines {
		if after, ok := strings.CutPrefix(strings.TrimSpace(line), "DESIGN_EXPORT:"); ok {
			marker = i
			exportPath = strings.TrimSpace(after)
			break
		}
	}
	if marker < 0 || exportPath == "" {
		return "", nil, false
	}
	var b64 strings.Builder
	for _, line := range lines[marker+1:] {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "EXECUTOR_PROOF") || strings.HasPrefix(t, "provenance") {
			break
		}
		if !isBase64Line(t) {
			break
		}
		b64.WriteString(t)
	}
	data, err := base64.StdEncoding.DecodeString(b64.String())
	if err != nil || len(data) == 0 {
		return "", nil, false
	}
	return exportPath, data, true
}

// isBase64Line reports whether a line is nothing but base64. The
// wrapped payload lines are; the provenance frame that closes the
// output is not.
func isBase64Line(t string) bool {
	if t == "" {
		return false
	}
	for _, r := range t {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r >= '0' && r <= '9':
		case r == '+' || r == '/' || r == '=':
		default:
			return false
		}
	}
	return true
}

// recordVerifySkipped is the honest record that a card was routed past the
// gate: the rung was resolved to none, so nothing ran and nothing is wrong.
func recordVerifySkipped(db *sql.DB, slug, taskID, profile string) error {
	if err := setVerifyEffective(db, taskID, profile); err != nil {
		log.Printf("verify: %s: %v", taskID, err)
	}
	if _, err := db.Exec(`UPDATE tasks SET verify_status='skipped', verify_output='', verify_run_id=NULL
		WHERE id=?`, taskID); err != nil {
		return err
	}
	if err := insertEvent(db, taskID, "verify_skipped", map[string]any{
		"source": "dispatcher", "profile": profile,
		"note": "no verification rung applies to this diff",
	}); err != nil {
		log.Printf("verify: %s: could not record skip: %v", taskID, err)
	}
	broadcastEvent("verify_skipped", map[string]any{"board": slug, "task_id": taskID})
	return nil
}

// recordVerifyUnavailable marks a card whose checks could not be attempted.
// Visibly degraded, never falsely green.
func recordVerifyUnavailable(db *sql.DB, slug, taskID, reason string) error {
	if err := setVerifyEffective(db, taskID, VerifyNone); err != nil {
		log.Printf("verify: %s: %v", taskID, err)
	}
	if _, err := db.Exec(`UPDATE tasks SET verify_status=?, verify_output=?, verify_run_id=NULL
		WHERE id=?`, verifyStatusUnavailable, reason, taskID); err != nil {
		return err
	}
	if err := insertEvent(db, taskID, "verify_unavailable", map[string]any{
		"source": "dispatcher", "reason": reason,
	}); err != nil {
		log.Printf("verify: %s: could not record unavailability: %v", taskID, err)
	}
	broadcastEvent("verify_unavailable", map[string]any{"board": slug, "task_id": taskID})
	return nil
}

func setVerifyEffective(db *sql.DB, taskID, profile string) error {
	_, err := db.Exec(`UPDATE tasks SET verify_profile_effective=? WHERE id=?`, profile, taskID)
	return err
}

// BeginVerify marks a verify run as started and returns its generation id.
//
// Same contract as BeginGate: the generation is written before the command is
// dispatched and only applied if it still matches, so a slow result from a
// superseded run cannot overwrite a newer verdict.
func BeginVerify(db *sql.DB, taskID string) (string, error) {
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
			Err:  fmt.Errorf("task is %s; verification only applies to a task in review", status),
		}
	}
	runID := fmt.Sprintf("verify_%x", time.Now().UnixNano())
	res, err := db.Exec(`UPDATE tasks SET verify_status='running', verify_run_id=?, verify_output=''
		WHERE id=? AND COALESCE(verify_status,'') <> 'running'`, runID, taskID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", &RunControlError{
			Code: 409,
			Err:  fmt.Errorf("%s: verification is already running for this task", CodeGateRunning),
		}
	}
	return runID, nil
}

// FinishVerify applies a verdict, but only if the generation still matches.
func FinishVerify(db *sql.DB, taskID, runID string, passed bool, output string) error {
	status := "failed"
	if passed {
		status = "passed"
	}
	_, err := db.Exec(`UPDATE tasks SET verify_status=?, verify_output=?, verify_run_id=NULL
		WHERE id=? AND verify_run_id=?`, status, gateToneTail(output, gateOutputTailBytes), taskID, runID)
	return err
}

// VerifyVerdict is everything the review UI needs about a task's verification.
type VerifyVerdict struct {
	Profile          string
	ProfileEffective string
	Status           string
	Output           string
}

// VerifyState reads a task's verification verdict and the rung that produced it.
//
// One query rather than two: profile and effective are asked for together
// because a reviewer needs both to answer "what was checked, and who decided
// that" — and a card whose declared profile is empty is exactly the one where
// only the second says anything.
func VerifyState(slug, taskID string) (VerifyVerdict, error) {
	db, err := openDB(slug)
	if err != nil {
		return VerifyVerdict{}, err
	}
	defer db.Close()
	var s VerifyVerdict
	err = db.QueryRow(`SELECT COALESCE(verify_profile,''), COALESCE(verify_profile_effective,''),
		COALESCE(verify_status,''), COALESCE(verify_output,'') FROM tasks WHERE id=?`, taskID).
		Scan(&s.Profile, &s.ProfileEffective, &s.Status, &s.Output)
	if err == sql.ErrNoRows {
		return VerifyVerdict{}, &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	}
	return s, err
}

// VerifyResult reports a task's verify verdict for the approve guard.
func VerifyResult(slug, taskID string) (status, output string, err error) {
	db, err := openDB(slug)
	if err != nil {
		return "", "", err
	}
	defer db.Close()
	err = db.QueryRow(`SELECT COALESCE(verify_status,''), COALESCE(verify_output,'') FROM tasks WHERE id=?`, taskID).
		Scan(&status, &output)
	return status, output, err
}

// RecordVerifyOverride notes that a reviewer approved a task whose verification
// failed, so "it shipped past a red gate" stays answerable later.
func RecordVerifyOverride(slug, taskID string) error {
	db, err := openDB(slug)
	if err != nil {
		return err
	}
	defer db.Close()
	return insertEvent(db, taskID, "verify_overridden", map[string]any{
		"source": "board-ui", "note": "approved despite failed verification",
	})
}

// VerifyTask is the subset of a task a manual verify re-run needs.
type VerifyTask struct {
	ID            string
	Title         string
	WorkspacePath string
	VerifyProfile string
	DesignSource  string
	Status        string
}

// LoadVerifyTask reads what a manual verify re-run needs.
func LoadVerifyTask(slug, taskID string) (VerifyTask, error) {
	db, err := openDB(slug)
	if err != nil {
		return VerifyTask{}, err
	}
	defer db.Close()
	var v VerifyTask
	err = db.QueryRow(`SELECT id, COALESCE(title,''), COALESCE(workspace_path,''),
		COALESCE(verify_profile,''), COALESCE(design_source,''), COALESCE(status,'')
		FROM tasks WHERE id=?`, taskID).Scan(&v.ID, &v.Title, &v.WorkspacePath, &v.VerifyProfile, &v.DesignSource, &v.Status)
	if err == sql.ErrNoRows {
		return VerifyTask{}, &RunControlError{Code: 404, Err: fmt.Errorf("task not found: %s", taskID)}
	}
	return v, err
}
