package kanban

import (
	"testing"
	"time"
)

func TestUpsertProviderInvalidatesRosterCache(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	chatRosterCache.Lock()
	chatRosterCache.at = time.Now()
	chatRosterCache.Unlock()

	if err := UpsertProvider(ProviderInput{Name: "fresh", BaseURL: "https://fresh.example.com/v1"}); err != nil {
		t.Fatal(err)
	}

	chatRosterCache.Lock()
	stale := time.Since(chatRosterCache.at) >= chatRosterTTL
	chatRosterCache.Unlock()
	if !stale {
		t.Fatal("roster cache not invalidated after provider upsert")
	}
}

func TestDeleteProviderInvalidatesRosterCache(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	if err := UpsertProvider(ProviderInput{Name: "gone", BaseURL: "https://gone.example.com/v1"}); err != nil {
		t.Fatal(err)
	}
	chatRosterCache.Lock()
	chatRosterCache.at = time.Now()
	chatRosterCache.Unlock()

	if err := DeleteProvider("gone"); err != nil {
		t.Fatal(err)
	}

	chatRosterCache.Lock()
	stale := time.Since(chatRosterCache.at) >= chatRosterTTL
	chatRosterCache.Unlock()
	if !stale {
		t.Fatal("roster cache not invalidated after provider delete")
	}
}
