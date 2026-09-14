package kanban

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// chatCommand — hermes-only (codex/shell remain task executors, not chat)
func chatCommand(agent, profile, model, prompt string) ([]string, error) {
	agent = strings.TrimSpace(agent)
	if agent != "hermes" {
		return nil, fmt.Errorf("unsupported chat agent %q", agent)
	}
	reasoning := "minimal"
	if fastChatPrompt(prompt) {
		reasoning = "none"
	}
	args := []string{"chat", "-Q", "--reasoning", reasoning}

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

// RunChat executes local agent fast path. Remote workspace stays task/node-agent path.
// Output bounded, context cancellable. Assistant output persists after completion.
func RunChat(ctx context.Context, runID, agent, profile, workspace, model, prompt string) {
	_ = UpdateChatRunState(runID, "running", "", "")
	_ = AppendChatRunEvent(runID, "spawned", fmt.Sprintf(`{"agent":%q,"profile":%q}`, agent, profile))
	answer, ok := greetingChatAnswer(prompt)
	if !ok {
		answer, ok = todayChatAnswer(prompt, time.Now())
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
	args, err := chatCommand(agent, profile, model, prompt)
	if err != nil {
		_ = UpdateChatRunState(runID, "error", "", err.Error())
		return
	}
	cmd := exec.CommandContext(ctx, "hermes", args...)
	if dir := strings.TrimSpace(localWorkspacePath(workspace)); dir != "" {
		cmd.Dir = dir
	}
	cmd.Stdin = strings.NewReader(prompt)

	pipe, err := cmd.StdoutPipe()
	if err != nil {
		_ = UpdateChatRunState(runID, "error", "", err.Error())
		return
	}
	if err := cmd.Start(); err != nil {
		_ = UpdateChatRunState(runID, "error", "", trimErr(err))
		return
	}
	var output strings.Builder
	scanner := bufio.NewScanner(pipe)
	for scanner.Scan() {
		line := scanner.Text()
		if output.Len() < 100000 {
			output.WriteString(line)
			output.WriteByte('\n')
		}
		_ = AppendChatRunEvent(runID, "tool_output", fmt.Sprintf(`{"text":%q}`, line))
	}
	err = cmd.Wait()
	if ctx.Err() != nil {
		_ = UpdateChatRunState(runID, "cancelled", output.String(), ctx.Err().Error())
		return
	}
	if err != nil {
		_ = UpdateChatRunState(runID, "error", output.String(), trimErr(err))
		return
	}
	result := strings.TrimSpace(output.String())
	if result == "" {
		_ = UpdateChatRunState(runID, "error", "", "agent returned empty response")
		return
	}
	_ = AppendChatRunEvent(runID, "completed", fmt.Sprintf(`{"bytes":%d}`, len(result)))
	_ = UpdateChatRunState(runID, "done", result, "")
	if r, err := GetChatRun(runID); err == nil {
		_, _ = CreateChatMessage(r.SessionID, "assistant", result, r.ID)
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
