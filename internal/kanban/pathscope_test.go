package kanban

import "testing"

// The cases the plan calls out by name, plus the boundary behaviour that makes
// a naive strings.HasPrefix wrong.
func TestPathsOverlap(t *testing.T) {
	cases := []struct {
		name string
		a, b string
		want bool
	}{
		// Named in the plan.
		{"glob contains file", "src/auth/**", "src/auth/token.rs", true},
		{"sibling directories", "src/auth/**", "src/api/**", false},
		{"segment boundary is not a character prefix", "src/a", "src/ab", false},
		{"root glob overlaps everything", "**", "src/anything.go", true},
		{"root glob on both sides", "**", "**", true},
		{"file glob at root is repo-wide", "*.go", "src/main.go", true},

		// Identical and nested.
		{"identical", "src/auth", "src/auth", true},
		{"dir contains child", "src/auth", "src/auth/token.rs", true},
		{"child does not contain dir", "src/auth/token.rs", "src/auth", true},
		{"sibling subtrees under same parent", "src/a/b/c", "src/a/b/d/e.go", false},
		{"nested one level too deep", "src/a/b", "src/a/b/c/d", true},
		{"sibling under same parent", "src/auth/login", "src/auth/logout", false},
		{"parent vs unrelated root", "src", "docs", false},

		// Normalization applied before comparison.
		{"leading dot slash", "./src/auth", "src/auth", true},
		{"doubled separator", "src//auth", "src/auth", true},
		{"trailing slash", "src/auth/", "src/auth", true},
		{"backslash", `src\auth`, "src/auth", true},
		{"whitespace", "  src/auth  ", "src/auth", true},
		{"normalized mixed forms", "./src//auth/", "src/auth", true},

		// The distinction that matters: `src/a/**` and `src/a/b/**` DO meet,
		// while `src/a` and `src/ab` do not.
		{"nested globs meet", "src/a/**", "src/a/b/**", true},
		{"nested globs one deeper", "src/a/b/**", "src/a/**", true},
		{"sibling globs same depth", "src/a/**", "src/ab/**", false},

		// Glob metacharacters reduce the prefix to the containing directory.
		{"star inside filename", "src/*.go", "src/main.go", true},
		{"star in mid path", "src/auth/*/token.go", "src/auth/x/token.go", true},
		{"question mark", "src/file?.go", "src/file1.go", true},
		{"char class", "src/file[0-9].go", "src/file3.go", true},

		// Degenerate inputs.
		{"empty vs empty", "", "", true},
		{"empty vs path", "", "src/main.go", true},
		{"path vs empty", "src/main.go", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := pathsOverlap(tc.a, tc.b); got != tc.want {
				t.Fatalf("pathsOverlap(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
			// Overlap must be symmetric; a one-directional bug would let a
			// race slip through depending on argument order.
			if got := pathsOverlap(tc.b, tc.a); got != tc.want {
				t.Fatalf("pathsOverlap(%q, %q) = %v, want %v (asymmetric)", tc.b, tc.a, got, tc.want)
			}
		})
	}
}

// TestGlobPrefix pins the prefix reduction directly, since pathsOverlap's
// correctness is entirely delegated to it.
func TestGlobPrefix(t *testing.T) {
	cases := map[string]string{
		"src/auth/**":      "src/auth",
		"src/auth":         "src/auth",
		"**":               "",
		"*.go":             "",
		"./src/*.go":       "src",
		"src/a/b/*.go":     "src/a/b",
		"src/a/b/":         "src/a/b",
		"":                 "",
		"src/file[0-9].go": "src",
		"src/a?/b.go":      "src",
		`src\auth\**`:      "src/auth",
		// A literal path with no metacharacter stays itself. It is a precise
		// claim on that one file, so narrowing it to its directory would make
		// `src/auth/token.rs` collide with every other file beside it.
		"src/auth/token.rs":   "src/auth/token.rs",
		"src/deep/a/b/c/x.md": "src/deep/a/b/c/x.md",
		"src/a?b/c":           "src",
		"a/b/**/c/d":          "a/b",
	}
	for in, want := range cases {
		if got := globPrefix(in); got != want {
			t.Errorf("globPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizePath(t *testing.T) {
	cases := map[string]string{
		"./src/auth":       "src/auth",
		"src//auth":        "src/auth",
		"src/auth/":        "src/auth",
		`src\auth`:         "src/auth",
		"  src/auth  ":     "src/auth",
		"./src//auth///":   "src/auth",
		"/":                "/",
		"":                 "",
		"   ":              "",
		"**":               "**",
		"./":               "",
		"a/b/../c":         "a/b/../c", // ".." is the validator's job to reject, not ours
		"src/./auth":       "src/auth",
		`\\server\share\a`: "/server/share/a",
	}
	for in, want := range cases {
		if got := normalizePath(in); got != want {
			t.Errorf("normalizePath(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestPathsOverlapAny covers the helper the lease check calls.
func TestPathsOverlapAny(t *testing.T) {
	held := []string{"src/auth/**", "docs/**"}

	if _, conflict := PathsOverlapAny(nil, held); conflict {
		t.Error("a task with no declared paths must not conflict with anything")
	}
	if _, conflict := PathsOverlapAny([]string{}, held); conflict {
		t.Error("an empty path list must not conflict")
	}
	got, conflict := PathsOverlapAny([]string{"src/api/x.go"}, held)
	if conflict {
		t.Error("src/api does not overlap src/auth or docs")
	} else if got != "" {
		t.Errorf("conflict glob = %q, want empty on no conflict", got)
	}
	got, conflict = PathsOverlapAny([]string{"src/api/x.go", "src/auth/session.go"}, held)
	if !conflict {
		t.Fatal("expected a conflict with src/auth/**")
	}
	if got != "src/auth/**" {
		t.Errorf("conflict glob = %q, want src/auth/**", got)
	}
	// Repo-wide always conflicts, even against an unrelated dir.
	if _, conflict := PathsOverlapAny([]string{"**"}, []string{"docs/**"}); !conflict {
		t.Error("** must conflict with docs/**")
	}
}

func TestPathsParseAndJSON(t *testing.T) {
	t.Run("round trip", func(t *testing.T) {
		in := []string{"src/auth/**", "./docs//readme.md", "src/auth/"}
		raw := PathsJSON(in)
		got := PathsParse(raw)
		want := []string{"src/auth/**", "docs/readme.md", "src/auth"}
		if len(got) != len(want) {
			t.Fatalf("round trip = %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("round trip[%d] = %q, want %q", i, got[i], want[i])
			}
		}
	})

	t.Run("empty encodes as empty array", func(t *testing.T) {
		if got := PathsJSON(nil); got != "[]" {
			t.Errorf("PathsJSON(nil) = %q, want []", got)
		}
		if got := PathsParse("[]"); got != nil {
			t.Errorf("PathsParse(\"[]\") = %v, want nil", got)
		}
		if got := PathsParse(""); got != nil {
			t.Errorf("PathsParse(\"\") = %v, want nil", got)
		}
	})

	// A corrupt column must degrade to "no declared scope" rather than break the
	// board. This is the tolerant behaviour PathsParse documents.
	t.Run("corrupt json degrades quietly", func(t *testing.T) {
		for _, bad := range []string{"{", "not json", `[unclosed`, `{"a":1}`, "null"} {
			if got := PathsParse(bad); got != nil {
				t.Errorf("PathsParse(%q) = %v, want nil", bad, got)
			}
		}
	})

	t.Run("blank entries dropped", func(t *testing.T) {
		got := PathsParse(`["src/a", "", "  ", "./src/b"]`)
		want := []string{"src/a", "src/b"}
		if len(got) != len(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("got[%d] = %q, want %q", i, got[i], want[i])
			}
		}
	})
}
