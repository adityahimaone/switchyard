package kanban

import (
	"os"
	"strings"
	"testing"
)

func TestLocalStorePutGetDelete(t *testing.T) {
	dir := t.TempDir()
	s := &LocalStore{Dir: dir}
	key := "abc123/test.png"
	data := []byte("fake png data")
	if err := s.Put(key, data); err != nil {
		t.Fatal(err)
	}
	if !s.Exists(key) {
		t.Fatal("expected exists after put")
	}
	got, err := s.Get(key)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(data) {
		t.Fatalf("data mismatch: %q vs %q", got, data)
	}
	if err := s.Delete(key); err != nil {
		t.Fatal(err)
	}
	if s.Exists(key) {
		t.Fatal("expected not exists after delete")
	}
	_, err = s.Get(key)
	if !os.IsNotExist(err) {
		t.Fatalf("expected not-exist error, got %v", err)
	}
	// delete idempotent
	if err := s.Delete(key); err != nil {
		t.Fatalf("delete non-existent should be ok, got %v", err)
	}
}

func TestR2ConfigRequiresCredentials(t *testing.T) {
	for _, key := range []string{"R2_BUCKET", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"} {
		t.Setenv(key, "")
	}
	if _, err := NewR2StoreFromEnv(); err == nil || !strings.Contains(err.Error(), "required") {
		t.Fatalf("expected missing credentials error, got %v", err)
	}
}
