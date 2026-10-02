package kanban

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A 1x1 GIF and a 1x1 PNG. Real bytes matter: SetWorkspaceAvatar sniffs the
// content type, so a string that merely claims to be an image is rejected.
var (
	wsGif = []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")
	wsPng = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xcf\xc0P\x0f\x00\x04\x85\x01\x80\x84\xa2\x8c\x18\x00\x00\x00\x00IEND\xaeB`\x82")
)

func patchWorkspaceHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	return home
}

func TestWorkspaceIdentityDefaultsWhenUnconfigured(t *testing.T) {
	patchWorkspaceHome(t)
	view, err := GetWorkspaceIdentityView()
	if err != nil {
		t.Fatal(err)
	}
	// A missing file must not be an error: the app renders the top bar before
	// anyone has ever opened settings.
	if view.Name != "" || view.ResolvedAvatarURL != "" || view.HasUploadedAvatar {
		t.Fatalf("unconfigured workspace should be empty, got %+v", view)
	}
}

// The server must not invent a name for the workspace — the client owns the
// fallback — so an absent name stays empty all the way through a save.
func TestWorkspaceIdentityRoundTripsAndNormalizes(t *testing.T) {
	patchWorkspaceHome(t)
	saved, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "  Switchyard   Control\tPlane  "})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Name != "Switchyard Control Plane" {
		t.Fatalf("name not normalized: %q", saved.Name)
	}
	got, err := LoadWorkspaceIdentity()
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Switchyard Control Plane" {
		t.Fatalf("round trip mismatch: %q", got.Name)
	}
}

func TestWorkspaceIdentityClearingNameIsAllowed(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "Named"}); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "   "}); err != nil {
		t.Fatalf("clearing the name should be allowed: %v", err)
	}
	got, _ := LoadWorkspaceIdentity()
	if got.Name != "" {
		t.Fatalf("name should be cleared, got %q", got.Name)
	}
}

// Whitespace inside a pasted name is collapsed to single spaces rather than
// rejected, so a name pasted with a newline or a tab is still usable. What must
// be refused is a control character normalization cannot strip, and length.
func TestWorkspaceIdentityNormalizesAndRejectsBadNames(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "line\nbreak\ttab"}); err != nil {
		t.Fatalf("embedded whitespace should be collapsed, not rejected: %v", err)
	}
	got, _ := LoadWorkspaceIdentity()
	if got.Name != "line break tab" {
		t.Fatalf("whitespace not collapsed: %q", got.Name)
	}

	long := strings.Repeat("n", maxWorkspaceNameLen+1)
	for _, tc := range []struct{ name, why string }{
		{"null\x00byte", "null byte survives normalization"},
		{"bell\x07", "control character survives normalization"},
		{long, "too long"},
	} {
		if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: tc.name}); err == nil {
			t.Errorf("accepted %s: %q", tc.why, tc.name)
		}
	}
	// The boundary itself must pass, or the limit is off by one.
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: strings.Repeat("n", maxWorkspaceNameLen)}); err != nil {
		t.Errorf("name of exactly max length rejected: %v", err)
	}
}

// A rename must not take the avatar with it: the two are independent edits and
// discarding an avatar because someone typed a new name would be data loss.
func TestSaveWorkspaceIdentityPreservesUploadedAvatar(t *testing.T) {
	patchWorkspaceHome(t)
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "Renamed"}); err != nil {
		t.Fatal(err)
	}
	if !HasWorkspaceAvatar() {
		t.Fatal("rename discarded the uploaded avatar")
	}
}

// SetWorkspaceName is the settings form's edit path, and it must leave both
// halves of the identity alone. This is the guard against the partial-update
// trap: a client that sends only a name would otherwise clear the avatar.
func TestSetWorkspaceNameLeavesAvatarUntouched(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SetWorkspaceAvatarURL("https://example.com/a.png"); err != nil {
		t.Fatal(err)
	}
	if _, err := SetWorkspaceName("Renamed"); err != nil {
		t.Fatal(err)
	}
	id, _ := LoadWorkspaceIdentity()
	if id.Name != "Renamed" {
		t.Fatalf("name not saved: %q", id.Name)
	}
	if id.AvatarURL != "https://example.com/a.png" {
		t.Fatalf("rename cleared the avatar url: %q", id.AvatarURL)
	}

	// Same for an uploaded blob.
	patchWorkspaceHome(t)
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	if _, err := SetWorkspaceName("WithBlob"); err != nil {
		t.Fatal(err)
	}
	if !HasWorkspaceAvatar() {
		t.Fatal("rename discarded the uploaded blob")
	}
}

func TestSetWorkspaceAvatarWritesAndReads(t *testing.T) {
	patchWorkspaceHome(t)
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	got, mime, ok := WorkspaceAvatar()
	if !ok || mime != "image/gif" {
		t.Fatalf("avatar round trip failed: ok=%v mime=%q", ok, mime)
	}
	if !bytes.Equal(got, wsGif) {
		t.Fatal("stored bytes differ from uploaded bytes")
	}
	view, err := GetWorkspaceIdentityView()
	if err != nil {
		t.Fatal(err)
	}
	// An uploaded blob resolves to the API path, so the client can cache-bust it.
	if view.ResolvedAvatarURL != "/api/workspace/avatar" || !view.HasUploadedAvatar {
		t.Fatalf("uploaded avatar not resolved to api path: %+v", view)
	}
}

// Browsers and Go's CreateFormFile both default to application/octet-stream, so
// a generic declared mime has to be accepted on the strength of the sniffed
// type alone — same trust boundary the profile avatar uses.
func TestSetWorkspaceAvatarAcceptsGenericMultipartMime(t *testing.T) {
	patchWorkspaceHome(t)
	if err := SetWorkspaceAvatar("application/octet-stream", wsPng); err != nil {
		t.Fatal(err)
	}
	_, mime, ok := WorkspaceAvatar()
	if !ok || mime != "image/png" {
		t.Fatalf("generic mime rejected, got ok=%v mime=%q", ok, mime)
	}
}

// The declared type is attacker-controlled, so the sniffed bytes are the real
// boundary. A PDF or an SVG that merely claims to be a PNG must be refused.
func TestSetWorkspaceAvatarRejectsBadInput(t *testing.T) {
	patchWorkspaceHome(t)
	cases := []struct {
		name, mime string
		data       []byte
	}{
		{"pdf", "application/pdf", []byte("%PDF-1.4 fake")},
		{"html", "text/html", []byte("<script>alert(1)</script>")},
		{"svg", "image/svg+xml", []byte(`<svg onload=alert(1)>`)},
		{"oversize", "image/gif", make([]byte, maxAvatarBytes+1)},
		{"empty", "image/gif", nil},
		{"declared mime lies about content", "image/png", wsGif},
	}
	for _, tc := range cases {
		if err := SetWorkspaceAvatar(tc.mime, tc.data); err == nil {
			t.Errorf("accepted %s", tc.name)
		}
	}
	if HasWorkspaceAvatar() {
		t.Error("a rejected upload left an avatar behind")
	}
}

// A URL and an uploaded blob are two answers to one question. Whichever is set
// last must win, or the rendered avatar depends on removal order.
func TestAvatarURLAndUploadAreMutuallyExclusive(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SetWorkspaceAvatarURL("https://example.com/a.png"); err != nil {
		t.Fatal(err)
	}
	view, _ := GetWorkspaceIdentityView()
	if view.ResolvedAvatarURL != "https://example.com/a.png" || view.HasUploadedAvatar {
		t.Fatalf("url avatar not applied: %+v", view)
	}

	// An upload must displace the URL.
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	id, _ := LoadWorkspaceIdentity()
	if id.AvatarURL != "" {
		t.Fatalf("upload left a stale url: %q", id.AvatarURL)
	}
	view, _ = GetWorkspaceIdentityView()
	if !view.HasUploadedAvatar {
		t.Fatalf("upload did not take precedence: %+v", view)
	}

	// Setting a URL again must displace the blob, not silently lose to it.
	if _, err := SetWorkspaceAvatarURL("https://example.com/b.png"); err != nil {
		t.Fatal(err)
	}
	if HasWorkspaceAvatar() {
		t.Error("url did not clear the uploaded blob")
	}
	view, _ = GetWorkspaceIdentityView()
	if view.ResolvedAvatarURL != "https://example.com/b.png" || view.HasUploadedAvatar {
		t.Fatalf("url should now win: %+v", view)
	}
}

// Clearing the URL is the remove path. If it left the blob behind, the avatar
// would reappear the moment the URL was cleared — the exact bug this guards.
func TestSetWorkspaceAvatarURLEmptyRemovesBoth(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SetWorkspaceAvatarURL("https://example.com/a.png"); err != nil {
		t.Fatal(err)
	}
	if _, err := SetWorkspaceAvatarURL(""); err != nil {
		t.Fatal(err)
	}
	if HasWorkspaceAvatar() {
		t.Error("avatar survived clearing the url")
	}
	view, _ := GetWorkspaceIdentityView()
	if view.ResolvedAvatarURL != "" {
		t.Fatalf("avatar url survived: %+v", view)
	}
}

func TestSetWorkspaceAvatarURLFailsClosed(t *testing.T) {
	patchWorkspaceHome(t)
	for _, bad := range []string{
		"not-a-url",
		"http://127.0.0.1/x.png",
		"http://10.0.0.1/x.png",
		"http://user:pass@example.com/x.png",
		"ftp://example.com/x.png",
		"https://example.com",
	} {
		if _, err := SetWorkspaceAvatarURL(bad); err == nil {
			t.Errorf("accepted bad url %q", bad)
		}
	}
	if _, err := SetWorkspaceAvatarURL(strings.Repeat("h", 3000)); err == nil {
		t.Error("accepted oversized url")
	}
}

// A hand-edited yaml must not take the top bar down; the store degrades to
// unconfigured and a subsequent save repairs the file.
func TestLoadWorkspaceIdentitySurvivesCorruptYaml(t *testing.T) {
	home := patchWorkspaceHome(t)
	if err := os.WriteFile(workspaceIdentityPath(), []byte("\tname: [unterminated"), 0o600); err != nil {
		t.Fatal(err)
	}
	id, err := LoadWorkspaceIdentity()
	if err != nil {
		t.Fatalf("corrupt yaml should degrade, not error: %v", err)
	}
	if id.Name != "" {
		t.Fatalf("expected empty name, got %q", id.Name)
	}
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "Repaired"}); err != nil {
		t.Fatalf("save after corrupt read: %v", err)
	}
	got, _ := LoadWorkspaceIdentity()
	if got.Name != "Repaired" {
		t.Fatalf("not repaired: %q", got.Name)
	}
	_ = home
}

// The identity record lives in hermesHome, not inside an agent profile dir, so
// writing it must not create or disturb a profile.
func TestWorkspaceIdentityDoesNotTouchProfiles(t *testing.T) {
	home := patchWorkspaceHome(t)
	os.MkdirAll(filepath.Join(home, "profiles", "base"), 0o755)
	os.WriteFile(filepath.Join(home, "profiles", "base", "config.yaml"),
		[]byte("model:\n  api_key: sk-test\n  base_url: https://x/v1\n  default: old\n  provider: custom\n"), 0o600)
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "X"}); err != nil {
		t.Fatal(err)
	}
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(home, "profiles", "base", "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(raw, []byte("old")) {
		t.Fatal("profile config was modified")
	}
	if _, err := os.Stat(filepath.Join(home, "profiles", "base", "avatar")); err == nil {
		t.Fatal("avatar blob landed inside the profile directory")
	}
}

// Writes go through a temp file and a rename, so a reader never sees a partial
// record and no .tmp is left behind on success.
func TestSaveWorkspaceIdentityIsAtomic(t *testing.T) {
	patchWorkspaceHome(t)
	if _, err := SaveWorkspaceIdentity(WorkspaceIdentity{Name: "Atomic"}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(workspaceIdentityPath() + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("temp file left behind")
	}
	if _, err := os.Stat(filepath.Join(hermesHome(), "workspace-avatar.tmp")); !os.IsNotExist(err) {
		t.Fatal("avatar temp file left behind")
	}
}

func TestRemoveWorkspaceAvatar(t *testing.T) {
	patchWorkspaceHome(t)
	if err := SetWorkspaceAvatar("image/gif", wsGif); err != nil {
		t.Fatal(err)
	}
	if err := RemoveWorkspaceAvatar(); err != nil {
		t.Fatal(err)
	}
	if HasWorkspaceAvatar() {
		t.Fatal("avatar still present after remove")
	}
	// Removing twice must stay quiet — the settings page can call it on a
	// workspace that never had an avatar.
	if err := RemoveWorkspaceAvatar(); err != nil {
		t.Fatalf("second remove errored: %v", err)
	}
	view, _ := GetWorkspaceIdentityView()
	if view.ResolvedAvatarURL != "" {
		t.Fatalf("resolved url should be empty after remove: %+v", view)
	}
}
