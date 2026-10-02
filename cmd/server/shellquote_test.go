package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kanban-board/internal/kanban"
)

// The SSH dispatcher was retired, so its transport-classification tests went
// with it: remoteTransportForPath and hardGuardTransport no longer exist, and
// transportForPath in internal/kanban/workspace_validate.go is now the single
// place that decides routing, covered by workspace_validate_test.go there.
//
// The quoting tests below are kept because the hazard they protect is not
// SSH-specific. A workspace path is interpolated into a shell command line that
// runs on the worker, so it must be treated as one literal argument. node-agent
// receives the same script, so removing the transport does not remove the risk.

func TestDispatchDSHSessionIDOnlyResumesExistingBinding(t *testing.T) {
	binding := kanban.HarnessBinding{HarnessSessionID: "switchyard-card-real"}
	if got := dispatchDSHSessionID(binding, false); got != "" {
		t.Fatalf("initial dispatch session=%q, want empty", got)
	}
	if got := dispatchDSHSessionID(binding, true); got != binding.HarnessSessionID {
		t.Fatalf("continuation session=%q, want %q", got, binding.HarnessSessionID)
	}
}

// TestShellQuoteOneLiteralPath runs a generated command through a real shell
// inside a real directory, which is the only way to prove the quoting holds.
// String comparison alone cannot tell whether the shell would actually interpret
// the path as one literal argument.
func TestShellQuoteOneLiteralPath(t *testing.T) {
	base := t.TempDir()
	// A directory whose name is deliberately hostile: spaces, a semicolon, a
	// command substitution and a single quote all in one path.
	//
	// The payload paths are absolute. A bare `touch pwned.txt` would resolve
	// against the test's working directory — the package source dir — so a
	// regression would scatter files through the repository instead of failing
	// cleanly. Keeping them inside base makes even a real injection harmless.
	pwned := filepath.Join(base, "pwned.txt")
	sub := filepath.Join(base, "sub.txt")
	hostile := filepath.Join(base, fmt.Sprintf("repo dir; touch %s; $(touch %s) 'quoted'", pwned, sub))
	if err := exec.Command("mkdir", "-p", hostile).Run(); err != nil {
		t.Skipf("cannot create hostile dir: %v", err)
	}
	// The directory cd must land in, with symlinks resolved the way the test
	// resolves it. The expectation comes from the filesystem rather than from
	// running the code under test, so the assertion is not circular.
	wantDir, err := filepath.EvalSymlinks(hostile)
	if err != nil {
		t.Fatalf("resolve expected dir: %v", err)
	}

	got := "cd " + shellQuote(hostile) + " && pwd"
	out, code := runLocalShell(t, got)
	if code != 0 {
		t.Fatalf("exit %d for workdir %q\nscript: %s\noutput: %s", code, hostile, got, out)
	}
	if want := strings.TrimSpace(out); want != wantDir {
		t.Fatalf("workdir not treated as one literal path\n got: %q\nwant: %q\nscript: %s",
			want, wantDir, got)
	}
	// Nothing embedded in the path may have executed.
	for _, side := range []string{pwned, sub} {
		assertMissing(t, side)
	}
}

// TestShellQuoteTable pins the exact output for the metacharacter classes the
// audit called out, so a later change to shellQuote cannot silently unquote one
// of them.
func TestShellQuoteTable(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"plain", "/Users/me/repo", `'/Users/me/repo'`},
		{"space", "/Users/me/my repo", `'/Users/me/my repo'`},
		{"semicolon", "/tmp/a; rm -rf /", `'/tmp/a; rm -rf /'`},
		{"command substitution", "/tmp/$(id)", `'/tmp/$(id)'`},
		{"backtick", "/tmp/`id`", "'/tmp/`id`'"},
		{"single quote", "/tmp/it's", `'/tmp/it'\''s'`},
		{"double quote", `/tmp/a"b`, `'/tmp/a"b'`},
		{"newline", "/tmp/a\nb", "'/tmp/a\nb'"},
		{"pipe and redirect", "/tmp/a|b>c", `'/tmp/a|b>c'`},
		{"empty", "", `''`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shellQuote(tc.in); got != tc.want {
				t.Fatalf("shellQuote(%q) = %q want %q", tc.in, got, tc.want)
			}
		})
	}
}

func runLocalShell(t *testing.T, script string) (string, int) {
	t.Helper()
	cmd := exec.Command("sh", "-c", script)
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else {
			t.Fatalf("run shell: %v", err)
		}
	}
	return string(out), code
}

// assertMissing fails if path exists. Used to prove no injected command ran.
func assertMissing(t *testing.T, path string) {
	t.Helper()
	if err := exec.Command("test", "-e", path).Run(); err == nil {
		t.Fatalf("workdir injection executed: %s was created", path)
	}
}
