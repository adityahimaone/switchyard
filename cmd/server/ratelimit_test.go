package main

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestLoginLimiterAllowsUntilThreshold(t *testing.T) {
	l := newLoginLimiter()
	// The first attempts are tolerated: a user who mistypes twice must not be
	// locked out.
	for i := 1; i < l.threshold; i++ {
		if d := l.failure("1.2.3.4"); d != 0 {
			t.Fatalf("failure %d of %d returned a lockout of %s", i, l.threshold-1, d)
		}
		if ok, _ := l.allow("1.2.3.4"); !ok {
			t.Fatalf("locked out at failure %d, threshold is %d", i, l.threshold)
		}
	}
}

func TestLoginLimiterLocksOutAtThreshold(t *testing.T) {
	l := newLoginLimiter()
	for i := 0; i < l.threshold; i++ {
		l.failure("1.2.3.4")
	}
	ok, retry := l.allow("1.2.3.4")
	if ok {
		t.Fatal("client should be locked out at the threshold")
	}
	if retry <= 0 {
		t.Fatal("a lockout must report a retry delay")
	}
}

// TestLoginLimiterBackoffGrows proves the delay increases with sustained
// attack, so a wordlist run slows to a crawl rather than a fixed trickle.
func TestLoginLimiterBackoffGrows(t *testing.T) {
	l := newLoginLimiter()
	first := l.failure("1.2.3.4")
	for i := 0; i < l.threshold-1; i++ {
		l.failure("1.2.3.4")
	}
	firstLock := l.failure("1.2.3.4")
	if first != 0 {
		t.Fatalf("pre-threshold failure should not lock, got %s", first)
	}
	// Each extra failure past the threshold doubles the delay.
	if secondLock := l.failure("1.2.3.4"); secondLock <= firstLock {
		t.Fatalf("backoff did not grow: %s then %s", firstLock, secondLock)
	}
	if capped := l.backoff(100); capped > l.maxBackoff {
		t.Fatalf("backoff %s exceeds cap %s", capped, l.maxBackoff)
	}
}

func TestLoginLimiterBackoffCapsAtMax(t *testing.T) {
	l := newLoginLimiter()
	// Far past anything reachable, to prove the cap holds.
	if got := l.backoff(60); got != l.maxBackoff {
		t.Fatalf("backoff = %s, want the cap %s", got, l.maxBackoff)
	}
}

func TestLoginLimiterPerClientIsolation(t *testing.T) {
	l := newLoginLimiter()
	for i := 0; i < l.threshold+2; i++ {
		l.failure("attacker")
	}
	if ok, _ := l.allow("attacker"); ok {
		t.Fatal("attacker should be locked out")
	}
	// The real operator, from a different address, is unaffected. Locking out
	// everyone on a global counter would be a denial-of-service against the
	// only user of this server.
	if ok, _ := l.allow("operator"); !ok {
		t.Fatal("a legitimate client was locked out by someone else's failures")
	}
}

func TestLoginLimiterSuccessClearsCounters(t *testing.T) {
	l := newLoginLimiter()
	for i := 0; i < l.threshold-1; i++ {
		l.failure("1.2.3.4")
	}
	// Signing in correctly resets the streak.
	l.success("1.2.3.4")
	// A fresh run of failures must again be tolerated for the full threshold.
	for i := 0; i < l.threshold-1; i++ {
		if ok, _ := l.allow("1.2.3.4"); !ok {
			t.Fatalf("locked out at failure %d after a successful login", i+1)
		}
		l.failure("1.2.3.4")
	}
}

func TestLoginLimiterLockoutExpires(t *testing.T) {
	l := newLoginLimiter()
	now := time.Now()
	l.now = func() time.Time { return now }
	for i := 0; i < l.threshold; i++ {
		l.failure("1.2.3.4")
	}
	if ok, _ := l.allow("1.2.3.4"); ok {
		t.Fatal("should be locked out")
	}
	// After the backoff elapses, the client may try again.
	now = now.Add(l.maxBackoff + time.Second)
	if ok, retry := l.allow("1.2.3.4"); !ok {
		t.Fatalf("still locked out after the backoff elapsed (retry %s)", retry)
	}
}

func TestLoginLimiterSweepBoundsMemory(t *testing.T) {
	l := newLoginLimiter()
	now := time.Now()
	l.now = func() time.Time { return now }
	for i := 0; i < 500; i++ {
		l.failure(string(rune('a'+i%26)) + "-" + time.Duration(i).String())
	}
	if len(l.failures) < 400 {
		t.Fatalf("expected many tracked clients, got %d", len(l.failures))
	}
	// After the TTL with no activity, the map is emptied rather than growing
	// without bound, which is what an unbounded map keyed by client IP is.
	now = now.Add(l.entryTTL + time.Hour)
	l.mu.Lock()
	before := len(l.failures)
	l.sweep(now)
	after := len(l.failures)
	l.mu.Unlock()
	if after != 0 {
		t.Fatalf("sweep left %d stale entries (had %d)", after, before)
	}
}

// TestLoginLimiterGlobalBackstop proves a distributed attack across many source
// addresses is slowed even though no single address crosses the threshold.
func TestLoginLimiterGlobalBackstop(t *testing.T) {
	l := newLoginLimiter()
	globalTrigger := l.threshold * 4
	for i := 0; i < globalTrigger; i++ {
		l.failure("bot-" + time.Duration(i).String())
	}
	// A brand new address is now also held back.
	if ok, _ := l.allow("fresh-victim"); ok {
		t.Fatal("global backstop did not engage after many distinct sources")
	}
}

func TestClientKeyPrefersForwardedFor(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	// Behind a proxy every request arrives from the proxy, so RemoteAddr alone
	// would put every client in one bucket.
	r.Header.Set("X-Forwarded-For", "203.0.113.7, 70.41.3.18, 150.172.238.178")
	if got := clientKey(r); got != "203.0.113.7" {
		t.Fatalf("clientKey = %q, want the left-most forwarded address", got)
	}
}

func TestClientKeyFallsBackToRemoteAddr(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "192.0.2.55:4321"
	if got := clientKey(r); got != "192.0.2.55" {
		t.Fatalf("clientKey = %q, want 192.0.2.55", got)
	}
	// A single-entry XFF without a comma is still honoured.
	r.Header.Set("X-Forwarded-For", "198.51.100.9")
	if got := clientKey(r); got != "198.51.100.9" {
		t.Fatalf("clientKey = %q, want 198.51.100.9", got)
	}
}

func TestClientKeyHandlesMalformedRemoteAddr(t *testing.T) {
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "not-an-addr"
	if got := clientKey(r); got != "not-an-addr" {
		t.Fatalf("clientKey = %q, want the raw RemoteAddr", got)
	}
}
