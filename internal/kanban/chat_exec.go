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
	reasoning := "minimal"
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
		res, err := DispatchRemote(NodeDispatchRequest{TaskID: runID, Title: "Chat: " + prompt, Board: "default", Message: prompt, Workspace: workspace, Model: model, Provider: profile, Executor: agent}, 10*time.Minute)
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
	// Try warm daemon first (saves cold-start on repeat runs); fall back to CLI.
	if daemonHealthy() {
		if ok := runChatViaDaemon(ctx, runID, workspace, profile, model, prompt); ok {
			return
		}
	}
	hermesSessionID := ""
	if r, getErr := GetChatRun(runID); getErr == nil {
		if s, sessionErr := GetChatSession(r.SessionID); sessionErr == nil {
			hermesSessionID = s.HermesSessionID
		}
	}
	args, err := chatCommand(agent, profile, model, prompt, hermesSessionID)
	if err != nil {
		_ = UpdateChatRunState(runID, "error", "", err.Error())
		return
	}
	var onLine = func(line string) {
		_ = AppendChatRunEvent(runID, "tool_output", fmt.Sprintf("{\"text\":%q}", line))
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
	result := strings.TrimSpace(output)
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
var hermesSessionIDRe = regexp.MustCompile(`Session:\s*(\S+)`)

func parseHermesSessionID(out string) string {
	if m := hermesSessionIDRe.FindStringSubmatch(out); m != nil {
		return m[1]
	}
	return ""
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

// runChatViaDaemon streams the warm daemon's SSE response into chat run events.
// Returns false on any failure before the first event so RunChat can fall back to CLI.
func runChatViaDaemon(ctx context.Context, runID, workspace, profile, model, prompt string) bool {
	body, _ := json.Marshal(map[string]string{
		"prompt":    prompt,
		"workspace": workspace,
		"profile":   profile,
		"model":     model,
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
	for dec.Scan() {
		got = true
		ev := dec.Event()
		switch ev["kind"] {
		case "tool_output":
			_ = AppendChatRunEvent(runID, "tool_output", fmt.Sprintf(`{"text":%q}`, ev["text"]))
		case "completed":
			result.WriteString(ev["text"])
		}
	}
	if !got {
		return false
	}
	out := strings.TrimSpace(result.String())
	if out == "" {
		_ = UpdateChatRunState(runID, "error", "", "agent returned empty response")
		return true
	}
	_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d,"daemon":true}`, len(out)))
	_ = UpdateChatRunState(runID, "done", out, "")
	if r, err := GetChatRun(runID); err == nil {
		_, _ = CreateChatMessage(r.SessionID, "assistant", out, r.ID)
	}
	return true
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
