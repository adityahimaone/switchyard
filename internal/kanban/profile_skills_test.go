package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProfileSkillContentIsScopedAndAtomic(t *testing.T) {
	home := patchProfilesHome(t)
	if err := WriteProfileSkill("base", "local", "# Local\n"); err != nil {
		t.Fatal(err)
	}
	got, err := ReadProfileSkill("base", "local")
	if err != nil || got != "# Local\n" {
		t.Fatalf("read profile skill: %q %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(home, "skills", "local", "SKILL.md")); !os.IsNotExist(err) {
		t.Fatal("profile write touched global skills")
	}
	if err := WriteProfileSkill("base", "../escape", "bad"); err == nil {
		t.Fatal("traversal skill accepted")
	}
}

func TestListProfileSkillsDoesNotLeakOtherProfile(t *testing.T) {
	patchProfilesHome(t)
	if err := WriteProfileSkill("base", "one", "one"); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(hermesHome(), "profiles", "other", "skills", "two"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hermesHome(), "profiles", "other", "skills", "two", "SKILL.md"), []byte("two"), 0o600); err != nil {
		t.Fatal(err)
	}
	items, err := ListProfileSkills("base")
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item == "two" {
			t.Fatalf("other profile skill leaked: %v", items)
		}
	}
	if !containsString(items, "one") {
		t.Fatalf("profile skill missing: %v", items)
	}
}
