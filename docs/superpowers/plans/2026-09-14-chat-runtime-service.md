# Persistent Hermes Chat Runtime — Implementation Plan

## Goal
Add a persistent local Hermes runtime service behind Switchyard chat: one runtime process instead of a fresh `hermes chat` per message, per-run SSE, explicit session history, model-compatible reasoning, reconnect/readback, and CLI fallback. Keep existing `/api/chat/*` contracts and remote-workspace routing unchanged.

## Architecture
Switchyard Go chat API owns rooms/persistence/auth/UI SSE. A new Go runtime client talks to a persistent Hermes runtime over localhost HTTP. Runtime owns the Hermes process, provider calls, tool callbacks, and runtime session context. Remote `/Users/...` paths keep the node-agent path. If runtime is down, local runs fall back to the current CLI path.

## Tech stack
Go `net/http`, `modernc.org/sqlite` chat DB, persistent Hermes runtime service (Go HTTP/JSON), SSE `text/event-stream`, existing `openEventStream`, TanStack Query, Vite/React.

---

## Task 1: Chat runtime client + config
**Files:**
- create `internal/chatruntime/runtime.go`
- create `internal/chatruntime/runtime_test.go`
- modify `internal/kanban/chat_exec.go`

- [ ] Step 1 — write failing test for client URL/config default and override
```go
func TestRuntimeBaseURL(t *testing.T) {
    t.Setenv("SWITCHYARD_HERMES_RUNTIME_URL", "")
    if got := runtimeBaseURL(); got != "http://127.0.0.1:8642" {
        t.Fatalf("default url got %q", got)
    }
    t.Setenv("SWITCHYARD_HERMES_RUNTIME_URL", "http://127.0.0.1:9100")
    if got := runtimeBaseURL(); got != "http://127.0.0.1:9100" {
        t.Fatalf("override url got %q", got)
    }
}
```
- [ ] Step 2 — run test, expect FAIL (`runtimeBaseURL` undefined)
- [ ] Step 3 — implement `runtimeBaseURL()` reading env with default
```go
package chatruntime

import "os"

func runtimeBaseURL() string {
    if v := os.Getenv("SWITCHYARD_HERMES_RUNTIME_URL"); v != "" {
        return v
    }
    return "http://127.0.0.1:8642"
}
```
- [ ] Step 4 — run test, expect PASS
- [ ] Step 5 — commit
```bash
git add internal/chatruntime/runtime.go internal/chatruntime/runtime_test.go
git commit -m "feat(chat-runtime): add runtime base URL config (kanban)"
```

## Task 2: Runtime request/response + event types
**Files:**
- modify `internal/chatruntime/runtime.go`
- modify `internal/chatruntime/runtime_test.go`

- [ ] Step 1 — write failing test for request encoding and event parse
```go
func TestEncodeRunRequest(t *testing.T) {
    req := RunRequest{RunID: "cr_1", SessionID: "cs_1", Prompt: "hai", History: []ChatTurn{{Role: "user", Content: "hai"}}, Profile: "default", Model: ""}
    body, err := json.Marshal(req)
    if err != nil { t.Fatal(err) }
    if !bytes.Contains(body, []byte(`"run_id":"cr_1"`)) {
        t.Fatalf("missing run_id: %s", body)
    }
}

func TestParseRunEvent(t *testing.T) {
    ev, err := ParseRunEvent([]byte(`{"id":1,"kind":"token","data":{"text":"halo"}}`))
    if err != nil { t.Fatal(err) }
    if ev.Kind != "token" || ev.Data["text"] != "halo" {
        t.Fatalf("bad event: %+v", ev)
    }
}
```
- [ ] Step 2 — run tests, expect FAIL
- [ ] Step 3 — implement `RunRequest`, `ChatTurn`, `RunEvent`, `ParseRunEvent`
```go
package chatruntime

import "encoding/json"

type ChatTurn struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type RunRequest struct {
    RunID    string     `json:"run_id"`
    SessionID string    `json:"session_id"`
    Prompt   string     `json:"prompt"`
    History  []ChatTurn `json:"history"`
    Profile  string     `json:"profile"`
    Model    string     `json:"model"`
    Workspace string    `json:"workspace"`
    Reasoning string    `json:"reasoning"`
}

type RunEvent struct {
    ID   int               `json:"id"`
    Kind string            `json:"kind"`
    Data map[string]string `json:"data"`
}

func ParseRunEvent(raw []byte) (RunEvent, error) {
    var ev RunEvent
    if err := json.Unmarshal(raw, &ev); err != nil {
        return RunEvent{}, err
    }
    if ev.Data == nil {
        ev.Data = map[string]string{}
    }
    return ev, nil
}
```
- [ ] Step 4 — run tests, expect PASS
- [ ] Step 5 — commit
```bash
git add internal/chatruntime/runtime.go internal/chatruntime/runtime_test.go
git commit -m "feat(chat-runtime): add run request/event types (kanban)"
```

## Task 3: Runtime client — start run, readback, stream, cancel
**Files:**
- modify `internal/chatruntime/runtime.go`
- modify `internal/chatruntime/runtime_test.go`

- [ ] Step 1 — write failing test for start/readback/stream/cancel using `httptest`
```go
func TestRuntimeClientLifecycle(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        switch {
        case r.URL.Path == "/health":
            w.Write([]byte(`{"status":"ready"}`))
        case r.URL.Path == "/runs" && r.Method == "POST":
            io.WriteString(w, `{"run_id":"cr_1","stream_id":"s1"}`)
        case strings.HasPrefix(r.URL.Path, "/runs/") && strings.HasSuffix(r.URL.Path, "/cancel"):
            w.WriteHeader(202)
        default:
            w.Write([]byte(`{"state":"done","output":"hai"}`))
        }
    }))
    defer srv.Close()
    c := NewClient(srv.URL)
    if st := c.Health(); st != "ready" {
        t.Fatalf("health got %q", st)
    }
    id, sid, err := c.StartRun(RunRequest{RunID: "cr_1"})
    if err != nil || id != "cr_1" || sid != "s1" {
        t.Fatalf("start got %q %q %v", id, sid, err)
    }
    if err := c.CancelRun("cr_1"); err != nil {
        t.Fatal(err)
    }
}
```
- [ ] Step 2 — run test, expect FAIL
- [ ] Step 3 — implement `Client` with `Health`, `StartRun`, `RunReadback`, `CancelRun`, bounded timeouts
```go
package chatruntime

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "strings"
    "time"
)

type Client struct {
    base string
    http *http.Client
}

func NewClient(base string) *Client {
    return &Client{base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) Health() string {
    req, _ := http.NewRequest("GET", c.base+"/health", nil)
    resp, err := c.http.Do(req)
    if err != nil {
        return "down"
    }
    defer resp.Body.Close()
    var out struct{ Status string `json:"status"` }
    json.NewDecoder(resp.Body).Decode(&out)
    return out.Status
}

func (c *Client) StartRun(req RunRequest) (runID, streamID string, err error) {
    body, _ := json.Marshal(req)
    httpReq, _ := http.NewRequest("POST", c.base+"/runs", bytes.NewReader(body))
    httpReq.Header.Set("Content-Type", "application/json")
    resp, err := c.http.Do(httpReq)
    if err != nil {
        return "", "", err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 202 {
        return "", "", fmt.Errorf("runtime start status %d", resp.StatusCode)
    }
    var out struct {
        RunID    string `json:"run_id"`
        StreamID string `json:"stream_id"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
        return "", "", err
    }
    return out.RunID, out.StreamID, nil
}

func (c *Client) RunReadback(runID string) (string, string, error) {
    req, _ := http.NewRequest("GET", c.base+"/runs/"+runID, nil)
    resp, err := c.http.Do(req)
    if err != nil {
        return "", "", err
    }
    defer resp.Body.Close()
    var out struct {
        State  string `json:"state"`
        Output string `json:"output"`
        Error  string `json:"error"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
        return "", "", err
    }
    return out.State, out.Output, nil
}

func (c *Client) CancelRun(runID string) error {
    req, _ := http.NewRequest("POST", c.base+"/runs/"+runID+"/cancel", nil)
    resp, err := c.http.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 400 {
        b, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("cancel failed: %s", strings.TrimSpace(string(b)))
    }
    return nil
}
```
- [ ] Step 4 — run test, expect PASS
- [ ] Step 5 — commit
```bash
git add internal/chatruntime/runtime.go internal/chatruntime/runtime_test.go
git commit -m "feat(chat-runtime): add runtime HTTP client lifecycle (kanban)"
```

## Task 4: Reasoning selection + model fallback
**Files:**
- modify `internal/kanban/chat_exec.go`
- modify `internal/kanban/chat_exec_test.go`

- [ ] Step 1 — write failing test for reasoning selection
```go
func TestSelectChatReasoning(t *testing.T) {
    cases := []struct {
        prompt   string
        supportNone bool
        supportMinimal bool
        want     string
    }{
        {"hi", true, true, "none"},
        {"explain", true, true, "minimal"},
        {"explain", false, true, "minimal"},
        {"explain", true, false, "none"},
    }
    for _, tc := range cases {
        got := selectChatReasoning(tc.prompt, tc.supportNone, tc.supportMinimal)
        if got != tc.want {
            t.Fatalf("prompt=%q none=%v minimal=%v got %q want %q", tc.prompt, tc.supportNone, tc.supportMinimal, got, tc.want)
        }
    }
}
```
- [ ] Step 2 — run test, expect FAIL
- [ ] Step 3 — implement `selectChatReasoning`
```go
func selectChatReasoning(prompt string, supportNone, supportMinimal bool) string {
    if fastChatPrompt(prompt) && supportNone {
        return "none"
    }
    if supportMinimal {
        return "minimal"
    }
    if supportNone {
        return "none"
    }
    return "minimal"
}
```
- [ ] Step 4 — run test, expect PASS
- [ ] Step 5 — commit
```bash
git add internal/kanban/chat_exec.go internal/kanban/chat_exec_test.go
git commit -m "feat(chat): add model-compatible reasoning selection (kanban)"
```

## Task 5: Runtime-backed chat run in Go
**Files:**
- modify `internal/kanban/chat.go` (session history query)
- modify `internal/kanban/chat_exec.go` (`RunChat` runtime branch)
- modify `internal/kanban/chat_exec_test.go`

- [ ] Step 1 — write failing test for `RunChat` runtime branch fallback when runtime down
```go
func TestRunChatRuntimeFallback(t *testing.T) {
    home := t.TempDir()
    t.Setenv("HERMES_HOME", home)
    s, _ := CreateChatSession("Test", "hermes", "default", "", "")
    m, _ := CreateChatMessage(s.ID, "user", "explain", "")
    run, _ := CreateChatRun(s.ID, m.ID, "hermes", "default", "", "", "explain")
    // no runtime available -> should not panic; CLI fallback path exercised separately
    UpdateChatRunState(run.ID, "loading", "", "")
    if GetChatRun(run.ID) == nil {
        t.Fatal("run missing")
    }
}
```
- [ ] Step 2 — run test, expect FAIL or incomplete
- [ ] Step 3 — add `ListChatTurns(sessionID)` returning prior user/assistant messages for history
- [ ] Step 4 — add runtime branch in `RunChat`: when runtime health is ready, build `RunRequest` with history + selected reasoning, start run, stream events into `chat_run_event`, persist final output; on runtime error or unavailable, fall back to CLI `chatCommand` path
- [ ] Step 5 — run Go tests, expect PASS
- [ ] Step 6 — commit
```bash
git add internal/kanban/chat.go internal/kanban/chat_exec.go internal/kanban/chat_exec_test.go
git commit -m "feat(chat): route local runs through persistent runtime with CLI fallback (kanban)"
```

## Task 6: Runtime service skeleton
**Files:**
- create `cmd/hermes-runtime/main.go`
- create `internal/chatruntime/service.go`
- create `internal/chatruntime/service_test.go`

- [ ] Step 1 — write failing test for service run lifecycle with fake Hermes caller
```go
func TestServiceRunLifecycle(t *testing.T) {
    svc := NewService(Config{}, func(req RunRequest) (string, error) { return "halo", nil })
    id, sid, err := svc.Start(RunRequest{RunID: "cr_1"})
    if err != nil || id != "cr_1" || sid == "" {
        t.Fatalf("start got %q %q %v", id, sid, err)
    }
    state, out, _ := svc.Readback("cr_1")
    if state != "done" || out != "halo" {
        t.Fatalf("readback %q %q", state, out)
    }
}
```
- [ ] Step 2 — run test, expect FAIL
- [ ] Step 3 — implement `Service` with in-memory run state, `Start`, `Readback`, `Cancel`, `Health`
- [ ] Step 4 — run test, expect PASS
- [ ] Step 5 — implement `cmd/hermes-runtime/main.go` binding loopback HTTP server and wiring the real Hermes CLI caller
- [ ] Step 6 — commit
```bash
git add cmd/hermes-runtime/main.go internal/chatruntime/service.go internal/chatruntime/service_test.go
git commit -m "feat(chat-runtime): add persistent runtime service skeleton (kanban)"
```

## Task 7: Frontend — consume runtime run stream cursor
**Files:**
- modify `web/src/api.ts`
- modify `web/src/features/chat/ChatPage.tsx`

- [ ] Step 1 — add typed `openChatRunStream(runID, onEvent)` using `EventSource` to `/api/chat/runs/{id}/stream`
- [ ] Step 2 — in `ChatPage`, when run active, subscribe to run stream instead of 1.5s polling when runtime events present; keep polling fallback for reconnect
- [ ] Step 3 — `pnpm -C web build`
- [ ] Step 4 — commit
```bash
git add web/src/api.ts web/src/features/chat/ChatPage.tsx
git commit -m "feat(chat): consume runtime run SSE with polling fallback (kanban)"
```

## Task 8: End-to-end verification
**Files:**
- none

- [ ] Step 1 — `go vet ./... && go test ./...`
- [ ] Step 2 — `pnpm -C web build`
- [ ] Step 3 — `go build -o bin/kanban-board ./cmd/server`
- [ ] Step 4 — start `bin/hermes-runtime` on loopback; verify `/health` returns ready
- [ ] Step 5 — restart `kanban-board`; send chat message; confirm runtime run started and events streamed
- [ ] Step 6 — send second message in same session; confirm history passed and context retained
- [ ] Step 7 — stop runtime; confirm local run falls back to CLI path without error
- [ ] Step 8 — commit verification notes if any config changed
```bash
git commit -m "chore(chat-runtime): verify persistent runtime + fallback (kanban)" --allow-empty
```
