package kanban

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

const notificationLimit = 500

type Notification struct {
	ID        string `json:"id"`
	Profile   string `json:"profile"`
	Kind      string `json:"kind"`
	Data      any    `json:"data"`
	Unread    bool   `json:"unread"`
	CreatedAt int64  `json:"created_at"`
}

var notificationStore = struct {
	sync.Mutex
	items []Notification
}{items: make([]Notification, 0, notificationLimit)}

func notificationID(kind string, data any) string {
	raw, _ := json.Marshal(data)
	h := sha256.Sum256(append([]byte(kind+":"), raw...))
	return fmt.Sprintf("n_%x", h[:8])
}

func RecordNotification(kind string, data map[string]any) error {
	if kind == "" {
		return fmt.Errorf("notification kind required")
	}
	profile, _ := data["profile"].(string)
	if profile == "" {
		profile = "default"
	}
	id := notificationID(kind, data)
	notificationStore.Lock()
	defer notificationStore.Unlock()
	for _, item := range notificationStore.items {
		if item.ID == id && item.Profile == profile {
			return nil
		}
	}
	notificationStore.items = append(notificationStore.items, Notification{ID: id, Profile: profile, Kind: kind, Data: data, Unread: true, CreatedAt: time.Now().Unix()})
	if len(notificationStore.items) > notificationLimit {
		notificationStore.items = notificationStore.items[len(notificationStore.items)-notificationLimit:]
	}
	return nil
}

func ListNotifications(profile string, unreadOnly bool, limit int) ([]Notification, error) {
	if profile == "" {
		profile = "default"
	}
	if limit <= 0 || limit > notificationLimit {
		limit = notificationLimit
	}
	notificationStore.Lock()
	defer notificationStore.Unlock()
	out := make([]Notification, 0, limit)
	for i := len(notificationStore.items) - 1; i >= 0 && len(out) < limit; i-- {
		item := notificationStore.items[i]
		if item.Profile != profile || (unreadOnly && !item.Unread) {
			continue
		}
		out = append(out, item)
	}
	return out, nil
}

func MarkNotificationRead(id string) error {
	notificationStore.Lock()
	defer notificationStore.Unlock()
	for i := range notificationStore.items {
		if notificationStore.items[i].ID == id {
			notificationStore.items[i].Unread = false
			return nil
		}
	}
	return fmt.Errorf("notification %q not found", id)
}

func MarkAllNotificationsRead(profile string) error {
	if profile == "" {
		profile = "default"
	}
	notificationStore.Lock()
	defer notificationStore.Unlock()
	for i := range notificationStore.items {
		if notificationStore.items[i].Profile == profile {
			notificationStore.items[i].Unread = false
		}
	}
	return nil
}

func resetNotificationsForTest() {
	notificationStore.Lock()
	notificationStore.items = nil
	notificationStore.Unlock()
}
