package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"kanban-board/internal/kanban"
)

// Auth routes.
//
// Split out of main() so the login gate and its rate limiting can be read, and
// tested, as one unit. All four routes are the only unauthenticated paths in the
// server; authHandler in main.go exempts exactly this set.
func registerAuthRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/status", func(w http.ResponseWriter, r *http.Request) {
		ok, err := kanban.ValidateSession(readAuthCookie(r))
		if err != nil {
			fail(w, err, 500)
			return
		}
		mustChange := false
		if ok {
			// A generated first-run password is still valid, but the operator
			// has not chosen a real one yet, so the UI forces a rotation.
			if mustChange, err = kanban.PasswordMustChange(); err != nil {
				fail(w, err, 500)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": ok, "must_change": mustChange})
	})

	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		key := clientKey(r)
		// Checked before decoding and before hashing: an argon2id verification
		// costs ~100ms of CPU, so an unlimited endpoint is a way to burn every
		// core on the box and starve the dispatchers.
		if ok, retry := limiter.allow(key); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
			log.Printf("auth: login throttled for %s (retry in %s)", key, retry.Round(time.Second))
			fail(w, fmt.Errorf("too many failed login attempts, try again later"), http.StatusTooManyRequests)
			return
		}
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		ok, err := kanban.VerifyPassword(req.Password)
		if err != nil {
			// A malformed stored hash makes every password unverifiable. It is
			// a server fault, not a bad guess, so it must not count against the
			// client and lock out the real operator.
			fail(w, err, 500)
			return
		}
		if !ok {
			lockout := limiter.failure(key)
			log.Printf("auth: failed login for %s", key)
			if lockout > 0 {
				w.Header().Set("Retry-After", strconv.Itoa(int(lockout.Seconds())+1))
			}
			// The same message whether the account exists, the password is
			// wrong, or the client is locked out, so the response cannot be
			// used to probe for valid accounts.
			fail(w, fmt.Errorf("invalid password"), http.StatusUnauthorized)
			return
		}
		limiter.success(key)
		token, err := kanban.CreateSession()
		if err != nil {
			fail(w, err, 500)
			return
		}
		http.SetCookie(w, sessionCookie(token, r))
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
	})

	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(sessionCookieName); err == nil {
			_ = kanban.DeleteSession(c.Value)
		}
		http.SetCookie(w, clearedSessionCookie(r))
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
	})

	mux.HandleFunc("POST /api/auth/password", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Current  string `json:"current"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req); err != nil {
			fail(w, err, 400)
			return
		}
		// Wrong current passwords are brute-forceable exactly like login, so
		// they go through the same limiter.
		key := clientKey(r)
		if ok, retry := limiter.allow(key); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
			fail(w, fmt.Errorf("too many failed attempts, try again later"), http.StatusTooManyRequests)
			return
		}
		if err := kanban.ChangePassword(req.Current, req.Password); err != nil {
			if strings.Contains(err.Error(), "current password is incorrect") {
				limiter.failure(key)
				log.Printf("auth: failed password change for %s", key)
			}
			fail(w, err, 400)
			return
		}
		limiter.success(key)
		http.SetCookie(w, clearedSessionCookie(r))
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
	})
}
