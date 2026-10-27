package kanban

// Design-time skill loading.
//
// A pen.dev card starts with the card's prose and nothing else. The three
// design skills carry the missing context: the brand-system method, the pen
// mechanics, and the typographic rules. The dispatcher loads them from the
// control plane's global skill roots and appends one "Design standards" pack
// to the pen brief.
//
// implement-brand-system is deliberately not in DesignAutoSkills. It starts
// editing application code, so a design-only card must not load it by
// accident; it is loaded only when the task explicitly summons it with
// $implement-brand-system.

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	DesignSkillBrand      = "sunnyside-brand-system"
	DesignSkillPen        = "pen-dev"
	DesignSkillTypography = "better-typography"
	DesignSkillImplement  = "implement-brand-system"
)

// DesignAutoSkills are loaded for every pen.dev card. Order is the order the
// pack renders in: method first, then the tool, then the type rules.
var DesignAutoSkills = []string{DesignSkillBrand, DesignSkillPen, DesignSkillTypography}

// DesignOptionalSkills are installed and discoverable, but never auto-loaded.
var DesignOptionalSkills = []string{DesignSkillImplement}

const (
	// One skill is capped so a long reference cannot crowd the others out of
	// the brief; the total cap keeps the pen prompt in a useful range. The
	// resolved pack is ~22 KB with all four skills, which is a brief, not a
	// context dump: the first 5.5 KB of each skill carries the method.
	designSkillPerSkillBytes = 5500
	designSkillPackBytes     = 24000
)

// DesignSkill is one installed SKILL.md, ready to embed in a prompt.
type DesignSkill struct {
	Name    string
	Path    string
	Content string
	Bytes   int
}

// DesignSkillPack is the rendered prompt block plus what was and was not found.
type DesignSkillPack struct {
	Markdown string
	Names    []string
	Missing  []string
}

func (p DesignSkillPack) Empty() bool { return strings.TrimSpace(p.Markdown) == "" }

var skillNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]*$`)

func validSkillName(name string) bool {
	if name == "" || strings.Contains(name, "..") || strings.HasPrefix(name, "/") {
		return false
	}
	if strings.ContainsAny(name, `\$`) {
		return false
	}
	return skillNamePattern.MatchString(name)
}

func designSkillKnown(name string) bool {
	return containsString(DesignAutoSkills, name) || containsString(DesignOptionalSkills, name)
}

// DesignSkillRoots returns the global skill directories, in precedence order.
// SWITCHYARD_SKILL_ROOTS is an explicit, testable override; otherwise the
// Hermes registry is read first and the npx universal directory second. The
// installer writes to ~/.agents/skills, while the app registry historically
// read ~/.hermes/skills, so both have to be visible here.
func DesignSkillRoots() []string {
	if raw := strings.TrimSpace(os.Getenv("SWITCHYARD_SKILL_ROOTS")); raw != "" {
		var out []string
		for _, p := range strings.Split(raw, string(os.PathListSeparator)) {
			p = strings.TrimSpace(p)
			if p == "" || containsString(out, p) {
				continue
			}
			out = append(out, p)
		}
		return out
	}
	roots := []string{filepath.Join(hermesHome(), "skills")}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots, filepath.Join(home, ".agents", "skills"))
	}
	return roots
}

// LoadDesignSkill reads one skill by directory name or frontmatter name. A
// missing skill is an error, not an empty string: the dispatcher records it so
// a broken install is visible in the log instead of silently shrinking the
// brief.
func LoadDesignSkill(name string) (DesignSkill, error) {
	name = strings.TrimSpace(name)
	if !validSkillName(name) {
		return DesignSkill{}, fmt.Errorf("invalid skill name %q", name)
	}
	for _, root := range DesignSkillRoots() {
		path := filepath.Join(root, filepath.FromSlash(name), "SKILL.md")
		if data, err := os.ReadFile(path); err == nil {
			return newDesignSkill(name, path, data), nil
		}
		if path, ok := findSkillFile(root, name); ok {
			if data, err := os.ReadFile(path); err == nil {
				return newDesignSkill(name, path, data), nil
			}
		}
	}
	return DesignSkill{}, os.ErrNotExist
}

func newDesignSkill(name, path string, data []byte) DesignSkill {
	content := strings.TrimSpace(string(data))
	return DesignSkill{Name: name, Path: path, Content: content, Bytes: len(content)}
}

// findSkillFile walks a root for a nested skill whose directory basename or
// frontmatter name matches. The direct path is tried first, so this only runs
// for category-style installs and for the first lookup after an install moved.
func findSkillFile(root, name string) (string, bool) {
	root = filepath.Clean(root)
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", false
	}
	var found string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || found != "" {
			return nil
		}
		if d.IsDir() {
			if path != root && (skillExcludedDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() != "SKILL.md" {
			return nil
		}
		dir := filepath.Base(filepath.Dir(path))
		if !strings.EqualFold(dir, name) && parseFrontmatter(readFileOrEmpty(path))["name"] != name {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			found = path
		}
		return nil
	})
	return found, found != ""
}

// SummonedSkillNames returns the $skill mentions in a task body, in order and
// without duplicates. It matches the same token the create dialog inserts.
func SummonedSkillNames(body string) []string {
	matches := summonedSkillPattern.FindAllStringSubmatch(body, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if name := m[1]; !containsString(out, name) {
			out = append(out, name)
		}
	}
	return out
}

var summonedSkillPattern = regexp.MustCompile(`(?:^|\s)\$([A-Za-z0-9][A-Za-z0-9_-]*)`)

// DesignSkillPackForTask composes the brief for one dispatch. A pen.dev card
// always gets the three auto skills; any $skill mention in the body is added
// on top, which is how implement-brand-system is opted into. A non-design card
// only gets the skills it explicitly summons.
func DesignSkillPackForTask(body, designTool, designScope string) DesignSkillPack {
	tool := strings.ToLower(strings.TrimSpace(designTool))
	designTask := tool == "pen_cli" || tool == "pencil_mcp"

	names := make([]string, 0, len(DesignAutoSkills)+2)
	if designTask {
		names = append(names, DesignAutoSkills...)
	}
	explicit := make(map[string]bool, len(DesignOptionalSkills))
	for _, name := range SummonedSkillNames(body) {
		explicit[name] = true
		if !containsString(names, name) {
			names = append(names, name)
		}
	}
	if len(names) == 0 {
		return DesignSkillPack{}
	}

	loaded := make([]DesignSkill, 0, len(names))
	missing := make([]string, 0)
	for _, name := range names {
		skill, err := LoadDesignSkill(name)
		if err != nil {
			// A plain shell card can legitimately contain $HOME or $PATH.
			// Only the design skill names are worth reporting as missing;
			// an unknown token is not a typo the dispatcher should log on
			// every run.
			if designSkillKnown(name) {
				missing = append(missing, name)
			}
			continue
		}
		loaded = append(loaded, skill)
	}
	if len(loaded) == 0 {
		return DesignSkillPack{Missing: missing}
	}
	// A skill the author explicitly summoned must not be the one the cap
	// silently drops. Render those first, then the auto method skills.
	ordered := make([]DesignSkill, 0, len(loaded))
	for _, skill := range loaded {
		if explicit[skill.Name] {
			ordered = append(ordered, skill)
		}
	}
	for _, skill := range loaded {
		if !explicit[skill.Name] {
			ordered = append(ordered, skill)
		}
	}
	loaded = ordered

	var b strings.Builder
	if designTask {
		b.WriteString("--- Design standards (auto-loaded skills) ---\n")
		b.WriteString("The control plane loaded the following installed design skills for this card. Apply their method, tokens and guardrails. The deliverable is a pen.dev `.pen` file and its PNG export; skip steps that only apply to shipping HTML/TSX.\n\n")
		b.WriteString("Before drawing, decide and state: canvas size, background, one accent, three type sizes, spacing rhythm, and the full section map. Fill the canvas with real content and real copy - no lorem ipsum, no empty placeholder frames, no generic AI gradient.\n\n")
		if strings.EqualFold(strings.TrimSpace(designScope), "design_and_code") {
			b.WriteString("This card continues to implementation after the mock. The `.pen` stays the reference; code follows the tokens. `implement-brand-system` is not auto-loaded: it is included only when the task summons it with $implement-brand-system.\n\n")
		}
	} else {
		b.WriteString("--- Skill references (loaded from the task prompt) ---\n")
		b.WriteString("The task summons the following installed skills. Apply them to this run.\n\n")
	}

	used := make([]string, 0, len(loaded))
	for _, skill := range loaded {
		remaining := designSkillPackBytes - b.Len() - 160
		if remaining < 400 {
			break
		}
		content := skill.Content
		if len(content) > designSkillPerSkillBytes {
			content = truncateSkillAtLine(content, designSkillPerSkillBytes) + "\n\n[... skill truncated for the pen brief ...]"
		}
		if len(content) > remaining {
			content = truncateSkillAtLine(content, remaining) + "\n\n[... skill pack truncated ...]"
		}
		fmt.Fprintf(&b, "### Skill: %s\n\n%s\n\n", skill.Name, content)
		used = append(used, skill.Name)
	}

	if designTask {
		b.WriteString("--- End design standards ---")
	} else {
		b.WriteString("--- End skill references ---")
	}
	return DesignSkillPack{Markdown: strings.TrimSpace(b.String()), Names: used, Missing: missing}
}

// AppendDesignSkillPack puts the standards after the task context so the
// identity/context compaction that happens earlier cannot trim them away.
func AppendDesignSkillPack(msg, pack string) string {
	pack = strings.TrimSpace(pack)
	if pack == "" {
		return msg
	}
	return strings.TrimRight(msg, "\n") + "\n\n" + pack
}

// truncateSkillAtLine cuts on a line and rune boundary, never mid-word in the
// common case, so a capped skill still reads like a document.
func truncateSkillAtLine(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if len(s) <= max {
		return s
	}
	cut := max
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	if idx := strings.LastIndex(s[:cut], "\n"); idx > cut/2 {
		cut = idx
	}
	return strings.TrimRight(s[:cut], "\n ")
}
