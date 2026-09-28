package kanban

import (
	"os"
	"path/filepath"
	"testing"
)

// writeSkill creates <hermes>/skills/<rel>/SKILL.md with a minimal frontmatter.
func writeSkill(t *testing.T, rel string) {
	t.Helper()
	dir := filepath.Join(hermesHome(), "skills", filepath.FromSlash(rel))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := "---\nname: " + filepath.Base(rel) + "\ndescription: test skill\n---\n\nbody\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

// writeHubLock writes the `npx skills` lockfile used to determine origin.
func writeHubLock(t *testing.T, body string) {
	t.Helper()
	dir := filepath.Join(hermesHome(), "skills", ".hub")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lock.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func skillByName(skills []SkillMeta, name string) (SkillMeta, bool) {
	for _, s := range skills {
		if s.Name == name {
			return s, true
		}
	}
	return SkillMeta{}, false
}

// A skill installed through `npx skills` carries trust_level "community" and
// must be reported as OriginNpx.
func TestListSkillsMarksHubInstalledAsNpx(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeSkill(t, "frontend-architect")
	writeSkill(t, "impeccable")
	writeHubLock(t, `{
	  "version": 1,
	  "installed": {
	    "frontend-architect": {"source": "skills.sh", "trust_level": "community", "install_path": "frontend-architect"},
	    "impeccable": {"source": "github", "trust_level": "community", "install_path": "impeccable"}
	  }
	}`)
	skills, err := ListSkills()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"frontend-architect", "impeccable"} {
		s, ok := skillByName(skills, name)
		if !ok {
			t.Fatalf("%s missing from %v", name, skills)
		}
		if s.Origin != OriginNpx {
			t.Errorf("%s origin = %q, want %q", name, s.Origin, OriginNpx)
		}
	}
	if s, _ := skillByName(skills, "frontend-architect"); s.OriginSource != "skills.sh" {
		t.Errorf("origin_source = %q, want skills.sh", s.OriginSource)
	}
}

// official entries ship with hermes and must not be reported as npx installs.
func TestListSkillsMarksOfficialAsHermes(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeSkill(t, "yuanbao")
	writeHubLock(t, `{
	  "version": 1,
	  "installed": {
	    "yuanbao": {"source": "official", "trust_level": "builtin", "install_path": "yuanbao"}
	  }
	}`)
	skills, err := ListSkills()
	if err != nil {
		t.Fatal(err)
	}
	s, ok := skillByName(skills, "yuanbao")
	if !ok {
		t.Fatalf("yuanbao missing from %v", skills)
	}
	if s.Origin != OriginHermes {
		t.Errorf("origin = %q, want %q", s.Origin, OriginHermes)
	}
	if s.OriginSource != "official" {
		t.Errorf("origin_source = %q, want official", s.OriginSource)
	}
}

// A nested skill must join on install_path, not the flat lockfile key, so
// category/name entries are still classified.
func TestListSkillsJoinsNestedSkillOnInstallPath(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeSkill(t, "creative/pixel-art")
	writeHubLock(t, `{
	  "version": 1,
	  "installed": {
	    "pixel-art": {"source": "skills.sh", "trust_level": "community", "install_path": "creative/pixel-art"}
	  }
	}`)
	skills, err := ListSkills()
	if err != nil {
		t.Fatal(err)
	}
	s, ok := skillByName(skills, "pixel-art")
	if !ok {
		t.Fatalf("pixel-art missing from %v", skills)
	}
	if s.Path != "creative/pixel-art" {
		t.Errorf("path = %q, want creative/pixel-art", s.Path)
	}
	if s.Origin != OriginNpx {
		t.Errorf("origin = %q, want %q for a nested install_path join", s.Origin, OriginNpx)
	}
}

// Skills with no lockfile entry have no provenance at all. They must still be
// listed, in the hermes bucket, with an explicit untracked source so the UI can
// say so rather than implying hermes authored them.
func TestListSkillsTreatsUntrackedAsHermes(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeSkill(t, "animate")
	writeSkill(t, "animation-vocabulary")
	skills, err := ListSkills()
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 2 {
		t.Fatalf("want 2 skills, got %v", skills)
	}
	for _, s := range skills {
		if s.Origin != OriginHermes {
			t.Errorf("%s origin = %q, want %q", s.Name, s.Origin, OriginHermes)
		}
		if s.OriginSource != "untracked" {
			t.Errorf("%s origin_source = %q, want untracked", s.Name, s.OriginSource)
		}
	}
}

// A corrupt lockfile must not break the listing or mark skills as npx.
func TestListSkillsToleratesCorruptLockfile(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeSkill(t, "animate")
	writeHubLock(t, "{not json at all")
	skills, err := ListSkills()
	if err != nil {
		t.Fatalf("corrupt lockfile must not fail the listing: %v", err)
	}
	if len(skills) != 1 || skills[0].Origin != OriginHermes {
		t.Fatalf("skills = %v, want a single hermes-origin skill", skills)
	}
}

// Entries without install_path fall back to the lockfile key.
func TestSkillOriginsFallsBackToLockKey(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	writeHubLock(t, `{
	  "version": 1,
	  "installed": {
	    "no-path-skill": {"source": "github", "trust_level": "community"}
	  }
	}`)
	origins := skillOrigins()
	entry, ok := origins["no-path-skill"]
	if !ok {
		t.Fatalf("expected fallback key lookup, got %v", origins)
	}
	origin, _ := classifySkillOrigin(entry)
	if origin != OriginNpx {
		t.Fatalf("origin = %q, want %q", origin, OriginNpx)
	}
}

func TestClassifySkillOriginTrustLevels(t *testing.T) {
	if o, s := classifySkillOrigin(hubEntry{source: "skills.sh", trust: "community"}); o != OriginNpx || s != "skills.sh" {
		t.Errorf("community = (%q,%q), want (%q, skills.sh)", o, s, OriginNpx)
	}
	if o, s := classifySkillOrigin(hubEntry{source: "local", trust: "COMMUNITY"}); o != OriginNpx || s != "local" {
		t.Errorf("case-insensitive community = (%q,%q), want (%q, local)", o, s, OriginNpx)
	}
	if o, s := classifySkillOrigin(hubEntry{source: "official", trust: "builtin"}); o != OriginHermes || s != "official" {
		t.Errorf("builtin = (%q,%q), want (%q, official)", o, s, OriginHermes)
	}
	// A lockfile entry with no source still has a record, so it must not be
	// reported as untracked.
	if o, s := classifySkillOrigin(hubEntry{trust: "community"}); o != OriginNpx || s != "untracked" {
		t.Errorf("sourceless = (%q,%q), want (%q, untracked)", o, s, OriginNpx)
	}
}
