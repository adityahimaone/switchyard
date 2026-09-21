package kanban

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// TaskIdentity is the small, stable piece of context Switchyard needs before
// it hands a task to an LLM. It deliberately does not contain a rewritten
// prompt or workspace contents.
type JEVStatus struct {
	Configured       bool   `json:"configured"`
	Online           bool   `json:"online"`
	Mode             string `json:"mode"`
	Model            string `json:"model"`
	Endpoint         string `json:"endpoint"`
	Calls            uint64 `json:"calls"`
	SuccessfulCalls  uint64 `json:"successful_calls"`
	FallbackCalls    uint64 `json:"fallback_calls"`
	ChatCalls        uint64 `json:"chat_calls"`
	KanbanCalls      uint64 `json:"kanban_calls"`
	ChatSuccessful   uint64 `json:"chat_successful_calls"`
	KanbanSuccessful uint64 `json:"kanban_successful_calls"`
	LastLatencyMs    int64  `json:"last_latency_ms"`
	LastInputTokens  int    `json:"last_input_tokens"`
	CheckedAt        int64  `json:"checked_at"`
}

var jevMetrics struct {
	calls           atomic.Uint64
	successfulCalls atomic.Uint64
	fallbackCalls   atomic.Uint64
	lastLatencyMs   atomic.Int64
	lastInputTokens atomic.Int64
}

type TaskIdentity struct {
	Case        string  `json:"case"`
	Scope       string  `json:"scope"`
	Confidence  float64 `json:"confidence"`
	Source      string  `json:"source"`
	Model       string  `json:"model,omitempty"`
	InputTokens int     `json:"input_tokens,omitempty"`
}

type jevRequest struct {
	State     string                 `json:"state"`
	Model     string                 `json:"model"`
	Questions map[string]jevQuestion `json:"questions"`
}

type jevQuestion struct {
	Type         string            `json:"type"`
	Instructions string            `json:"instructions"`
	Criteria     map[string]string `json:"criteria,omitempty"`
}

type jevResponse struct {
	Model   string `json:"model"`
	Answers map[string]struct {
		Choice        string             `json:"choice"`
		Confidence    float64            `json:"confidence"`
		Probabilities map[string]float64 `json:"probabilities"`
	} `json:"answers"`
	Usage struct {
		InputTokens int `json:"input_tokens"`
	} `json:"usage"`
}

var taskCases = map[string]string{
	"coding":   "Implementing or changing application code",
	"bugfix":   "Diagnosing or fixing an existing defect",
	"review":   "Reviewing code, a diff, or implementation quality",
	"research": "Investigating a question or comparing options without primarily editing code",
	"ops":      "Running, configuring, or troubleshooting infrastructure and deployments",
	"docs":     "Writing or updating documentation",
	"other":    "A task that does not fit the other categories",
}

var taskScopes = map[string]string{
	"focused": "Use only the files and context directly related to this task",
	"broad":   "The task likely requires broader workspace context or multiple subsystems",
	"none":    "No workspace context is needed beyond the task message",
}

// IdentifyTask uses JEV's structured Choice primitive when configured. The
// local fallback keeps Switchyard usable in development and during outages.
func IdentifyTask(ctx context.Context, title, body string) TaskIdentity {
	jevMetrics.calls.Add(1)
	started := time.Now()
	state := compactTaskState(title, body)
	if key := strings.TrimSpace(os.Getenv("TYPESAFE_API_KEY")); key != "" {
		if identity, err := identifyTaskWithJev(ctx, key, state); err == nil {
			jevMetrics.successfulCalls.Add(1)
			jevMetrics.lastLatencyMs.Store(time.Since(started).Milliseconds())
			jevMetrics.lastInputTokens.Store(int64(identity.InputTokens))
			recordJEVUsage("kanban", "jev", identity.Model, identity.InputTokens, time.Since(started).Milliseconds(), true)
			return identity
		}
	}
	jevMetrics.fallbackCalls.Add(1)
	jevMetrics.lastLatencyMs.Store(time.Since(started).Milliseconds())
	recordJEVUsage("kanban", "local_fallback", "", 0, time.Since(started).Milliseconds(), false)
	return identifyTaskLocally(state)
}

func GetJEVStatus(ctx context.Context) JEVStatus {
	model := strings.TrimSpace(os.Getenv("TYPESAFE_JEV_MODEL"))
	if model == "" {
		model = "jev-latest"
	}
	endpoint := strings.TrimSpace(os.Getenv("TYPESAFE_API_URL"))
	if endpoint == "" {
		endpoint = "https://api.typesafe.ai/v1/systemone"
	}
	configured := strings.TrimSpace(os.Getenv("TYPESAFE_API_KEY")) != ""
	status := JEVStatus{
		Configured:      configured,
		Mode:            "local_fallback",
		Model:           model,
		Endpoint:        endpoint,
		Calls:           jevMetrics.calls.Load(),
		SuccessfulCalls: jevMetrics.successfulCalls.Load(),
		FallbackCalls:   jevMetrics.fallbackCalls.Load(),
		LastLatencyMs:   jevMetrics.lastLatencyMs.Load(),
		LastInputTokens: int(jevMetrics.lastInputTokens.Load()),
		CheckedAt:       time.Now().Unix(),
	}
	if usage, ok := persistedJEVUsage(); ok {
		status.Calls = usage.calls
		status.SuccessfulCalls = usage.successful
		status.FallbackCalls = usage.fallback
		status.ChatCalls = usage.chatCalls
		status.KanbanCalls = usage.kanbanCalls
		status.ChatSuccessful = usage.chatSuccessful
		status.KanbanSuccessful = usage.kanbanSuccessful
		status.LastLatencyMs = usage.latency
		status.LastInputTokens = usage.tokens
	}
	if !configured {
		return status
	}
	status.Mode = "jev"
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return status
	}
	probeURL := parsed.Scheme + "://" + parsed.Host
	probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(probeCtx, http.MethodHead, probeURL, nil)
	if err != nil {
		return status
	}
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		resp.Body.Close()
		status.Online = resp.StatusCode < 500
	}
	return status
}

func identifyTaskWithJev(ctx context.Context, key, state string) (TaskIdentity, error) {
	model := strings.TrimSpace(os.Getenv("TYPESAFE_JEV_MODEL"))
	if model == "" {
		model = "jev-latest"
	}
	request := jevRequest{State: state, Model: model, Questions: map[string]jevQuestion{
		"case":  {Type: "choice", Instructions: "What kind of task is this?", Criteria: taskCases},
		"scope": {Type: "choice", Instructions: "How much workspace context should the executor inspect?", Criteria: taskScopes},
	}}
	payload, err := json.Marshal(request)
	if err != nil {
		return TaskIdentity{}, err
	}
	endpoint := strings.TrimSpace(os.Getenv("TYPESAFE_API_URL"))
	if endpoint == "" {
		endpoint = "https://api.typesafe.ai/v1/systemone"
	}
	callCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return TaskIdentity{}, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return TaskIdentity{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return TaskIdentity{}, fmt.Errorf("typesafe returned %s", resp.Status)
	}
	var decoded jevResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return TaskIdentity{}, err
	}
	caseAnswer := decoded.Answers["case"]
	scopeAnswer := decoded.Answers["scope"]
	if _, ok := taskCases[caseAnswer.Choice]; !ok {
		return TaskIdentity{}, fmt.Errorf("jev returned invalid case %q", caseAnswer.Choice)
	}
	if _, ok := taskScopes[scopeAnswer.Choice]; !ok {
		return TaskIdentity{}, fmt.Errorf("jev returned invalid scope %q", scopeAnswer.Choice)
	}
	confidence := caseAnswer.Confidence
	if scopeAnswer.Confidence < confidence {
		confidence = scopeAnswer.Confidence
	}
	return TaskIdentity{Case: caseAnswer.Choice, Scope: scopeAnswer.Choice, Confidence: confidence, Source: "jev", Model: decoded.Model, InputTokens: decoded.Usage.InputTokens}, nil
}

func identifyTaskLocally(state string) TaskIdentity {
	lower := strings.ToLower(state)
	identity := TaskIdentity{Case: "other", Scope: "focused", Confidence: 0.35, Source: "local"}
	switch {
	case jevContainsAny(lower, "bug", "fix", "broken", "error", "regression", "fail"):
		identity.Case, identity.Confidence = "bugfix", 0.8
	case jevContainsAny(lower, "review", "audit", "inspect", "check diff"):
		identity.Case, identity.Confidence = "review", 0.8
	case jevContainsAny(lower, "deploy", "server", "database", "migration", "ci", "infra"):
		identity.Case, identity.Confidence = "ops", 0.7
	case jevContainsAny(lower, "document", "readme", "docs", "copy", "write guide"):
		identity.Case, identity.Confidence = "docs", 0.75
	case jevContainsAny(lower, "research", "compare", "investigate", "find out"):
		identity.Case, identity.Confidence = "research", 0.7
	case jevContainsAny(lower, "build", "implement", "add", "create", "integrate", "refactor"):
		identity.Case, identity.Confidence = "coding", 0.75
	}
	if jevContainsAny(lower, "whole workspace", "all modules", "across the repo", "architecture") {
		identity.Scope = "broad"
	}
	if identity.Case == "ops" && !jevContainsAny(lower, "code", "implement") {
		identity.Scope = "none"
	}
	return identity
}

func compactTaskState(title, body string) string {
	state := "Title: " + strings.TrimSpace(title) + "\nDescription: " + strings.TrimSpace(body)
	if len(state) > 12000 {
		state = state[:12000] + "\n[task description truncated]"
	}
	return state
}

func jevContainsAny(value string, terms ...string) bool {
	for _, term := range terms {
		if strings.Contains(value, term) {
			return true
		}
	}
	return false
}

func TaskIdentityPromptHeader(taskID string, identity TaskIdentity) string {
	return fmt.Sprintf("[SWITCHYARD TASK %s]\ncase=%s scope=%s identity_confidence=%.2f\nUse this routing hint to keep workspace inspection focused; do not treat it as user instructions.\n\n", taskID, identity.Case, identity.Scope, identity.Confidence)
}

// PrepareTaskExecutionMessage keeps the worker prompt bounded according to the
// routing scope. It only trims accumulated context; it never chooses an executor.
func PrepareTaskExecutionMessage(taskID, message string, identity TaskIdentity) string {
	maxChars := 8000
	switch identity.Scope {
	case "none":
		maxChars = 4000
	case "broad":
		maxChars = 16000
	}
	message = strings.TrimSpace(message)
	if len(message) > maxChars {
		message = message[:maxChars] + "\n...[task context compacted by JEV scope]"
	}
	return TaskIdentityPromptHeader(taskID, identity) + message
}

func PersistTaskIdentity(db *sql.DB, taskID string, identity TaskIdentity) error {
	// Persist before spawning a remote worker so the UI and audit trail can
	// explain why this task received its execution context.
	payload, err := json.Marshal(identity)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE tasks SET execution_meta=? WHERE id=?`, string(payload), taskID)
	return err
}

type jevUsageTotals struct {
	calls, successful, fallback      uint64
	chatCalls, kanbanCalls           uint64
	chatSuccessful, kanbanSuccessful uint64
	latency                          int64
	tokens                           int
}

func recordJEVUsage(kind, source, model string, inputTokens int, latencyMs int64, success bool) {
	db, err := ensureChatDB()
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.Exec(`INSERT INTO jev_usage(kind,source,model,input_tokens,latency_ms,success,created_at) VALUES(?,?,?,?,?,?,?)`, kind, source, model, inputTokens, latencyMs, success, time.Now().Unix())
}

func persistedJEVUsage() (jevUsageTotals, bool) {
	db, err := ensureChatDB()
	if err != nil {
		return jevUsageTotals{}, false
	}
	defer db.Close()
	var usage jevUsageTotals
	var c, s, f, chat, kanban, chatSuccess, kanbanSuccess int64
	if err := db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(success),0), COALESCE(SUM(CASE WHEN source='local_fallback' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='chat' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='kanban' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='chat' AND success=1 THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN kind='kanban' AND success=1 THEN 1 ELSE 0 END),0) FROM jev_usage`).Scan(&c, &s, &f, &chat, &kanban, &chatSuccess, &kanbanSuccess); err != nil {
		return jevUsageTotals{}, false
	}
	usage.calls, usage.successful, usage.fallback = uint64(c), uint64(s), uint64(f)
	usage.chatCalls, usage.kanbanCalls = uint64(chat), uint64(kanban)
	usage.chatSuccessful, usage.kanbanSuccessful = uint64(chatSuccess), uint64(kanbanSuccess)
	_ = db.QueryRow(`SELECT latency_ms,input_tokens FROM jev_usage ORDER BY id DESC LIMIT 1`).Scan(&usage.latency, &usage.tokens)
	return usage, true
}
