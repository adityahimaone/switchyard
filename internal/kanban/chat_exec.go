package kanban

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// chatCommand — hermes-only (codex/shell remain task executors, not chat)
func chatCommand(agent, profile, model, prompt, hermesSessionID string) ([]string, error) {
	agent = strings.TrimSpace(agent)
	if agent != "hermes" {
		return nil, fmt.Errorf("unsupported chat agent %q", agent)
	}
	reasoning := "low"
	if fastChatPrompt(prompt) {
		reasoning = "none"
	}
	args := []string{"chat", "-Q", "--reasoning", reasoning}
	if hermesSessionID != "" {
		args = append(args, "--resume", hermesSessionID)
	}
	if profile != "" && profile != "default" {
		args = append(args, "--profile", profile)
	}
	if model != "" {
		args = append(args, "--model", model)
	}
	return append(args, "--query-file", "-"), nil
}

func fastChatPrompt(prompt string) bool {
	return len([]rune(strings.TrimSpace(prompt))) <= 30
}

func formatChatAttachmentPrompt(prompt string, analyses []string) string {
	clean := make([]string, 0, len(analyses))
	for _, analysis := range analyses {
		if value := strings.TrimSpace(analysis); value != "" {
			clean = append(clean, "- "+value)
		}
	}
	if len(clean) == 0 {
		return prompt
	}
	return "Attached image analysis:\n" + strings.Join(clean, "\n") + "\n\nUser request:\n" + prompt
}

func chatProfileModel(profile string) string {
	profiles, _ := ListProfiles()
	for _, item := range profiles {
		if item.Name == profile {
			return item.Model
		}
	}
	return ""
}

func prepareChatAttachmentPrompt(ctx context.Context, runID, profile, model, prompt string) (string, error) {
	run, err := GetChatRun(runID)
	if err != nil {
		return "", err
	}
	attachments, err := ListChatAttachments(run.MessageID)
	if err != nil {
		return "", err
	}
	if len(attachments) == 0 {
		return prompt, nil
	}
	if strings.TrimSpace(model) == "" {
		model = chatProfileModel(profile)
	}
	if strings.TrimSpace(model) == "" {
		return "", fmt.Errorf("image attachment requires vision-capable model")
	}
	analyses := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		resolved, resolveErr := ResolveAttachmentModel(model, attachment.MIME)
		if resolveErr != nil {
			return "", resolveErr
		}
		analysis, analyzeErr := AnalyzeAttachment(ctx, attachment.ID, resolved.Model, prompt)
		if analyzeErr != nil {
			return "", fmt.Errorf("analyze %s: %w", attachment.Filename, analyzeErr)
		}
		analyses = append(analyses, analysis)
	}
	return formatChatAttachmentPrompt(prompt, analyses), nil
}

func greetingChatAnswer(prompt string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(prompt)) {
	case "hello", "hi", "halo", "hey", "hai", "hello!", "hi!", "halo!", "hey!", "hai!":
		return "Halo! Gw Hermes. Ada yang mau lu kerjain?", true
	default:
		return "", false
	}
}

func todayChatAnswer(prompt string, now time.Time) (string, bool) {
	p := strings.ToLower(strings.TrimSpace(prompt))
	switch p {
	case "hari ini hari apa", "hari ini tanggal berapa", "what day is today", "what is today's date":
		if strings.HasPrefix(p, "hari") {
			weekdays := [...]string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}
			months := [...]string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}
			return fmt.Sprintf("Hari ini %s, %d %s %d.", weekdays[now.Weekday()], now.Day(), months[now.Month()-1], now.Year()), true
		}
		return fmt.Sprintf("Today is %s, %s.", now.Weekday(), now.Format("January 2, 2006")), true
	default:
		return "", false
	}
}

func timeChatAnswer(prompt string, now time.Time) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(prompt)) {
	case "jam berapa", "sekarang jam berapa", "what time is it", "what's the time":
		return fmt.Sprintf("Sekarang %s.", now.Format("15:04 MST")), true
	default:
		return "", false
	}
}

// RunChat executes local agent fast path. Remote workspace stays task/node-agent path.
// Output bounded, context cancellable. Assistant output persists after completion.
func RunChat(ctx context.Context, runID, agent, profile, workspace, model, prompt string) {
	_ = UpdateChatRunState(runID, "running", "", "")
	_ = AppendChatRunEvent(runID, "spawned", fmt.Sprintf(`{"agent":%q,"profile":%q}`, agent, profile))
	preparedPrompt, err := prepareChatAttachmentPrompt(ctx, runID, profile, model, prompt)
	if err != nil {
		_ = UpdateChatRunState(runID, "error", "", err.Error())
		return
	}
	prompt = preparedPrompt
	answer, ok := greetingChatAnswer(prompt)
	if !ok {
		answer, ok = todayChatAnswer(prompt, time.Now())
	}
	if !ok {
		answer, ok = timeChatAnswer(prompt, time.Now())
	}
	if ok && strings.TrimSpace(workspace) == "" {
		_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d,"fast_path":true}`, len(answer)))
		_ = UpdateChatRunState(runID, "done", answer, "")
		if r, err := GetChatRun(runID); err == nil {
			_, _ = CreateChatMessage(r.SessionID, "assistant", answer, r.ID)
		}
		return
	}

	if strings.TrimSpace(workspace) != "" && !isLocalWorkspace(workspace) {
		remoteProgress := ""
		res, err := DispatchRemoteWithProgress(NodeDispatchRequest{TaskID: runID, Title: "Chat: " + prompt, Board: "default", Message: prompt, Workspace: workspace, Model: model, Provider: profile, Executor: agent}, RemoteDispatchWait(), func(chunk string) {
			remoteProgress = appendChatProgressLines(runID, remoteProgress, chunk)
		})
		if err != nil {
			_ = UpdateChatRunState(runID, "error", "", err.Error())
			return
		}
		if res == nil || !res.Success {
			msg := "remote agent failed"
			if res != nil && res.Error != "" {
				msg = res.Error
			}
			output := ""
			if res != nil {
				output = res.Output
			}
			_ = UpdateChatRunState(runID, "error", output, msg)
			return
		}
		_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d,"remote":true}`, len(res.Output)))
		_ = UpdateChatRunState(runID, "done", res.Output, "")
		if r, err := GetChatRun(runID); err == nil {
			_, _ = CreateChatMessage(r.SessionID, "assistant", res.Output, r.ID)
		}
		return
	}
	hermesSessionID := ""
	switchyardSessionID := ""
	if r, getErr := GetChatRun(runID); getErr == nil {
		switchyardSessionID = r.SessionID
		if s, sessionErr := GetChatSession(r.SessionID); sessionErr == nil {
			hermesSessionID = s.HermesSessionID
		}
	}
	// These lookups are intentionally represented by one honest setup step.
	// Emitting four synchronous ticks here made the checklist look complete
	// before Hermes had started doing any work.
	_ = AppendChatRunEvent(runID, "phase", `{"phase":"preparing_session","label":"Preparing chat session"}`)

	// Try warm daemon first (saves cold-start on repeat runs); fall back to CLI.
	if daemonHealthy() {
		if ok := runChatViaDaemonRetry(ctx, runID, workspace, profile, model, prompt, hermesSessionID, switchyardSessionID); ok {
			return
		}
	}
	args, err := chatCommand(agent, profile, model, prompt, hermesSessionID)
	if err != nil {
		_ = UpdateChatRunState(runID, "error", "", err.Error())
		return
	}
	_ = AppendChatRunEvent(runID, "phase", `{"phase":"model_call_started","label":"Running Hermes"}`)
	var onLine = func(line string) {
		appendHermesOutputEvents(runID, line)
	}
	var output string
	output, err = runHermesProcess(ctx, args, workspace, prompt, onLine)
	if err != nil && hermesSessionID != "" && ctx.Err() == nil {
		if r, getErr := GetChatRun(runID); getErr == nil {
			_ = ClearHermesSessionID(r.SessionID)
		}
		_ = AppendChatRunEvent(runID, "session_reset", "{\"reason\":\"resume_failed\"}")
		args, err = chatCommand(agent, profile, model, prompt, "")
		if err == nil {
			output, err = runHermesProcess(ctx, args, workspace, prompt, onLine)
		}
	}
	if ctx.Err() != nil {
		_ = UpdateChatRunState(runID, "cancelled", output, ctx.Err().Error())
		return
	}
	if err != nil {
		_ = UpdateChatRunState(runID, "error", output, trimErr(err))
		return
	}
	result := strings.TrimSpace(stripHermesMetadata(output))
	if result == "" {
		_ = UpdateChatRunState(runID, "error", "", "agent returned empty response")
		return
	}
	if sid := parseHermesSessionID(output); sid != "" {
		if r, getErr := GetChatRun(runID); getErr == nil {
			_ = SetHermesSessionID(r.SessionID, sid)
		}
	}
	_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d}`, len(result)))
	_ = UpdateChatRunState(runID, "done", result, "")
	if r, err := GetChatRun(runID); err == nil {
		_, _ = CreateChatMessage(r.SessionID, "assistant", result, r.ID)
	}
}

// parseHermesSessionID extracts the session id printed by `hermes chat` on exit.
func runHermesProcess(ctx context.Context, args []string, workspace, prompt string, onLine func(string)) (string, error) {
	cmd := exec.CommandContext(ctx, "hermes", args...)
	if dir := strings.TrimSpace(localWorkspacePath(workspace)); dir != "" {
		cmd.Dir = dir
	}
	cmd.Stdin = strings.NewReader(prompt)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}
	var b strings.Builder
	scanner := bufio.NewScanner(pipe)
	for scanner.Scan() {
		line := scanner.Text()
		if b.Len() < 100000 {
			b.WriteString(line)
			b.WriteByte('\n')
		}
		if onLine != nil {
			onLine(line)
		}
	}
	return b.String(), cmd.Wait()
}

// parseHermesSessionID extracts the session id printed by `hermes chat` on exit.
// hermes prints `Session: <id>` (e.g. "Session: 20260914_175347_076ded") to stdout.
var hermesSessionIDRe = regexp.MustCompile(`(?i)(?:Session|session_id):\s*(\S+)`)

func parseHermesSessionID(out string) string {
	if m := hermesSessionIDRe.FindStringSubmatch(out); m != nil {
		return m[1]
	}
	return ""
}

func stripHermesMetadata(out string) string {
	kept := make([]string, 0)
	for _, line := range strings.Split(out, "\n") {
		if parseHermesSessionID(line) == "" && !strings.HasPrefix(strings.TrimSpace(line), "HERMES_EVENT:") {
			kept = append(kept, line)
		}
	}
	return strings.Join(kept, "\n")
}

func appendHermesOutputEvents(runID, line string) {
	if parseHermesSessionID(line) != "" {
		return
	}
	if event, ok := parseHermesStructuredEvent(line); ok {
		if event.Phase != "" {
			label := event.Label
			if label == "" {
				label = hermesPhaseLabel(event.Phase, event.Name)
			}
			payload := map[string]string{"phase": event.Phase, "label": label}
			if event.Name != "" {
				payload["name"] = event.Name
			}
			raw, _ := json.Marshal(payload)
			_ = AppendChatRunEvent(runID, "phase", string(raw))
		}
		return
	}
	// Raw process output is useful for the streaming response/debug log, but it
	// is not a user-facing activity step.
	_ = AppendChatRunEvent(runID, "raw_output", fmt.Sprintf(`{"text":%q}`, line))
	if phase, label := hermesOutputPhase(line); phase != "" {
		_ = AppendChatRunEvent(runID, "phase", fmt.Sprintf(`{"phase":%q,"label":%q}`, phase, label))
	}
}

type hermesStructuredEvent struct {
	Phase string `json:"phase"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

func parseHermesStructuredEvent(line string) (hermesStructuredEvent, bool) {
	value := strings.TrimSpace(line)
	if !strings.HasPrefix(value, "HERMES_EVENT:") {
		return hermesStructuredEvent{}, false
	}
	var event hermesStructuredEvent
	if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(value, "HERMES_EVENT:"))), &event); err != nil || event.Phase == "" {
		return hermesStructuredEvent{}, false
	}
	return event, true
}

func hermesPhaseLabel(phase, name string) string {
	switch phase {
	case "job_started":
		return "Starting remote agent"
	case "preparing_session":
		return "Preparing chat session"
	case "executor_resolved":
		if name != "" {
			return "Resolved executor: " + name
		}
		return "Resolved executor"
	case "codegraph_preflight":
		return "Checking workspace structure"
	case "process_spawned":
		return "Starting agent process"
	case "process_exited":
		return "Agent process finished"
	case "reading_skill":
		return "Reading agent skill"
	case "reading_instructions":
		return "Reading project instructions"
	case "shell_command":
		return "Using shell command"
	case "file_operation":
		return "Working with workspace files"
	default:
		if name != "" {
			return name
		}
		return strings.ReplaceAll(phase, "_", " ")
	}
}

func appendChatProgressLines(runID, pending, chunk string) string {
	pending += chunk
	for {
		idx := strings.IndexByte(pending, '\n')
		if idx < 0 {
			return pending
		}
		appendHermesOutputEvents(runID, strings.TrimSuffix(pending[:idx], "\r"))
		pending = pending[idx+1:]
	}
}

func hermesOutputPhase(line string) (string, string) {
	lower := strings.ToLower(strings.TrimSpace(line))
	switch {
	case strings.Contains(lower, "session_id:"):
		return "session_created", "Session context updated"
	case strings.Contains(lower, "reading skill"), strings.Contains(lower, "loading skill"), strings.Contains(lower, "skill:"):
		return "reading_skill", "Reading agent skill"
	case strings.Contains(lower, "agents.md"), strings.Contains(lower, "readme.md"), strings.Contains(lower, "project instructions"):
		return "reading_instructions", "Reading project instructions"
	case strings.Contains(lower, "codegraph"):
		return "codegraph_check", "Checking workspace structure"
	case strings.Contains(lower, "shell"), strings.Contains(lower, "execute command"), strings.Contains(lower, "running command"), strings.Contains(lower, "terminal"):
		return "shell_command", "Using shell command"
	case strings.Contains(lower, "reading file"), strings.Contains(lower, "read file"), strings.Contains(lower, "opening file"), strings.Contains(lower, "writing file"):
		return "file_operation", "Working with workspace files"
	default:
		return "", ""
	}
}

func isLocalWorkspace(path string) bool {
	path = strings.TrimSpace(path)
	return path == "" || filepathIsLocal(path)
}

func filepathIsLocal(path string) bool {
	return !strings.HasPrefix(path, "/Users/") && !strings.Contains(path, ":\\")
}

func chatContextTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Minute)
}

const daemonSockPath = "/tmp/hermes-daemon.sock"

func daemonSock() string {
	if v := os.Getenv("HERMES_DAEMON_SOCK"); v != "" {
		return v
	}
	return daemonSockPath
}

func daemonHealthy() bool {
	c := &http.Client{Transport: &http.Transport{DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
		return net.Dial("unix", daemonSock())
	}}, Timeout: 800 * time.Millisecond}
	r, err := c.Get("http://localhost/health")
	if err != nil {
		return false
	}
	defer r.Body.Close()
	return r.StatusCode == 200
}

// ChatDaemonHealth reports whether the local warm Hermes bridge is reachable.
func ChatDaemonHealth() map[string]any {
	if daemonHealthy() {
		return map[string]any{"status": "ready", "socket": daemonSock()}
	}
	return map[string]any{"status": "down", "socket": daemonSock()}
}

// runChatViaDaemon streams the warm daemon's SSE response into chat run events.
// Returns false on any failure before the first event so RunChat can fall back to CLI.
func runChatViaDaemon(ctx context.Context, runID, workspace, profile, model, prompt, hermesSessionID, switchyardSessionID string) bool {
	body, _ := json.Marshal(map[string]string{
		"prompt":                prompt,
		"workspace":             workspace,
		"profile":               profile,
		"model":                 model,
		"session_id":            hermesSessionID,
		"switchyard_session_id": switchyardSessionID,
	})
	req, err := http.NewRequestWithContext(ctx, "POST", "http://localhost/query", bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	c := &http.Client{Transport: &http.Transport{DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
		return net.Dial("unix", daemonSock())
	}}, Timeout: 10 * time.Minute}
	resp, err := c.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		_, _ = io.ReadAll(resp.Body)
		return false
	}
	dec := newSSEDecoder(resp.Body)
	var result strings.Builder
	got := false
	sid := ""
	failed := ""
	for dec.Scan() {
		got = true
		ev := dec.Event()
		switch ev["kind"] {
		case "tool_output":
			appendHermesOutputEvents(runID, ev["text"])
		case "phase":
			phasePayload, _ := json.Marshal(map[string]string{"phase": ev["phase"], "label": ev["label"]})
			_ = AppendChatRunEvent(runID, "phase", string(phasePayload))
		case "error":
			failed = ev["error"]
		case "completed":
			result.WriteString(ev["text"])
			if s := daemonSessionID(ev); s != "" {
				sid = s
			}
		}
	}
	if !got || failed != "" {
		return false
	}
	out := strings.TrimSpace(stripHermesMetadata(result.String()))
	if out == "" {
		_ = UpdateChatRunState(runID, "error", "", "agent returned empty response")
		return true
	}
	// Persist new hermes session id before creating the assistant message so the
	// next turn in this room resumes context. On resume-failure, clear and retry once.
	if sid != "" && switchyardSessionID != "" {
		if cur, err := GetChatSession(switchyardSessionID); err == nil && cur.HermesSessionID != sid {
			_ = SetHermesSessionID(switchyardSessionID, sid)
		}
	}
	_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d,"daemon":true}`, len(out)))
	_ = UpdateChatRunState(runID, "done", out, "")
	if r, err := GetChatRun(runID); err == nil {
		_, _ = CreateChatMessage(r.SessionID, "assistant", out, r.ID)
	}
	return true
}

// daemonSessionID returns the hermes session id from a completed SSE event, if present.
func daemonSessionID(ev map[string]string) string {
	return ev["session_id"]
}

// runChatViaDaemonRetry resumes once with a cleared session on resume failure.
func runChatViaDaemonRetry(ctx context.Context, runID, workspace, profile, model, prompt, hermesSessionID, switchyardSessionID string) bool {
	if hermesSessionID == "" || switchyardSessionID == "" {
		return runChatViaDaemon(ctx, runID, workspace, profile, model, prompt, hermesSessionID, switchyardSessionID)
	}
	if ok := runChatViaDaemon(ctx, runID, workspace, profile, model, prompt, hermesSessionID, switchyardSessionID); ok {
		return true
	}
	// Resume likely failed mid-stream: clear and retry fresh (best-effort daemon).
	if cur, err := GetChatSession(switchyardSessionID); err == nil {
		if cur.HermesSessionID == hermesSessionID {
			_ = ClearHermesSessionID(switchyardSessionID)
		}
	}
	return runChatViaDaemon(ctx, runID, workspace, profile, model, prompt, "", switchyardSessionID)
}

// sseEvent reads Server-Sent-Events `data:` lines into a map of JSON fields per event.
type sseEvent struct {
	sc   *bufio.Scanner
	last map[string]string
}

func newSSEDecoder(r io.Reader) *sseEvent {
	return &sseEvent{sc: bufio.NewScanner(r)}
}

func (d *sseEvent) Scan() bool {
	var data []string
	for d.sc.Scan() {
		line := d.sc.Text()
		if line == "" {
			if len(data) > 0 {
				d.last = parseSSE(strings.Join(data, "\n"))
				return true
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(line, "data:"))
		}
	}
	if len(data) > 0 {
		d.last = parseSSE(strings.Join(data, "\n"))
		return true
	}
	return false
}

func (d *sseEvent) Event() map[string]string { return d.last }

func parseSSE(raw string) map[string]string {
	out := map[string]string{}
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}
