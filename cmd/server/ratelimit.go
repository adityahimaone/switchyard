package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Login rate limiting.
//
// The password gate is the only thing between an unauthenticated request and the
// ability to make a worker machine run shell commands, so an attacker is
// assumed to try passwords in a loop. Two limits apply together:
//
//   - per client IP, so one host cannot grind through a wordlist;
//   - global, so a botnet (or a single host behind many source addresses)
//     cannot grind through it either.
//
// A limit rejects the attempt before the password is hashed. That matters: with
// argon2id each wrong guess costs ~100ms of CPU, so an unlimited endpoint is a
// cheap way to pin every core on the box and starve the dispatchers.
type loginLimiter struct {
	mu sync.Mutex
	// failures counts consecutive failures per client key.
	failures map[string]*failureRecord
	// global counts consecutive failures across all clients.
	global failureRecord

	// threshold is the number of consecutive failures tolerated before a
	// client is locked out.
	threshold int
	// baseBackoff doubles per additional failure past the threshold.
	baseBackoff time.Duration
	// maxBackoff caps the lockout so a burst cannot lock out a real operator
	// for hours.
	maxBackoff time.Duration
	// entryTTL bounds memory: a client that stops attacking is forgotten.
	entryTTL time.Duration

	// now is injectable so tests do not have to sleep.
	now func() time.Time
}

type failureRecord struct {
	count       int
	lockedUntil time.Time
	lastSeen    time.Time
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{
		failures:    map[string]*failureRecord{},
		threshold:   5,
		baseBackoff: 2 * time.Second,
		maxBackoff:  15 * time.Minute,
		entryTTL:    1 * time.Hour,
		now:         time.Now,
	}
}

// clientKey identifies the source of a login attempt.
//
// RemoteAddr is preferred, but behind a reverse proxy every request arrives
// from the proxy, which would collapse all clients into one bucket. The
// forwarded address is therefore preferred when present, and only trusted
// because this server is expected to sit behind a proxy it controls.
func clientKey(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Left-most entry is the original client.
		if first, _, ok := strings.Cut(xff, ","); ok {
			if ip := strings.TrimSpace(first); ip != "" {
				return ip
			}
		} else if ip := strings.TrimSpace(xff); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// Retry-After seconds for a 429, or 0 when the client is not limited.
func (l *loginLimiter) retryAfter(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)

	var wait time.Duration
	if rec, ok := l.failures[key]; ok {
		wait = remaining(now, rec.lockedUntil)
	}
	if g := remaining(now, l.global.lockedUntil); g > wait {
		wait = g
	}
	return wait
}

// allow reports whether an attempt may proceed, and how long to tell the client
// to wait if not.
func (l *loginLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweep(now)

	if rec, ok := l.failures[key]; ok {
		if d := remaining(now, rec.lockedUntil); d > 0 {
			return false, d
		}
	}
	if d := remaining(now, l.global.lockedUntil); d > 0 {
		return false, d
	}
	return true, 0
}

// failure records a rejected attempt and returns the resulting lockout, if any.
func (l *loginLimiter) failure(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()

	rec, ok := l.failures[key]
	if !ok {
		rec = &failureRecord{}
		l.failures[key] = rec
	}
	rec.count++
	rec.lastSeen = now
	l.global.count++
	l.global.lastSeen = now

	// The global counter never locks out a legitimate operator for long: it
	// exists to slow a distributed attack, not to deny service.
	if l.global.count >= l.threshold*4 {
		l.global.lockedUntil = now.Add(l.backoff(0))
	}

	if rec.count < l.threshold {
		return 0
	}
	// First lockout is the base, then doubling per extra failure.
	d := l.backoff(rec.count - l.threshold)
	rec.lockedUntil = now.Add(d)
	return d
}

// success clears the counters for a client, so a user who mistypes twice and
// then signs in correctly is not left near the threshold.
func (l *loginLimiter) success(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}

// backoff returns the lockout for n extra failures past the threshold.
func (l *loginLimiter) backoff(n int) time.Duration {
	d := l.baseBackoff
	for i := 0; i < n && d < l.maxBackoff; i++ {
		d *= 2
	}
	if d > l.maxBackoff {
		d = l.maxBackoff
	}
	return d
}

// sweep drops entries that are neither locked nor recent, and resets the global
// counter once it has been quiet long enough. Called with the lock held.
func (l *loginLimiter) sweep(now time.Time) {
	for k, rec := range l.failures {
		if now.After(rec.lockedUntil) && now.Sub(rec.lastSeen) > l.entryTTL {
			delete(l.failures, k)
		}
	}
	if l.global.count > 0 && now.Sub(l.global.lastSeen) > l.entryTTL {
		l.global = failureRecord{}
	}
}

func remaining(now, until time.Time) time.Duration {
	if now.Before(until) {
		return until.Sub(now)
	}
	return 0
}
