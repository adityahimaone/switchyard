package kanban

// The immutable design slice store.
//
// A Doop frame is live and editable. A card must not be graded against a design
// that changed after the card was created, so the control plane snapshots the
// frame ONCE into this store and the card points at that snapshot by identity.
// Dispatch reads the snapshot and inlines it into the prompt: workers therefore
// see a self-contained design contract and never need a Doop URL, an agent key,
// or any network access.
//
// Layout: ~/.hermes/kanban/design-slices/<slug>/<key>/{frame.html,frame.png,frame.json}
// The key is a sha256 prefix of the canonical doop:// ref, never user input, so
// it cannot steer a read outside the store.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	DesignSliceHTMLFile = "frame.html"
	DesignSlicePNGFile  = "frame.png"
	DesignSliceMetaFile = "frame.json"
	maxDesignSliceHTML  = 512 << 10
	maxDesignSlicePNG   = 8 << 20
)

var designSliceKeyPattern = regexp.MustCompile(`^[a-f0-9]{16}$`)

// DesignSlice is the metadata for one snapshot. The PNG stays on disk and is
// read only when it is served, so a large frame does not sit in every prompt.
type DesignSlice struct {
	Key            string   `json:"key"`
	Slug           string   `json:"slug"`
	DesignRef      string   `json:"design_ref"`
	DesignSource   string   `json:"design_source"`
	CanvasID       string   `json:"canvas_id"`
	FrameID        string   `json:"frame_id"`
	FrameName      string   `json:"frame_name"`
	Version        string   `json:"version"`
	ApprovalStatus string   `json:"approval_status"`
	Selectors      []string `json:"selectors,omitempty"`
	Width          int      `json:"width"`
	Height         int      `json:"height"`
	HTMLBytes      int      `json:"html_bytes"`
	PNGBytes       int      `json:"png_bytes"`
	Guidelines     string   `json:"guidelines,omitempty"`
	SourceURL      string   `json:"source_url,omitempty"`
	CreatedAt      int64    `json:"created_at"`
}

// DesignSliceDir returns the directory for one snapshot. An invalid key is
// rejected before it can become a filesystem path.
func DesignSliceDir(slug, key string) (string, error) {
	if !designSliceKeyPattern.MatchString(key) {
		return "", fmt.Errorf("invalid design slice key %q", key)
	}
	clean := strings.TrimSpace(slug)
	if clean == "" || strings.ContainsAny(clean, `/\`) || clean == "." || clean == ".." {
		return "", fmt.Errorf("invalid board slug %q", slug)
	}
	return filepath.Join(hermesHome(), "kanban", "design-slices", clean, key), nil
}

// LoadDesignSlice reads an existing snapshot. os.ErrNotExist means "not
// cached yet", which the resolver uses as its cache-miss signal.
func LoadDesignSlice(slug, key string) (*DesignSlice, string, error) {
	dir, err := DesignSliceDir(slug, key)
	if err != nil {
		return nil, "", err
	}
	raw, err := os.ReadFile(filepath.Join(dir, DesignSliceMetaFile))
	if err != nil {
		return nil, "", err
	}
	var slice DesignSlice
	if err := json.Unmarshal(raw, &slice); err != nil {
		return nil, "", fmt.Errorf("corrupt design slice %s: %w", key, err)
	}
	return &slice, dir, nil
}

// LoadDesignSliceHTML returns the authoritative markup of a snapshot.
func LoadDesignSliceHTML(slug, key string) (string, error) {
	dir, err := DesignSliceDir(slug, key)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(dir, DesignSliceHTMLFile))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// LoadDesignSlicePNG returns the scale-1 visual reference.
func LoadDesignSlicePNG(slug, key string) ([]byte, error) {
	dir, err := DesignSliceDir(slug, key)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(filepath.Join(dir, DesignSlicePNGFile))
}

// SaveDesignSlice writes a snapshot atomically: files land in a temp directory
// beside the target and the whole directory is renamed into place, so a reader
// never sees a half-written bundle.
func SaveDesignSlice(slice *DesignSlice, html string, png []byte) error {
	if slice == nil {
		return fmt.Errorf("nil design slice")
	}
	if len(html) > maxDesignSliceHTML {
		return fmt.Errorf("frame HTML is %d bytes, maximum is %d", len(html), maxDesignSliceHTML)
	}
	if len(png) > maxDesignSlicePNG {
		return fmt.Errorf("frame PNG is %d bytes, maximum is %d", len(png), maxDesignSlicePNG)
	}
	dir, err := DesignSliceDir(slice.Slug, slice.Key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
		return err
	}
	if _, _, err := LoadDesignSlice(slice.Slug, slice.Key); err == nil {
		return nil // already cached; never overwrite an immutable snapshot
	}
	tmp, err := os.MkdirTemp(filepath.Dir(dir), ".slice-"+slice.Key+"-")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(tmp) }()
	slice.HTMLBytes = len(html)
	slice.PNGBytes = len(png)
	if slice.CreatedAt == 0 {
		slice.CreatedAt = time.Now().Unix()
	}
	meta, err := json.MarshalIndent(slice, "", "  ")
	if err != nil {
		return err
	}
	for name, data := range map[string][]byte{
		DesignSliceHTMLFile: []byte(html),
		DesignSlicePNGFile:  png,
		DesignSliceMetaFile: append(meta, '\n'),
	} {
		if err := os.WriteFile(filepath.Join(tmp, name), data, 0o644); err != nil {
			return err
		}
	}
	if err := os.Rename(tmp, dir); err != nil {
		// Another request may have won the race. That is a cache hit, not a
		// failure, as long as the resulting bundle is complete.
		if _, _, loadErr := LoadDesignSlice(slice.Slug, slice.Key); loadErr == nil {
			return nil
		}
		return err
	}
	return nil
}

// Fingerprint is the content hash of the authored HTML, recorded on the card so
// a silent change to the frame can be detected even when the version is reused.
func Fingerprint(html string) string {
	sum := sha256.Sum256([]byte(html))
	return hex.EncodeToString(sum[:])[:12]
}

// DesignSlicePreviewURL is the API path that serves the snapshot's PNG.
func DesignSlicePreviewURL(slug, key string) string {
	return "/api/boards/" + slug + "/design-slices/" + key + "/frame.png"
}

// NormalizeSelectors trims, de-duplicates and bounds the layer selectors a card
// is allowed to implement. They are prose for the agent, not CSS executed by
// the server, so the only hard rules are size and count.
func NormalizeSelectors(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, raw := range in {
		s := strings.TrimSpace(raw)
		if s == "" || len(s) > 200 || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
		if len(out) == 32 {
			break
		}
	}
	return out
}
