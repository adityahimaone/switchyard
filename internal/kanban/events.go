package kanban

import (
	"encoding/json"
	"sync"
	"time"
)

// EventHub broadcasts small task/workspace events to SSE subscribers.
// No replay: clients reconnect and refetch; the DB is the source of truth.

type SSEEvent struct {
	Kind string
	Data any
}

type EventHub struct {
	mu   sync.Mutex
	subs map[chan SSEEvent]struct{}
}

var Hub = &EventHub{subs: make(map[chan SSEEvent]struct{})}

func BroadcastEvent(kind string, data any) {
	if payload, ok := data.(map[string]any); ok {
		switch kind {
		case "task_failed", "task_stuck", "review_requested", "approval_required", "cron_completed", "cron_failed":
			_ = RecordNotification(kind, payload)
		}
	}
	broadcastEvent(kind, data)
}

func broadcastEvent(kind string, data any) {
	Hub.mu.Lock()
	defer Hub.mu.Unlock()
	ev := SSEEvent{Kind: kind, Data: data}
	for ch := range Hub.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (h *EventHub) Subscribe() chan SSEEvent {
	ch := make(chan SSEEvent, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *EventHub) Unsubscribe(ch chan SSEEvent) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
	close(ch)
}

func SSEEnvelope(kind string, data any) string {
	raw, _ := json.Marshal(map[string]any{"kind": kind, "data": data, "at": time.Now().Unix()})
	return string(raw)
}
