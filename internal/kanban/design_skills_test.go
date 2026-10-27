package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTestSkill(t *testing.T, root, name, body string) {
	t.Helper()
	dir := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func designSkillTestRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("SWITCHYARD_SKILL_ROOTS", root)
	return root
}

func writeAllDesignSkills(t *testing.T, root string) {
	t.Helper()
	names := append(append([]string{}, DesignAutoSkills...), DesignSkillImplement)
	for _, name := range names {
		writeTestSkill(t, root, name, "---\nname: "+name+"\ndescription: test skill\n---\n\n# "+name+"\n\nUse tokens, a type scale and real copy.")
	}
}

func TestDesignSkillPackAutoLoadsForPenCards(t *testing.T) {
	root := designSkillTestRoot(t)
	writeAllDesignSkills(t, root)

	pack := DesignSkillPackForTask("Design a settings screen", "pen_cli", "design_only")
	if pack.Empty() {
		t.Fatal("pen card got an empty skill pack")
	}
	if len(pack.Missing) != 0 {
		t.Fatalf("unexpected missing skills: %v", pack.Missing)
	}
	for _, name := range DesignAutoSkills {
		if !strings.Contains(pack.Markdown, "### Skill: "+name) {
			t.Errorf("pack missing auto skill %q:\n%s", name, pack.Markdown)
		}
	}
	if strings.Contains(pack.Markdown, "### Skill: "+DesignSkillImplement) {
		t.Errorf("implement-brand-system must not be auto-loaded:\n%s", pack.Markdown)
	}
	if !strings.Contains(pack.Markdown, "--- Design standards") || !strings.Contains(pack.Markdown, "--- End design standards ---") {
		t.Errorf("pack is not fenced as design standards:\n%s", pack.Markdown)
	}
}

func TestDesignSkillPackAddsSummonedImplementationSkill(t *testing.T) {
	root := designSkillTestRoot(t)
	writeAllDesignSkills(t, root)

	pack := DesignSkillPackForTask("Implement the settings screen with $implement-brand-system", "pen_cli", "design_and_code")
	if !strings.Contains(pack.Markdown, "### Skill: "+DesignSkillImplement) {
		t.Errorf("summoned implementation skill was not loaded:\n%s", pack.Markdown)
	}
	for _, name := range DesignAutoSkills {
		if !strings.Contains(pack.Markdown, "### Skill: "+name) {
			t.Errorf("auto skill %q disappeared when adding implement-brand-system", name)
		}
	}
	if !strings.Contains(pack.Markdown, "continues to implementation") {
		t.Errorf("design_and_code pack should note the implementation phase:\n%s", pack.Markdown)
	}
	if len(pack.Names) == 0 || pack.Names[0] != DesignSkillImplement {
		t.Errorf("summoned skill should render first so the cap cannot drop it: %v", pack.Names)
	}
}

func TestDesignSkillPackSkipsAutoSkillsForPlainCards(t *testing.T) {
	root := designSkillTestRoot(t)
	writeAllDesignSkills(t, root)

	if pack := DesignSkillPackForTask("Fix the API", "", ""); !pack.Empty() {
		t.Fatalf("plain card got a skill pack:\n%s", pack.Markdown)
	}

	pack := DesignSkillPackForTask("Fix headings with $better-typography", "", "")
	if !strings.Contains(pack.Markdown, "### Skill: "+DesignSkillTypography) {
		t.Errorf("explicit $skill was not loaded on a plain card:\n%s", pack.Markdown)
	}
	if strings.Contains(pack.Markdown, "### Skill: "+DesignSkillBrand) {
		t.Errorf("plain card should not get the brand-system auto skill:\n%s", pack.Markdown)
	}
	if !strings.Contains(pack.Markdown, "--- Skill references") {
		t.Errorf("plain card should use the reference header:\n%s", pack.Markdown)
	}
}

func TestDesignSkillPackReportsMissingSkills(t *testing.T) {
	designSkillTestRoot(t) // empty root

	pack := DesignSkillPackForTask("Design a screen", "pen_cli", "design_only")
	if !pack.Empty() {
		t.Fatalf("pack should be empty when every skill is missing:\n%s", pack.Markdown)
	}
	if len(pack.Missing) != len(DesignAutoSkills) {
		t.Fatalf("missing = %v, want %v", pack.Missing, DesignAutoSkills)
	}
}

func TestDesignSkillPackCapsRunawaySkill(t *testing.T) {
	root := designSkillTestRoot(t)
	writeTestSkill(t, root, DesignSkillPen, strings.Repeat("line of guidance\n", 4000))

	pack := DesignSkillPackForTask("Design a screen", "pen_cli", "design_only")
	if pack.Empty() {
		t.Fatal("pack is empty")
	}
	if len(pack.Markdown) > designSkillPackBytes+200 {
		t.Fatalf("pack length = %d, want <= %d", len(pack.Markdown), designSkillPackBytes+200)
	}
	if !strings.Contains(pack.Markdown, "truncated") {
		t.Errorf("capped pack should say it was truncated")
	}
}

func TestDesignSkillPackIgnoresUnknownDollarTokens(t *testing.T) {
	designSkillTestRoot(t) // empty root

	pack := DesignSkillPackForTask("Run echo $HOME and print $PATH", "", "")
	if !pack.Empty() {
		t.Fatalf("plain card got a skill pack:\n%s", pack.Markdown)
	}
	if len(pack.Missing) != 0 {
		t.Fatalf("unknown shell variables must not be reported as missing skills: %v", pack.Missing)
	}
}

func TestLoadDesignSkillFindsFrontmatterAlias(t *testing.T) {
	root := designSkillTestRoot(t)
	writeTestSkill(t, root, "category/real-name", "---\nname: alias-name\ndescription: aliased\n---\n\nbody")

	skill, err := LoadDesignSkill("alias-name")
	if err != nil {
		t.Fatalf("LoadDesignSkill: %v", err)
	}
	if skill.Name != "alias-name" || !strings.Contains(skill.Content, "body") {
		t.Fatalf("unexpected skill: %+v", skill)
	}
}

func TestLoadDesignSkillRejectsTraversal(t *testing.T) {
	designSkillTestRoot(t)
	for _, name := range []string{"../etc", "/etc/passwd", "a/../../b", `foo$bar`, "..", ""} {
		if _, err := LoadDesignSkill(name); err == nil {
			t.Errorf("LoadDesignSkill(%q) accepted an unsafe name", name)
		}
	}
}

func TestSummonedSkillNamesDeduplicates(t *testing.T) {
	got := SummonedSkillNames("$pen-dev then $pen-dev and $implement-brand-system\n$better-typography")
	want := []string{"pen-dev", "implement-brand-system", "better-typography"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}
