package main

import (
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"kanban-board/internal/kanban"
)

// CompletionData is the "what did this card actually produce" summary for a
// settled card: which model ran, how long it took, where its log lives, and
// what landed in git. Everything here is read-only and derived — nothing is
// stored, so an old card reports its real state instead of a stale snapshot.
type CompletionData struct {
	Model         string  `json:"model"`
	Executor      string  `json:"executor"`
	ExecutionMode string  `json:"execution_mode"`
	Attempt       int     `json:"attempt"`
	StartedAt     *int64  `json:"started_at"`
	CompletedAt   *int64  `json:"completed_at"`
	DurationSecs  int64   `json:"duration_seconds"`
	ApproveCommit string  `json:"approve_commit,omitempty"`
	Log           LogInfo `json:"log"`
	Git           GitInfo `json:"git"`
}

type LogInfo struct {
	Path      string `json:"path"`
	Bytes     int64  `json:"bytes"`
	Modified  int64  `json:"modified"`
	Available bool   `json:"available"`
}

type GitInfo struct {
	Available   bool     `json:"available"`
	Reason      string   `json:"reason,omitempty"`
	Branch      string   `json:"branch,omitempty"`
	Head        string   `json:"head,omitempty"`
	Short       string   `json:"short,omitempty"`
	Subject     string   `json:"subject,omitempty"`
	Author      string   `json:"author,omitempty"`
	CommittedAt int64    `json:"committed_at,omitempty"`
	Files       int      `json:"files"`
	Insertions  int      `json:"insertions"`
	Deletions   int      `json:"deletions"`
	FileList    []string `json:"file_list,omitempty"`
	Upstream    string   `json:"upstream,omitempty"`
	Ahead       int      `json:"ahead"`
	Behind      int      `json:"behind"`
	Dirty       int      `json:"dirty"`
}

// One shell round-trip with sentinel markers, because every extra dispatch to a
// remote worker costs a job slot and a round-trip.
const completionGitScript = `echo "@@BRANCH"; git rev-parse --abbrev-ref HEAD 2>/dev/null
echo "@@HEAD"; git rev-parse HEAD 2>/dev/null
echo "@@SHORT"; git rev-parse --short HEAD 2>/dev/null
echo "@@SUBJECT"; git log -1 --pretty=%s 2>/dev/null
echo "@@AUTHOR"; git log -1 --pretty=%an 2>/dev/null
echo "@@AT"; git log -1 --pretty=%ct 2>/dev/null
echo "@@STAT"; git show --numstat --format= HEAD 2>/dev/null | awk '{a+=$1; d+=$2; n++} END {print n+0, a+0, d+0}'
echo "@@UPSTREAM"; git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
echo "@@AHEAD"; git rev-list --count @{u}..HEAD 2>/dev/null
echo "@@BEHIND"; git rev-list --count HEAD..@{u} 2>/dev/null
echo "@@DIRTY"; git status --porcelain 2>/dev/null | wc -l
echo "@@FILES"; git show --name-only --format= HEAD 2>/dev/null | sed '/^$/d' | head -40
echo "@@END"`

func parseCompletionGit(raw string) GitInfo {
	sections := map[string][]string{}
	key := ""
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimRight(line, "\r")
		if strings.HasPrefix(trimmed, "@@") {
			key = strings.TrimSpace(strings.TrimPrefix(trimmed, "@@"))
			continue
		}
		if key == "" {
			continue
		}
		sections[key] = append(sections[key], trimmed)
	}
	first := func(name string) string {
		for _, v := range sections[name] {
			if v = strings.TrimSpace(v); v != "" {
				return v
			}
		}
		return ""
	}
	num := func(name string) int {
		n, _ := strconv.Atoi(first(name))
		return n
	}
	at, _ := strconv.ParseInt(first("AT"), 10, 64)
	g := GitInfo{
		Branch:      first("BRANCH"),
		Head:        first("HEAD"),
		Short:       first("SHORT"),
		Subject:     first("SUBJECT"),
		Author:      first("AUTHOR"),
		CommittedAt: at,
		Upstream:    first("UPSTREAM"),
		Ahead:       num("AHEAD"),
		Behind:      num("BEHIND"),
		Dirty:       num("DIRTY"),
	}
	// "3 42 7" -> files, insertions, deletions. A binary file reports "-"
	// and awk turns that into 0, which is the honest answer for a line count.
	if parts := strings.Fields(first("STAT")); len(parts) == 3 {
		g.Files, _ = strconv.Atoi(parts[0])
		g.Insertions, _ = strconv.Atoi(parts[1])
		g.Deletions, _ = strconv.Atoi(parts[2])
	}
	for _, f := range sections["FILES"] {
		if f = strings.TrimSpace(f); f != "" {
			g.FileList = append(g.FileList, f)
		}
	}
	g.Available = g.Head != ""
	if !g.Available {
		g.Reason = "no git repository in this workspace"
	}
	return g
}

func completionLog(slug, id string) LogInfo {
	path := kanban.WorkerLogPath(slug, id)
	info, err := os.Stat(path)
	if err != nil {
		return LogInfo{Path: path}
	}
	return LogInfo{Path: path, Bytes: info.Size(), Modified: info.ModTime().Unix(), Available: true}
}

func handleTaskCompletion(w http.ResponseWriter, r *http.Request) {
	slug, id := r.PathValue("slug"), r.PathValue("id")
	if _, err := kanban.MigrateBoardSchemaPublic(slug); err != nil {
		fail(w, err, http.StatusInternalServerError)
		return
	}
	db, err := sql.Open("sqlite", "file:"+kanban.BoardDBPath(slug)+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		fail(w, err, http.StatusInternalServerError)
		return
	}
	defer db.Close()

	var out CompletionData
	var started, completed sql.NullInt64
	var approve sql.NullString
	err = db.QueryRow(`SELECT COALESCE(model,''), COALESCE(executor,''), COALESCE(execution_mode,''),
		COALESCE(attempt,1), started_at, completed_at, last_approve_commit
		FROM tasks WHERE id=?`, id).
		Scan(&out.Model, &out.Executor, &out.ExecutionMode, &out.Attempt, &started, &completed, &approve)
	if err == sql.ErrNoRows {
		fail(w, fmt.Errorf("task %q not found", id), http.StatusNotFound)
		return
	}
	if err != nil {
		fail(w, err, http.StatusInternalServerError)
		return
	}
	if started.Valid {
		out.StartedAt = &started.Int64
	}
	if completed.Valid {
		out.CompletedAt = &completed.Int64
	}
	if approve.Valid {
		// Older rows recorded the node-agent provenance word instead of a hash
		// (headSHA's old fields[0]); only a hex token is a commit.
		if _, hexErr := hex.DecodeString(approve.String); hexErr == nil && len(approve.String) >= 7 {
			out.ApproveCommit = approve.String
		}
	}
	if started.Valid && completed.Valid && completed.Int64 > started.Int64 {
		out.DurationSecs = completed.Int64 - started.Int64
	}

	out.Log = completionLog(slug, id)

	task, err := loadReviewTask(slug, id)
	if err != nil {
		out.Git = GitInfo{Reason: "task workspace could not be resolved"}
		writeJSON(w, http.StatusOK, out)
		return
	}
	if reviewIsWindowsWorker(task) {
		// ponytail: no cmd.exe variant of the script; Windows cards show the
		// rest of the summary. Add when a Windows card needs commit data.
		out.Git = GitInfo{Reason: "git summary not collected on a windows worker"}
		writeJSON(w, http.StatusOK, out)
		return
	}
	raw, code := runGitFunc(task, completionGitScript)
	if code != 0 && !strings.Contains(raw, "@@HEAD") {
		out.Git = GitInfo{Reason: strings.TrimSpace(firstLineOf(raw, "git summary unavailable"))}
		writeJSON(w, http.StatusOK, out)
		return
	}
	out.Git = parseCompletionGit(raw)
	writeJSON(w, http.StatusOK, out)
}

func firstLineOf(raw, fallback string) string {
	for _, line := range strings.Split(raw, "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "@@") {
			return line
		}
	}
	return fallback
}
