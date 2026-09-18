package kanban

import "testing"

func TestNotificationsDeduplicateAndTrackUnread(t *testing.T) {
	resetNotificationsForTest()
	first := map[string]any{"profile": "default", "task_id": "t1", "error": "failed"}
	if err := RecordNotification("task_failed", first); err != nil {
		t.Fatal(err)
	}
	if err := RecordNotification("task_failed", first); err != nil {
		t.Fatal(err)
	}
	items, err := ListNotifications("default", true, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || !items[0].Unread {
		t.Fatalf("items = %#v", items)
	}
	if err := MarkNotificationRead(items[0].ID); err != nil {
		t.Fatal(err)
	}
	items, err = ListNotifications("default", false, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Unread {
		t.Fatal("notification remained unread or missing")
	}
}

func TestNotificationsBounded(t *testing.T) {
	resetNotificationsForTest()
	for i := 0; i < notificationLimit+20; i++ {
		if err := RecordNotification("event", map[string]any{"id": i}); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListNotifications("default", false, notificationLimit+20)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != notificationLimit {
		t.Fatalf("len = %d, want %d", len(items), notificationLimit)
	}
}
