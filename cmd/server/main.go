package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"kanban-board/internal/kanban"
)

var version = "v0.2.0"

const sessionCookieName = "kanban_session"

// limiter throttles login attempts. Process-scoped and in-memory, which is
// correct for the single-instance deployment this server targets; a multi-node
// deployment would need shared state.
var limiter = newLoginLimiter()

// sessionCookie builds the session cookie for a request.
//
// Secure is set whenever the connection is HTTPS, including when a reverse
// proxy terminated TLS and forwarded the scheme. It is omitted for plain HTTP
// so a LAN visit still works; a Secure cookie sent over http:// is silently
// dropped by the browser, which would look like a random logout.
func sessionCookie(token string, r *http.Request) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   14 * 24 * 60 * 60,
	}
}

// clearedSessionCookie expires the session cookie. The attributes must match
// those of the cookie being cleared or the browser keeps the original.
func clearedSessionCookie(r *http.Request) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   requestIsHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func fail(w http.ResponseWriter, err error, code int) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

// ecosystemStatus maps a registry error to an HTTP status. Validation failures
// stay 400; filesystem failures report their real class so the client can tell
// "your input was wrong" from "the server is broken".
func ecosystemStatus(err error) int {
	if kanban.IsValidationError(err) {
		return http.StatusBadRequest
	}
	switch {
	case errors.Is(err, os.ErrNotExist), errors.Is(err, fs.ErrNotExist):
		return http.StatusNotFound
	case errors.Is(err, os.ErrPermission), errors.Is(err, fs.ErrPermission):
		return http.StatusForbidden
	case errors.Is(err, syscall.ENOSPC), errors.Is(err, syscall.EROFS):
		return http.StatusInsufficientStorage
	default:
		return http.StatusInternalServerError
	}
}

func main() {
	if len(os.Args) == 2 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Println(version)
		return
	}
	addr := envOr("KANBAN_ADDR", "127.0.0.1:8790")
	dist := envOr("KANBAN_WEB_DIST", "web/dist")
	if err := ensureAdminCredential(); err != nil {
		log.Fatal(err)
	}
	// Verify the boards still match the schema this binary was written against.
	// Hermes owns these tables and does not version them, so a renamed or
	// dropped column would otherwise surface as a runtime 500 on whichever
	// screen happened to touch it. Reported, not fatal: one bad board must not
	// take the healthy ones down with it.
	if reports, err := kanban.CheckAllBoardSchemas(); err != nil {
		log.Printf("schema-check: could not verify boards: %v", err)
	} else {
		for _, r := range reports {
			if !r.OK() {
				log.Printf("schema-check: board %s is INCOMPATIBLE: %s", r.Board, r)
			}
		}
	}

	// Rewrite any card left on the retired SSH transport before the review gate
	// stops accepting it. A card parked in `review` can only leave via approve,
	// so leaving it on 'ssh' would strand it there permanently.
	if n, err := kanban.MigrateRetiredTransport(kanban.TransportForExistingPath); err != nil {
		log.Printf("transport-migration: incomplete: %v", err)
	} else if n > 0 {
		log.Printf("transport-migration: migrated %d task(s) to node-agent", n)
	}

	mux := http.NewServeMux()
	registerAuthRoutes(mux)
	registerBoardsRoutes(mux)
	registerProfilesRoutes(mux)
	registerWorkspaceIdentityRoutes(mux)
	registerSettingsRoutes(mux)
	registerRuntimeRoutes(mux)
	registerOverviewRoutes(mux)
	registerCronRoutes(mux)
	registerKnowledgeRoutes(mux)
	registerEcosystemRoutes(mux)
	registerChatRoutes(mux)
	registerWorkspaceFileRoutes(mux)
	registerAttachmentRoutes(mux)

	// The SPA catch-all is registered last: ServeMux matches the most specific
	// pattern, but a "/" registered before the API routes would still be
	// shadowed by them only if they were more specific — which they are. Order
	// here documents that the API surface is complete before the shell is
	// mounted.
	mux.Handle("/", spa(dist))

	// Reclaim worktrees belonging to tasks that finished long ago. This runs at
	// startup rather than on a timer because the worktrees live on workers, not
	// here: a sweep is cheap, and a task that has been done for days should not
	// keep a checkout alive.
	kanban.SweepAllBoardWorktrees(time.Now())

	kanban.StartFlowSync()
	// dispatcherCtx is cancelled on shutdown so no poll loop claims a new task
	// against a server that is already draining.
	dispatcherCtx, stopDispatchers := context.WithCancel(context.Background())
	defer stopDispatchers()
	// The single dispatcher. The former SSH lane was retired: its tasks were
	// migrated to node-agent at startup and its executor was already routing
	// through node-agent anyway, so it was a second code path over one transport.
	startRemoteDispatcher(dispatcherCtx)
	// Expired sessions are only reclaimed on a timer: ValidateSession deletes a
	// row solely when that exact token is presented again, which never happens
	// for a token the user has discarded.
	kanban.StartSessionJanitor(dispatcherCtx, 1*time.Hour)
	log.Printf("kanban-board listening on %s (dist=%s)", addr, dist)

	srv := newServer(addr, securityHeaders(sameOriginGuard(authHandler(mux))))

	signalCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	serveErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		log.Fatalf("kanban-board: listen failed: %v", err)
	case <-signalCtx.Done():
		// Stop claiming work first: a task picked up during a drain would be
		// left running with no dispatcher to record its result.
		stopSignals()
		stopDispatchers()
		log.Println("kanban-board: shutting down")
		// Drain in-flight requests so an approve is not cut off mid-commit. The
		// deadline bounds the wait: a wedged long request must not block exit.
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("kanban-board: shutdown: %v", err)
		}
		log.Println("kanban-board: stopped")
	}
}

// ensureAdminCredential creates the admin credential on first run.
//
// Precedence: SWITCHYARD_ADMIN_PASSWORD wins, then SWITCHYARD_DEV=1 seeds the
// known dev password, otherwise a random password is generated and logged once.
// SWITCHYARD_ADMIN_PASSWORD_REQUIRED=1 turns a missing password into a hard
// startup failure for deployments that would rather not have a password in the
// logs at all.
func ensureAdminCredential() error {
	if err := kanban.EnsureAuthSeed(); err != nil {
		return err
	}
	if os.Getenv("SWITCHYARD_ADMIN_PASSWORD_REQUIRED") != "1" {
		return nil
	}
	// Only meaningful on a database that was just seeded: an existing credential
	// is left alone, so turning this on later cannot lock the operator out.
	must, err := kanban.PasswordMustChange()
	if err != nil {
		return err
	}
	if must {
		return errors.New("SWITCHYARD_ADMIN_PASSWORD is required on first run: set it, or unset SWITCHYARD_ADMIN_PASSWORD_REQUIRED to accept a generated password")
	}
	return nil
}

// newServer builds the HTTP server with the hardening the audit asked for.
//
// ReadHeaderTimeout and IdleTimeout bound how long a connection can occupy a
// slot without transferring anything, which is what makes slowloris
// uneconomic. WriteTimeout is deliberately left unset: the SSE endpoint holds a
// response open for the life of the tab, and a write deadline would sever every
// live event stream on a fixed schedule rather than on real inactivity.
func newServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
}

func profileQuery(r *http.Request) string {
	// No ?profile= means the caller wants the app default, so it resolves to the
	// active profile. MCP/extension config for "whatever is active" is what an
	// operator expects when they never pass one.
	return kanban.DefaultProfile(r.URL.Query().Get("profile"))
}

func authHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api/auth/status" || r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/logout" || r.URL.Path == "/api/auth/password" {
			next.ServeHTTP(w, r)
			return
		}
		ok, err := kanban.ValidateSession(readAuthCookie(r))
		if err != nil {
			fail(w, err, http.StatusInternalServerError)
			return
		}
		if !ok {
			fail(w, fmt.Errorf("authentication required"), http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func readAuthCookie(r *http.Request) string {
	c, err := r.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// spa serves the built frontend with index.html fallback for client routes.
func spa(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		cleaned := filepath.Clean(r.URL.Path)
		rel := strings.TrimPrefix(cleaned, "/")
		p := filepath.Join(dir, rel)
		if st, err := os.Stat(p); err == nil {
			if !st.IsDir() {
				setStaticCacheHeaders(w, r)
				fs.ServeHTTP(w, r)
				return
			}
			idx := filepath.Join(p, "index.html")
			if _, err := os.Stat(idx); err == nil {
				setStaticCacheHeaders(w, r)
				http.ServeFile(w, r, idx)
				return
			}
		}
		// Hashed build output that no longer exists must 404, never fall back to
		// the HTML shell. A 200 with an HTML body is cached as immutable by the
		// service worker under the .js URL, so the chunk fails to parse forever
		// and no later deploy can recover it.
		if isAssetPath(urlPath(r)) {
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		setStaticCacheHeaders(w, r)
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}

// urlPath returns r.URL.Path with forward slashes on every platform.
// filepath.Clean rewrites to backslashes on Windows, which would make
// isAssetPath miss "/assets/" and silently disable the deleted-chunk 404.
func urlPath(r *http.Request) string {
	return strings.ReplaceAll(r.URL.Path, "\\", "/")
}

// isAssetPath reports whether a path is content-hashed build output, which must
// never be answered with the SPA shell.
func isAssetPath(path string) bool {
	return strings.HasPrefix(path, "/assets/") ||
		strings.HasSuffix(path, ".js") ||
		strings.HasSuffix(path, ".mjs") ||
		strings.HasSuffix(path, ".css")
}

// setStaticCacheHeaders keeps the HTML shell revalidated so a redeploy cannot
// leave a browser holding an index.html that references deleted asset hashes.
// Hashed build output is immutable and cached hard; everything else is
// revalidated on each visit.
func setStaticCacheHeaders(w http.ResponseWriter, r *http.Request) {
	p := urlPath(r)
	if p == "/index.html" || !strings.HasPrefix(p, "/assets/") {
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
}
