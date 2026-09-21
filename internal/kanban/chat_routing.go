package kanban

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// ChatRoute is the structured preflight decision used to keep chat context
// small and route high-risk requests through confirmation.
type ChatRoute struct {
	Intent                  string  `json:"intent"`
	ContextScope            string  `json:"context_scope"`
	NeedsWorkspace          bool    `json:"needs_workspace"`
	NeedsConfirmation       bool    `json:"needs_confirmation"`
	NeedsAttachmentAnalysis bool    `json:"needs_attachment_analysis"`
	NeedsCompaction         bool    `json:"needs_compaction"`
	Confidence              float64 `json:"confidence"`
	Source                  string  `json:"source"`
	Model                   string  `json:"model,omitempty"`
	InputTokens             int     `json:"input_tokens,omitempty"`
}

var chatIntents = map[string]string{
	"casual_chat":          "A conversational question or simple answer that does not require workspace work",
	"task_execution":       "The user wants the agent to inspect or change a workspace",
	"create_kanban_task":   "The user wants to create or formalize a tracked Kanban task",
	"task_status":          "The user asks about the progress or state of a tracked task",
	"workspace_question":   "The user asks about code, files, architecture, or repository behavior",
	"review_request":       "The user requests a code review, diff review, or quality assessment",
	"summarization":        "The user wants a conversation, document, or result summarized",
	"clarification_needed": "The request is too ambiguous to safely route or execute",
	"other":                "The request does not fit the other categories",
}

var chatContextScopes = map[string]string{
	"none":              "Do not inspect workspace or historical context beyond the current request",
	"session_only":      "Use the current conversation session but no workspace inspection",
	"workspace_focused": "Inspect only files and context directly related to the request",
	"workspace_broad":   "Use broader workspace, CodeGraph, or prerequisite context",
	"task_history":      "Use task results, comments, and recent execution history",
}

type chatRouteRequest struct {
	State     string                       `json:"state"`
	Model     string                       `json:"model"`
	Questions map[string]chatRouteQuestion `json:"questions"`
}

type chatRouteQuestion struct {
	Type         string            `json:"type"`
	Instructions string            `json:"instructions"`
	Criteria     map[string]string `json:"criteria,omitempty"`
}

type chatRouteAnswer struct {
	Choice     string  `json:"choice"`
	Confidence float64 `json:"confidence"`
	Noul       float64 `json:"noul"`
}

type chatRouteResponse struct {
	Model   string                     `json:"model"`
	Answers map[string]chatRouteAnswer `json:"answers"`
	Usage   struct {
		InputTokens int `json:"input_tokens"`
	} `json:"usage"`
}

// RouteChat evaluates one compact state. Short messages intentionally avoid a
// network call because greetings and acknowledgements do not need routing.
func RouteChat(ctx context.Context, title, prompt, workspace string, attachmentCount int, recent string) ChatRoute {
	if !chatNeedsRouting(prompt, workspace, attachmentCount, recent) {
		route := routeChatLocally(prompt, workspace, attachmentCount, recent)
		route.Source = "local_fast_path"
		recordJEVUsage("chat", "local_fast_path", "", 0, 0, false)
		return route
	}
	jevMetrics.calls.Add(1)
	started := time.Now()
	state := compactChatRouteState(title, prompt, workspace, attachmentCount, recent)
	if key := strings.TrimSpace(os.Getenv("TYPESAFE_API_KEY")); key != "" {
		if route, err := routeChatWithJev(ctx, key, state); err == nil {
			jevMetrics.successfulCalls.Add(1)
			jevMetrics.lastLatencyMs.Store(time.Since(started).Milliseconds())
			jevMetrics.lastInputTokens.Store(int64(route.InputTokens))
			recordJEVUsage("chat", "jev", route.Model, route.InputTokens, time.Since(started).Milliseconds(), true)
			return route
		}
	}
	jevMetrics.fallbackCalls.Add(1)
	jevMetrics.lastLatencyMs.Store(time.Since(started).Milliseconds())
	recordJEVUsage("chat", "local_fallback", "", 0, time.Since(started).Milliseconds(), false)
	route := routeChatLocally(prompt, workspace, attachmentCount, recent)
	route.Source = "local_fallback"
	return route
}

func routeChatWithJev(ctx context.Context, key, state string) (ChatRoute, error) {
	model := strings.TrimSpace(os.Getenv("TYPESAFE_JEV_MODEL"))
	if model == "" {
		model = "jev-latest"
	}
	request := chatRouteRequest{State: state, Model: model, Questions: map[string]chatRouteQuestion{
		"intent":                    {Type: "choice", Instructions: "What is the user's primary intent?", Criteria: chatIntents},
		"context_scope":             {Type: "choice", Instructions: "What context should the agent receive or inspect?", Criteria: chatContextScopes},
		"needs_workspace":           {Type: "noul", Instructions: "The request requires inspecting or changing a workspace"},
		"needs_confirmation":        {Type: "noul", Instructions: "The request could cause a destructive, external, or state-changing action that should be confirmed before execution"},
		"needs_attachment_analysis": {Type: "noul", Instructions: "The attached files need to be analyzed to answer the request"},
		"needs_compaction":          {Type: "noul", Instructions: "The existing session context is likely too large or stale and should be compacted before continuing"},
	}}
	payload, err := json.Marshal(request)
	if err != nil {
		return ChatRoute{}, err
	}
	endpoint := strings.TrimSpace(os.Getenv("TYPESAFE_API_URL"))
	if endpoint == "" {
		endpoint = "https://api.typesafe.ai/v1/systemone"
	}
	callCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return ChatRoute{}, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ChatRoute{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ChatRoute{}, fmt.Errorf("typesafe returned %s", resp.Status)
	}
	var decoded chatRouteResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return ChatRoute{}, err
	}
	intent := decoded.Answers["intent"]
	scope := decoded.Answers["context_scope"]
	if _, ok := chatIntents[intent.Choice]; !ok {
		return ChatRoute{}, fmt.Errorf("invalid chat intent %q", intent.Choice)
	}
	if _, ok := chatContextScopes[scope.Choice]; !ok {
		return ChatRoute{}, fmt.Errorf("invalid chat context scope %q", scope.Choice)
	}
	confidence := intent.Confidence
	if confidence == 0 {
		confidence = 0.5
	}
	return ChatRoute{
		Intent:                  intent.Choice,
		ContextScope:            scope.Choice,
		NeedsWorkspace:          decoded.Answers["needs_workspace"].Noul >= 0.5,
		NeedsConfirmation:       decoded.Answers["needs_confirmation"].Noul >= 0.5,
		NeedsAttachmentAnalysis: decoded.Answers["needs_attachment_analysis"].Noul >= 0.5,
		NeedsCompaction:         decoded.Answers["needs_compaction"].Noul >= 0.5,
		Confidence:              confidence,
		Source:                  "jev",
		Model:                   decoded.Model,
		InputTokens:             decoded.Usage.InputTokens,
	}, nil
}

func routeChatLocally(prompt, workspace string, attachmentCount int, recent string) ChatRoute {
	p := strings.ToLower(strings.TrimSpace(prompt))
	if chatContainsAny(p, "yes", "confirm", "confirmed", "lanjutkan", "jalankan") && strings.Contains(strings.ToLower(recent), "confirmation required") {
		return ChatRoute{Intent: "task_execution", ContextScope: "workspace_focused", NeedsWorkspace: true, Confidence: 0.95, Source: "local_confirmation"}
	}
	route := ChatRoute{Intent: "casual_chat", ContextScope: "session_only", Confidence: 0.55, Source: "local"}
	switch {
	case chatContainsAny(p, "buat task", "create task", "kanban task", "jadikan task"):
		route.Intent, route.ContextScope, route.Confidence = "create_kanban_task", "task_history", 0.82
	case chatContainsAny(p, "status task", "progress task", "task sudah", "berapa persen"):
		route.Intent, route.ContextScope, route.Confidence = "task_status", "task_history", 0.8
	case chatContainsAny(p, "review", "review code", "review diff", "audit"):
		route.Intent, route.ContextScope, route.Confidence = "review_request", "workspace_focused", 0.78
	case chatContainsAny(p, "ringkas", "rangkum", "summarize", "summary"):
		route.Intent, route.ContextScope, route.Confidence = "summarization", "session_only", 0.78
	case chatContainsAny(p, "implement", "buatkan", "ubah", "perbaiki", "fix", "debug", "coding", "refactor", "hapus", "delete", "deploy"):
		route.Intent, route.ContextScope, route.Confidence = "task_execution", "workspace_focused", 0.75
	case chatContainsAny(p, "file", "kode", "code", "repository", "repo", "arsitektur", "architecture"):
		route.Intent, route.ContextScope, route.Confidence = "workspace_question", "workspace_focused", 0.72
	}
	route.NeedsWorkspace = route.Intent == "task_execution" || route.Intent == "review_request" || route.Intent == "workspace_question"
	route.NeedsAttachmentAnalysis = attachmentCount > 0 && chatContainsAny(p, "gambar", "image", "foto", "attachment", "lampiran", "pdf", "lihat", "analyze")
	route.NeedsCompaction = len(recent) > 6000
	route.NeedsConfirmation = route.Intent == "create_kanban_task" || (workspace != "" && route.NeedsWorkspace && chatContainsAny(p, "hapus", "delete", "remove", "drop", "reset", "overwrite", "commit", "push", "deploy", "jalankan", "run command"))
	if route.NeedsConfirmation {
		route.Confidence = maxFloat(route.Confidence, 0.8)
	}
	return route
}

func chatNeedsRouting(prompt, workspace string, attachmentCount int, recent string) bool {
	return len([]rune(strings.TrimSpace(prompt))) > 30 || attachmentCount > 0 || len(recent) > 6000
}

func compactChatRouteState(title, prompt, workspace string, attachmentCount int, recent string) string {
	state := fmt.Sprintf("Session: %s\nWorkspace selected: %t\nAttachments: %d\nRecent context:\n%s\nCurrent user message:\n%s", strings.TrimSpace(title), strings.TrimSpace(workspace) != "", attachmentCount, strings.TrimSpace(recent), strings.TrimSpace(prompt))
	if len(state) > 14000 {
		state = state[:14000] + "\n[context truncated]"
	}
	return state
}

func ChatRoutingPrompt(route ChatRoute) string {
	return fmt.Sprintf("[SWITCHYARD CHAT ROUTING]\nintent=%s context_scope=%s needs_workspace=%t needs_confirmation=%t needs_compaction=%t confidence=%.2f\nUse this as routing metadata only. Keep context focused on the selected scope. If the request is ambiguous, ask one concise clarification.\n\n", route.Intent, route.ContextScope, route.NeedsWorkspace, route.NeedsConfirmation, route.NeedsCompaction, route.Confidence)
}

func chatContainsAny(value string, terms ...string) bool {
	for _, term := range terms {
		if strings.Contains(value, term) {
			return true
		}
	}
	return false
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func routeChatForRun(ctx context.Context, runID, prompt, workspace string) (ChatRoute, string, error) {
	run, err := GetChatRun(runID)
	if err != nil {
		return ChatRoute{}, "", err
	}
	session, err := GetChatSession(run.SessionID)
	if err != nil {
		return ChatRoute{}, "", err
	}
	attachments, err := ListChatAttachments(run.MessageID)
	if err != nil {
		return ChatRoute{}, "", err
	}
	messages, err := ListChatMessages(run.SessionID)
	if err != nil {
		return ChatRoute{}, "", err
	}
	var parts []string
	start := len(messages) - 7
	if start < 0 {
		start = 0
	}
	for _, message := range messages[start:] {
		if message.ID == run.MessageID {
			continue
		}
		content := strings.TrimSpace(message.Content)
		if len(content) > 900 {
			content = content[:900] + "…"
		}
		if content != "" {
			parts = append(parts, message.Role+": "+content)
		}
	}
	recent := strings.Join(parts, "\n")
	return RouteChat(ctx, session.Title, prompt, workspace, len(attachments), recent), recent, nil
}

func chatTaskStatusAnswer(prompt string) (string, bool) {
	var taskID string
	for _, token := range strings.Fields(prompt) {
		token = strings.Trim(token, "`.,!?;:()[]{}\"")
		if strings.HasPrefix(token, "t_") && len(token) >= 4 {
			taskID = token
			break
		}
	}
	if taskID == "" {
		return "", false
	}
	boards, err := ListBoards()
	if err != nil {
		return "", false
	}
	for _, board := range boards {
		tasks, _, err := ListTasksQuery(board.Slug, TaskQuery{Q: taskID, Limit: 5})
		if err != nil {
			continue
		}
		for _, task := range tasks {
			if task.ID != taskID {
				continue
			}
			answer := fmt.Sprintf("Task %s on board %s is %s.", task.ID, board.Name, task.Status)
			if task.Title != "" {
				answer += " Title: " + task.Title + "."
			}
			if task.LastError != "" {
				answer += " Last error: " + task.LastError + "."
			}
			return answer, true
		}
	}
	return fmt.Sprintf("I couldn't find task %s in the available boards.", taskID), true
}

func CreateChatConfirmation(sessionID, runID, intent, prompt string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	now := time.Now().Unix()
	_, err = db.Exec(`UPDATE chat_confirmations SET status='superseded' WHERE session_id=? AND status='pending'`, sessionID)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO chat_confirmations(session_id,run_id,intent,prompt,created_at,expires_at,status) VALUES(?,?,?,?,?,?,?)`, sessionID, runID, intent, prompt, now, now+10*60, "pending")
	return err
}

func PendingChatConfirmation(sessionID string) (intent, prompt string, ok bool) {
	db, err := ensureChatDB()
	if err != nil {
		return "", "", false
	}
	defer db.Close()
	var id int64
	var expires int64
	err = db.QueryRow(`SELECT id,intent,prompt,expires_at FROM chat_confirmations WHERE session_id=? AND status='pending' ORDER BY id DESC LIMIT 1`, sessionID).Scan(&id, &intent, &prompt, &expires)
	if err != nil {
		return "", "", false
	}
	if expires <= time.Now().Unix() {
		_, _ = db.Exec(`UPDATE chat_confirmations SET status='expired' WHERE id=?`, id)
		return "", "", false
	}
	return intent, prompt, true
}

func ConsumeChatConfirmation(sessionID string) error {
	db, err := ensureChatDB()
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`UPDATE chat_confirmations SET status='consumed', consumed_at=? WHERE session_id=? AND status='pending'`, time.Now().Unix(), sessionID)
	return err
}

func isChatConfirmationPrompt(prompt string) bool {
	switch strings.ToLower(strings.TrimSpace(prompt)) {
	case "confirm", "confirmed", "yes", "y", "lanjut", "lanjutkan", "jalankan":
		return true
	default:
		return false
	}
}

func createChatTaskFromPrompt(prompt, workspace string) (*Task, error) {
	title := strings.TrimSpace(prompt)
	for _, prefix := range []string{"buat task", "create task", "kanban task", "jadikan task"} {
		if strings.HasPrefix(strings.ToLower(title), prefix) {
			title = strings.TrimSpace(title[len(prefix):])
			break
		}
	}
	if title == "" {
		title = "Chat-created task"
	}
	if len([]rune(title)) > 120 {
		title = string([]rune(title)[:120])
	}
	task := &Task{Title: title, Body: strings.TrimSpace(prompt), WorkspacePath: strings.TrimSpace(workspace)}
	if err := CreateTask("default", task); err != nil {
		return nil, err
	}
	return task, nil
}
