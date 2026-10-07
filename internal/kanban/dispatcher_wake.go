package kanban

// dispatcherWake is the dispatcher's wake signal. A state change that
// makes a card dispatchable — a create, a comment requeue, a retry, a
// release, an approval, or an explicit start — sends here instead of
// leaving the card to wait up to 30s for the dispatcher's next poll.
var dispatcherWake = make(chan struct{}, 1)

// WakeDispatcher asks the dispatcher for a pass now. It never blocks:
// the signal is coalesced to one, so a burst of changes collapses into
// a single extra pass, which is all the dispatcher needs.
func WakeDispatcher() {
	select {
	case dispatcherWake <- struct{}{}:
	default:
	}
}

// DispatcherWake returns the wake signal a dispatch loop selects on.
func DispatcherWake() <-chan struct{} { return dispatcherWake }
