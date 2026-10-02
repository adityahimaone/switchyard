package main

import (
	"context"
	"strings"
	"sync"
)

// Run tracking for in-flight dispatches.
//
// This used to live beside the retired SSH dispatcher, but the stop endpoint
// still depends on it: a node-agent dispatch is only cancellable through the
// worker, so the control plane keeps its own registry to answer "is this task
// still running, and has the user asked it to stop?".
var activeRuns = struct {
	sync.Mutex
	cancels map[string]context.CancelFunc
	stopped map[string]bool
}{cancels: map[string]context.CancelFunc{}, stopped: map[string]bool{}}

// beginTaskRun registers a cancellable run for a task and returns its context
// plus a cleanup to call when the run ends.
func beginTaskRun(taskID string) (context.Context, func()) {
	ctx, cancel := context.WithCancel(context.Background())
	activeRuns.Lock()
	activeRuns.cancels[taskID] = cancel
	// A stop that arrived between the request and this registration must still
	// take effect, otherwise the run would ignore it and run to completion.
	if activeRuns.stopped[taskID] {
		cancel()
	}
	activeRuns.Unlock()
	return ctx, func() {
		activeRuns.Lock()
		delete(activeRuns.cancels, taskID)
		delete(activeRuns.stopped, taskID)
		activeRuns.Unlock()
	}
}

// requestTaskStop marks a task as stopping and cancels its run if one is
// registered. It reports whether a cancellable run was found.
func requestTaskStop(taskID string) bool {
	activeRuns.Lock()
	defer activeRuns.Unlock()
	activeRuns.stopped[taskID] = true
	cancel := activeRuns.cancels[taskID]
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

// taskStopRequested reports whether the user asked for this task to stop.
func taskStopRequested(taskID string) bool {
	activeRuns.Lock()
	defer activeRuns.Unlock()
	return activeRuns.stopped[taskID]
}

// truncate shortens s to max characters, appending an ellipsis when it cuts.
// Output shown in the UI is capped so a runaway agent log cannot bloat a card.
func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max] + "..."
	}
	return s
}
