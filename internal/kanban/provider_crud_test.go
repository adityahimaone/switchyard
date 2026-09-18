package kanban

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpsertProviderWritesSecretButListRedactsIt(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := UpsertProvider(ProviderInput{
		Name: "demo", BaseURL: "https://api.example.com/v1", APIKey: "secret-key", DefaultModel: "model-a",
	}); err != nil {
		t.Fatal(err)
	}

	providers, err := ListProviders()
	if err != nil {
		t.Fatal(err)
	}
	if len(providers) != 1 || !providers[0].APIKeySet || providers[0].BaseURL != "https://api.example.com/v1" {
		t.Fatalf("providers = %#v", providers)
	}
	raw, err := os.ReadFile(filepath.Join(home, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) == "" || !strings.Contains(string(raw), "secret-key") {
		t.Fatal("provider secret not persisted in server-side config")
	}
}

func TestUpsertProviderRejectsUnsafeProvider(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := UpsertProvider(ProviderInput{Name: "bad/name", BaseURL: "https://api.example.com"}); err == nil {
		t.Fatal("invalid provider name accepted")
	}
	if err := UpsertProvider(ProviderInput{Name: "bad-url", BaseURL: "http://169.254.169.254"}); err == nil {
		t.Fatal("unsafe provider URL accepted")
	}
}

func TestDeleteProviderRemovesOnlyNamedProvider(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := UpsertProvider(ProviderInput{Name: "one", BaseURL: "https://one.example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := UpsertProvider(ProviderInput{Name: "two", BaseURL: "https://two.example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := DeleteProvider("one"); err != nil {
		t.Fatal(err)
	}
	providers, err := ListProviders()
	if err != nil {
		t.Fatal(err)
	}
	if len(providers) != 1 || providers[0].Name != "two" {
		t.Fatalf("providers after delete = %#v", providers)
	}
}
