package kanban

import (
	"os"
	"sort"

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
