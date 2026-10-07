package kanban

import "testing"

// TestWakeDispatcherCoalesces proves the wake signal never blocks
// the caller and collapses a burst into a single pass: the channel
// holds one signal, so a hundred wakes trigger one extra poll,
// not a hundred.
func TestWakeDispatcherCoalesces(t *testing.T) {
	// Drain anything left by an earlier test (StartTaskNow wakes).
	select {
	case <-DispatcherWake():
	default:
	}

	for i := 0; i < 64; i++ {
		WakeDispatcher()
	}
	// The channel is full; this send must be dropped, not block.
	WakeDispatcher()

	select {
	case <-DispatcherWake():
	default:
		t.Fatal("a wake was not delivered")
	}
	select {
	case <-DispatcherWake():
		t.Fatal("wakes accumulated; they must coalesce to one")
	default:
	}
}
