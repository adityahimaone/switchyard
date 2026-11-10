package kanban

// Design provenance.
//
// design_source answers "what committed design does this card implement?".
// design_provider answers "where did that design come from?", and design_ref
// carries the immutable identity of the source object. Keeping provenance in
// its own column matters: design_tool is the pen.dev *generator* switch and its
// TaskDesignWarnings vocabulary guard fires on design prose, so overloading it
// with a Figma/Doop provider would produce a false hint on every design card.
//
// The ref is deliberately not a URL the agent may fetch. It is an identity the
// control plane resolves ONCE, at create time, into an immutable slice bundle.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
)

const (
	DesignProviderDoop        = "doop"
	DesignProviderFigmaLink   = "figma_link"
	DesignProviderFigmaPlugin = "figma_plugin"
	DesignProviderFigmaMCP    = "figma_mcp"
	DesignProviderPen         = "pen"
)

// DesignProviderLadder is the set of origins a card may declare. "" (no design)
// is the absence of a declaration and is not a rung.
var DesignProviderLadder = []string{
	DesignProviderDoop,
	DesignProviderFigmaLink,
	DesignProviderFigmaPlugin,
	DesignProviderFigmaMCP,
	DesignProviderPen,
}

var ValidDesignProviders = map[string]bool{}

func init() {
	for _, provider := range DesignProviderLadder {
		ValidDesignProviders[provider] = true
	}
}

// maxDesignRefBytes caps the ref like the other enum-ish task fields. It is an
// identity string, not prose: anything longer is a client bug.
const maxDesignRefBytes = 512

// doopRefPattern accepts doop://<canvas>/<frame>[@<version>]. The version is
// optional because list_frame_versions may not be exposed on every Doop build;
// when absent the fetch timestamp is used as the cache version instead.
var doopRefPattern = regexp.MustCompile(`^doop://([A-Za-z0-9._~-]+)/([A-Za-z0-9._~-]+)(?:@([A-Za-z0-9._~:+-]+))?$`)

// DoopRef is the parsed, canonical identity of one Doop frame.
type DoopRef struct {
	CanvasID string `json:"canvas_id"`
	FrameID  string `json:"frame_id"`
	Version  string `json:"version"`
}

// ParseDoopRef parses and canonicalises a design_ref for a Doop card.
func ParseDoopRef(ref string) (DoopRef, error) {
	m := doopRefPattern.FindStringSubmatch(strings.TrimSpace(ref))
	if m == nil {
		return DoopRef{}, fmt.Errorf("invalid doop design_ref %q (want doop://<canvas>/<frame>[@<version>])", ref)
	}
	return DoopRef{CanvasID: m[1], FrameID: m[2], Version: m[3]}, nil
}

// Canonical returns the stable string form of the ref.
func (r DoopRef) Canonical() string {
	out := "doop://" + r.CanvasID + "/" + r.FrameID
	if r.Version != "" {
		out += "@" + r.Version
	}
	return out
}

// Key is the cache key for the immutable snapshot of this exact frame version.
// It is derived from identity, never from a user-supplied path, so a design_ref
// cannot steer a read outside the slice store.
func (r DoopRef) Key() string {
	sum := sha256.Sum256([]byte(r.Canonical()))
	return hex.EncodeToString(sum[:])[:16]
}

// DesignSourcePath is the repo-relative path reported on the card. It mirrors
// where the bundle would be materialised in a workspace, without pretending the
// control plane owns that checkout.
func (r DoopRef) DesignSourcePath() string {
	return "design/doop/" + r.Key()
}

// ValidateDesignRef checks the shape and size of a design_ref for its provider.
// Non-Doop providers keep the raw reference (a Figma URL) as provenance text.
func ValidateDesignRef(provider, ref string) error {
	if len(ref) > maxDesignRefBytes {
		return fmt.Errorf("design ref is %d bytes, maximum is %d", len(ref), maxDesignRefBytes)
	}
	if hasControlChars(ref) {
		return fmt.Errorf("design ref contains control characters")
	}
	if provider != DesignProviderDoop {
		return nil
	}
	if strings.TrimSpace(ref) == "" {
		return fmt.Errorf("design_provider=doop requires a design_ref")
	}
	_, err := ParseDoopRef(ref)
	return err
}

// IsDoopDesign reports whether a card's design came from a Doop frame.
func IsDoopDesign(provider string) bool {
	return strings.EqualFold(strings.TrimSpace(provider), DesignProviderDoop)
}
