package kanban

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// seedForTest seeds a fresh auth database with the dev password, which is what
// every credential-behaviour test below needs as a known starting point.
func seedForTest(t *testing.T) {
	t.Helper()
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func TestAuthSeedDefaultPasswordRequiresDevFlag(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	// No SWITCHYARD_DEV: the known constant must not be reachable, and no
	// operator password is set, so a random one is generated instead.
	t.Setenv("SWITCHYARD_DEV", "")
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	ok, err := VerifyPassword(devPassword)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ok {
		t.Fatalf("dev password %q must not verify without SWITCHYARD_DEV=1", devPassword)
	}
	// The generated password is flagged for rotation.
	must, err := PasswordMustChange()
	if err != nil {
		t.Fatalf("must_change: %v", err)
	}
	if !must {
		t.Fatal("a generated password must be flagged must_change")
	}
}

func TestAuthSeedDevFlagUsesKnownPassword(t *testing.T) {
	seedForTest(t)
	ok, err := VerifyPassword(devPassword)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatalf("dev password %q should verify when SWITCHYARD_DEV=1", devPassword)
	}
	ok, _ = VerifyPassword("wrong")
	if ok {
		t.Fatal("wrong password should not verify")
	}
	// A dev password is chosen, not generated, so no forced rotation.
	must, err := PasswordMustChange()
	if err != nil {
		t.Fatalf("must_change: %v", err)
	}
	if must {
		t.Fatal("dev password should not require a change")
	}
}

func TestFirstRunPasswordPrecedence(t *testing.T) {
	cases := []struct {
		name           string
		env            map[string]string
		wantPassword   string
		wantMustChange bool
	}{
		{
			name:           "explicit env wins over dev flag",
			env:            map[string]string{"SWITCHYARD_ADMIN_PASSWORD": "operator-chosen-1", "SWITCHYARD_DEV": "1"},
			wantPassword:   "operator-chosen-1",
			wantMustChange: false,
		},
		{
			name:           "env password wins over random",
			env:            map[string]string{"SWITCHYARD_ADMIN_PASSWORD": "operator-chosen-1"},
			wantPassword:   "operator-chosen-1",
			wantMustChange: false,
		},
		{
			name:           "dev flag wins over random",
			env:            map[string]string{"SWITCHYARD_DEV": "1"},
			wantPassword:   devPassword,
			wantMustChange: false,
		},
		{
			name:           "blank env is ignored",
			env:            map[string]string{"SWITCHYARD_ADMIN_PASSWORD": "   "},
			wantMustChange: true,
		},
		{
			name:           "dev flag must be exactly 1",
			env:            map[string]string{"SWITCHYARD_DEV": "true"},
			wantMustChange: true,
		},
		{
			name: "short env password is rejected",
			env:  map[string]string{"SWITCHYARD_ADMIN_PASSWORD": "short"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("SWITCHYARD_ADMIN_PASSWORD", "")
			t.Setenv("SWITCHYARD_DEV", "")
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			got, mustChange, err := firstRunPassword()
			if tc.wantPassword == "" && !tc.wantMustChange {
				// The rejection case: no password may be produced at all.
				if err == nil {
					t.Fatalf("expected an error, got password %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("firstRunPassword: %v", err)
			}
			if tc.wantPassword != "" && got != tc.wantPassword {
				t.Fatalf("password = %q want %q", got, tc.wantPassword)
			}
			if mustChange != tc.wantMustChange {
				t.Fatalf("mustChange = %v want %v", mustChange, tc.wantMustChange)
			}
			if tc.wantMustChange {
				assertGeneratedPasswordShape(t, got)
			}
		})
	}
}

func TestRandomPasswordShape(t *testing.T) {
	seen := make(map[string]bool, 50)
	for i := 0; i < 50; i++ {
		pw, err := randomPassword(generatedPasswordLength)
		if err != nil {
			t.Fatalf("randomPassword: %v", err)
		}
		assertGeneratedPasswordShape(t, pw)
		// Two identical 24-char draws would mean the entropy source is broken.
		if seen[pw] {
			t.Fatalf("randomPassword repeated %q after %d draws", pw, i)
		}
		seen[pw] = true
	}
}

func assertGeneratedPasswordShape(t *testing.T, pw string) {
	t.Helper()
	if len(pw) != generatedPasswordLength {
		t.Fatalf("length = %d want %d", len(pw), generatedPasswordLength)
	}
	for _, r := range pw {
		if !strings.ContainsRune(passwordAlphabet, r) {
			t.Fatalf("character %q is not in the alphabet", r)
		}
	}
}

func TestEnsureAuthSeedIsIdempotent(t *testing.T) {
	seedForTest(t)
	if err := ChangePassword(devPassword, "a-better-password"); err != nil {
		t.Fatalf("change: %v", err)
	}
	// A restart must never reset a live password back to the seeded one.
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("reseed: %v", err)
	}
	ok, _ := VerifyPassword("a-better-password")
	if !ok {
		t.Fatal("restart reset the password")
	}
	ok, _ = VerifyPassword(devPassword)
	if ok {
		t.Fatal("restart reinstated the dev password")
	}
}

func TestEnsureAuthSeedRejectsShortChosenPassword(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_ADMIN_PASSWORD", "short")
	t.Setenv("SWITCHYARD_DEV", "")
	if err := EnsureAuthSeed(); err == nil {
		t.Fatal("a chosen password below the minimum must be rejected, not silently seeded")
	}
}

// TestChosenPasswordNeedsNoRotation covers the operator-chosen path end to end:
// SWITCHYARD_ADMIN_PASSWORD seeds the credential and no rotation is demanded,
// because the operator chose it rather than receiving a generated one.
func TestChosenPasswordNeedsNoRotation(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_ADMIN_PASSWORD", "chosen-by-operator")
	t.Setenv("SWITCHYARD_DEV", "")
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	must, err := PasswordMustChange()
	if err != nil {
		t.Fatalf("must_change: %v", err)
	}
	if must {
		t.Fatal("an operator-chosen password must not require a rotation")
	}
	ok, err := VerifyPassword("chosen-by-operator")
	if err != nil || !ok {
		t.Fatalf("chosen password must verify: ok=%v err=%v", ok, err)
	}
	// It is stored as argon2id, never in plaintext.
	db, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := db.QueryRow(`SELECT password_hash FROM auth_config WHERE id=1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(stored, "$argon2id$") {
		t.Fatalf("hash is not argon2id: %q", stored)
	}
	if strings.Contains(stored, "chosen-by-operator") {
		t.Fatal("the password appears in the stored hash")
	}
}

// TestChangePasswordClearsMustChange proves rotating a generated password
// releases the forced-change screen.
func TestChangePasswordClearsMustChange(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_ADMIN_PASSWORD", "")
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Simulate the generated-password state.
	db, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE auth_config SET must_change=1 WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	if must, _ := PasswordMustChange(); !must {
		t.Fatal("setup: must_change should be set")
	}
	if err := ChangePassword(devPassword, "chosen-by-operator"); err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	must, err := PasswordMustChange()
	if err != nil {
		t.Fatal(err)
	}
	if must {
		t.Fatal("ChangePassword should clear must_change")
	}
}

func TestAuthVerifyAndChange(t *testing.T) {
	seedForTest(t)
	// change with correct current
	if err := ChangePassword(devPassword, "newpass123456"); err != nil {
		t.Fatalf("change: %v", err)
	}
	ok, _ := VerifyPassword("newpass123456")
	if !ok {
		t.Fatal("new password should verify")
	}
	ok, _ = VerifyPassword(devPassword)
	if ok {
		t.Fatal("old password should not verify after change")
	}
	// change with wrong current should fail
	if err := ChangePassword("wrong", "anotherpassword"); err == nil {
		t.Fatal("change with wrong current should fail")
	}
}

func TestAuthChangeValidation(t *testing.T) {
	seedForTest(t)
	if err := ChangePassword(devPassword, "123"); err == nil {
		t.Fatal("too short password should be rejected")
	}
	if err := ChangePassword(devPassword, ""); err == nil {
		t.Fatal("empty password should be rejected")
	}
	// 11 characters is one below the minimum.
	if err := ChangePassword(devPassword, "12345678901"); err == nil {
		t.Fatal("password one below the minimum should be rejected")
	}
	// exactly 12 is accepted
	if err := ChangePassword(devPassword, "123456789012"); err != nil {
		t.Fatalf("password at the minimum length should be accepted: %v", err)
	}
}

func TestAuthSessionCreateValidateExpiry(t *testing.T) {
	seedForTest(t)
	token, err := CreateSession()
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if token == "" {
		t.Fatal("token empty")
	}
	ok, err := ValidateSession(token)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if !ok {
		t.Fatal("fresh session should be valid")
	}
	// invalid token
	ok, _ = ValidateSession("invalid-token")
	if ok {
		t.Fatal("invalid token should not validate")
	}
	// delete
	if err := DeleteSession(token); err != nil {
		t.Fatalf("delete: %v", err)
	}
	ok, _ = ValidateSession(token)
	if ok {
		t.Fatal("deleted session should not validate")
	}
}

func TestAuthSessionExpiry(t *testing.T) {
	seedForTest(t)
	token, _ := CreateSession()
	// force expire by setting expires_at in past
	db, _ := openAuthDB()
	_, _ = db.Exec(`UPDATE sessions SET expires_at=? WHERE token_hash=?`, time.Now().Add(-time.Hour).Unix(), hashToken(token))
	// The handle is pooled; closing it here would break later requests.
	ok, _ := ValidateSession(token)
	if ok {
		t.Fatal("expired session should not validate")
	}
}

func TestAuthChangeRevokesSessions(t *testing.T) {
	seedForTest(t)
	tok, _ := CreateSession()
	if err := ChangePassword(devPassword, "newpass456789"); err != nil {
		t.Fatalf("change: %v", err)
	}
	ok, _ := ValidateSession(tok)
	if ok {
		t.Fatal("sessions should be revoked after password change")
	}
}

// TestAuthMigratesLegacyDatabase proves an auth.db written before must_change
// existed is upgraded in place, and that its existing password keeps working.
// An operator upgrading the binary must not be locked out.
func TestAuthMigratesLegacyDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HERMES_HOME", home)
	t.Setenv("SWITCHYARD_DEV", "1")

	// Write a legacy database with the old two-column schema.
	legacy := newLegacyAuthDB(t, home, "legacy-password-1")
	legacy.Close()

	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	ok, err := VerifyPassword("legacy-password-1")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("legacy password should still verify after migration")
	}
	// must_change defaults to 0 for migrated rows: no forced rotation.
	must, err := PasswordMustChange()
	if err != nil {
		t.Fatalf("must_change: %v", err)
	}
	if must {
		t.Fatal("migrated credential should not require a change")
	}
}

func authTestHashToken(tok string) string {
	return hashToken(tok)
}

// TestPurgeExpiredSessions proves abandoned sessions are reclaimed. Without a
// sweeper they accumulate forever, because a row is only deleted when that
// exact token is presented again — which never happens for a token the user has
// discarded.
func TestPurgeExpiredSessions(t *testing.T) {
	seedForTest(t)
	live, err := CreateSession()
	if err != nil {
		t.Fatal(err)
	}
	// Two already-expired sessions.
	db, _ := openAuthDB()
	for i := 0; i < 2; i++ {
		tok, err := CreateSession()
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`UPDATE sessions SET expires_at=? WHERE token_hash=?`,
			time.Now().Add(-time.Hour).Unix(), hashToken(tok)); err != nil {
			t.Fatal(err)
		}
	}

	n, err := purgeExpiredSessions()
	if err != nil {
		t.Fatalf("purge: %v", err)
	}
	if n != 2 {
		t.Fatalf("purged %d, want 2", n)
	}
	// The live session must survive, and still work.
	if ok, _ := ValidateSession(live); !ok {
		t.Fatal("purge removed a live session")
	}
	// A second sweep has nothing left to do.
	if n, err := purgeExpiredSessions(); err != nil || n != 0 {
		t.Fatalf("second purge removed %d (err %v), want 0", n, err)
	}
}

// TestAuthDBHandleIsPooled proves repeated calls return the same handle rather
// than reopening and re-migrating on every API request.
func TestAuthDBHandleIsPooled(t *testing.T) {
	seedForTest(t)
	first, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	second, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("openAuthDB returned a different handle for the same path")
	}
	// A working query proves the pooled handle is still usable after reuse.
	if err := first.Ping(); err != nil {
		t.Fatalf("pooled handle is not usable: %v", err)
	}
}

func TestStartSessionJanitorStopsOnContextCancel(t *testing.T) {
	seedForTest(t)
	ctx, cancel := context.WithCancel(context.Background())
	StartSessionJanitor(ctx, 10*time.Millisecond)
	// Let a few ticks run, then stop. The goroutine must exit on its own.
	time.Sleep(50 * time.Millisecond)
	cancel()
	time.Sleep(30 * time.Millisecond)
	// The handle must still work after the janitor has stopped.
	if _, err := openAuthDB(); err != nil {
		t.Fatalf("auth db unusable after janitor stop: %v", err)
	}
}

// newLegacyAuthDB writes an auth.db using the pre-must_change schema, so the
// migration path can be exercised against a database this binary did not
// create. It bypasses openAuthDB, which would create the current schema.
func newLegacyAuthDB(t *testing.T, hermesHome, password string) *sql.DB {
	t.Helper()
	dir := filepath.Join(hermesHome, "kanban")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)", filepath.Join(dir, "auth.db")))
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	// The old schema: no must_change column.
	if _, err := db.Exec(`CREATE TABLE auth_config (id INTEGER PRIMARY KEY CHECK (id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`); err != nil {
		db.Close()
		t.Fatalf("create legacy schema: %v", err)
	}
	salt, err := newSalt()
	if err != nil {
		db.Close()
		t.Fatalf("salt: %v", err)
	}
	// The retired scheme, so the migration path is exercised against a hash
	// this code can no longer produce.
	legacy := legacyHash(password, salt)
	if _, err := db.Exec(`INSERT INTO auth_config (id,salt,password_hash) VALUES (1,?,?)`, salt, legacy); err != nil {
		db.Close()
		t.Fatalf("insert legacy row: %v", err)
	}
	return db
}

// legacyHash reproduces the retired SHA-256 chain exactly, so a database
// written by an older binary still verifies.
func legacyHash(password, salt string) string {
	v := []byte(salt + ":" + password)
	for i := 0; i < legacyIterations; i++ {
		sum := sha256.Sum256(v)
		v = sum[:]
	}
	return hex.EncodeToString(v)
}
