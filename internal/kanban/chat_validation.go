package kanban

import (
	"fmt"
	"sync"
	"time"
)

var chatRosterCache struct {
	sync.Mutex
	at        time.Time
	profiles  []Profile
	providers []ProviderItem
}

const chatRosterTTL = 5 * time.Second

func invalidateChatRosterCache() {
	chatRosterCache.Lock()
	chatRosterCache.at = time.Time{}
	chatRosterCache.Unlock()
}

// ValidateChatModel rejects explicit overrides outside configured profile/provider rosters.
// Empty model means profile default and remains valid.
func ValidateChatModel(profile, model string) error {
	if model == "" {
		return nil
	}
	chatRosterCache.Lock()
	defer chatRosterCache.Unlock()
	if time.Since(chatRosterCache.at) >= chatRosterTTL {
		profiles, err := ListProfiles()
		if err != nil {
			return err
		}
		providers, err := ListProviders()
		if err != nil {
			return err
		}
		chatRosterCache.profiles = profiles
		chatRosterCache.providers = providers
		chatRosterCache.at = time.Now()
	}
	profiles := chatRosterCache.profiles
	for _, p := range profiles {
		if p.Name == profile && p.Model == model {
			return nil
		}
	}
	for _, p := range chatRosterCache.providers {
		for _, candidate := range p.Models {
			if candidate == model {
				return nil
			}
		}
	}
	return fmt.Errorf("model %q is not configured for profile %q", model, profile)
}
