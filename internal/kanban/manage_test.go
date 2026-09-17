package kanban

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func patchProfilesHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	os.MkdirAll(filepath.Join(home, "profiles", "base"), 0o755)
	os.WriteFile(filepath.Join(home, "profiles", "base", "config.yaml"),
		[]byte("model:\n  api_key: sk-test\n  base_url: https://x/v1\n  default: old-model\n  provider: custom\nfallback_providers: []\n"), 0o600)
	os.WriteFile(filepath.Join(home, "profiles", "base", "SOUL.md"), []byte("base prompt\n"), 0o644)
	os.MkdirAll(filepath.Join(home, "profiles", "base", "skills", "alpha"), 0o755)
	os.MkdirAll(filepath.Join(home, "profiles", "base", "skills", "beta"), 0o755)
	os.WriteFile(filepath.Join(home, "config.yaml"), []byte("model:\n  api_key: sk-test\n  base_url: https://x/v1\n  default: old-model\n  provider: custom\n"), 0o600)
	return home
}

func TestGetProfile(t *testing.T) {
	patchProfilesHome(t)
	p, err := GetProfile("base")
	if err != nil {
		t.Fatal(err)
	}
	if p.Model != "old-model" || p.Provider != "custom" || !p.Valid {
		t.Errorf("bad parse: %+v", p)
	}
	if p.SystemPrompt != "base prompt\n" {
		t.Errorf("SOUL.md not read: %q", p.SystemPrompt)
	}
	if len(p.Skills) != 2 || p.Skills[0] != "alpha" {
		t.Errorf("skills: %v", p.Skills)
	}
	if _, err := GetProfile("ghost"); err == nil {
		t.Error("ghost profile accepted")
	}
}

func TestCreateAndPatchProfile(t *testing.T) {
	patchProfilesHome(t)
	// invalid provider must be refused (protocol_violation guard)
	if err := CreateProfile("bad", ProfileInput{Provider: "custom:host"}); err == nil {
		t.Error("invalid provider accepted")
	}
	if err := CreateProfile("Bad Name!", ProfileInput{Provider: "custom"}); err == nil {
		t.Error("invalid name accepted")
	}
	if err := CreateProfile("newguy", ProfileInput{Model: "m1", Provider: "custom", SystemPrompt: ptr("hello")}); err != nil {
		t.Fatal(err)
	}
	p, _ := GetProfile("newguy")
	if p.Model != "m1" || p.SystemPrompt != "hello" {
		t.Errorf("create failed: %+v", p)
	}
	// config copied from base keeps api_key/base_url

	// patch model+provider, preserve api_key lines byte-for-byte
	if err := PatchProfile("newguy", ProfileInput{Model: "m2", Provider: "openai"}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(profileDir("newguy"), "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	if !strings.Contains(s, "api_key: sk-test") || !strings.Contains(s, "base_url: https://x/v1") {
		t.Errorf("other keys lost:\n%s", s)
	}
	if !strings.Contains(s, "default: m2") || !strings.Contains(s, "provider: openai") {
		t.Errorf("patch failed:\n%s", s)
	}
	q, _ := GetProfile("newguy")
	if q.Provider != "openai" || q.Model != "m2" {
		t.Errorf("reparse: %+v", q)
	}
	// system prompt patch
	sp := "new prompt"
	if err := PatchProfile("newguy", ProfileInput{SystemPrompt: &sp}); err != nil {
		t.Fatal(err)
	}
	q, _ = GetProfile("newguy")
	if q.SystemPrompt != "new prompt" {
		t.Errorf("prompt patch: %q", q.SystemPrompt)
	}
}

func TestProfileSkillsCreateReplaceAndClear(t *testing.T) {
	home := patchProfilesHome(t)
	os.MkdirAll(filepath.Join(home, "skills", "global-one"), 0o755)
	os.WriteFile(filepath.Join(home, "skills", "global-one", "SKILL.md"), []byte("---\nname: global-one\ndescription: test\n---\n"), 0o644)
	os.MkdirAll(filepath.Join(home, "skills", "global-two"), 0o755)
	os.WriteFile(filepath.Join(home, "skills", "global-two", "SKILL.md"), []byte("---\nname: global-two\ndescription: test\n---\n"), 0o644)

	if err := CreateProfile("skills-user", ProfileInput{Provider: "custom", Skills: []string{"global-one", "global-one"}}); err != nil {
		t.Fatal(err)
	}
	p, err := GetProfile("skills-user")
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Skills) != 1 || p.Skills[0] != "global-one" {
		t.Fatalf("created skills: %v", p.Skills)
	}
	if _, err := os.Stat(filepath.Join(home, "profiles", "skills-user", "skills", "global-one", "SKILL.md")); err != nil {
		t.Fatalf("worker skill link missing: %v", err)
	}
	if raw, err := os.ReadFile(filepath.Join(home, "profiles", "skills-user", "skills.json")); err != nil || !strings.Contains(string(raw), "global-one") {
		t.Fatalf("skills metadata missing: %s %v", raw, err)
	}
	if err := PatchProfile("skills-user", ProfileInput{Skills: []string{"global-two"}, SkillsSet: true}); err != nil {
		t.Fatal(err)
	}
	p, _ = GetProfile("skills-user")
	if len(p.Skills) != 1 || p.Skills[0] != "global-two" {
		t.Fatalf("replaced skills: %v", p.Skills)
	}
	if err := PatchProfile("skills-user", ProfileInput{Skills: []string{}, SkillsSet: true}); err != nil {
		t.Fatal(err)
	}
	p, _ = GetProfile("skills-user")
	if len(p.Skills) != 0 {
		t.Fatalf("cleared skills: %v", p.Skills)
	}
	if err := PatchProfile("skills-user", ProfileInput{Skills: []string{"missing"}, SkillsSet: true}); err == nil {
		t.Fatal("unknown skill accepted")
	}
}

// helper: second call returns profiles dir of temp home (keeps test independent)
func patchProfilesHome2(t *testing.T) string {
	return filepath.Join(profileDir("newguy"))
}

func TestDeleteProfile(t *testing.T) {
	patchProfilesHome(t)
	if err := CreateProfile("gone", ProfileInput{Provider: "custom"}); err != nil {
		t.Fatal(err)
	}
	if err := DeleteProfile("gone"); err != nil {
		t.Fatal(err)
	}
	if profileExists("gone") {
		t.Error("profile still exists")
	}
	if err := DeleteProfile("default"); err == nil {
		t.Error("default deleted")
	}
	if err := DeleteProfile("ghost"); err == nil {
		t.Error("ghost deleted")
	}
}

func TestWorkspaceCRUD(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	// pre-existing file with extra keys (luvus id) that must survive edits
	wsPath := filepath.Join(home, "workspaces.json")
	os.WriteFile(wsPath, []byte(`{"version":1,"workspaces":[{"id":"a","name":"a","path":"/tmp/a","host":"mac-tailscale","kind":"dir","luvus_workspace_id":"keepme"}]}`), 0o600)

	list, err := ListWorkspaces()
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v %v", list, err)
	}
	if list[0].Status != "unknown" {
		t.Errorf("status: %q", list[0].Status)
	}

	// update existing + create new
	if err := SaveWorkspace(&Workspace{ID: "a", Name: "a2", Path: "/tmp/aa", Host: "mac-tailscale", Kind: "dir"}); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkspace(&Workspace{ID: "b", Name: "b", Path: "/tmp/b", Host: "", Kind: "dir"}); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkspace(&Workspace{ID: "", Name: "x"}); err == nil {
		t.Error("empty id accepted")
	}

	raw, _ := os.ReadFile(wsPath)
	var f struct {
		Workspaces []map[string]json.RawMessage `json:"workspaces"`
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Workspaces) != 2 {
		t.Fatalf("want 2 ws, got %d: %s", len(f.Workspaces), raw)
	}
	byID := map[string]map[string]json.RawMessage{}
	for _, m := range f.Workspaces {
		var id string
		json.Unmarshal(m["id"], &id)
		byID[id] = m
	}
	if v, ok := byID["a"]["luvus_workspace_id"]; !ok || string(v) != `"keepme"` {
		t.Errorf("extra key lost: %v", byID["a"])
	}
	var name string
	json.Unmarshal(byID["a"]["name"], &name)
	if name != "a2" {
		t.Errorf("name not updated: %q", name)
	}

	if err := DeleteWorkspace("a"); err != nil {
		t.Fatal(err)
	}
	list, _ = ListWorkspaces()
	if len(list) != 1 || list[0].ID != "b" {
		t.Errorf("after delete: %+v", list)
	}
	if err := DeleteWorkspace("zz"); err == nil {
		t.Error("delete ghost accepted")
	}
}

func TestPingLocal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	dir := filepath.Join(home, "ws")
	os.MkdirAll(dir, 0o755)
	r := PingWorkspace(&Workspace{ID: "x", Path: dir, Host: ""})
	if r.Status != "connected" {
		t.Errorf("local ping: %+v", r)
	}
	r = PingWorkspace(&Workspace{ID: "x", Path: filepath.Join(home, "nope"), Host: ""})
	if r.Status != "unreachable" {
		t.Errorf("missing path: %+v", r)
	}
}

func ptr(s string) *string { return &s }
