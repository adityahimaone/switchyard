package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kanban-board/internal/kanban"
)

// listenLocal binds a real loopback listener so Shutdown and Serve are
// exercised against an actual socket rather than a stub.
func listenLocal(addr string) (net.Listener, error) {
	return net.Listen("tcp", addr)
}

// TestDispatchersStopOnContextCancel proves the poll loop observes shutdown
// instead of running until the process dies. Previously a SIGTERM left the
// dispatcher claiming tasks against a server that was already draining.
func TestDispatchersStopOnContextCancel(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ctx, cancel := context.WithCancel(context.Background())
	startRemoteDispatcher(ctx)
	// Cancelling must not block or panic; the goroutine unwinds on its own
	// select. A second call would panic on a closed channel, so exactly one.
	cancel()
}

// TestDispatchersExitImmediatelyWhenAlreadyCancelled covers the start path when
// shutdown has already happened: the loop must return without doing a first
// pass over the boards.
func TestDispatchersExitImmediatelyWhenAlreadyCancelled(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	startRemoteDispatcher(ctx)
	// Give the goroutine a chance to run; if it ignored ctx it would keep
	// polling this temp home forever, which -race would flag as a leak.
	time.Sleep(50 * time.Millisecond)
}

// TestServerTimeoutsConfigured pins the timeout values. WriteTimeout must stay
// zero: the SSE endpoint holds responses open for the life of the tab, and any
// write deadline would kill every event stream on a schedule.
func TestServerTimeoutsConfigured(t *testing.T) {
	srv := newServer("127.0.0.1:0", http.NewServeMux())
	if srv.ReadHeaderTimeout <= 0 {
		t.Error("ReadHeaderTimeout must be set to bound slowloris")
	}
	if srv.ReadTimeout <= 0 {
		t.Error("ReadTimeout must be set to bound a slow request body")
	}
	if srv.IdleTimeout <= 0 {
		t.Error("IdleTimeout must be set to release keep-alive connections")
	}
	if srv.WriteTimeout != 0 {
		t.Errorf("WriteTimeout must be unset for SSE, got %v", srv.WriteTimeout)
	}
	if srv.MaxHeaderBytes <= 0 {
		t.Error("MaxHeaderBytes must be bounded")
	}
}

// TestGracefulShutdownDrainsInFlightRequests proves Shutdown lets an in-flight
// request finish rather than dropping it. This is what protects an approve
// that is mid-commit when a deploy sends SIGTERM.
func TestGracefulShutdownDrainsInFlightRequests(t *testing.T) {
	release := make(chan struct{})
	handlerDone := make(chan struct{})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /slow", func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.Write([]byte("done"))
		close(handlerDone)
	})
	srv := newServer("127.0.0.1:0", mux)
	ln, err := listenLocal(srv.Addr)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()

	respCh := make(chan error, 1)
	go func() {
		resp, err := http.Get("http://" + ln.Addr().String() + "/slow")
		if err == nil {
			resp.Body.Close()
		}
		respCh <- err
	}()

	// Let the handler reach its blocking point, then let it complete.
	time.Sleep(150 * time.Millisecond)
	close(release)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown: %v", err)
	}
	if err := <-respCh; err != nil {
		t.Fatalf("in-flight request was cut off by Shutdown: %v", err)
	}
	select {
	case <-handlerDone:
	default:
		t.Fatal("handler did not return before Shutdown completed")
	}
	if err := <-serveErr; err != nil && err != http.ErrServerClosed {
		t.Fatalf("Serve returned %v, want nil or ErrServerClosed", err)
	}
}

// TestShutdownTimesOutOnWedgedRequest proves a handler that never returns
// cannot block process exit forever. The deadline is what guarantees systemd
// eventually sees the process go away instead of escalating to SIGKILL.
func TestShutdownTimesOutOnWedgedRequest(t *testing.T) {
	block := make(chan struct{})
	defer close(block)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /wedged", func(w http.ResponseWriter, r *http.Request) { <-block })
	srv := newServer("127.0.0.1:0", mux)
	ln, err := listenLocal(srv.Addr)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = srv.Serve(ln) }()
	go func() {
		if resp, err := http.Get("http://" + ln.Addr().String() + "/wedged"); err == nil {
			resp.Body.Close()
		}
	}()
	time.Sleep(150 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := srv.Shutdown(ctx); err == nil {
		t.Fatal("Shutdown should return the context error for a wedged request")
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Fatalf("Shutdown blocked for %v, long past its deadline", elapsed)
	}
}

// TestAuthHandlerPassesThroughPublicRoutes keeps the handler reachable through
// the new server constructor: public routes open, protected routes 401.
func TestAuthHandlerPassesThroughPublicRoutes(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := kanban.EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /api/boards", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := authHandler(mux)

	for _, tc := range []struct {
		path string
		want int
	}{
		{"/api/auth/status", http.StatusOK},
		{"/api/boards", http.StatusUnauthorized},
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
		if w.Code != tc.want {
			t.Errorf("%s got %d want %d", tc.path, w.Code, tc.want)
		}
	}
}
