> **Archived spec.** This describes the design as it stood when the SSH
> dispatcher was still in place. That transport has since been retired and
> `cmd/server/ssh_dispatch.go` no longer exists — `cmd/server/remote_dispatch.go`
> is the only dispatcher. See [../execution-flow.md](../execution-flow.md) for
> the current routing rules.

# Design — Single Dispatcher + Review Gate (kanban-board + node-agent rev 5)

Date: 2026-09-07 · Status: approved by Adit (pilihan A + tambahan review gate)

## Goal

Hilangkan error `pid ... exited with code 3` permanen + task selesai harus lewat review
column dengan approve (commit / commit & push) sebelum jadi `done`.

## 1. kanban-board — single dispatcher + hard guard + review gate

### ssh_dispatch.go (VPS, poll 30s, satu-satunya claimer)

- Query tetap: `status='todo' AND workspace_transport='ssh'`.
- **Hard guard** sebelum claim:
  - workspace_path absoulte `/Users/...` atau `/Users` prefix tapi transport != ssh →
    auto-fix `UPDATE tasks SET workspace_transport='ssh', workspace_ssh_target='mac-tailscale'`
    + log warning. Task tidak di-spawn local.
- Success → `status='review'` (BUKAN done). Failure → retry ×3 → blocked (tetap).
- Result disimpan di kolom `result` (sudah ada).

### POST /api/boards/{slug}/tasks/{id}/approve (baru)

Body: `{"action":"commit"|"commit_push"}`.
Flow:
1. Baca task → harus `review`.
2. Resolve workspace → host/target via workspaces.json.
3. Remote exec via SSH (mac-tailscale / windows-tailscale) di workspace_path:
   - `git add -A && git commit -m "<task title>"` (+ `git push` kalau commit_push).
4. StatusTransition → `done`.
Error → 400 + task tetap review.

### GET /api/boards/{slug}/tasks/{id}/diff (baru)

Return `{stat, diff}` dari `git diff HEAD` remote exec (truncate 100KB).
Frontend review column pakai ini.

### workspaces.json — prequest

Workspace.Note (field `note`, sudah ada di struct + knownKeys) = prequest project.
Prioritas baca (node-agent):
1. `note` dari workspaces.json (via dispatch payload — server inject `PrequestNote`)
2. `AGENTS.md` (head 100 lines)
3. `README.md` (head 100 lines)

## 2. node-agent rev 5 — cmd/agent/main.go

### runJob urutan baru

1. `ensureCodegraph(ws)`:
   - `.codegraph/` ada → skip (auto-sync bawaan codegraph).
   - `codegraph` binary ada → `codegraph init` di ws, timeout 60s, hasil di-log, gagal → lanjut (non-fatal).
   - binary ga ada → skip (no auto-install).
2. `readPrequest(ws, noteFromServer)`: note (server) > AGENTS.md > README.md, head 100 lines.
3. Prompt = prequest + task message (di-prepend).
4. Execute `hermes chat -q <prompt>` cwd=ws — **jobTimeout 120s → 600s** (bukti log: semua
   failure `120xxx ms` = kena 120s timeout lama).
5. Result POST tetap.

### transport.DispatchRequest

Tambah field opsional `PrequestNote string json:"prequest_note,omitempty"` — diisi server
dari workspaces.json Note match by path. Backward compatible (omitempty).

## 3. Frontend (web/src/features/board)

### Review column & TaskDetailPage

- Task `review` → section "Review changes":
  - full diff inline (scrollable, `<pre>` max-h-96, dari endpoint /diff),
  - button **Approve** → dropdown 2 opsi: `Commit` / `Commit & Push`,
  - tombol approve cuma aktif kalau diff sukses ke-load.
- TaskCard: `review` allowed transitions → hanya `done` via approve (API enforced),
  drag ke blocked/todo tetep boleh buat rework.
- Backend guard: `StatusTransition` review→done cuma lewat endpoint approve
  (status endpoint PATCH review→done ditolak di handler).

## 4. Node-agent server (VPS :8788) — minor

- `/api/nodes/{id}/dispatch` handler: lookup Note by Workspace prefix dari workspaces.json,
  inject `PrequestNote` ke DispatchRequest sebelum kirim ke agent.
- Timeout env launchd Mac: `NODE_AGENT_JOB_TIMEOUT=600` (di-set via plist EnvironmentVariables).

## 5. Non-goals (YAGNI)

- Auto-install codegraph di node.
- Routing table transport ketiga (`local`).
- WebSocket streaming.

## Rollout

1. node-agent: edit agent+transport, `go build && go vet`, deploy Mac via SSH (launchd plist
   update env + restart), Windows menyusul manual.
2. kanban-board: ssh_dispatch guard + review + 2 endpoint baru, build+vet, PM2 restart.
3. Frontend: review UI, `pnpm build`, PM2 restart (static dari web/dist).
4. E2E: buat task kecil `todo` transport=ssh → agent jalan → card `review` → approve
   commit → `done`. Verifikasi commit muncul di remote repo.
