package kanban

import (
	"encoding/json"
	"strings"
)

// Path scope: deciding whether two tasks would be editing the same files.
//
// A task declares globs (`src/auth/**`). Two tasks conflict when their globs
// could touch the same file. That comparison is done here in Go and never in
// SQL, because SQLite has no glob semantics and the segment-boundary rule below
// is the whole correctness argument.
//
// The rule that matters: prefix matching is on path SEGMENTS, not characters.
// `src/a` must not conflict with `src/ab`, or every task under `src/` would
// collide with every sibling.

// normalizePath makes a declared path comparable: forward slashes, no "./"
// segments, no doubled separators, no trailing slash.
//
// Interior "." segments are removed because they are purely cosmetic. ".." is
// deliberately left alone — it is a traversal, and stripping it would silently
// turn a rejected path into an accepted one. Validating that is the caller's
// job (see ValidateNewTask), not this function's.
func normalizePath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.ReplaceAll(p, `\`, "/")
	for strings.Contains(p, "//") {
		p = strings.ReplaceAll(p, "//", "/")
	}
	for strings.Contains(p, "/./") {
		p = strings.ReplaceAll(p, "/./", "/")
	}
	p = strings.TrimPrefix(p, "./")
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
	}
	return p
}

// globPrefix reduces a glob to the directory that certainly contains it.
//
// Everything from the first glob metacharacter is dropped, so `src/auth/**`
// becomes `src/auth`. The result is the narrowest directory that every match is
// inside — which is what makes it safe to compare as a path prefix.
//
// An empty result means "the whole repository": a bare `**` or `*.go` at the
// root can match anywhere, so it conflicts with everything.
func globPrefix(p string) string {
	p = normalizePath(p)
	i := strings.IndexAny(p, "*?[{")
	if i < 0 {
		return p
	}
	lit := p[:i]
	if strings.HasSuffix(lit, "/") {
		return strings.TrimRight(lit, "/")
	}
	if j := strings.LastIndex(lit, "/"); j >= 0 {
		return lit[:j]
	}
	return ""
}

// pathsOverlap reports whether two declared globs could edit the same file.
func pathsOverlap(a, b string) bool {
	pa, pb := globPrefix(a), globPrefix(b)
	if pa == "" || pb == "" {
		// Either side is repo-wide, so they necessarily meet.
		return true
	}
	if pa == pb {
		return true
	}
	// Segment-aware: "src/auth" contains "src/auth/token.rs", but "src/a" does
	// not contain "src/ab".
	return strings.HasPrefix(pb, pa+"/") || strings.HasPrefix(pa, pb+"/")
}

// PathsOverlapAny reports whether candidate conflicts with any held glob.
// An empty candidate list never conflicts, so a task with no declared scope
// imposes nothing on anyone else.
func PathsOverlapAny(candidates, held []string) (string, bool) {
	for _, c := range candidates {
		for _, h := range held {
			if pathsOverlap(c, h) {
				return h, true
			}
		}
	}
	return "", false
}

// PathsParse decodes the stored JSON array of globs.
//
// Tolerant on purpose: a corrupt column must not stop a board from loading, so
// bad JSON yields no paths rather than an error. That degrades to "no declared
// scope", which is the same state as a card created before this feature.
func PathsParse(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	cleaned := make([]string, 0, len(out))
	for _, p := range out {
		if n := normalizePath(p); n != "" {
			cleaned = append(cleaned, n)
		}
	}
	if len(cleaned) == 0 {
		// Uniform empty result: callers can compare against nil without caring
		// whether the input was absent, "[]", "null", or a list of blanks.
		return nil
	}
	return cleaned
}

// PathsJSON encodes globs for storage. Always returns valid JSON, so the column
// is never left holding something PathsParse would reject.
func PathsJSON(paths []string) string {
	if len(paths) == 0 {
		return "[]"
	}
	cleaned := make([]string, 0, len(paths))
	for _, p := range paths {
		if n := normalizePath(p); n != "" {
			cleaned = append(cleaned, n)
		}
	}
	if len(cleaned) == 0 {
		return "[]"
	}
	b, err := json.Marshal(cleaned)
	if err != nil {
		return "[]"
	}
	return string(b)
}
