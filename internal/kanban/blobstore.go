package kanban

import (
	"fmt"
	"os"
	"path/filepath"
)

// BlobStore abstracts attachment storage (local disk now, R2 later).
type BlobStore interface {
	Put(key string, data []byte) error
	Get(key string) ([]byte, error)
	Delete(key string) error
	Exists(key string) bool
}

// LocalStore writes to ~/.hermes/attachments/<key>.
type LocalStore struct{ Dir string }

func NewLocalStore() *LocalStore { return &LocalStore{Dir: filepath.Join(hermesHome(), "attachments")} }

func (s *LocalStore) Put(key string, data []byte) error {
	full := filepath.Join(s.Dir, key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	return os.WriteFile(full, data, 0o600)
}

func (s *LocalStore) Get(key string) ([]byte, error) {
	return os.ReadFile(filepath.Join(s.Dir, key))
}

func (s *LocalStore) Delete(key string) error {
	full := filepath.Join(s.Dir, key)
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *LocalStore) Exists(key string) bool {
	_, err := os.Stat(filepath.Join(s.Dir, key))
	return err == nil
}

// activeStore is the global blob store; default local, switchable for R2.
var activeStore BlobStore = NewLocalStore()

func SetStore(s BlobStore) { activeStore = s }
func GetStore() BlobStore  { return activeStore }

// R2 stub — implement when R2 credentials available.
type R2Store struct {
	Bucket   string
	Endpoint string
	// ponnytail: no R2 SDK dependency yet; wire cloudflare-go or aws-sdk when credentials land.
}

func (r *R2Store) Put(key string, data []byte) error {
	return fmt.Errorf("r2 store not implemented — configure R2_BUCKET + R2_ENDPOINT env vars")
}
func (r *R2Store) Get(key string) ([]byte, error) {
	return nil, fmt.Errorf("r2 store not implemented")
}
func (r *R2Store) Delete(key string) error {
	return fmt.Errorf("r2 store not implemented")
}
func (r *R2Store) Exists(key string) bool { return false }
