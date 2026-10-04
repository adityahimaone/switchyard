package kanban

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Password hashing.
//
// The original scheme chained 120k SHA-256 rounds over "salt:password". That is
// not a password KDF: it holds no memory, so a GPU or FPGA can evaluate it at
// billions of candidates per second, and it is a hand-rolled construction rather
// than a reviewed one. Argon2id is memory-hard, which is what makes offline
// cracking expensive regardless of the attacker's silicon.
//
// Stored format is the standard PHC string, so the parameters travel with the
// hash and can be raised later without a schema change:
//
//	$argon2id$v=19$m=65536,t=3,p=2$<b64 salt>$<b64 hash>
//
// Hashes written by the legacy scheme are still accepted and are transparently
// re-hashed to argon2id on the next successful login, so upgrading the binary
// never locks anyone out.
const (
	argon2Time    = 3
	argon2Memory  = 64 * 1024 // 64 MiB
	argon2Threads = 2
	argon2KeyLen  = 32
	argon2SaltLen = 16

	// legacyIterations is the round count of the retired SHA-256 chain. It is
	// kept only to verify existing hashes during the migration window.
	legacyIterations = 120000
)

const argon2Prefix = "$argon2id$"

// hashPassword returns a PHC-formatted argon2id hash with a fresh random salt.
func hashPassword(password string) (string, error) {
	salt := make([]byte, argon2SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return encodeArgon2id(password, salt), nil
}

func encodeArgon2id(password string, salt []byte) string {
	key := argon2.IDKey([]byte(password), salt, argon2Time, argon2Memory, argon2Threads, argon2KeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argon2Memory, argon2Time, argon2Threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	)
}

// verifyPassword reports whether password matches stored, and whether the
// stored hash should be upgraded to the current parameters.
//
// salt is the legacy per-row salt column. It is only consulted for hashes
// written by the retired SHA-256 chain; argon2id embeds its own salt in the
// hash string, so new rows leave that column empty.
//
// The returned upgrade flag is what makes the migration transparent: on a
// successful login against a legacy or under-parameterised hash, the caller
// rewrites it as argon2id without the user noticing.
func verifyPassword(stored, salt, password string) (ok bool, needsRehash bool, err error) {
	if strings.HasPrefix(stored, argon2Prefix) {
		return verifyArgon2id(stored, password)
	}
	if strings.HasPrefix(stored, "$argon2i$") || strings.HasPrefix(stored, "$argon2d$") {
		// Not produced by this code. Refusing is safer than guessing a format.
		return false, false, fmt.Errorf("unsupported argon2 variant")
	}
	// Legacy SHA-256 chain: "salt:password", hashed legacyIterations times.
	if ok := verifyLegacy(stored, salt, password); !ok {
		return false, false, nil
	}
	return true, true, nil
}

func verifyArgon2id(stored, password string) (ok bool, needsRehash bool, err error) {
	params, salt, want, err := decodeArgon2id(stored)
	if err != nil {
		return false, false, err
	}
	got := argon2.IDKey([]byte(password), salt, params.time, params.memory, params.threads, uint32(len(want)))
	// Constant-time: a byte-by-byte == returns early on the first mismatch and
	// leaks how much of the hash an attacker guessed correctly.
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return false, false, nil
	}
	return true, params.needsUpgrade(), nil
}

// decodeArgon2id parses a PHC string. Parameters are read from the string rather
// than from the constants, so a hash written with different settings still
// verifies instead of silently failing.
func decodeArgon2id(stored string) (params argon2Params, salt, want []byte, err error) {
	parts := strings.Split(stored, "$")
	// "", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return params, nil, nil, fmt.Errorf("malformed argon2id hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return params, nil, nil, fmt.Errorf("argon2id version: %w", err)
	}
	if version != argon2.Version {
		return params, nil, nil, fmt.Errorf("argon2id version %d unsupported", version)
	}
	var memory uint32
	var time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return params, nil, nil, fmt.Errorf("argon2id params: %w", err)
	}
	if memory == 0 || time == 0 || threads == 0 {
		return params, nil, nil, fmt.Errorf("argon2id params out of range")
	}
	// A stored hash is trusted input only in the sense that this process wrote
	// it, but these values size the allocation. Cap them so a corrupted or
	// hand-edited database cannot turn a login into an OOM kill.
	if memory > 1024*1024 {
		return params, nil, nil, fmt.Errorf("argon2id memory %d exceeds cap", memory)
	}
	if time > 32 {
		return params, nil, nil, fmt.Errorf("argon2id time %d exceeds cap", time)
	}
	if threads > 64 {
		return params, nil, nil, fmt.Errorf("argon2id threads %d exceeds cap", threads)
	}
	salt, err = base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return params, nil, nil, fmt.Errorf("argon2id salt: %w", err)
	}
	want, err = base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return params, nil, nil, fmt.Errorf("argon2id hash: %w", err)
	}
	if len(salt) < 8 || len(want) < 16 {
		return params, nil, nil, fmt.Errorf("argon2id salt or hash too short")
	}
	return argon2Params{memory: memory, time: time, threads: threads}, salt, want, nil
}

type argon2Params struct {
	memory  uint32
	time    uint32
	threads uint8
}

// needsUpgrade reports whether the stored hash was produced with weaker
// parameters than the current policy, so it can be rewritten on next login.
func (p argon2Params) needsUpgrade() bool {
	return p.memory < argon2Memory || p.time < argon2Time || p.threads < argon2Threads
}

// verifyLegacy checks a hash written by the retired SHA-256 chain. It exists
// only for the migration window and is removed once no operator still has one.
func verifyLegacy(stored, salt, password string) bool {
	v := []byte(salt + ":" + password)
	for i := 0; i < legacyIterations; i++ {
		sum := sha256.Sum256(v)
		v = sum[:]
	}
	want, err := hex.DecodeString(stored)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(v, want) == 1
}

func newSalt() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// argon2idTuningString renders the active parameters for the startup log, so an
// operator can see what the server is actually using.
func argon2idTuningString() string {
	return "argon2id m=" + strconv.Itoa(argon2Memory) + "KiB t=" + strconv.Itoa(argon2Time) +
		" p=" + strconv.Itoa(argon2Threads)
}
