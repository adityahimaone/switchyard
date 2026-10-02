package kanban

import (
	"encoding/base64"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/crypto/argon2"
)

func TestHashPasswordProducesArgon2idPHC(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$") {
		t.Fatalf("not a PHC argon2id string: %q", hash)
	}
	// The parameters must travel with the hash so they can be raised later
	// without a schema change.
	if !strings.Contains(hash, "m=65536,t=3,p=2") {
		t.Fatalf("parameters not embedded in hash: %q", hash)
	}
}

func TestHashPasswordUsesFreshSalt(t *testing.T) {
	a, err := hashPassword("same-password")
	if err != nil {
		t.Fatal(err)
	}
	b, err := hashPassword("same-password")
	if err != nil {
		t.Fatal(err)
	}
	// Identical passwords must not produce identical hashes, or the database
	// leaks which rows share a password.
	if a == b {
		t.Fatal("two hashes of the same password are identical: salt is not random")
	}
}

func TestVerifyPasswordArgon2id(t *testing.T) {
	hash, err := hashPassword("a-good-password")
	if err != nil {
		t.Fatal(err)
	}
	ok, needsRehash, err := verifyPassword(hash, "", "a-good-password")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("correct password rejected")
	}
	if needsRehash {
		t.Fatal("a hash at current parameters must not request a rehash")
	}

	ok, _, err = verifyPassword(hash, "", "a-good-passwore")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ok {
		t.Fatal("wrong password accepted")
	}
}

// TestVerifyPasswordRejectsMalformedHashes covers a corrupted or hand-edited
// database. Each case would otherwise size an allocation from attacker-shaped
// parameters, so the caps and format checks must reject rather than allocate.
func TestVerifyPasswordRejectsMalformedHashes(t *testing.T) {
	valid, err := hashPassword("x")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err = decodeArgon2id(valid); err != nil {
		t.Fatalf("a freshly produced hash must decode: %v", err)
	}

	cases := []struct{ name, stored string }{
		{"empty", ""},
		{"no params", "$argon2id$v=19$"},
		{"wrong prefix", "$argon2i$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA"},
		{"truncated", "$argon2id$v=19$m=65536,t=3,p=2$onlythree"},
		{"bad version", "$argon2id$v=13$m=65536,t=3,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"zero memory", "$argon2id$v=19$m=0,t=3,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"zero time", "$argon2id$v=19$m=65536,t=0,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"absurd memory", "$argon2id$v=19$m=99999999,t=3,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"absurd time", "$argon2id$v=19$m=65536,t=9999,p=2$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"absurd threads", "$argon2id$v=19$m=65536,t=3,p=255$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"salt not base64", "$argon2id$v=19$m=65536,t=3,p=2$!!!not-base64!!!$aGFzaGhhc2hoYXNoaGFzaA"},
		{"hash not base64", "$argon2id$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ$!!!not-base64!!!"},
		{"salt too short", "$argon2id$v=19$m=65536,t=3,p=2$YQ$aGFzaGhhc2hoYXNoaGFzaA"},
		{"hash too short", "$argon2id$v=19$m=65536,t=3,p=2$c2FsdHNhbHQ$aGFzaA"},
		{"garbage", "not-a-hash-at-all"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, _, err := decodeArgon2id(tc.stored); err == nil {
				t.Fatalf("decodeArgon2id accepted %q", tc.stored)
			}
		})
	}
}

// TestVerifyPasswordUnsupportedVariantIsAnError proves argon2i/argon2d are
// refused rather than silently verified with argon2id parameters, which would
// make a valid password fail with no explanation.
func TestVerifyPasswordUnsupportedVariantIsAnError(t *testing.T) {
	_, _, err := verifyPassword("$argon2i$v=19$m=65536,t=3,p=2$c2FsdA$aGFzaA", "", "whatever")
	if err == nil {
		t.Fatal("argon2i must be refused with an error, not treated as a mismatch")
	}
}

// TestVerifyPasswordWeakParamsRequestRehash proves an argon2id hash written with
// weaker settings still verifies, and is flagged so login can upgrade it.
func TestVerifyPasswordWeakParamsRequestRehash(t *testing.T) {
	// t=1,p=1 is far below the current policy but structurally valid.
	weak := encodeWeakArgon2id("legacy-password", 1, 1)
	ok, needsRehash, err := verifyPassword(weak, "", "legacy-password")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("a weaker but valid argon2id hash must still verify")
	}
	if !needsRehash {
		t.Fatal("a hash below current parameters must request an upgrade")
	}
}

// encodeWeakArgon2id produces a syntactically valid hash with parameters the
// current code can no longer emit, so the upgrade path is genuinely exercised.
func encodeWeakArgon2id(password string, timeCost uint32, threads uint8) string {
	salt := []byte("saltsaltsalt")
	const mem = 64 * 1024
	key := argon2.IDKey([]byte(password), salt, timeCost, mem, threads, argon2KeyLen)
	return "$argon2id$v=19$m=65536,t=" + strconv.FormatUint(uint64(timeCost), 10) +
		",p=" + strconv.FormatUint(uint64(threads), 10) +
		"$" + base64.RawStdEncoding.EncodeToString(salt) +
		"$" + base64.RawStdEncoding.EncodeToString(key)
}

func TestLegacyHashStillVerifies(t *testing.T) {
	salt := "abc123salt"
	stored := legacyHash("old-password", salt)
	ok, needsRehash, err := verifyPassword(stored, salt, "old-password")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("a legacy hash must still verify after the argon2id migration")
	}
	if !needsRehash {
		t.Fatal("a legacy hash must be flagged for upgrade")
	}

	ok, _, err = verifyPassword(stored, salt, "wrong-password")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ok {
		t.Fatal("legacy hash accepted the wrong password")
	}
}

func TestVerifyPasswordUpgradesLegacyOnLogin(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_DEV", "1")

	// Seed, then downgrade the stored row to the retired scheme.
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	salt := "legacysalt"
	db, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE auth_config SET salt=?, password_hash=? WHERE id=1`,
		salt, legacyHash(devPassword, salt)); err != nil {
		t.Fatal(err)
	}
	var stored string
	if err := db.QueryRow(`SELECT password_hash FROM auth_config WHERE id=1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(stored, "$argon2id$") {
		t.Fatalf("expected a legacy row before login, got %q", stored)
	}
	if stored != legacyHash(devPassword, salt) {
		t.Fatalf("legacy row not written correctly: %q", stored)
	}

	// A successful login must transparently upgrade the row.
	ok, err := VerifyPassword(devPassword)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !ok {
		t.Fatal("legacy password rejected after migration")
	}

	// The handle is pooled, so it is reused rather than reopened.
	var after, afterSalt string
	if err := db.QueryRow(`SELECT password_hash, salt FROM auth_config WHERE id=1`).Scan(&after, &afterSalt); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(after, "$argon2id$") {
		t.Fatalf("hash was not upgraded on login: %q", after)
	}
	if afterSalt != "" {
		t.Fatalf("legacy salt should be cleared after upgrade, got %q", afterSalt)
	}
	// And it must still verify, now via argon2id, without a second upgrade.
	ok, _, err = verifyPassword(after, "", devPassword)
	if err != nil || !ok {
		t.Fatalf("upgraded hash must verify: ok=%v err=%v", ok, err)
	}
}

func TestVerifyPasswordDoesNotUpgradeOnFailure(t *testing.T) {
	t.Setenv("HERMES_HOME", t.TempDir())
	t.Setenv("SWITCHYARD_DEV", "1")
	if err := EnsureAuthSeed(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	salt := "legacysalt2"
	db, err := openAuthDB()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE auth_config SET salt=?, password_hash=? WHERE id=1`,
		salt, legacyHash(devPassword, salt)); err != nil {
		t.Fatal(err)
	}
	// A failed login must not rewrite the row: that would let an attacker
	// convert the hash to a format of their choosing, or burn CPU on writes.
	if ok, _ := VerifyPassword("not-the-password"); ok {
		t.Fatal("wrong password accepted")
	}
	var stored string
	if err := db.QueryRow(`SELECT password_hash FROM auth_config WHERE id=1`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(stored, "$argon2id$") {
		t.Fatal("a failed login upgraded the hash")
	}
}
