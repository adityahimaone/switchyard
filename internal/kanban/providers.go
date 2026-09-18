package kanban

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// ProviderItem is one entry from config.yaml custom_providers (model roster
// behind a "custom" provider id). APIKeySet hides the secret value.
type ProviderItem struct {
	Name         string                     `json:"name"`
	BaseURL      string                     `json:"base_url"`
	DefaultModel string                     `json:"default_model"`
	Models       []string                   `json:"models"` // sorted ids for picker
	Capabilities map[string]ModelCapability `json:"capabilities"`
	APIKeySet    bool                       `json:"api_key_set"`
}

type providerRaw struct {
	Name    string         `yaml:"name"`
	BaseURL string         `yaml:"base_url"`
	APIKey  string         `yaml:"api_key"`
	Model   string         `yaml:"model"`
	Models  map[string]any `yaml:"models"`
}

type configRaw struct {
	CustomProviders []providerRaw `yaml:"custom_providers"`
}

func DiscoverConfiguredProviderModels(name string) ([]string, error) {
	raw, err := os.ReadFile(filepath.Join(hermesHome(), "config.yaml"))
	if err != nil {
		return nil, err
	}
	var c configRaw
	if err := yaml.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	for _, provider := range c.CustomProviders {
		if provider.Name == name {
			return discoverProviderModels(context.Background(), provider.BaseURL, provider.APIKey, 1<<20, 5*time.Second)
		}
	}
	return nil, fmt.Errorf("provider %q not found", name)
}

func validateProviderBaseURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.User != nil || u.Hostname() == "" {
		return fmt.Errorf("invalid provider URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()) != nil)) {
		return fmt.Errorf("provider URL must use HTTPS, except localhost HTTP")
	}
	ip := net.ParseIP(u.Hostname())
	if ip != nil && (ip.To4() == nil || !ip.IsLoopback()) {
		return fmt.Errorf("provider URL targets non-loopback or IPv6 IP")
	}
	return nil
}

func discoverProviderModels(ctx context.Context, baseURL, apiKey string, maxBytes int64, timeout time.Duration) ([]string, error) {
	if err := validateProviderBaseURL(baseURL); err != nil {
		return nil, err
	}
	u, err := url.Parse(strings.TrimRight(baseURL, "/") + "/models")
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	client := &http.Client{Timeout: timeout}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("provider models request returned %s", res.Status)
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxBytes+1)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("invalid provider models response: %w", err)
	}
	if len(payload.Data) == 0 {
		return nil, fmt.Errorf("provider models response has no models")
	}
	models := make([]string, 0, len(payload.Data))
	for _, model := range payload.Data {
		if strings.TrimSpace(model.ID) == "" {
			return nil, fmt.Errorf("provider models response contains empty model ID")
		}
		models = append(models, model.ID)
	}
	sort.Strings(models)
	return models, nil
}

// ListProviders reads ~/.hermes/config.yaml custom_providers rosters.
func ListProviders() ([]ProviderItem, error) {
	raw, err := os.ReadFile(hermesHome() + "/config.yaml")
	if err != nil {
		return nil, err
	}
	var c configRaw
	if err := yaml.Unmarshal(raw, &c); err != nil {
		return nil, err
	}
	out := make([]ProviderItem, 0, len(c.CustomProviders))
	for _, p := range c.CustomProviders {
		mids := make([]string, 0, len(p.Models))
		for k := range p.Models {
			mids = append(mids, k)
		}
		sort.Strings(mids)
		caps := map[string]ModelCapability{}
		cfg, _ := LoadAttachmentAnalysisConfig()
		for _, model := range mids {
			caps[model] = ModelCapabilityFor(model, cfg)
			if meta, ok := p.Models[model].(map[string]any); ok {
				caps[model] = capabilityFromMetadata(meta, caps[model])
			}
		}
		out = append(out, ProviderItem{
			Name: p.Name, BaseURL: p.BaseURL, DefaultModel: p.Model,
			Models: mids, Capabilities: caps, APIKeySet: p.APIKey != "",
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
