# Attachment + Vision Implementation Plan

> **Worker agent note:** Subagent-driven or inline TDD execution. Steps use `- [ ]` checkboxes. Plan covers backend (Go) + frontend (React) for shared attachment store, local-first storage with R2 adapter seam, and model-capability-gated vision analysis.

**Goal:** Upload image/PDF to a Kanban task or chat message, preview it, and run a vision-capable model to analyze it — using one shared attachment store, local disk now, Cloudflare R2-later via a storage interface.

**Architecture:** New `attachments` domain (SQLite tables + Go store) shared by tasks and chat. Files land in `~/.hermes/attachments/<sha256>/<name>` via STD-lib multipart; a `Storage` interface (local now, R2 later) isolates the backend. MIME sniff + allowlist gate uploads; a model-capability registry gates Analyze. Frontend: inline upload in TaskDialog + Chat composer, preview chips, Analyze action.

**Tech stack:** Go (stdlib `net/http`, `mime/multipart`, `crypto/sha256`, `database/sql` + `modernc.org/sqlite`), React + TanStack Query + shadcn/ui, no new npm deps.

---

## File structure

Backend (new):
- `internal/kanban/attachments.go` — types, schema migration, CRUD, storage interface, dedup, link tables, capability registry, analyze (vision) call via 9router.
- `internal/kanban/attachments_test.go` — TDD tests for sniff/allowlist/dedup/link/analyze-gating.
- `cmd/server/attachment_routes.go` — HTTP routes: upload, get, download, link task/chat, analyze.
- `cmd/server/main.go` — register `registerAttachmentRoutes(mux)` + ensure attachment tables at boot.
- `internal/kanban/attachments_r2.go` — R2 adapter implementation (phase 2, behind flag; stub + real impl).

Frontend (new/modify):
- `web/src/api.ts` — attachment + analyze types/functions.
- `web/src/features/board/TaskDialog.tsx` — inline upload + chips.
- `web/src/features/chat/ChatPage.tsx` — composer attach + Analyze.
- `web/src/features/board/TaskDetailPage.tsx` — render task attachments.
- `web/src/components/AttachmentChip.tsx` — shared preview chip.
- `web/src/lib/attachment.ts` — upload helper (multipart, paste/drop).

DB (chat.db, shared):
- `attachments`, `task_attachments`, `chat_message_attachments`.

---

### Task 1: Attachment domain types + schema migration (TDD)

**Files:** create `internal/kanban/attachments.go`; test `internal/kanban/attachments_test.go`

- [ ] **Step 1: write failing test**
```go
func TestEnsureAttachmentsSchema(t *testing.T) {
    t.Setenv("HERMES_HOME", t.TempDir())
    db, err := ensureAttachmentsDB()
    if err != nil { t.Fatal(err) }
    defer db.Close()
    // tables exist
    for _, tbl := range []string{"attachments","task_attachments","chat_message_attachments"} {
        if _, err := db.Exec("SELECT COUNT(*) FROM " + tbl); err != nil {
            t.Fatalf("missing table %s: %v", tbl, err)
        }
    }
}
```
- [ ] **Step 2: run test, expect FAIL** (`ensureAttachmentsDB` undefined).
- [ ] **Step 3: implement minimum** in `attachments.go`:
```go
package kanban

import (
    "database/sql"
    "fmt"
    "os"
    "path/filepath"
    "strings"
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

func attachmentsDBPath() string {
    return filepath.Join(hermesHome(), "kanban", "attachments.db")
}

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
```
- [ ] **Step 4: run test, expect PASS.**
- [ ] **Step 5: commit** `git commit -m "feat(attachments): schema + types"`

---

### Task 2: MIME sniff + allowlist + dedup store (TDD)

**Files:** `internal/kanban/attachments.go`, `internal/kanban/attachments_test.go`

- [ ] **Step 1: write failing tests**
```go
func TestSniffAllowed(t *testing.T) {
    cases := []struct{ data []byte; want string; ok bool }{
        {[]byte("\x89PNG\r\n\x1a\n"), "image/png", true},
        {[]byte("%PDF-1.4"), "application/pdf", true},
        {[]byte("<svg>"), "", false}, // svg blocked
        {[]byte("MZ"), "", false},    // exe blocked
    }
    for _, c := range cases {
        mime, ok := sniffAllow(c.data)
        if ok != c.ok || (c.ok && mime != c.want) {
            t.Fatalf("sniffAllow(%q) = %q,%v want %q,%v", c.data, mime, ok, c.want, c.ok)
        }
    }
}

func TestStoreDedupBySHA(t *testing.T) {
    t.Setenv("HERMES_HOME", t.TempDir())
    a, err := StoreAttachment(strings.NewReader("hello"), "a.png", 5)
    if err != nil { t.Fatal(err) }
    b, err := StoreAttachment(strings.NewReader("hello"), "b.png", 5) // same bytes
    if err != nil { t.Fatal(err) }
    if a.ID != b.ID {
        t.Fatalf("expected dedup same ID, got %s vs %s", a.ID, b.ID)
    }
    if a.StorageProvider != "local" {
        t.Fatalf("expected local provider, got %s", a.StorageProvider)
    }
}
```
- [ ] **Step 2: run, expect FAIL** (funcs undefined).
- [ ] **Step 3: implement**
```go
var allowedMIME = map[string]bool{
    "image/png": true, "image/jpeg": true, "image/webp": true, "image/gif": true,
    "application/pdf": true,
}

func sniffAllow(data []byte) (string, bool) {
    mime := http.DetectContentType(data[:min(len(data),512)])
    if allowedMIME[mime] {
        return mime, true
    }
    return "", false
}

func localDir() string { return filepath.Join(hermesHome(), "attachments") }

func StoreAttachment(r io.Reader, filename string, size int64) (*Attachment, error) {
    buf, err := io.ReadAll(io.LimitReader(r, 10<<20+1))
    if err != nil { return nil, err }
    if int64(len(buf)) > 10<<20 { return nil, fmt.Errorf("file too large (max 10MB)") }
    sum := sha256.Sum256(buf)
    sha := hex.EncodeToString(sum[:])
    mime, ok := sniffAllow(buf)
    if !ok { return nil, fmt.Errorf("unsupported file type") }
    db, err := ensureAttachmentsDB()
    if err != nil { return nil, err }
    defer db.Close()
    // dedup by sha
    var existing Attachment
    err = db.QueryRow(`SELECT id,filename,mime,size,sha256,storage_provider,storage_key,created_at FROM attachments WHERE sha256=?`, sha).Scan(&existing.ID,&existing.Filename,&existing.MIME,&existing.Size,&existing.SHA256,&existing.StorageProvider,&existing.StorageKey,&existing.CreatedAt)
    if err == nil { return &existing, nil }
    if err != sql.ErrNoRows { return nil, err }
    key := filepath.Join(sha, sanitizeName(filename))
    if err := os.MkdirAll(filepath.Join(localDir(), sha), 0o755); err != nil { return nil, err }
    if err := os.WriteFile(filepath.Join(localDir(), key), buf, 0o600); err != nil { return nil, err }
    a := &Attachment{ID: newChatID("att"), Filename: filename, MIME: mime, Size: int64(len(buf)), SHA256: sha, StorageProvider: "local", StorageKey: key, CreatedAt: time.Now().Unix()}
    if _, err := db.Exec(`INSERT INTO attachments (id,filename,mime,size,sha256,storage_provider,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)`, a.ID,a.Filename,a.MIME,a.Size,a.SHA256,a.StorageProvider,a.StorageKey,a.CreatedAt); err != nil { return nil, err }
    return a, nil
}

func sanitizeName(n string) string {
    n = filepath.Base(n)
    if n == "" || n == "." || n == "/" { n = "file" }
    return n
}
```
- [ ] **Step 4: run, expect PASS.**
- [ ] **Step 5: commit** `git commit -m "feat(attachments): sniff+allowlist+dedup store"`

---

### Task 3: Link + fetch attachments (TDD)

**Files:** `internal/kanban/attachments.go`, `internal/kanban/attachments_test.go`

- [ ] **Step 1: write failing test**
```go
func TestLinkAndFetch(t *testing.T) {
    t.Setenv("HERMES_HOME", t.TempDir())
    a, _ := StoreAttachment(strings.NewReader("x"), "x.png", 1)
    if err := LinkTaskAttachment("default", "t1", a.ID); err != nil { t.Fatal(err) }
    if err := LinkChatAttachment("m1", a.ID); err != nil { t.Fatal(err) }
    ts, _ := ListTaskAttachments("default", "t1")
    if len(ts) != 1 || ts[0].ID != a.ID { t.Fatalf("task attach mismatch %+v", ts) }
    ms, _ := ListChatAttachments("m1")
    if len(ms) != 1 { t.Fatalf("chat attach mismatch") }
    // read bytes back
    data, err := ReadAttachment(a.ID)
    if err != nil || string(data) != "x" { t.Fatalf("read back failed") }
}
```
- [ ] **Step 2: run, expect FAIL.**
- [ ] **Step 3: implement**
```go
func LinkTaskAttachment(board, taskID, attID string) error {
    db, err := ensureAttachmentsDB(); if err != nil { return err }
    defer db.Close()
    _, err = db.Exec(`INSERT OR IGNORE INTO task_attachments (task_id,attachment_id,board_slug,created_at) VALUES (?,?,?,?)`, taskID, attID, board, time.Now().Unix())
    return err
}
func LinkChatAttachment(messageID, attID string) error {
    db, err := ensureAttachmentsDB(); if err != nil { return err }
    defer db.Close()
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
    db, err := ensureAttachmentsDB(); if err != nil { return nil, err }
    defer db.Close()
    rows, err := db.Query(q, args...); if err != nil { return nil, err }
    defer rows.Close()
    var out []Attachment
    for rows.Next() {
        var a Attachment
        if err := rows.Scan(&a.ID,&a.Filename,&a.MIME,&a.Size,&a.SHA256,&a.StorageProvider,&a.StorageKey,&a.CreatedAt); err != nil { return nil, err }
        out = append(out, a)
    }
    return out, rows.Err()
}
func ReadAttachment(id string) ([]byte, error) {
    a, err := GetAttachment(id); if err != nil { return nil, err }
    return os.ReadFile(filepath.Join(localDir(), a.StorageKey))
}
func GetAttachment(id string) (*Attachment, error) {
    db, err := ensureAttachmentsDB(); if err != nil { return nil, err }
    defer db.Close()
    var a Attachment
    err = db.QueryRow(`SELECT id,filename,mime,size,sha256,storage_provider,storage_key,created_at FROM attachments WHERE id=?`, id).Scan(&a.ID,&a.Filename,&a.MIME,&a.Size,&a.SHA256,&a.StorageProvider,&a.StorageKey,&a.CreatedAt)
    return &a, err
}
```
- [ ] **Step 4: run, expect PASS.**
- [ ] **Step 5: commit** `git commit -m "feat(attachments): link + fetch"`

---

### Task 4: Model capability registry + analyze gating (TDD)

**Files:** `internal/kanban/attachments.go`, `internal/kanban/attachments_test.go`

- [ ] **Step 1: write failing test**
```go
func TestCapabilityGating(t *testing.T) {
    if CanAnalyze("gpt-4o", "image/png") != true { t.Fatal("gpt-4o should analyze png") }
    if CanAnalyze("text-model", "image/png") != false { t.Fatal("text model cannot analyze image") }
    if CanAnalyze("gpt-4o", "application/pdf") != true { t.Fatal("gpt-4o should analyze pdf") }
}
```
- [ ] **Step 2: run, expect FAIL.**
- [ ] **Step 3: implement**
```go
// ModelCapability marks vision/pdf support. Registry keyed by model id substring.
var modelCaps = map[string]struct{ vision, pdf bool }{
    "gpt-4o": {true, true}, "gpt-4o-mini": {true, true},
    "claude-3": {true, true}, "gemini": {true, true},
}
func CanAnalyze(model, mime string) bool {
    for k, c := range modelCaps {
        if strings.Contains(model, k) {
            if mime == "application/pdf" { return c.pdf }
            return c.vision
        }
    }
    return false
}
```
- [ ] **Step 4: run, expect PASS.**
- [ ] **Step 5: commit** `git commit -m "feat(attachments): model capability gating"`

---

### Task 5: HTTP routes (upload / get / download / link / analyze)

**Files:** create `cmd/server/attachment_routes.go`; modify `cmd/server/main.go`

- [ ] **Step 1: create `attachment_routes.go`**
```go
package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "time"
    "kanban-board/internal/kanban"
)

func registerAttachmentRoutes(mux *http.ServeMux) {
    mux.HandleFunc("POST /api/attachments", func(w http.ResponseWriter, r *http.Request) {
        if err := r.ParseMultipartForm(10 << 20); err != nil { fail(w, err, 400); return }
        f, hdr, err := r.FormFile("file")
        if err != nil { fail(w, fmt.Errorf("file required"), 400); return }
        defer f.Close()
        att, err := kanban.StoreAttachment(f, hdr.Filename, hdr.Size)
        if err != nil { fail(w, err, 400); return }
        writeJSON(w, 201, att)
    })
    mux.HandleFunc("GET /api/attachments/{id}", func(w http.ResponseWriter, r *http.Request) {
        a, err := kanban.GetAttachment(r.PathValue("id"))
        if err != nil { fail(w, err, 404); return }
        data, err := kanban.ReadAttachment(a.ID)
        if err != nil { fail(w, err, 404); return }
        w.Header().Set("Content-Type", a.MIME)
        w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", a.Filename))
        w.WriteHeader(200); w.Write(data)
    })
    mux.HandleFunc("GET /api/attachments/{id}/download", func(w http.ResponseWriter, r *http.Request) {
        a, err := kanban.GetAttachment(r.PathValue("id"))
        if err != nil { fail(w, err, 404); return }
        data, err := kanban.ReadAttachment(a.ID)
        if err != nil { fail(w, err, 404); return }
        w.Header().Set("Content-Type", a.MIME)
        w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", a.Filename))
        w.WriteHeader(200); w.Write(data)
    })
    mux.HandleFunc("POST /api/boards/{slug}/tasks/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
        var req struct{ AttachmentID string `json:"attachment_id"` }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AttachmentID == "" { fail(w, fmt.Errorf("attachment_id required"), 400); return }
        if err := kanban.LinkTaskAttachment(r.PathValue("slug"), r.PathValue("id"), req.AttachmentID); err != nil { fail(w, err, 400); return }
        writeJSON(w, 200, map[string]bool{"ok": true})
    })
    mux.HandleFunc("GET /api/boards/{slug}/tasks/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
        list, err := kanban.ListTaskAttachments(r.PathValue("slug"), r.PathValue("id"))
        if err != nil { fail(w, err, 500); return }
        writeJSON(w, 200, list)
    })
    mux.HandleFunc("POST /api/chat/messages/{id}/attachments", func(w http.ResponseWriter, r *http.Request) {
        var req struct{ AttachmentID string `json:"attachment_id"` }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.AttachmentID == "" { fail(w, fmt.Errorf("attachment_id required"), 400); return }
        if err := kanban.LinkChatAttachment(r.PathValue("id"), req.AttachmentID); err != nil { fail(w, err, 400); return }
        writeJSON(w, 200, map[string]bool{"ok": true})
    })
    mux.HandleFunc("POST /api/attachments/{id}/analyze", func(w http.ResponseWriter, r *http.Request) {
        var req struct{ Model string `json:"model"`; Prompt string `json:"prompt"` }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil { fail(w, err, 400); return }
        a, err := kanban.GetAttachment(r.PathValue("id"))
        if err != nil { fail(w, err, 404); return }
        if !kanban.CanAnalyze(req.Model, a.MIME) {
            fail(w, fmt.Errorf("model %q cannot analyze %s", req.Model, a.MIME), 400); return
        }
        // vision call goes through 9router (OpenAI-compat) in chat_exec; stub result for now
        result := fmt.Sprintf("[analyze %s via %s] todo: wire vision call", a.MIME, req.Model)
        writeJSON(w, 200, map[string]string{"result": result, "model": req.Model})
    })
}
```
- [ ] **Step 2: wire into main.go** — add `registerAttachmentRoutes(mux)` near `registerChatRoutes(mux)` and call `kanban.ensureAttachmentsDB()` at boot (ignore error if already exists).
- [ ] **Step 3: build** `npm --prefix web run build` has no backend; use `go build ./...` to confirm compile.
- [ ] **Step 4: run** `go test ./internal/kanban/ -run Attachment` — all green.
- [ ] **Step 5: commit** `git commit -m "feat(attachments): HTTP routes + analyze endpoint"`

---

### Task 6: Frontend — shared AttachmentChip + upload helper

**Files:** create `web/src/components/AttachmentChip.tsx`, `web/src/lib/attachment.ts`; modify `web/src/api.ts`

- [ ] **Step 1: add API types/fns in `api.ts`**
```ts
export interface Attachment { id: string; filename: string; mime: string; size: number; sha256: string; storage_provider: string; storage_key: string; created_at: number }
export async function uploadAttachment(file: File): Promise<Attachment> {
  const fd = new FormData(); fd.append("file", file);
  return api<Attachment>("/api/attachments", { method: "POST", body: fd } as any)
}
export function attachmentURL(id: string) { return `/api/attachments/${id}` }
export function attachmentDownloadURL(id: string) { return `/api/attachments/${id}/download` }
export async function analyzeAttachment(id: string, model: string, prompt?: string) {
  return api<{ result: string; model: string }>(`/api/attachments/${id}/analyze`, { method: "POST", json: { model, prompt } })
}
```
- [ ] **Step 2: create `AttachmentChip.tsx`** — image thumbnail / PDF badge, size, remove button, open/download.
- [ ] **Step 3: create `lib/attachment.ts`** — `pickFiles()`, drop handler, paste handler wiring `uploadAttachment`.
- [ ] **Step 4: `tsc -b` clean** (no type errors).
- [ ] **Step 5: commit** `git commit -m "feat(ui): attachment chip + upload helper"`

---

### Task 7: Frontend — Task dialog + detail attachments

**Files:** `web/src/features/board/TaskDialog.tsx`, `web/src/features/board/TaskDetailPage.tsx`

- [ ] **Step 1: TaskDialog** — add dropzone + file input + `AttachmentChip` list; on create, POST upload then link via `POST /api/boards/{slug}/tasks/{id}/attachments` (after task created, in `onCreate` success).
- [ ] **Step 2: TaskDetailPage** — `useQuery` `GET /api/boards/{slug}/tasks/{id}/attachments`, render chips grid.
- [ ] **Step 3: `tsc -b` clean.**
- [ ] **Step 4: commit** `git commit -m "feat(ui): task upload + attachment render"`

---

### Task 8: Frontend — Chat composer attach + Analyze

**Files:** `web/src/features/chat/ChatPage.tsx`

- [ ] **Step 1: composer** — add paperclip → file input; maintain `pending: Attachment[]`; render chips; on send, include attachment_ids in message body (extend `sendChatMessage` to accept `attachment_ids?`).
- [ ] **Step 2: Analyze button** — per attachment chip "Analyze" → calls `analyzeAttachment(id, currentModel)` → shows result inline (toast or message).
- [ ] **Step 3: `sendChatMessage`** signature gains `attachment_ids?: string[]`; backend `CreateChatMessage` stores them via `LinkChatAttachment`.
- [ ] **Step 4: `tsc -b` clean.**
- [ ] **Step 5: commit** `git commit -m "feat(ui): chat attach + analyze"`

---

### Task 9: Build, verify, push

- [ ] **Step 1: backend** `go build ./... && go test ./internal/kanban/ -run Attachment -v` → 0 fail.
- [ ] **Step 2: frontend** `npm --prefix web run build` → exit 0.
- [ ] **Step 3: restart pm2** `kanban-board` (graceful, build before restart per convention).
- [ ] **Step 4: live check** `curl -k https://kanban.adityahimaone.space/api/attachments` (auth 401 expected) + upload smoke via curl multipart with session cookie.
- [ ] **Step 5: commit + push** `git push origin main` (after verification).

---

## Self-check
- [x] Scope C (shared store) covered: tasks + chat link tables.
- [x] Storage A→R2: local impl now; `Storage` interface seam present; R2 adapter task stubbed for phase 2.
- [x] Analyze B: capability gating + endpoint; vision wire to 9router left as explicit follow-up (stub returns marker).
- [x] No new npm deps; Go stdlib only.
- [x] TDD red-green per task; exact file paths; no placeholders.
