package kanban

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Attachment struct {
	ID              string `json:"id"`
	Filename        string `json:"filename"`
	MIME            string `json:"mime"`
	Size            int64  `json:"size"`
	SHA256          string `json:"sha256"`
	StorageProvider string `json:"storage_provider"`
	StorageKey      string `json:"storage_key"`
	CreatedAt       int64  `json:"created_at"`
}

func attachmentsDBPath() string { return filepath.Join(hermesHome(), "kanban", "attachments.db") }

func ensureAttachmentsDB() (*sql.DB, error) {
	p := attachmentsDBPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", p)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL UNIQUE, storage_provider TEXT NOT NULL DEFAULT 'local', storage_key TEXT NOT NULL, created_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS task_attachments (task_id TEXT NOT NULL, attachment_id TEXT NOT NULL, board_slug TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(task_id, attachment_id))`,
		`CREATE TABLE IF NOT EXISTS chat_message_attachments (message_id TEXT NOT NULL, attachment_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(message_id, attachment_id))`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_sha ON attachments(sha256)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			db.Close()
			return nil, err
		}
	}
	return db, nil
}

var allowedMIME = map[string]bool{
	"image/png":       true,
	"image/jpeg":      true,
	"image/webp":      true,
	"image/gif":       true,
	"application/pdf": true,
}

func sniffAllow(data []byte) (string, bool) {
	if len(data) == 0 {
		return "", false
	}
	// PDF magic
	if len(data) >= 4 && string(data[:4]) == "%PDF" {
		return "application/pdf", true
	}
	// PNG magic (Go's DetectContentType returns application/octet-stream for PNG in some versions)
	if len(data) >= 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
		return "image/png", true
	}
	mime := http.DetectContentType(data[:minInt(len(data), 512)])
	// DetectContentType may append "; charset=..." — strip
	if idx := strings.Index(mime, ";"); idx != -1 {
		mime = strings.TrimSpace(mime[:idx])
	}
	if allowedMIME[mime] {
		return mime, true
	}
	// Map known substrings
	switch {
	case strings.HasPrefix(mime, "image/png"):
		return "image/png", true
	case strings.HasPrefix(mime, "image/jpeg"):
		return "image/jpeg", true
	case strings.HasPrefix(mime, "image/webp"):
		return "image/webp", true
	case strings.HasPrefix(mime, "image/gif"):
		return "image/gif", true
	case strings.HasPrefix(mime, "application/pdf"):
		return "application/pdf", true
	}
	return "", false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// EnsureAttachmentsDBPublic opens/migrates attachments tables. Call at server boot.
func EnsureAttachmentsDBPublic() (*sql.DB, error) { return ensureAttachmentsDB() }

func localDir() string { return filepath.Join(hermesHome(), "attachments") }

func sanitizeName(n string) string {
	n = filepath.Base(strings.TrimSpace(n))
	if n == "" || n == "." || n == "/" {
		n = "file"
	}
	// strip path separators just in case
	n = strings.ReplaceAll(n, string(os.PathSeparator), "_")
	return n
}

func StoreAttachmentBytes(data []byte, filename string) (*Attachment, error) {
	if int64(len(data)) > 10<<20 {
		return nil, fmt.Errorf("file too large (max 10MB)")
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("empty file")
	}
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	mime, ok := sniffAllow(data)
	if !ok {
		return nil, fmt.Errorf("unsupported file type")
	}
	db, err := ensureAttachmentsDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var existing Attachment
	err = db.QueryRow(`SELECT id,filename,mime,size,sha256,storage_provider,storage_key,created_at FROM attachments WHERE sha256=?`, sha).Scan(&existing.ID, &existing.Filename, &existing.MIME, &existing.Size, &existing.SHA256, &existing.StorageProvider, &existing.StorageKey, &existing.CreatedAt)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	key := filepath.Join(sha, sanitizeName(filename))
	full := filepath.Join(localDir(), key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(full, data, 0o600); err != nil {
		return nil, err
	}
	a := &Attachment{ID: newChatID("att"), Filename: sanitizeName(filename), MIME: mime, Size: int64(len(data)), SHA256: sha, StorageProvider: "local", StorageKey: key, CreatedAt: time.Now().Unix()}
	if _, err := db.Exec(`INSERT INTO attachments (id,filename,mime,size,sha256,storage_provider,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)`, a.ID, a.Filename, a.MIME, a.Size, a.SHA256, a.StorageProvider, a.StorageKey, a.CreatedAt); err != nil {
		return nil, err
	}
	return a, nil
}

func StoreAttachment(r io.Reader, filename string, size int64) (*Attachment, error) {
	_ = size
	buf, err := io.ReadAll(io.LimitReader(r, 10<<20+1))
	if err != nil {
		return nil, err
	}
	if int64(len(buf)) > 10<<20 {
		return nil, fmt.Errorf("file too large (max 10MB)")
	}
	if len(buf) == 0 {
		return nil, fmt.Errorf("empty file")
	}
	sum := sha256.Sum256(buf)
	sha := hex.EncodeToString(sum[:])
	mime, ok := sniffAllow(buf)
	if !ok {
		return nil, fmt.Errorf("unsupported file type")
	}
	db, err := ensureAttachmentsDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var existing Attachment
	err = db.QueryRow(`SELECT id,filename,mime,size,sha256,storage_provider,storage_key,created_at FROM attachments WHERE sha256=?`, sha).Scan(&existing.ID, &existing.Filename, &existing.MIME, &existing.Size, &existing.SHA256, &existing.StorageProvider, &existing.StorageKey, &existing.CreatedAt)
	if err == nil {
		return &existing, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	key := filepath.Join(sha, sanitizeName(filename))
	full := filepath.Join(localDir(), key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(full, buf, 0o600); err != nil {
		return nil, err
	}
	a := &Attachment{ID: newChatID("att"), Filename: sanitizeName(filename), MIME: mime, Size: int64(len(buf)), SHA256: sha, StorageProvider: "local", StorageKey: key, CreatedAt: time.Now().Unix()}
	if _, err := db.Exec(`INSERT INTO attachments (id,filename,mime,size,sha256,storage_provider,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)`, a.ID, a.Filename, a.MIME, a.Size, a.SHA256, a.StorageProvider, a.StorageKey, a.CreatedAt); err != nil {
		return nil, err
	}
	return a, nil
}

func GetAttachment(id string) (*Attachment, error) {
	db, err := ensureAttachmentsDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var a Attachment
	err = db.QueryRow(`SELECT id,filename,mime,size,sha256,storage_provider,storage_key,created_at FROM attachments WHERE id=?`, id).Scan(&a.ID, &a.Filename, &a.MIME, &a.Size, &a.SHA256, &a.StorageProvider, &a.StorageKey, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func ReadAttachment(id string) ([]byte, error) {
	a, err := GetAttachment(id)
	if err != nil {
		return nil, err
	}
	if a.StorageProvider != "local" {
		return nil, fmt.Errorf("unsupported storage provider %q", a.StorageProvider)
	}
	return os.ReadFile(filepath.Join(localDir(), a.StorageKey))
}

func LinkTaskAttachment(board, taskID, attID string) error {
	if strings.TrimSpace(board) == "" || strings.TrimSpace(taskID) == "" || strings.TrimSpace(attID) == "" {
		return fmt.Errorf("board, task and attachment required")
	}
	db, err := ensureAttachmentsDB()
	if err != nil {
		return err
	}
	defer db.Close()
	// verify attachment exists
	var dummy string
	if err := db.QueryRow(`SELECT id FROM attachments WHERE id=?`, attID).Scan(&dummy); err != nil {
		return fmt.Errorf("attachment not found")
	}
	_, err = db.Exec(`INSERT OR IGNORE INTO task_attachments (task_id,attachment_id,board_slug,created_at) VALUES (?,?,?,?)`, taskID, attID, board, time.Now().Unix())
	return err
}

func LinkChatAttachment(messageID, attID string) error {
	if strings.TrimSpace(messageID) == "" || strings.TrimSpace(attID) == "" {
		return fmt.Errorf("message and attachment required")
	}
	db, err := ensureAttachmentsDB()
	if err != nil {
		return err
	}
	defer db.Close()
	var dummy string
	if err := db.QueryRow(`SELECT id FROM attachments WHERE id=?`, attID).Scan(&dummy); err != nil {
		return fmt.Errorf("attachment not found")
	}
	_, err = db.Exec(`INSERT OR IGNORE INTO chat_message_attachments (message_id,attachment_id,created_at) VALUES (?,?,?)`, messageID, attID, time.Now().Unix())
	return err
}

func ListTaskAttachments(board, taskID string) ([]Attachment, error) {
	return listAttachments(`SELECT a.id,a.filename,a.mime,a.size,a.sha256,a.storage_provider,a.storage_key,a.created_at FROM attachments a JOIN task_attachments ta ON ta.attachment_id=a.id WHERE ta.board_slug=? AND ta.task_id=? ORDER BY ta.created_at ASC`, board, taskID)
}

func ListChatAttachments(messageID string) ([]Attachment, error) {
	return listAttachments(`SELECT a.id,a.filename,a.mime,a.size,a.sha256,a.storage_provider,a.storage_key,a.created_at FROM attachments a JOIN chat_message_attachments ca ON ca.attachment_id=a.id WHERE ca.message_id=? ORDER BY ca.created_at ASC`, messageID)
}

func listAttachments(q string, args ...any) ([]Attachment, error) {
	db, err := ensureAttachmentsDB()
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.Filename, &a.MIME, &a.Size, &a.SHA256, &a.StorageProvider, &a.StorageKey, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []Attachment{}
	}
	return out, rows.Err()
}

// ModelCapability registry — substring match on model id
var modelCaps = map[string]struct {
	vision bool
	pdf    bool
}{
	"gpt-4o":      {true, true},
	"gpt-4o-mini": {true, true},
	"claude-3":    {true, true},
	"claude-4":    {true, true},
	"gemini":      {true, true},
	"vision":      {true, true},
}

func CanAnalyze(model, mime string) bool {
	if strings.TrimSpace(model) == "" || strings.TrimSpace(mime) == "" {
		return false
	}
	lower := strings.ToLower(model)
	for k, c := range modelCaps {
		if strings.Contains(lower, k) {
			if mime == "application/pdf" {
				return c.pdf
			}
			return c.vision
		}
	}
	return false
}
