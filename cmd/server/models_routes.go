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

	"kanban-board/internal/kanban"
)

type ModelOption struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Sublabel string `json:"sublabel,omitempty"`
	Badge    string `json:"badge,omitempty"`
	Provider string `json:"provider,omitempty"`
	Pinned   bool   `json:"pinned,omitempty"`
	Disabled bool   `json:"disabled,omitempty"`
}

// ModelsResponse is what the create-task picker renders. Source is load-bearing:
// the modal has to distinguish "the node that will run this card said so" from
// "this is the last list we saw" from "nobody could be asked". Presenting a
// stale or local guess as a probed list is how the picker came to offer models
// the worker cannot run.
type ModelsResponse struct {
	Executor  string        `json:"executor"`
	Profile   string        `json:"profile,omitempty"`
	NodeID    string        `json:"node_id,omitempty"`
	Source    string        `json:"source,omitempty"` // probed|cached|pending|unverified|unavailable|local
	Detail    string        `json:"detail,omitempty"`
	FetchedAt int64         `json:"fetched_at,omitempty"`
	Models    []ModelOption `json:"models"`
}

var (
	modelsCacheMu sync.RWMutex
	modelsCache   = make(map[string]cachedModels)
)

type cachedModels struct {
	cachedAt time.Time
	resp     ModelsResponse
}

// modelsCacheTTL only absorbs bursts from one page: the catalog itself lives on
// the node, and a picker that opens must be allowed to ask. Five minutes was
// long enough for a model list edited in the user's own DSH GUI to stay hidden.
const modelsCacheTTL = 20 * time.Second

// modelCatalogExecutors are the executors whose model list belongs to the node
// that runs the card. This process cannot know which dsh profile or which
// Command Code build a Mac or Windows worker has, so answering from here would
// be a guess dressed up as a fact.
var modelCatalogExecutors = map[string]bool{"dsh": true, "commandcode": true}

func registerModelsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/models", func(w http.ResponseWriter, r *http.Request) {
		executor := normalizeModelExecutor(r.URL.Query().Get("executor"))
		profile := strings.TrimSpace(r.URL.Query().Get("profile"))
		if profile == "" && executor == "dsh" {
			// "live" asks the node's running DSH host for the catalog it is
			// actually serving. That is the only list a person can compare with
			// their own harness: an account-backed provider's models exist only
			// at runtime, so any file-derived list is a guess.
			profile = "live"
		}
		workspace := strings.TrimSpace(r.URL.Query().Get("workspace"))
		refresh := r.URL.Query().Get("refresh") == "true" || r.URL.Query().Get("refresh") == "1"

		if modelCatalogExecutors[executor] {
			writeJSON(w, http.StatusOK, resolveNodeModels(executor, profile, workspace, refresh))
			return
		}

		var models []ModelOption
		if executor == "pen" || executor == "pen_cli" || executor == "pencil" {
			models = fetchPenModels()
		} else {
			models = []ModelOption{}
		}
		writeJSON(w, http.StatusOK, ModelsResponse{Executor: executor, Source: "local", Models: models})
	})
}

func normalizeModelExecutor(raw string) string {
	executor := strings.ToLower(strings.TrimSpace(raw))
	if executor == "" {
		return "dsh"
	}
	if executor == "cmd" {
		return "commandcode"
	}
	return executor
}

// modelsCacheKey is per node. Keyed by executor alone, a Windows workspace could
// be answered with the list a Mac had reported for the same executor.
func modelsCacheKey(executor, profile, nodeID string) string {
	key := executor
	if profile != "" {
		key += ":" + profile
	}
	return key + "@" + nodeID
}

// resolveNodeModels asks the node that owns the workspace what it can run, and
// degrades in a way the UI can label.
func resolveNodeModels(executor, profile, workspace string, refresh bool) ModelsResponse {
	probed, err := fetchNodeModels(executor, profile, workspace, refresh)
	if err == nil {
		key := modelsCacheKey(executor, profile, probed.NodeID)
		if probed.Source == "probed" && len(probed.Models) > 0 {
			modelsCacheMu.Lock()
			modelsCache[key] = cachedModels{cachedAt: time.Now(), resp: probed}
			modelsCacheMu.Unlock()
			return probed
		}
		// The node answered but has not reported this catalog yet: keep that
		// node's last-known list visible, marked as not freshly probed.
		if last, ok := cachedFor(key); ok {
			last.Source = "cached"
			if probed.Detail != "" {
				last.Detail = probed.Detail
			}
			return last
		}
		probed.Executor = executor
		if probed.Profile == "" {
			probed.Profile = profile
		}
		return probed
	}

	// node-agent unreachable: nothing that runs cards can be asked, which is the
	// only case where a local read is allowed — and it says so. A cached answer
	// is preferred, naming the node it came from, because it is still a real
	// catalog rather than this machine's guess.
	if last, ok := cachedAnyNode(executor, profile); ok {
		last.Source = "cached"
		last.Detail = "node-agent unreachable: " + err.Error()
		return last
	}
	local := localModelFallback(executor, profile)
	local.Source = "unverified"
	local.Detail = "node-agent unreachable: " + err.Error()
	return local
}

func cachedFor(key string) (ModelsResponse, bool) {
	modelsCacheMu.RLock()
	defer modelsCacheMu.RUnlock()
	cached, ok := modelsCache[key]
	if !ok || len(cached.resp.Models) == 0 {
		return ModelsResponse{}, false
	}
	return cached.resp, true
}

// cachedAnyNode finds the newest catalog for this executor from any node, used
// only when no node can be asked.
func cachedAnyNode(executor, profile string) (ModelsResponse, bool) {
	prefix := modelsCacheKey(executor, profile, "")
	modelsCacheMu.RLock()
	defer modelsCacheMu.RUnlock()
	var best cachedModels
	for key, cached := range modelsCache {
		if !strings.HasPrefix(key, prefix) || len(cached.resp.Models) == 0 {
			continue
		}
		if best.cachedAt.IsZero() || cached.cachedAt.After(best.cachedAt) {
			best = cached
		}
	}
	if best.cachedAt.IsZero() {
		return ModelsResponse{}, false
	}
	return best.resp, true
}

// fetchNodeModels proxies to node-agent /api/models, which resolves the node by
// workspace exactly the way dispatch does.
func fetchNodeModels(executor, profile, workspace string, refresh bool) (ModelsResponse, error) {
	cat, err := kanban.FetchNodeModels(executor, profile, workspace, refresh)
	if err != nil {
		return ModelsResponse{}, err
	}
	out := ModelsResponse{
		Executor:  cat.Executor,
		Profile:   cat.Profile,
		NodeID:    cat.NodeID,
		Source:    cat.Source,
		Detail:    cat.Detail,
		FetchedAt: cat.FetchedAt,
		Models:    make([]ModelOption, 0, len(cat.Models)),
	}
	for _, m := range cat.Models {
		sublabel := m.Sublabel
		if m.Note != "" {
			sublabel = m.Note
		}
		out.Models = append(out.Models, ModelOption{
			Value:    m.Value,
			Label:    m.Label,
			Sublabel: sublabel,
			Badge:    m.Badge,
			Provider: m.Provider,
			Pinned:   m.Pinned,
			Disabled: m.Disabled,
		})
	}
	return out, nil
}

// localModelFallback reads this machine's own dsh profile or Command Code CLI.
func localModelFallback(executor, profile string) ModelsResponse {
	switch executor {
	case "commandcode":
		return ModelsResponse{Executor: executor, Models: fetchCommandCodeModels()}
	case "dsh":
		return ModelsResponse{Executor: executor, Profile: profile, Models: fetchDSHModels(profile)}
	}
	return ModelsResponse{Executor: executor, Models: []ModelOption{}}
}

// fetchDSHModels reads one profile on the local machine. Last resort only: the
// authoritative list comes from the node that runs the card, because a 6-model
// profile and a 1400-model router profile are both legitimate and this process
// cannot tell which one the card will use.
func fetchDSHModels(profile string) []ModelOption {
	if profile == "" {
		profile = "live"
	}
	candidates := []string{}
	if dshHome := os.Getenv("DSH_HOME"); dshHome != "" {
		candidates = append(candidates, filepath.Join(dshHome, "profiles", profile, "cordis.patch.yml"))
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidates = append(candidates, filepath.Join(home, ".dsh", "profiles", profile, "cordis.patch.yml"))
	}
	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil || len(data) == 0 {
			continue
		}
		if parsed := parseCordisPatchModels(data); len(parsed) > 0 {
			return parsed
		}
	}
	return nil
}

// parseCordisPatchModels reads the models declared in a dsh profile patch file,
// keeping each model's own provider.
//
// It used to prepend thirteen hand-written pins under a provider no profile
// declared, and to reject any list shorter than fourteen entries as implausible
// — which is exactly how a picker fed by the router profile advertised models a
// worker running the web profile could not resolve.
func parseCordisPatchModels(data []byte) []ModelOption {
	seen := make(map[string]bool)
	var models []ModelOption
	scanner := bufio.NewScanner(bytes.NewReader(data))
	insideModels := false
	idRe := regexp.MustCompile(`^\s*-\s*id:\s*([^\s#]+)`)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "models:") {
			insideModels = true
			continue
		}
		if insideModels && (strings.HasPrefix(line, "- id:") || (len(line) > 0 && line[0] != ' ' && line[0] != '\t' && line[0] != '#')) {
			insideModels = false
			continue
		}
		if !insideModels {
			continue
		}
		m := idRe.FindStringSubmatch(line)
		if len(m) < 2 || seen[m[1]] {
			continue
		}
		id := m[1]
		seen[id] = true
		models = append(models, ModelOption{Value: id, Label: id, Sublabel: id})
	}
	// Empty is a truthful answer: no profile was readable, so there is nothing to
	// offer. A hand-maintained catalog here would advertise ids this machine cannot
	// resolve, which is the bug this parser was rewritten to stop causing.
	return models
}

func fetchCommandCodeModels() []ModelOption {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Cold start on this CLI measured 4.3s against a 5s budget, which failed at
	// random under test load. Listing models is not on a request path that needs
	// sub-second latency, so the budget is generous on purpose.
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

	// No CLI here means no answer here. The worker that runs cards is asked first
	// anyway; inventing a list would only hide that this machine cannot run one.
	return nil
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

	return result
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
