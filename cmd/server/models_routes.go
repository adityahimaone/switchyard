package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type ModelOption struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Sublabel string `json:"sublabel,omitempty"`
	Badge    string `json:"badge,omitempty"`
	Pinned   bool   `json:"pinned,omitempty"`
	Disabled bool   `json:"disabled,omitempty"`
}

type ModelsResponse struct {
	Executor string        `json:"executor"`
	Models   []ModelOption `json:"models"`
}

var (
	modelsCacheMu sync.RWMutex
	modelsCache   = make(map[string]cachedModels)
)

type cachedModels struct {
	cachedAt time.Time
	models   []ModelOption
}

const modelsCacheTTL = 5 * time.Minute

func registerModelsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/models", func(w http.ResponseWriter, r *http.Request) {
		executor := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("executor")))
		if executor == "" {
			executor = "dsh"
		}
		if executor == "cmd" {
			executor = "commandcode"
		}
		refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("refresh") == "1"

		if !refresh {
			modelsCacheMu.RLock()
			cached, ok := modelsCache[executor]
			modelsCacheMu.RUnlock()
			if ok && time.Since(cached.cachedAt) < modelsCacheTTL && len(cached.models) > 0 {
				writeJSON(w, http.StatusOK, ModelsResponse{
					Executor: executor,
					Models:   cached.models,
				})
				return
			}
		}

		var models []ModelOption
		if executor == "dsh" {
			models = fetchDSHModels()
		} else if executor == "commandcode" {
			models = fetchCommandCodeModels()
		} else if executor == "pen" || executor == "pen_cli" || executor == "pencil" {
			models = fetchPenModels()
		} else {
			models = []ModelOption{}
		}

		modelsCacheMu.Lock()
		modelsCache[executor] = cachedModels{
			cachedAt: time.Now(),
			models:   models,
		}
		modelsCacheMu.Unlock()

		writeJSON(w, http.StatusOK, ModelsResponse{
			Executor: executor,
			Models:   models,
		})
	})
}

func fetchDSHModels() []ModelOption {
	candidates := []string{}
	if dshHome := os.Getenv("DSH_HOME"); dshHome != "" {
		candidates = append(candidates,
			filepath.Join(dshHome, "profiles", "web", "cordis.patch.yml"),
			filepath.Join(dshHome, "profiles", "headless", "cordis.patch.yml"),
		)
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidates = append(candidates,
			filepath.Join(home, ".dsh", "profiles", "web", "cordis.patch.yml"),
			filepath.Join(home, ".dsh", "profiles", "headless", "cordis.patch.yml"),
		)
	}
	candidates = append(candidates,
		"/home/adityahimaone/.dsh/profiles/web/cordis.patch.yml",
		"/home/adityahimaone/.dsh/profiles/headless/cordis.patch.yml",
		"/Users/adityahimawan/.dsh/profiles/web/cordis.patch.yml",
		"/Users/adityahimawan/.dsh/profiles/headless/cordis.patch.yml",
	)

	for _, path := range candidates {
		if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
			if parsed := parseCordisPatchModels(data); len(parsed) > 13 {
				return parsed
			}
		}
	}

	return getFallbackDSHModels()
}

func parseCordisPatchModels(data []byte) []ModelOption {
	official := []ModelOption{
		{Value: "deepseek-account:DeepSeek-V4.1-Flash", Label: "DeepSeek-V4.1-Flash", Badge: "DeepSeek Account", Pinned: true},
		{Value: "deepseek-account:DeepSeek-V4-Pro", Label: "DeepSeek-V4-Pro", Badge: "DeepSeek Account", Pinned: true},
		{Value: "deepseek:DeepSeek-V4.1-Flash", Label: "DeepSeek-V4.1-Flash", Badge: "DeepSeek", Pinned: true},
		{Value: "deepseek:DeepSeek-V4-Pro", Label: "DeepSeek-V4-Pro", Badge: "DeepSeek", Pinned: true},
	}

	pinnedRouter := []ModelOption{
		{Value: "adit-9router/kiro-cheap-combo-2", Label: "Kiro Cheap Combo 2", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/claude-office", Label: "Claude Office", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/free-combo-q4-2026", Label: "Free Combo Q4 2026", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/codex", Label: "Codex", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/f8", Label: "F8", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/free", Label: "Free", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/god", Label: "God Mode", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/cheap", Label: "Cheap", Badge: "adit-9router", Pinned: true},
		{Value: "adit-9router/premium", Label: "Premium", Badge: "adit-9router", Pinned: true},
	}

	seen := make(map[string]bool)
	for _, p := range official {
		seen[p.Value] = true
	}
	for _, p := range pinnedRouter {
		seen[p.Value] = true
		seen[strings.TrimPrefix(p.Value, "adit-9router/")] = true
	}

	var dynamicModels []ModelOption
	scanner := bufio.NewScanner(bytes.NewReader(data))
	insideModels := false
	idRe := regexp.MustCompile(`^\s*-\s*id:\s*([^\s#]+)`)

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if strings.Contains(line, "models:") {
			insideModels = true
			continue
		}
		// If another top-level section starts, stop models
		if insideModels && (strings.HasPrefix(line, "- id:") || (len(line) > 0 && line[0] != ' ' && line[0] != '\t' && line[0] != '#')) {
			insideModels = false
			continue
		}
		if insideModels {
			if strings.HasPrefix(trimmed, "- id:") {
				m := idRe.FindStringSubmatch(line)
				if len(m) > 1 {
					rawId := m[1]
					val := "adit-9router/" + rawId
					if seen[rawId] || seen[val] {
						continue
					}
					seen[rawId] = true
					seen[val] = true

					badge := "9router"
					label := rawId
					if strings.Contains(rawId, "/") {
						parts := strings.Split(rawId, "/")
						badge = parts[0]
						label = strings.Join(parts[1:], " · ")
					}

					dynamicModels = append(dynamicModels, ModelOption{
						Value:    val,
						Label:    label,
						Sublabel: rawId,
						Badge:    badge,
					})
				}
			}
		}
	}

	if len(dynamicModels) > 0 {
		var result []ModelOption
		result = append(result, official...)
		result = append(result, pinnedRouter...)
		result = append(result, dynamicModels...)
		return result
	}

	return getFallbackDSHModels()
}

func fetchCommandCodeModels() []ModelOption {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmdPaths := []string{"cmd", "/opt/homebrew/bin/cmd", "/usr/local/bin/cmd"}
	for _, bin := range cmdPaths {
		if path, err := exec.LookPath(bin); err == nil {
			cmd := exec.CommandContext(ctx, path, "--list-models")
			if out, err := cmd.Output(); err == nil && len(out) > 0 {
				if parsed := parseCommandCodeModels(out); len(parsed) > 0 {
					return parsed
				}
			}
			break
		}
	}

	return getFallbackCommandCodeModels()
}

func parseCommandCodeModels(data []byte) []ModelOption {
	var result []ModelOption
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(bytes.NewReader(data))

	lineRe := regexp.MustCompile(`^\s*([a-zA-Z0-9_\-\.\/:]+)\s{2,}(.+)$`)

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "Available models") || strings.HasPrefix(trimmed, "Pass the full id") || strings.HasPrefix(trimmed, "cmd --model") || strings.HasPrefix(trimmed, "Docs:") || strings.HasPrefix(trimmed, "Decision models") || strings.HasPrefix(trimmed, "typesafe/jev") {
			continue
		}
		if !strings.HasPrefix(line, " ") && !strings.Contains(line, "  ") {
			continue
		}

		m := lineRe.FindStringSubmatch(line)
		if len(m) == 3 {
			id := m[1]
			desc := strings.TrimSpace(m[2])
			if seen[id] {
				continue
			}
			seen[id] = true

			badge := ""
			isLocked := strings.Contains(desc, "(locked)")
			if isLocked {
				desc = strings.TrimSpace(strings.ReplaceAll(desc, "(locked)", ""))
			}

			lowerDesc := strings.ToLower(desc)
			if strings.Contains(lowerDesc, "recommended") {
				badge = "recommended"
			} else if strings.Contains(lowerDesc, "free") {
				badge = "free"
			} else if strings.Contains(lowerDesc, "default") {
				badge = "default"
			} else if strings.Contains(lowerDesc, "omni-modal") {
				badge = "omni-modal"
			} else if strings.Contains(lowerDesc, "1m context") {
				badge = "1M context"
			} else if strings.Contains(lowerDesc, "frontier") {
				badge = "frontier"
			} else if strings.Contains(lowerDesc, "fast") {
				badge = "fast"
			} else if isLocked {
				badge = "locked"
			}

			label := formatCleanModelLabel(id)
			if isLocked {
				label += " (locked)"
			}

			result = append(result, ModelOption{
				Value:    id,
				Label:    label,
				Sublabel: desc,
				Badge:    badge,
			})
		}
	}

	if len(result) > 0 {
		return result
	}
	return getFallbackCommandCodeModels()
}

func formatCleanModelLabel(id string) string {
	cleanName := id
	if strings.Contains(cleanName, "/") {
		parts := strings.Split(cleanName, "/")
		cleanName = parts[len(parts)-1]
	}
	words := strings.Split(cleanName, "-")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	name := strings.Join(words, " ")
	name = strings.ReplaceAll(name, "Qwen3.", "Qwen 3.")
	name = strings.ReplaceAll(name, "Grok 4.", "Grok 4.")
	name = strings.ReplaceAll(name, "Gemini 3.", "Gemini 3.")
	name = strings.ReplaceAll(name, "V4.", "V4.")
	name = strings.ReplaceAll(name, " 5 5", " 5.5")
	name = strings.ReplaceAll(name, " 5 1", " 5.1")
	name = strings.ReplaceAll(name, " 4 8", " 4.8")
	name = strings.ReplaceAll(name, " 4 7", " 4.7")
	name = strings.ReplaceAll(name, " 4 6", " 4.6")
	name = strings.ReplaceAll(name, " 4 5", " 4.5")
	name = strings.ReplaceAll(name, " 3 8", " 3.8")
	name = strings.ReplaceAll(name, " 3 7", " 3.7")
	name = strings.ReplaceAll(name, " 3 6", " 3.6")
	name = strings.ReplaceAll(name, " 3 5", " 3.5")
	name = strings.ReplaceAll(name, " 2 7", " 2.7")
	name = strings.ReplaceAll(name, " 2 6", " 2.6")
	name = strings.ReplaceAll(name, " 2 5", " 2.5")
	name = strings.ReplaceAll(name, " 2 1", " 2.1")
	name = strings.ReplaceAll(name, " 2 0", " 2.0")
	name = strings.ReplaceAll(name, " 1 5", " 1.5")
	name = strings.ReplaceAll(name, " 1 3", " 1.3")
	name = strings.ReplaceAll(name, " 1 2", " 1.2")
	name = strings.ReplaceAll(name, " 1 1", " 1.1")
	name = strings.ReplaceAll(name, " 1 0", " 1.0")
	return name
}

func fetchPenModels() []ModelOption {
	var models []ModelOption
	home, _ := os.UserHomeDir()
	pencilDir := ""
	if home != "" {
		pencilDir = filepath.Join(home, ".pencil")
	}

	// 1. Detect API keys from ~/.pencil/agent-auth
	agentAuth := make(map[string]string)
	if pencilDir != "" {
		if data, err := os.ReadFile(filepath.Join(pencilDir, "agent-auth")); err == nil {
			var parsed map[string]struct {
				Type string `json:"type"`
				Key  string `json:"key"`
			}
			if err := json.Unmarshal(data, &parsed); err == nil {
				for prov, entry := range parsed {
					if entry.Key != "" {
						agentAuth[strings.ToLower(prov)] = entry.Key
					}
				}
			}
		}
	}

	// 2. Check active pen.dev session
	hasActiveSession := false
	if pencilDir != "" {
		if _, err := os.Stat(filepath.Join(pencilDir, "session-desktop.json")); err == nil {
			hasActiveSession = true
		} else if _, err := os.Stat(filepath.Join(pencilDir, "session-cli.json")); err == nil {
			hasActiveSession = true
		}
	}
	if os.Getenv("PEN_CLI_KEY") != "" {
		hasActiveSession = true
	}

	sessionBadge := "Active Session"
	if !hasActiveSession {
		sessionBadge = "pen.dev"
	}

	// 3. Add Gemini models (primary pen.dev engine)
	geminiModels := []struct{ id, label string }{
		{"gemini-3.6-flash", "Gemini 3.6 Flash"},
		{"gemini-3.7-flash", "Gemini 3.7 Flash"},
		{"gemini-3.5-flash", "Gemini 3.5 Flash"},
		{"gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite"},
		{"gemini-3.1-pro-preview", "Gemini 3.1 Pro"},
	}
	for i, gm := range geminiModels {
		models = append(models, ModelOption{
			Value:    "gemini:" + gm.id,
			Label:    gm.label,
			Sublabel: "Google · pen.dev built-in",
			Badge:    sessionBadge,
			Pinned:   i < 2,
		})
	}

	// 4. Custom models from ~/.pencil/models-store.json (e.g. DeepSeek)
	hasDeepSeekKey := agentAuth["deepseek"] != "" || os.Getenv("DEEPSEEK_API_KEY") != ""
	deepseekBadge := "DeepSeek"
	if hasDeepSeekKey {
		deepseekBadge = "DeepSeek • API Key Set"
	}
	models = append(models, ModelOption{
		Value:    "deepseek:deepseek-flash",
		Label:    "DeepSeek V4.1 Flash",
		Sublabel: "DeepSeek API",
		Badge:    deepseekBadge,
		Pinned:   true,
	})
	models = append(models, ModelOption{
		Value:    "deepseek:deepseek-v4-pro",
		Label:    "DeepSeek V4 Pro",
		Sublabel: "DeepSeek API",
		Badge:    deepseekBadge,
	})

	// 5. 9Router models if configured
	if agentAuth["9router"] != "" || os.Getenv("NINEROUTER_API_KEY") != "" {
		models = append(models, ModelOption{
			Value:    "9router:codex",
			Label:    "9Router Codex",
			Sublabel: "9Router Proxy",
			Badge:    "9router • API Key Set",
			Pinned:   true,
		})
	}

	// 6. Claude models
	hasClaudeKey := agentAuth["claude"] != "" || agentAuth["anthropic"] != "" || os.Getenv("ANTHROPIC_API_KEY") != ""
	claudeBadge := "Anthropic"
	if hasClaudeKey {
		claudeBadge = "Anthropic • API Key Set"
	}
	claudeModels := []struct{ id, label string }{
		{"claude-sonnet-5", "Claude Sonnet 5"},
		{"claude-haiku-4-5", "Claude Haiku 4.5"},
		{"claude-opus-5-5", "Claude Opus 5.5"},
	}
	for _, cm := range claudeModels {
		models = append(models, ModelOption{
			Value:    "claude:" + cm.id,
			Label:    cm.label,
			Sublabel: "Anthropic",
			Badge:    claudeBadge,
		})
	}

	// 7. Codex models
	hasCodexKey := agentAuth["codex"] != "" || agentAuth["openai"] != "" || os.Getenv("OPENAI_API_KEY") != ""
	codexBadge := "OpenAI Codex"
	if hasCodexKey {
		codexBadge = "OpenAI • API Key Set"
	}
	codexModels := []struct{ id, label string }{
		{"gpt-5.6-terra", "GPT-5.6 Terra"},
		{"gpt-6-sol", "GPT-6 Sol"},
		{"gpt-5.5", "GPT-5.5"},
	}
	for _, om := range codexModels {
		models = append(models, ModelOption{
			Value:    "codex:" + om.id,
			Label:    om.label,
			Sublabel: "OpenAI Codex",
			Badge:    codexBadge,
		})
	}

	return models
}
