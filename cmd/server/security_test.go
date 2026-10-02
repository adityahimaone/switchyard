package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRequestIsHTTPS(t *testing.T) {
	// Every case below models the real deployment: the browser speaks HTTPS to
	// a proxy, and the proxy re-requests this server over plain HTTP on
	// loopback. That is why the forwarded header is consulted at all, and why
	// the targets are http:// rather than https://.
	//
	// Note httptest.NewRequest synthesises a non-nil r.TLS for an https://
	// target, which short-circuits the forwarded-header path and makes such a
	// case assert nothing. r.TLS is therefore nil throughout, and the setup
	// asserts that so the test cannot silently stop testing what it claims.
	cases := []struct {
		name    string
		target  string
		headers map[string]string
		want    bool
	}{
		{"plain http, no proxy", "http://example.com/", nil, false},
		{"proxy forwarded https", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "https"}, true},
		{"proxy forwarded http", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "http"}, false},
		{"forwarded chain uses first", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "https, http"}, true},
		{"forwarded chain first is http", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "http, https"}, false},
		{"forwarded uppercase", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "HTTPS"}, true},
		{"forwarded with whitespace", "http://example.com/",
			map[string]string{"X-Forwarded-Proto": "  https  "}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", tc.target, nil)
			for k, v := range tc.headers {
				r.Header.Set(k, v)
			}
			if r.TLS != nil {
				t.Fatal("test setup error: r.TLS must be nil to exercise the header path")
			}
			if got := requestIsHTTPS(r); got != tc.want {
				t.Fatalf("requestIsHTTPS = %v want %v", got, tc.want)
			}
		})
	}
}

// TestRequestIsHTTPSDirectTLS covers the no-proxy case: a real TLS connection
// must be detected from r.TLS alone.
func TestRequestIsHTTPSDirectTLS(t *testing.T) {
	r := httptest.NewRequest("GET", "https://example.com/", nil)
	if r.TLS == nil {
		t.Skip("httptest did not synthesise a TLS state for an https target")
	}
	if !requestIsHTTPS(r) {
		t.Fatal("a direct TLS connection must be detected")
	}
}

func TestSessionCookieSecureFlag(t *testing.T) {
	r := httptest.NewRequest("POST", "https://example.com/api/auth/login", nil)
	c := sessionCookie("tok", r)
	if !c.Secure {
		t.Fatal("cookie must be Secure over https")
	}
	if !c.HttpOnly {
		t.Fatal("cookie must be HttpOnly so JS cannot read the session")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("SameSite = %v, want Lax", c.SameSite)
	}
	// Plain HTTP must not get the flag, or the browser silently drops the
	// cookie and every LAN visit looks like a logout.
	plain := httptest.NewRequest("POST", "http://192.168.1.5:8790/api/auth/login", nil)
	if sessionCookie("tok", plain).Secure {
		t.Fatal("cookie must not be Secure over plain http")
	}
	// The clearing cookie must match, or the browser keeps the original.
	cleared := clearedSessionCookie(r)
	if !cleared.Secure || !cleared.HttpOnly || cleared.SameSite != c.SameSite || cleared.Path != c.Path {
		t.Fatalf("cleared cookie attributes differ: %+v", cleared)
	}
	if cleared.MaxAge != -1 {
		t.Fatalf("cleared MaxAge = %d, want -1", cleared.MaxAge)
	}
}

func TestSecurityHeaders(t *testing.T) {
	h := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))

	want := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy":        "no-referrer",
		"X-Frame-Options":        "DENY",
	}
	for k, v := range want {
		if got := w.Header().Get(k); got != v {
			t.Errorf("%s = %q want %q", k, got, v)
		}
	}
	csp := w.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("Content-Security-Policy is missing")
	}
	// Scripts must not be allowed to run inline, and framing must be denied.
	for _, want := range []string{"script-src 'self'", "object-src 'none'", "frame-ancestors 'none'"} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP missing %q, got %q", want, csp)
		}
	}
	// 'unsafe-inline' must never reach script-src, which would void the policy.
	if strings.Contains(csp, "script-src 'self' 'unsafe-inline'") {
		t.Error("CSP allows inline scripts")
	}
}

func TestSameOriginGuard(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := sameOriginGuard(inner)

	cases := []struct {
		name   string
		method string
		origin string
		host   string
		want   int
	}{
		{"same origin POST", "POST", "https://kanban.example.com", "kanban.example.com", 200},
		{"same origin with port", "POST", "http://localhost:8790", "localhost:8790", 200},
		{"cross origin POST", "POST", "https://evil.example.com", "kanban.example.com", 403},
		{"cross origin DELETE", "DELETE", "https://evil.example.com", "kanban.example.com", 403},
		{"no origin allowed (curl, MCP)", "POST", "", "kanban.example.com", 200},
		// Reads are not state-changing, so a cross-origin GET is not a CSRF.
		{"cross origin GET allowed", "GET", "https://evil.example.com", "kanban.example.com", 200},
		{"cross origin HEAD allowed", "HEAD", "https://evil.example.com", "kanban.example.com", 200},
		{"malformed origin rejected", "POST", "not a url", "kanban.example.com", 403},
		// A lookalike host must not pass: this is the whole point of the check.
		{"suffix confusion rejected", "POST", "https://kanban.example.com.evil.io", "kanban.example.com", 403},
		{"subdomain rejected", "POST", "https://evil.kanban.example.com", "kanban.example.com", 403},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "http://"+tc.host+"/api/boards", nil)
			r.Host = tc.host
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got %d want %d", w.Code, tc.want)
			}
		})
	}
}

func TestOriginMatchesIgnoresScheme(t *testing.T) {
	// Behind a proxy the browser sees https and the app sees http on the
	// loopback hop. Rejecting that would lock the operator out entirely.
	r := httptest.NewRequest("POST", "http://kanban.example.com/api/auth/login", nil)
	r.Host = "kanban.example.com"
	if !originMatchesRequest("https://kanban.example.com", r) {
		t.Fatal("scheme difference must not fail the origin check")
	}
}

func TestCanonicalHost(t *testing.T) {
	cases := map[string]string{
		"Example.COM":        "example.com",
		"example.com:8790":   "example.com:8790",
		"example.com":        "example.com",
		"127.0.0.1:8790":     "127.0.0.1:8790",
		"[::1]:8790":         "[::1]:8790",
		"kanban.example.com": "kanban.example.com",
	}
	for in, want := range cases {
		if got := canonicalHost(in); got != want {
			t.Errorf("canonicalHost(%q) = %q want %q", in, got, want)
		}
	}
}
