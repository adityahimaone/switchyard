package kanban

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type ModelCapability struct {
	Vision bool `yaml:"vision" json:"vision"`
	PDF    bool `yaml:"pdf" json:"pdf"`
}

type AttachmentAnalysisConfig struct {
	Mode              string                     `yaml:"mode" json:"mode"`
	DedicatedModel    string                     `yaml:"dedicated_model" json:"dedicated_model"`
	DedicatedProvider string                     `yaml:"dedicated_provider" json:"dedicated_provider"`
	FallbackOnError   bool                       `yaml:"fallback_on_error" json:"fallback_on_error"`
	Overrides         map[string]ModelCapability `yaml:"model_capabilities" json:"model_capabilities"`
}

type AttachmentModelResolution struct {
	Model    string
	Provider string
}

func attachmentAnalysisConfigPath() string {
	return filepath.Join(hermesHome(), "attachment-analysis.yaml")
}

func LoadAttachmentAnalysisConfig() (AttachmentAnalysisConfig, error) {
	cfg := AttachmentAnalysisConfig{Mode: "auto", FallbackOnError: true, Overrides: map[string]ModelCapability{}}
	raw, err := os.ReadFile(attachmentAnalysisConfigPath())
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return cfg, err
	}
	if cfg.Mode == "" {
		cfg.Mode = "auto"
	}
	if cfg.Overrides == nil {
		cfg.Overrides = map[string]ModelCapability{}
	}
	return cfg, nil
}

func SaveAttachmentAnalysisConfig(cfg AttachmentAnalysisConfig) error {
	if cfg.Mode == "" {
		cfg.Mode = "auto"
	}
	if cfg.Mode != "auto" && cfg.Mode != "dedicated" {
		return fmt.Errorf("invalid attachment analysis mode %q", cfg.Mode)
	}
	if cfg.Overrides == nil {
		cfg.Overrides = map[string]ModelCapability{}
	}
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return err
	}
	raw, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	tmp := attachmentAnalysisConfigPath() + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, attachmentAnalysisConfigPath())
}

func ResolveAttachmentFallbackModel(model, mime string) (AttachmentModelResolution, error) {
	cfg, err := LoadAttachmentAnalysisConfig()
	if err != nil {
		return AttachmentModelResolution{}, err
	}
	if !cfg.FallbackOnError || cfg.DedicatedModel == "" || strings.EqualFold(model, cfg.DedicatedModel) {
		return AttachmentModelResolution{}, fmt.Errorf("no attachment analysis fallback configured")
	}
	if !CanAnalyzeWithConfig(cfg.DedicatedModel, mime, cfg) {
		return AttachmentModelResolution{}, fmt.Errorf("dedicated attachment analysis model cannot analyze %s", mime)
	}
	return AttachmentModelResolution{Model: cfg.DedicatedModel, Provider: cfg.DedicatedProvider}, nil
}

func ResolveAttachmentModel(model, mime string) (AttachmentModelResolution, error) {
	cfg, err := LoadAttachmentAnalysisConfig()
	if err != nil {
		return AttachmentModelResolution{}, err
	}
	if cfg.Mode != "dedicated" && CanAnalyzeWithConfig(model, mime, cfg) {
		return AttachmentModelResolution{Model: model}, nil
	}
	if cfg.DedicatedModel != "" && CanAnalyzeWithConfig(cfg.DedicatedModel, mime, cfg) {
		return AttachmentModelResolution{Model: cfg.DedicatedModel, Provider: cfg.DedicatedProvider}, nil
	}
	if cfg.Mode == "dedicated" && cfg.DedicatedModel == "" {
		return AttachmentModelResolution{}, fmt.Errorf("dedicated attachment analysis model is not configured")
	}
	return AttachmentModelResolution{}, fmt.Errorf("no vision-capable model configured for %s", mime)
}

func ModelCapabilityFor(model string, cfg AttachmentAnalysisConfig) ModelCapability {
	for id, cap := range cfg.Overrides {
		if strings.EqualFold(id, model) || strings.Contains(strings.ToLower(model), strings.ToLower(id)) {
			return cap
		}
	}
	for id, cap := range modelCaps {
		if strings.Contains(strings.ToLower(model), id) {
			return ModelCapability{Vision: cap.vision, PDF: cap.pdf}
		}
	}
	return ModelCapability{}
}

func capabilityFromMetadata(meta map[string]any, fallback ModelCapability) ModelCapability {
	for _, key := range []string{"vision", "image", "multimodal"} {
		if v, ok := meta[key].(bool); ok {
			fallback.Vision = v
		}
	}
	if v, ok := meta["pdf"].(bool); ok {
		fallback.PDF = v
	}
	if raw, ok := meta["input_modalities"].([]any); ok {
		for _, item := range raw {
			if s, ok := item.(string); ok && (s == "image" || s == "vision") {
				fallback.Vision = true
			}
		}
	}
	return fallback
}

func CanAnalyzeWithConfig(model, mime string, cfg AttachmentAnalysisConfig) bool {
	cap := ModelCapabilityFor(model, cfg)
	if !cap.Vision && !cap.PDF {
		if providers, err := ListProviders(); err == nil {
			for _, provider := range providers {
				for id, candidate := range provider.Capabilities {
					if strings.EqualFold(id, model) || strings.Contains(strings.ToLower(model), strings.ToLower(id)) {
						cap = candidate
						break
					}
				}
			}
		}
	}
	if mime == "application/pdf" {
		return cap.PDF
	}
	return cap.Vision
}
