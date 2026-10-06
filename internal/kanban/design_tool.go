package kanban

// The design-tool switch: how a card declares that its design
// must be produced with pen.dev, and which pen.dev surface does
// it. The tool choice used to live in card prose, which is how
// t_e44e7e9b died: its body said "the pen CLI is NOT installed",
// the prose went stale, and the run spent its whole budget on a
// flow that no longer applied. design_tool makes the choice a
// column the dispatcher reads, so the mandate it renders cannot
// go stale the way a sentence can.

import (
	"fmt"
	"regexp"
	"strings"
)

// DesignToolLadder is the set of pen.dev surfaces a card may name.
// pen_cli is the headless CLI (pen --out ... --prompt ... --export):
// the only surface that can create a new .pen file on a worker.
// pencil_mcp is the desktop app's MCP server, which edits the
// document open in the app but cannot save a new document.
var DesignToolLadder = []string{"pen_cli", "pencil_mcp"}

// ValidDesignTools is the ladder as a lookup, the way
// ValidExecutors is for executors.
var ValidDesignTools = map[string]bool{}

func init() {
	for _, tool := range DesignToolLadder {
		ValidDesignTools[tool] = true
	}
}

// designVocab matches the words a card uses when its design
// lives in pen.dev. The guard below uses it in both directions:
// a design_tool tag with no such words is probably a misclick,
// and such words with no tag are probably a forgotten one.
var designVocab = regexp.MustCompile(`(?i)pen\.dev|pencil|canvas|\.pen\b|design|designing|mock|screenshot|wireframe|prototype|visual`)

// DesignVocabularyHit reports whether the text uses the
// design/canvas vocabulary pen.dev cards are written in.
func DesignVocabularyHit(text string) bool {
	return designVocab.MatchString(text)
}

// DesignPathForTitle derives the default design file for a card
// from its title: design/<kebab-title>.pen. A pen_cli card
// created without an explicit design_source gets this path, so
// the mandate and the export beside it have a home without the
// author having to invent a filename.
func DesignPathForTitle(title string) string {
	s := strings.ToLower(strings.TrimSpace(title))
	s = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 48 {
		s = strings.Trim(s[:48], "-")
	}
	if s == "" {
		s = "design"
	}
	return "design/" + s + ".pen"
}

// maxDesignToolBytes caps design_tool like the other enum-ish
// task fields: it is a fixed token, so anything longer than a
// token is a client bug, not a value.
const maxDesignToolBytes = 32

// TaskDesignWarnings returns the two-way guard around the
// design-tool switch. Hints, not errors: the switch is the
// author's explicit intent and always wins, but a card that
// disagrees with its own description is worth a warning before
// an agent spends a design budget on it.
func TaskDesignWarnings(t *Task) []Issue {
	var hints []Issue
	text := strings.TrimSpace(t.Title) + " " + strings.TrimSpace(t.Body)
	hit := DesignVocabularyHit(text)
	switch {
	case t.DesignTool != "" && !hit:
		hints = append(hints, Issue{
			Code:    CodeDesignHint,
			Field:   "design_tool",
			Message: fmt.Sprintf("design_tool=%q but the title and prompt contain no design/canvas vocabulary (pen.dev, canvas, design, mock, .pen) — is the tag intentional?", t.DesignTool),
		})
	case t.DesignTool == "" && t.DesignSource == "" && hit:
		hints = append(hints, Issue{
			Code:    CodeDesignHint,
			Field:   "design_tool",
			Message: "the title or prompt mentions design/canvas — if this card should generate a pen.dev mock, set design_tool=pen_cli (design_source names a committed mock the card implements verbatim)",
		})
	}
	return hints
}
