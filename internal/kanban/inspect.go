package kanban

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ---- Logs (read-only, mirrors hermes-webui _handle_logs) ----

// logWhitelist: fixed keys -> filenames under <hermes>/logs. No
// user-controlled filenames (traversal-safe by construction).
var logWhitelist = map[string]string{
	"agent":   "agent.log",
	"errors":  "errors.log",
	"gateway": "gateway.log",
	"gui":     "gui.log",
	"mcp":     "mcp-stderr.log",
	"update":  "update.log",
}

var logTailValues = map[int]bool{100: true, 200: true, 500: true, 1000: true}

const (
	logDefaultTail = 200
	logMaxBytes    = 4 * 1024 * 1024
)

// LogTail is the response shape for GET /api/logs.
type LogTail struct {
	File       string   `json:"file"`
	Tail       int      `json:"tail"`
	Lines      []string `json:"lines"`
	Truncated  bool     `json:"truncated"`
	TotalBytes int64    `json:"total_bytes"`
	Mtime      *float64 `json:"mtime"`
	Hint       string   `json:"hint,omitempty"`
}

// NormalizeTail parses the tail param; only whitelisted sizes survive.
func NormalizeTail(raw string) int {
	n := 0
	if _, err := fmt.Sscanf(strings.TrimSpace(raw), "%d", &n); err != nil || !logTailValues[n] {
		return logDefaultTail
	}
	return n
}

// ReadLogTail returns a bounded tail of a whitelisted hermes log file.
func ReadLogTail(fileKey, rawTail string) (LogTail, error) {
	filename, ok := logWhitelist[fileKey]
	if !ok {
		return LogTail{}, errors.New("unknown log file")
	}
	tail := NormalizeTail(rawTail)
	out := LogTail{File: fileKey, Tail: tail, Lines: []string{}}

	logPath := filepath.Join(hermesHome(), "logs", filename)
	// defense in depth: stay under logs dir
	if filepath.Dir(logPath) != filepath.Join(hermesHome(), "logs") {
		return LogTail{}, errors.New("unknown log file")
	}
	st, err := os.Stat(logPath)
	if err != nil || st.IsDir() {
		out.Hint = "Log file for " + fileKey + " not found yet."
		return out, nil
	}
	out.TotalBytes = st.Size()
	mt := float64(st.ModTime().UnixNano()) / 1e9
	out.Mtime = &mt
	out.Truncated = out.TotalBytes > logMaxBytes

	f, err := os.Open(logPath)
	if err != nil {
		return LogTail{}, err
	}
	defer f.Close()

	readBytes := out.TotalBytes
	if readBytes > logMaxBytes {
		readBytes = logMaxBytes
		if _, err := f.Seek(-logMaxBytes, 2); err != nil {
			return LogTail{}, err
		}
	}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var lines []string
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	if lines == nil {
		lines = []string{}
	}
	if len(lines) > tail {
		lines = lines[len(lines)-tail:]
	}
	out.Lines = lines
	return out, nil
}

// ---- Skills (read-only, mirrors hermes-web-go skillsmem) ----

// SkillMeta is one entry for GET /api/skills.
type SkillMeta struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category,omitempty"`
	Path        string `json:"path,omitempty"`
}

const skillMaxDescription = 200

var skillExcludedDirs = map[string]bool{
	".git": true, ".archive": true, "__pycache__": true, "node_modules": true, ".venv": true, "venv": true,
}

// ListSkills walks <hermes>/skills for SKILL.md files and returns
// frontmatter-derived name/description with category from the rel path.
func ListSkills() ([]SkillMeta, error) {
	root := filepath.Join(hermesHome(), "skills")
	var out []SkillMeta
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && (skillExcludedDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
			return filepath.SkipDir
		}
		if d.IsDir() || d.Name() != "SKILL.md" {
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		meta := parseFrontmatter(string(content))
		name := meta["name"]
		if name == "" {
			name = filepath.Base(filepath.Dir(path))
		}
		if name == "" {
			return nil
		}
		desc := meta["description"]
		if desc == "" {
			desc = firstBodyLine(string(content))
		}
		if len(desc) > skillMaxDescription {
			desc = desc[:skillMaxDescription-3] + "..."
		}
		rel, _ := filepath.Rel(root, filepath.Dir(path))
		out = append(out, SkillMeta{
			Name:        name,
			Description: desc,
			Category:    categoryFor(rel),
			Path:        rel,
		})
		return nil
	})
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// SkillContent returns the raw SKILL.md for one skill. Name must be a single
// path segment (no traversal) OR a nested rel path (category/name) with no "..".
func SkillContent(name string) (map[string]string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || strings.Contains(name, "..") {
		return nil, errors.New("invalid skill name")
	}
	if strings.ContainsAny(name, `\$`) {
		return nil, errors.New("invalid skill name")
	}
	root := filepath.Join(hermesHome(), "skills")
	// direct: <root>/<name>/SKILL.md (flat name or category/name)
	candidate := filepath.Join(root, name, "SKILL.md")
	clean := filepath.Clean(candidate)
	if !strings.HasPrefix(clean, root+string(filepath.Separator)) {
		return nil, errors.New("invalid skill name")
	}
	if _, err := os.Stat(clean); err == nil {
		content, err := os.ReadFile(clean)
		if err != nil {
			return nil, err
		}
		return map[string]string{"name": name, "content": string(content)}, nil
	}
	// fallback: match dir basename or frontmatter name
	var found string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || found != "" {
			return nil
		}
		if d.IsDir() && skillExcludedDirs[d.Name()] {
			return filepath.SkipDir
		}
		if !d.IsDir() && d.Name() == "SKILL.md" &&
			(strings.EqualFold(filepath.Base(filepath.Dir(p)), name) ||
				parseFrontmatter(readFileOrEmpty(p))["name"] == name) {
			found = p
		}
		return nil
	})
	if found == "" {
		return nil, os.ErrNotExist
	}
	content, err := os.ReadFile(found)
	if err != nil {
		return nil, err
	}
	return map[string]string{"name": name, "content": string(content)}, nil
}

func readFileOrEmpty(p string) string {
	b, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	return string(b)
}

func parseFrontmatter(content string) map[string]string {
	out := make(map[string]string)
	lines := strings.Split(content, "\n")
	if len(lines) < 3 || strings.TrimSpace(lines[0]) != "---" {
		return out
	}
	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			break
		}
		if i := strings.Index(trimmed, ":"); i > 0 {
			key := strings.TrimSpace(trimmed[:i])
			value := strings.TrimSpace(trimmed[i+1:])
			value = strings.Trim(value, `"'`)
			out[key] = value
		}
	}
	return out
}

func firstBodyLine(content string) string {
	lines := strings.Split(content, "\n")
	inFM := len(lines) > 0 && strings.TrimSpace(lines[0]) == "---"
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if inFM {
			if trimmed == "---" {
				inFM = false
			}
			if i == 0 {
				continue
			}
			continue
		}
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			return trimmed
		}
	}
	return ""
}

func categoryFor(rel string) string {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	if len(parts) >= 1 && parts[0] != "." {
		return parts[0]
	}
	return ""
}

// ---- Memory (read-only, mirrors hermes-web-go skillsmem.ReadMemory) ----

// MemorySnapshot is the response shape for GET /api/memory.
type MemorySnapshot struct {
	Memory      string   `json:"memory"`
	User        string   `json:"user"`
	Soul        string   `json:"soul"`
	MemoryPath  string   `json:"memory_path"`
	UserPath    string   `json:"user_path"`
	SoulPath    string   `json:"soul_path"`
	MemoryMtime *float64 `json:"memory_mtime"`
	UserMtime   *float64 `json:"user_mtime"`
	SoulMtime   *float64 `json:"soul_mtime"`
}

// ReadMemory returns MEMORY.md/USER.md (memories/) + SOUL.md (home root).
func ReadMemory() (*MemorySnapshot, error) {
	home := hermesHome()
	s := &MemorySnapshot{
		MemoryPath: filepath.Join(home, "memories", "MEMORY.md"),
		UserPath:   filepath.Join(home, "memories", "USER.md"),
		SoulPath:   filepath.Join(home, "SOUL.md"),
	}
	read := func(path string) (string, *float64) {
		fi, err := os.Stat(path)
		if err != nil {
			return "", nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return "", nil
		}
		mt := float64(fi.ModTime().Unix())
		return string(content), &mt
	}
	s.Memory, s.MemoryMtime = read(s.MemoryPath)
	s.User, s.UserMtime = read(s.UserPath)
	s.Soul, s.SoulMtime = read(s.SoulPath)
	return s, nil
}
