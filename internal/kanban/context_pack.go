package kanban

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// LoadTaskIdentity returns the persisted TaskIdentity from execution_meta if valid, or nil.
func LoadTaskIdentity(db *sql.DB, taskID string) (*TaskIdentity, error) {
	var meta string
	if err := db.QueryRow(`SELECT COALESCE(execution_meta,'') FROM tasks WHERE id=?`, taskID).Scan(&meta); err != nil {
		return nil, err
	}
	meta = strings.TrimSpace(meta)
	if meta == "" {
		return nil, nil
	}
	var id TaskIdentity
	if err := json.Unmarshal([]byte(meta), &id); err != nil {
		return nil, nil
	}
	if id.Case == "" && id.Scope == "" {
		return nil, nil
	}
	return &id, nil
}

// BuildColdRerunContextPack assembles a structured context pack for re-runs
// when native harness session continuation is unavailable.
func BuildColdRerunContextPack(db *sql.DB, taskID, workspace, title, originalBody, lastResult string) string {
	var b strings.Builder
	b.WriteString("[CONTINUATION — STRUCTURED CONTEXT PACK]\n")
	b.WriteString("You are resuming an existing task in the workspace after reviewer feedback or a previous attempt.\n")
	b.WriteString("Do NOT redo completed work from scratch; inspect the current workspace diff and address the unresolved items below.\n\n")

	b.WriteString("## 1. Original Task Specification\n")
	b.WriteString("Title: " + strings.TrimSpace(title) + "\n")
	if strings.TrimSpace(originalBody) != "" {
		b.WriteString(strings.TrimSpace(originalBody) + "\n")
	}

	// 2. Current Git Diff Stat in Workspace
	if workspace != "" {
		if out, err := exec.Command("git", "-C", workspace, "diff", "--stat", "HEAD").Output(); err == nil && len(strings.TrimSpace(string(out))) > 0 {
			b.WriteString("\n## 2. Uncommitted Workspace Changes (git diff --stat)\n```\n")
			b.WriteString(strings.TrimSpace(string(out)))
			b.WriteString("\n```\n")
		}
	}

	// 3. Structured Summary of Previous Attempt
	if strings.TrimSpace(lastResult) != "" {
		b.WriteString("\n## 3. Previous Run Output Summary\n")
		b.WriteString(summarizePreviousResult(lastResult, 3200) + "\n")
	}

	// 4. Last Gate / Verify Failure Digest (if any)
	var gateStatus, gateOutput, verifyStatus, verifyReport string
	_ = db.QueryRow(`SELECT COALESCE(gate_status,''), COALESCE(gate_output,''), COALESCE(verify_status,''), COALESCE(verify_report,'') FROM tasks WHERE id=?`, taskID).
		Scan(&gateStatus, &gateOutput, &verifyStatus, &verifyReport)
	if gateStatus == "failed" && gateOutput != "" {
		b.WriteString("\n## 4. Quality Gate Failure to Fix\n```\n" + tailString(gateOutput, 1500) + "\n```\n")
	}
	if verifyStatus == "failed" && verifyReport != "" {
		b.WriteString("\n## 5. Verification Failure to Fix\n```\n" + tailString(verifyReport, 1500) + "\n```\n")
	}

	// 5. All Unresolved Review Comments (including file:line anchors)
	comments, _ := UnresolvedTaskComments(db, taskID)
	if len(comments) > 0 {
		b.WriteString("\n## 6. Unresolved Reviewer Feedback (Action Required)\n")
		for i, c := range comments {
			loc := ""
			if c.FilePath != "" {
				loc = fmt.Sprintf(" [%s:%d]", c.FilePath, c.LineNumber)
			}
			fmt.Fprintf(&b, "%d. @%s%s: %s\n", i+1, c.Author, loc, strings.TrimSpace(c.Body))
		}
	}
	return b.String()
}

func summarizePreviousResult(s string, limit int) string {
	s = strings.TrimSpace(s)
	if len(s) <= limit {
		return s
	}
	headLen := limit / 3
	tailLen := limit - headLen
	return s[:headLen] + "\n\n... [intermediate output omitted] ...\n\n" + s[len(s)-tailLen:]
}

func tailString(s string, limit int) string {
	s = strings.TrimSpace(s)
	if len(s) <= limit {
		return s
	}
	return "... [truncated]\n" + s[len(s)-limit:]
}
