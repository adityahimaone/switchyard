package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

// requestIsHTTPS reports whether the client reached this server over TLS,
// directly or through a reverse proxy.
//
// X-Forwarded-Proto is only consulted because the deployment puts nginx or a
// similar proxy in front. That header is trivially spoofable by a direct
// client, so a server exposed without a proxy must not rely on it: the only
// consequence of forging it here is that one's own cookie gains the Secure
// flag, which fails closed rather than open.
func requestIsHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	// X-Forwarded-Proto is authoritative when present: it is what the
	// terminating proxy actually saw. Falling back to r.URL.Scheme after a
	// forwarded header says "http" would contradict the proxy and mark the
	// cookie Secure on a connection the browser is not using TLS for.
	if proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); proto != "" {
		first, _, _ := strings.Cut(proto, ",")
		return strings.EqualFold(strings.TrimSpace(first), "https")
	}
	return strings.EqualFold(r.URL.Scheme, "https")
}

// securityHeaders sets response headers that constrain what a browser will do
// with a response. They are cheap and independent of the auth layer, so they
// wrap everything including the SPA shell.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		// Stops a browser from second-guessing a declared Content-Type, which
		// is what turns an uploaded file into script execution.
		h.Set("X-Content-Type-Options", "nosniff")
		// Keeps the workspace host and any path out of Referer on outbound links.
		h.Set("Referrer-Policy", "no-referrer")
		// This app never embeds third-party frames, and framing it lets a
		// hostile page overlay the UI to capture clicks on the approve button.
		h.Set("X-Frame-Options", "DENY")
		// Vite emits module scripts and inline styles for the WebGL canvas, so
		// the policy allows 'self' and 'unsafe-inline' for styles but not for
		// scripts. connect-src must include ws: for the SSE stream.
		h.Set("Content-Security-Policy", strings.Join([]string{
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"font-src 'self' data:",
			// The app talks to the node-agent gateway from the browser via
			// fetch, and opens an SSE stream over the same origin.
			"connect-src 'self' ws: wss:",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'",
		}, "; "))
		next.ServeHTTP(w, r)
	})
}

// sameOriginGuard rejects state-changing requests whose Origin is not this
// server.
//
// SameSite=Lax already blocks cross-site cookie-bearing POSTs in current
// browsers, so this is defence in depth for the cases Lax does not cover: a
// browser without SameSite enforcement, and any future route that is reachable
// by GET. Requests with no Origin header are allowed because a same-origin
// fetch from this app always sends one, and non-browser clients (curl, the MCP
// server) legitimately omit it.
func sameOriginGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isSafeMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if !originMatchesRequest(origin, r) {
			http.Error(w, "cross-origin request rejected", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isSafeMethod(m string) bool {
	switch m {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	return false
}

// originMatchesRequest compares an Origin header against the request's own
// host. Scheme is ignored because behind a proxy the two can legitimately
// differ, and a cross-site attacker cannot forge Host.
func originMatchesRequest(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := r.Host
	if host == "" {
		return false
	}
	// Compare host:port, tolerating a missing default port on either side.
	return canonicalHost(u.Host) == canonicalHost(host)
}

func canonicalHost(hostport string) string {
	host, port, err := net.SplitHostPort(hostport)
	if err != nil {
		// No port present.
		return strings.ToLower(hostport)
	}
	if port == "" {
		return strings.ToLower(host)
	}
	return strings.ToLower(net.JoinHostPort(host, port))
}
