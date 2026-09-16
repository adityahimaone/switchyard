package kanban

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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

// R2Store implements BlobStore against a Cloudflare R2 bucket via S3-compatible API.
type R2Store struct {
	client *s3.Client
	bucket string
}

func (r *R2Store) Put(key string, data []byte) error {
	_, err := r.client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
		Body:   strings.NewReader(string(data)),
	})
	return err
}

func (r *R2Store) Get(key string) ([]byte, error) {
	out, err := r.client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (r *R2Store) Delete(key string) error {
	_, err := r.client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (r *R2Store) Exists(key string) bool {
	_, err := r.client.HeadObject(context.Background(), &s3.HeadObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	return err == nil
}

// NewR2StoreFromEnv builds an R2-backed store from R2_* environment variables.
// Endpoint must be account-level (e.g. https://<accountid>.r2.cloudflarestorage.com).
func NewR2StoreFromEnv() (*R2Store, error) {
	bucket := strings.TrimSpace(os.Getenv("R2_BUCKET"))
	endpoint := strings.TrimSpace(os.Getenv("R2_ENDPOINT"))
	accessKey := strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID"))
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	if bucket == "" || endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required")
	}
	endpoint = strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://"), "/")
	if i := strings.IndexByte(endpoint, '/'); i >= 0 {
		endpoint = endpoint[:i]
	}
	cfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion("auto"),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("https://" + endpoint)
		o.UsePathStyle = true
		o.Region = "auto"
	})
	return &R2Store{client: client, bucket: bucket}, nil
}

// ConfigureAttachmentStore selects R2 when R2_ENDPOINT is set, else local disk.
func ConfigureAttachmentStore() error {
	if strings.TrimSpace(os.Getenv("R2_ENDPOINT")) == "" {
		SetStore(NewLocalStore())
		return nil
	}
	r2, err := NewR2StoreFromEnv()
	if err != nil {
		return err
	}
	SetStore(r2)
	return nil
}
