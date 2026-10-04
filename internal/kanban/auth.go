package kanban

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const authSessionDays = 14

// minPasswordLength is enforced for operator-chosen passwords. The audit raised
// this from 6 because 6-character passphrases fall well under an offline
// cracking budget against a fast hash.
const minPasswordLength = 12

func authDBPath() string { return filepath.Join(hermesHome(), "kanban", "auth.db") }

// authDB is the process-wide handle to auth.db.
//
// It used to be opened, migrated and closed inside every call, which meant the
// schema migration ran on every API request, because the auth middleware
// validates a session on each one. The handle is pooled instead and keyed by
// path, because tests point HERMES_HOME at a fresh temp directory and a
// package-level singleton would then serve one test's database to another.
var authDB = struct {
	mu   sync.Mutex
	byID map[string]*sql.DB
}{byID: map[string]*sql.DB{}}

// openAuthDB returns the shared handle for auth.db, creating and migrating it
// on first use.
//
// Callers must NOT close the returned handle: it is pooled for the life of the
// process, and closing it would break every concurrent request. CloseAuthDB
// exists for tests and shutdown.
func openAuthDB() (*sql.DB, error) {
	path := authDBPath()
	authDB.mu.Lock()
	defer authDB.mu.Unlock()
	if db, ok := authDB.byID[path]; ok {
		return db, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", path))
	if err != nil {
		return nil, err
	}
	// One connection: SQLite serialises writers anyway, and a single connection
	// avoids SQLITE_BUSY between concurrent requests in the same process.
	db.SetMaxOpenConns(1)
	if err := migrateAuthDB(db); err != nil {
		db.Close()
		return nil, err
	}
	authDB.byID[path] = db
	return db, nil
}

// CloseAuthDB releases the pooled handle. It exists for tests and for a clean
// shutdown; production code leaves the handle open for the process lifetime.
func CloseAuthDB() error {
	authDB.mu.Lock()
	defer authDB.mu.Unlock()
	var firstErr error
	for path, db := range authDB.byID {
		if err := db.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
		delete(authDB.byID, path)
	}
	return firstErr
}

// purgeExpiredSessions deletes sessions that have already expired. Without it,
// expired rows accumulate forever: ValidateSession only removes a row when that
// exact token is presented again, which never happens for a token the user has
// discarded.
func purgeExpiredSessions() (int64, error) {
	db, err := openAuthDB()
	if err != nil {
		return 0, err
	}
	res, err := db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix())
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// StartSessionJanitor purges expired sessions on a timer until ctx is done.
func StartSessionJanitor(ctx context.Context, every time.Duration) {
	go func() {
		ticker := time.NewTicker(every)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if n, err := purgeExpiredSessions(); err != nil {
					log.Printf("session-janitor: %v", err)
				} else if n > 0 {
					log.Printf("session-janitor: purged %d expired session(s)", n)
				}
			}
		}
	}()
}

// migrateAuthDB creates the auth schema and upgrades databases that predate the
// must_change column. CREATE TABLE IF NOT EXISTS cannot add a column to a table
// that already exists, so the column is added separately.
func migrateAuthDB(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS auth_config (id INTEGER PRIMARY KEY CHECK (id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`); err != nil {
		return err
	}
	rows, err := db.Query(`SELECT COUNT(*) FROM pragma_table_info('auth_config') WHERE name='must_change'`)
	if err != nil {
		return err
	}
	present := 0
	if rows.Next() {
		if err := rows.Scan(&present); err != nil {
			rows.Close()
			return err
		}
	}
	rows.Close()
	if present == 0 {
		if _, err := db.Exec(`ALTER TABLE auth_config ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}
	return nil
}

// devPassword is the only password that is ever a known constant. It is
// reachable only when SWITCHYARD_DEV=1, which exists for the test suite and
// docs/local-windows-dev.md. It is deliberately short, so it is exempt from
// minPasswordLength: that floor exists to protect real deployments, and this
// constant never reaches one.
const devPassword = "123456"

// generatedPasswordLength is 24 characters drawn from a 57-symbol alphabet,
// roughly 137 bits of entropy.
const generatedPasswordLength = 24

// passwordAlphabet excludes characters that are easy to confuse in a log or a
// terminal (O/0, l/1/I) and shell metacharacters, so a generated password can be
// pasted into a URL or a terminal without quoting.
const passwordAlphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// firstRunPassword decides what to seed on a fresh database, in priority order:
//
//  1. SWITCHYARD_ADMIN_PASSWORD — used verbatim, never logged.
//  2. SWITCHYARD_DEV=1         — the known dev password, for tests and local docs.
//  3. otherwise                — a random password, returned for one-time logging.
//
// mustChange is true whenever the password was not chosen by the operator, so
// the UI can force a rotation after the first login.
func firstRunPassword() (password string, mustChange bool, err error) {
	if env := strings.TrimSpace(os.Getenv("SWITCHYARD_ADMIN_PASSWORD")); env != "" {
		// An operator-supplied password is held to the real floor, so a typo
		// or an empty-ish value fails loudly at startup instead of seeding a
		// credential nobody can guess.
		if len([]rune(env)) < minPasswordLength {
			return "", false, fmt.Errorf("SWITCHYARD_ADMIN_PASSWORD is %d characters, minimum is %d", len([]rune(env)), minPasswordLength)
		}
		return env, false, nil
	}
	if devMode() {
		return devPassword, false, nil
	}
	pw, err := randomPassword(generatedPasswordLength)
	if err != nil {
		return "", false, err
	}
	return pw, true, nil
}

func devMode() bool {
	return os.Getenv("SWITCHYARD_DEV") == "1"
}

func randomPassword(n int) (string, error) {
	out := make([]byte, n)
	buf := make([]byte, n)
	alphabet := []byte(passwordAlphabet)
	// Rejection sampling keeps the distribution uniform. Reducing a random byte
	// modulo len(alphabet) instead would over-represent the first
	// 256%len(alphabet) symbols, which is 52 of 57 here — most of the alphabet.
	limit := 256 - (256 % len(alphabet))
	for i := 0; i < n; {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if int(b) >= limit {
				continue
			}
			out[i] = alphabet[int(b)%len(alphabet)]
			i++
			if i == n {
				break
			}
		}
	}
	return string(out), nil
}

// EnsureAuthSeed creates the admin credential on first run. It is a no-op once
// a credential exists, so restarting the server never resets a live password.
func EnsureAuthSeed() error {
	return ensureAuthSeed(firstRunPassword)
}

// ensureAuthSeed takes the password decision as a parameter so the ordering
// above can be tested without mutating process environment.
func ensureAuthSeed(decide func() (string, bool, error)) error {
	db, err := openAuthDB()
	if err != nil {
		return err
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM auth_config`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	password, mustChange, err := decide()
	if err != nil {
		return err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	must := 0
	if mustChange {
		must = 1
	}
	// The salt column is retained for legacy hashes. argon2id embeds its own
	// salt in the hash string, so new rows leave it empty.
	if _, err := db.Exec(`INSERT INTO auth_config (id,salt,password_hash,must_change) VALUES (1,'',?,?)`,
		hash, must); err != nil {
		return err
	}
	// A generated password exists only in this log line. It is never persisted
	// in plaintext and cannot be recovered later, so say so explicitly.
	if mustChange {
		log.Printf("switchyard: first run — created an admin password for %s", authDBPath())
		log.Printf("switchyard: ─────────────────────────────────────────────")
		log.Printf("switchyard:   password: %s", password)
		log.Printf("switchyard:   This is shown ONCE. Save it now.")
		log.Printf("switchyard:   A password change is required at first login,")
		log.Printf("switchyard:   or set SWITCHYARD_ADMIN_PASSWORD and restart.")
		log.Printf("switchyard: ─────────────────────────────────────────────")
	}
	return nil
}

// VerifyPassword reports whether password matches the stored credential. On a
// successful match against a hash written with older or weaker parameters, it
// rewrites the row as argon2id with the current policy, so upgrading the binary
// migrates every credential the first time it is used.
func VerifyPassword(password string) (bool, error) {
	ok, err := verifyAndRehash(password)
	if err != nil {
		return false, err
	}
	return ok, nil
}

func verifyAndRehash(password string) (bool, error) {
	db, err := openAuthDB()
	if err != nil {
		return false, err
	}
	var salt, stored string
	if err := db.QueryRow(`SELECT salt,password_hash FROM auth_config WHERE id=1`).Scan(&salt, &stored); err != nil {
		return false, err
	}
	ok, needsRehash, err := verifyPassword(stored, salt, password)
	if err != nil {
		return false, err
	}
	if !ok || !needsRehash {
		return ok, nil
	}
	fresh, err := hashPassword(password)
	if err != nil {
		// The password was correct; failing to upgrade the hash is not a
		// reason to reject a valid login.
		log.Printf("switchyard: password rehash failed: %v", err)
		return true, nil
	}
	if _, err := db.Exec(`UPDATE auth_config SET password_hash=?, salt='' WHERE id=1`, fresh); err != nil {
		log.Printf("switchyard: password rehash write failed: %v", err)
		return true, nil
	}
	log.Printf("switchyard: password hash upgraded to %s", argon2idTuningString())
	return true, nil
}

// PasswordMustChange reports whether the stored password was generated rather
// than chosen by the operator, so the UI can force a rotation. An existing
// database that predates the flag is treated as "no change needed": an operator
// who already set a real password must not be locked out of their own server.
func PasswordMustChange() (bool, error) {
	db, err := openAuthDB()
	if err != nil {
		return false, err
	}
	var must int
	if err := db.QueryRow(`SELECT must_change FROM auth_config WHERE id=1`).Scan(&must); err != nil {
		return false, err
	}
	return must != 0, nil
}

func ChangePassword(current, next string) error {
	if len([]rune(next)) < minPasswordLength {
		return fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}
	ok, err := VerifyPassword(current)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("current password is incorrect")
	}
	db, err := openAuthDB()
	if err != nil {
		return err
	}
	hash, err := hashPassword(next)
	if err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE auth_config SET salt='',password_hash=?,must_change=0 WHERE id=1`, hash); err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM sessions`)
	return err
}

func CreateSession() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)
	db, err := openAuthDB()
	if err != nil {
		return "", err
	}
	_, err = db.Exec(`INSERT INTO sessions (token_hash,expires_at) VALUES (?,?)`, hashToken(token), time.Now().Add(authSessionDays*24*time.Hour).Unix())
	return token, err
}

func ValidateSession(token string) (bool, error) {
	if strings.TrimSpace(token) == "" {
		return false, nil
	}
	db, err := openAuthDB()
	if err != nil {
		return false, err
	}
	var expires int64
	if err := db.QueryRow(`SELECT expires_at FROM sessions WHERE token_hash=?`, hashToken(token)).Scan(&expires); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if expires <= time.Now().Unix() {
		_, _ = db.Exec(`DELETE FROM sessions WHERE token_hash=?`, hashToken(token))
		return false, nil
	}
	return true, nil
}

func DeleteSession(token string) error {
	db, err := openAuthDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM sessions WHERE token_hash=?`, hashToken(token))
	return err
}
