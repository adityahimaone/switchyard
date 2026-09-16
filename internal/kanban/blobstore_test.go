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

func TestR2StoreReturnsNotImplemented(t *testing.T) {
	r := &R2Store{Bucket: "test", Endpoint: "https://example.com"}
	if err := r.Put("k", []byte("x")); err == nil || !strings.Contains(err.Error(), "not implemented") {
		t.Fatalf("expected not implemented, got %v", err)
	}
	if _, err := r.Get("k"); err == nil || !strings.Contains(err.Error(), "not implemented") {
		t.Fatalf("expected not implemented, got %v", err)
	}
}
