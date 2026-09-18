# Chat Live Activity Context — Implementation Plan

> **For AI agent workers:** required subskills: use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Surface ChatRun lifecycle state and ChatRunEvent activity inside each assistant response, live via authenticated SSE.

**Architecture:** Backend broadcasts chat run lifecycle events on the existing event hub and `/api/events/stream`. Frontend subscribes once, filters by session/run ownership, feeds React Query cache, and renders a collapsible activity panel below each response. Queries remain source of truth after reconnect.

**Tech stack:** Go stdlib net/http server, React 19 + TanStack Query, Vite. Existing patterns only.

---

### Task 1: Backend lifecycle event envelope

**Files:**
- Create: `internal/kanban/chat_activity_test.go`
- Create: `internal/kanban/chat_activity.go`

- [ ] **Step 1: Write failing test**

```go
package kanban

import "testing"

func TestChatLifecycleEnvelope(t *testing.T) {
	ev := ChatLifecycleEvent{
		SessionID: "cs_1",
		RunID:     "r_1",
		MessageID: "m_1",
		State:     "running",
	}
	s := SSEEnvelope("chat_run_state", ev)
	if s == "" {
		t.Fatal("empty envelope")
	}
}
```

- [ ] **Step 2: Run test, expect failure**

Run: `go test ./internal/kanban -run TestChatLifecycleEnvelope`
Expect: compile failure, `ChatLifecycleEvent` undefined.

- [ ] **Step 3: Write minimal type**

```go
package kanban

type ChatLifecycleEvent struct {
	SessionID string `json:"session_id"`
	RunID     string `json:"run_id"`
	MessageID string `json:"message_id"`
	State     string `json:"state"`
}

func BroadcastChatLifecycle(ev ChatLifecycleEvent) {
	BroadcastEvent("chat_run_state", ev)
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `go test ./internal/kanban -run TestChatLifecycleEnvelope`
Expect: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/kanban/chat_activity.go internal/kanban/chat_activity_test.go
git commit -m "feat(chat): lifecycle event envelope"
```

### Task 2: Wire lifecycle broadcasts at run transitions

**Files:**
- Create: `internal/kanban/chat_activity_test.go`
- Modify: `internal/kanban/chat_exec.go`

- [ ] **Step 1: Write failing test asserting broadcast marker**

Append to `chat_activity_test.go`:

```go
func TestBroadcastChatLifecycleCallsHub(t *testing.T) {
	ch := Hub.Subscribe()
	defer Hub.Unsubscribe(ch)
	BroadcastChatLifecycle(ChatLifecycleEvent{SessionID: "cs_1", RunID: "r_1", MessageID: "m_1", State: "running"})
	select {
	case ev := <-ch:
		if ev.Kind != "chat_run_state" {
			t.Fatalf("kind=%s", ev.Kind)
		}
	default:
		t.Fatal("no event")
	}
}
```

- [ ] **Step 2: Run, expect pass**

Run: `go test ./internal/kanban -run TestBroadcastChatLifecycleCallsHub`
Expect: PASS (BroadcastEvent already works).

- [ ] **Step 3: Locate run transition points in `chat_exec.go`**

Search: `func runChatAgent`, state assignments. Confirm broadcast call sites:
- loading → running
- running → completed
- running → error/cancelled

- [ ] **Step 4: Add broadcasts at each transition**

At loading transition and each terminal transition, after state write, call:

```go
BroadcastChatLifecycle(ChatLifecycleEvent{
	SessionID: run.SessionID,
	RunID:     run.ID,
	MessageID: run.MessageID,
	State:     run.State,
})
```

- [ ] **Step 5: Run full Go tests**

Run: `go test ./...`
Expect: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/kanban/chat_exec.go internal/kanban/chat_activity_test.go
git commit -m "feat(chat): broadcast run lifecycle transitions"
```

### Task 3: Frontend live event subscription hook

**Files:**
- Create: `web/src/features/chat/useChatRunLifecycle.ts`
- Create: `web/src/features/chat/useChatRunLifecycle.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest"

describe("useChatRunLifecycle", () => {
  it("filters events by session", () => {
    const owned = isOwnRunEvent("cs_1", { session_id: "cs_1", run_id: "r_1", message_id: "m_1", state: "running" })
    expect(owned).toBe(true)
    const foreign = isOwnRunEvent("cs_2", { session_id: "cs_1", run_id: "r_1", message_id: "m_1", state: "running" })
    expect(foreign).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd web && npx vitest run src/features/chat/useChatRunLifecycle.test.ts`
Expect: FAIL, `isOwnRunEvent` not exported.

- [ ] **Step 3: Write hook**

```ts
export type ChatLifecyclePayload = {
  session_id: string
  run_id: string
  message_id: string
  state: string
}

export function isOwnRunEvent(sessionID: string, ev: ChatLifecyclePayload): boolean {
  return ev.session_id === sessionID
}

export function useChatRunLifecycle(sessionID: string | undefined, onEvent: (ev: ChatLifecyclePayload) => void): { connected: boolean } {
  // Effect subscribes to /api/events/stream with auth cookie, parses each SSE data line,
  // calls onEvent only when isOwnRunEvent(sessionID, payload) is true,
  // returns connected=true once `: connected` frame seen.
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd web && npx vitest run src/features/chat/useChatRunLifecycle.test.ts`
Expect: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/chat/useChatRunLifecycle.ts web/src/features/chat/useChatRunLifecycle.test.ts
git commit -m "feat(chat): live run lifecycle subscription"
```

### Task 4: Collapsible activity panel

**Files:**
- Create: `web/src/features/chat/ActivityPanel.tsx`
- Create: `web/src/features/chat/ActivityPanel.test.tsx`

- [ ] **Step 1: Write failing UI test**

```tsx
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ActivityPanel } from "./ActivityPanel"

describe("ActivityPanel", () => {
  it("opens while running", () => {
    const { getByText } = render(<ActivityPanel state="running" elapsed="0.5s" phase="Step 1" count={1} />)
    expect(getByText("Step 1")).toBeTruthy()
  })
  it("closes on completed unless user opened", () => {
    const { queryByText } = render(<ActivityPanel state="completed" elapsed="2.0s" phase="Done" count={2} />)
    expect(queryByText("Done")).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd web && npx vitest run src/features/chat/ActivityPanel.test.tsx`
Expect: FAIL, component missing.

- [ ] **Step 3: Write component**

```tsx
export function ActivityPanel({ state, elapsed, phase, count, userOpen }: { state: string; elapsed: string; phase: string; count: number; userOpen?: boolean }) {
  const active = state === "loading" || state === "running"
  const open = userOpen || active
  return open ? <div className="chat-activity-panel" data-state={state}><span>{state}</span><span>{elapsed}</span><span>{phase}</span><span>{count}</span></div> : null
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd web && npx vitest run src/features/chat/ActivityPanel.test.tsx`
Expect: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/chat/ActivityPanel.tsx web/src/features/chat/ActivityPanel.test.tsx
git commit -m "feat(chat): collapsible activity panel"
```

### Task 5: Integrate into ChatPage response footer

**Files:**
- Modify: `web/src/features/chat/ChatPage.tsx`

- [ ] **Step 1: Find response render region**

Search `MessageFooter`, `AgentTaskPlan` usage in ChatPage. Confirm where run and events enter render.

- [ ] **Step 2: Add live subscription + panel wiring**

- Call `useChatRunLifecycle(sessionID, handler)` once.
- Handler updates `selectedRun` state and invalidates `chat-run-events` query.
- Render `<ActivityPanel state={run?.state} elapsed={elapsed} phase={currentPhase} count={events.data?.length ?? 0} />` below assistant content, above footer.

- [ ] **Step 3: Run frontend tests**

Run: `cd web && npx vitest run src/features/chat/`
Expect: PASS.

- [ ] **Step 4: Run full verification**

Run: `cd web && npx tsc --noEmit && npx vitest run src/features/chat/`
Expect: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/features/chat/ChatPage.tsx
git commit -m "feat(chat): integrate live activity panel"
```

### Task 6: Live authenticated SSE smoke

**Files:**
- None (verification only)

- [ ] **Step 1: Run server, login, subscribe, trigger run**

Run: `go build -o /tmp/kbs ./cmd/server && HERMES_HOME=/tmp/kb-home KANBAN_ADDR=127.0.0.1:18793 KANBAN_WEB_DIST=web/dist /tmp/kbs`
Then login, subscribe to `/api/events/stream`, create a chat run, confirm `chat_run_state` event frame.

- [ ] **Step 2: Record confirmation**

Record: stream received `event: chat_run_state`, `: connected` visible, session/run/message ids match.

- [ ] **Step 3: Full gate**

Run: `gofmt -l . && go test ./... && go vet ./... && go build -o /tmp/kbs ./cmd/server && cd web && npx tsc --noEmit && npx vitest run && npx vite build && git diff --check`
Expect: all pass.
