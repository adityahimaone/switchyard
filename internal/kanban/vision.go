package kanban

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type visionProviderRaw struct {
	Name    string         `yaml:"name"`
	BaseURL string         `yaml:"base_url"`
	APIKey  string         `yaml:"api_key"`
	Models  map[string]any `yaml:"models"`
}

type visionConfigRaw struct {
	CustomProviders []visionProviderRaw `yaml:"custom_providers"`
}

// AnalyzeAttachment sends attachment bytes through configured OpenAI-compatible provider.
// Provider secret stays server-side; response returns only model text.
func AnalyzeAttachment(ctx context.Context, id, model, prompt string) (string, error) {
	a, err := GetAttachment(id)
	if err != nil {
		return "", err
	}
	data, err := ReadAttachment(id)
	if err != nil {
		return "", err
	}
	analysisCfg, err := LoadAttachmentAnalysisConfig()
	if err != nil {
		return "", err
	}
	if !CanAnalyzeWithConfig(model, a.MIME, analysisCfg) {
		return "", fmt.Errorf("model %q cannot analyze %s", model, a.MIME)
	}
	cfg, err := loadVisionProvider(model)
	if err != nil {
		return "", err
	}
	if cfg.BaseURL == "" || cfg.APIKey == "" {
		return "", fmt.Errorf("OpenAI-compatible provider missing base_url or api_key")
	}
	if prompt == "" {
		prompt = "Analyze this attachment. Describe important content, extract actionable facts, and flag uncertainty."
	}
	content := []any{map[string]any{"type": "text", "text": prompt}}
	content = append(content, map[string]any{
		"type":      "image_url",
		"image_url": map[string]string{"url": "data:" + a.MIME + ";base64," + base64.StdEncoding.EncodeToString(data)},
	})
	payload := map[string]any{
		"model":       model,
		"messages":    []any{map[string]any{"role": "user", "content": content}},
		"temperature": 0.1,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(cfg.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if out.Error != nil && out.Error.Message != "" {
			return "", fmt.Errorf("vision provider: %s", out.Error.Message)
		}
		return "", fmt.Errorf("vision provider returned HTTP %d", resp.StatusCode)
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("vision provider returned empty response")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func loadVisionProvider(model string) (visionProviderRaw, error) {
	raw, err := os.ReadFile(hermesHome() + "/config.yaml")
	if err != nil {
		return visionProviderRaw{}, err
	}
	var cfg visionConfigRaw
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return visionProviderRaw{}, err
	}
	// Prefer the provider that actually owns the requested model id (exact or substring match).
	// Falls back to 9router-named provider, then any configured provider.
	var fallback visionProviderRaw
	for _, p := range cfg.CustomProviders {
		if p.BaseURL == "" || p.APIKey == "" {
			continue
		}
		if fallback.BaseURL == "" {
			fallback = p
		}
		if strings.Contains(strings.ToLower(p.Name), "9router") && fallback.Name != "9router" {
			fallback = p // prefer 9router as default fallback
		}
	}
	for _, p := range cfg.CustomProviders {
		if p.BaseURL == "" || p.APIKey == "" {
			continue
		}
		for id := range p.Models {
			if id != "" && (strings.EqualFold(id, model) || strings.Contains(strings.ToLower(model), strings.ToLower(id))) {
				return p, nil
			}
		}
	}
	if fallback.BaseURL != "" {
		return fallback, nil
	}
	return visionProviderRaw{}, fmt.Errorf("no OpenAI-compatible provider configured")
}
