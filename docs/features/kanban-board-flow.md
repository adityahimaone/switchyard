# Kanban Board Flow — A sampai Z

Dokumen canonical untuk task flow Switchyard/Kanban. Kanban mengatur intent, workspace, executor, dispatch, evidence, review, dan lifecycle task. Chat bukan bagian dari flow ini; baca `chat-flow.md`.

## 1. Boundary sistem

```text
Kanban UI/API
  -> Control plane: board DB, validation, dispatcher, review gate
  -> Transport: node-agent HTTP/gRPC atau legacy SSH
  -> Execution plane: Mac/Windows worker
  -> Workspace: source code host
  -> Result + provenance + events
  -> Review gate
  -> done / blocked
```

Control plane berjalan di VPS. Source code remote tetap berada di host pemilik workspace. VPS tidak boleh memakai `/Users/...` atau `C:\...` sebagai local cwd.

Komponen utama:

- `web/src/features/board/` — board, task card, dialog, detail, review UI.
- `cmd/server/` — HTTP API, dispatcher, auth, routing.
- `internal/kanban/` — domain task, SQLite, workspace validation, review, node-agent client.
- `~/.hermes/kanban/boards/<slug>/kanban.db` — database per board.
- `~/.hermes/workspaces.json` — source of truth workspace dan host.
- node-agent — execution plane pada host yang memiliki source code.

## 2. A — Author intent

User membuat task dengan data eksplisit:

- board
- title
- body/description
- workspace path
- workspace transport/target jika remote
- assignee/profile
- executor: `hermes`, `codex`, `shell`, atau compatibility `auto`
- priority
- optional shell `command` for direct mode; new shell tasks default to agentic mode

`body` menjelaskan intent. Shell agentic memakai body sebagai intent lalu planner read-only menyusun command per iterasi; worker menjalankan command di workspace exact melalui shell + RTK. Shell direct tetap memakai `command` untuk kompatibilitas.

Task baru masuk `todo` atau status draft yang disetujui. Task baru tidak boleh langsung `running`; claim hanya milik dispatcher.

## 3. B — Board and task persistence

Board memakai SQLite dengan WAL. Task row menyimpan intent, status, workspace, executor, assignee, timestamps, result, failure metadata, dan runtime fields milik dispatcher.

`task_events` menyimpan audit trail lifecycle. Write dari UI memakai source `board-ui`. Jangan mengubah field dispatcher seperti `claim_lock`, `worker_pid`, `current_run_id`, atau retry counters tanpa domain operation yang tepat.

Board slug immutable. Board archive hanya lewat Settings → Boards. Task archive tetap action level task.

## 4. C — Validate before dispatch

API menjadi security boundary. UI disable state saja tidak cukup.

Validasi minimum:

1. title/body sesuai contract.
2. executor valid.
3. profile ada dan valid.
4. shell direct punya `command` non-empty; shell agentic punya body/intent non-empty.
5. workspace path local atau exact match entry registered.
6. remote workspace punya transport/target yang approved.
7. task running tidak boleh di-reassign.
8. credentials tidak boleh masuk body, command, result, atau log.

Remote-shaped path yang belum registered harus fail closed dengan pesan perbaikan. Jangan mencoba `mkdir`, `stat`, atau spawn lokal terhadap `/Users/...` dan `C:\...`.

## 5. D — Discover exact workspace

Workspace registry berada di `~/.hermes/workspaces.json`. Entry remote minimal:

```json
{
  "id": "next-portfolio-blog",
  "path": "/Users/adityahimawan/Development/next-portfolio-blog",
  "host": "mac-tailscale",
  "os": "mac",
  "note": "project constraints"
}
```

Path child harus didaftarkan exact jika routing membutuhkan app tertentu. Parent path tidak otomatis mencakup child.

Semua save wajib merge unknown keys seperti `luvus_workspace_id`, `remote`, dan `apps`; dropping keys merusak consumer Hermes/node-agent.

## 6. E — Executor selection

| Executor | Runtime | Context | Input | Proof |
|---|---|---|---|---|
| `hermes` | `hermes chat -q ...` | CodeGraph + prerequisites | task message | provenance `executor=hermes` |
| `codex` | `codex exec --full-auto ...` | CodeGraph + prerequisites | task message | provenance `executor=codex` |
| `shell` | planner read-only → `bash -lc ...` | bounded iterations + optional shell preflight | intent (agentic) atau `command` (direct) | provenance + iteration events |
| `auto` | compatibility fallback | resolved runtime | task message | resolved provenance |

Gunakan executor explicit saat membandingkan runtime. Jangan menyimpulkan executor dari durasi, title, atau teks `Sisyphus`.

## 7. F — Preflight

Sebelum create/dispatch task remote:

- board dan scope benar.
- exact workspace terdaftar.
- host reachable via SSH/Tailscale.
- profile valid.
- node advertise executor yang diminta.
- CodeGraph healthy untuk AI executor.
- shell command self-contained dan aman.
- board, priority, workspace, profile, executor eksplisit.

Canary remote:

```sh
ssh mac-tailscale 'test -d /Users/adityahimawan/Development/next-portfolio-blog && pwd'
```

## 8. G — Gateway and dispatcher

Dispatcher satu-satunya pemilik claim task. Polling normal setiap 30 detik.

Lifecycle claim:

```text
todo/ready -> running
```

Saat claim:

- lock/claim task secara atomik.
- set `started_at`.
- clear stale `completed_at`.
- pertahankan `result` untuk continuation.
- assemble previous result/comment context sebelum DB handle ditutup.
- route berdasarkan registered workspace, bukan tebakan dari path.

Remote card tanpa transport lama harus dinormalisasi ke `ssh` + target approved sebelum spawn. Jangan menjalankan dua dispatcher yang berebut DB.

## 9. H — Host routing

Path local diproses control-plane host jika valid secara lokal. Path remote diproses node-agent host.

```text
VPS dispatcher
  -> node-agent server :8788 HTTP / :8789 gRPC
  -> Tailscale
  -> Mac/Windows worker
  -> workspace cwd
```

Node-agent memilih gRPC jika available dalam `auto`; fallback HTTP long-poll. Transport aktual harus muncul sebagai metadata `transport`/`delivery_id`, bukan diasumsikan.

## 10. I — Invoke executor

Worker resolve binary dan menjalankan executor di workspace exact.

AI executor memakai CodeGraph/prerequisite context sesuai policy. Shell agentic planner membaca workspace secara read-only, lalu worker menjalankan command terstruktur melalui RTK. Iterasi dibatasi maksimal 12 dan command destruktif diblokir. Shell direct tetap tidak membaca AGENTS/README/CodeGraph. Output compaction optional, bukan pengganti raw evidence.

## 11. J — Job runtime states

State machine utama:

```text
created -> todo/ready -> running -> review -> done
                              \-> blocked
```

Makna state:

- `todo`/`ready`: menunggu dispatcher.
- `running`: task claimed, worker aktif.
- `review`: worker selesai, output/worktree perlu inspection.
- `done`: acceptance evidence verified, approval selesai.
- `blocked`: execution, auth, quota, routing, atau evidence gagal.
- `archived`: task disembunyikan secara soft-delete.

Success worker tidak otomatis `done`. Semua executor masuk `review` dulu.

## 12. K — Keep live progress

Progress pipeline:

```text
executor stdout/stderr
  -> node-agent progress buffer
  -> Kanban worker log
  -> worker-log API offset
  -> UI polling saat running
```

Worker log berbeda dari final result. UI harus menampilkan log live tanpa menunggu task terminal. Offset cursor append-only; jangan fetch full log berulang.

Timeline `task_events` adalah lifecycle evidence. Jangan mensintesis event progress hanya dari status polling.

## 13. L — Logs and provenance

Bukti wajib dibaca dari beberapa lapisan:

1. task row: requested executor, workspace, transport, status.
2. node-agent result: `executor`, `requested`, `bin`, `args`, `ws`, transport.
3. worker log: `$TMPDIR/node-agent-<task_id>/run.log`.
4. task events.
5. final artifact/test output.

`Sisyphus` atau label task bukan proof executor.

## 14. M — Monitor completion

Worker mengirim result terminal. Node-agent menyimpan result/provenance. Kanban membaca result dan meng-update task secara guarded:

```sql
UPDATE tasks
SET status = 'review', result = ?, completed_at = ?
WHERE id = ? AND status = 'running'
```

Guard status mencegah late result dari dispatch lama menimpa attempt baru. Retry tidak boleh overwrite result attempt sebelumnya tanpa snapshot/history.

## 15. N — Normalize result

Result dipisahkan menjadi:

- Worker Log: command/process stream.
- Final Result: summary, tests, artifact, failure.

Jika marker output tidak lengkap, preserve full output. Jangan silently drop text. Continuation menyimpan previous result supaya agent menerima context bounded pada spawn berikutnya.

## 16. O — Observe review diff

Review membaca exact `workspace_path`, branch, dan git status dari host target.

Diff harus menggabungkan:

```sh
git diff HEAD -- .
git ls-files --others --exclude-standard
```

Tracked-only diff melewatkan file baru. Empty diff harus dibedakan dari error/untracked state.

Review UI menampilkan changed files, hunks, result, worker log, comments, dan acceptance evidence.

## 17. P — Pick files and approval

User dapat memilih file secara selective. Approve endpoint memvalidasi file list sebelum staging.

Review actions:

- `commit` — commit pada workspace, tidak push.
- `commit_push` — commit lalu push.
- clean workspace — mark done tanpa commit.
- dirty workspace + action done — reject; user harus memilih commit atau commit_push.

Commit message memakai title, changed-file bullets, dan `Refs: <task_id>`.

## 18. Q — Quality gate

Sebelum done, verify acceptance contract:

- requested artifact ada.
- tests/build/check sesuai scope.
- output berasal dari workspace correct.
- provenance cocok executor.
- diff hanya scope task.
- no secret leakage.
- browser clickability diberi `NOT VERIFIED` jika browser evidence unavailable.

Jangan mark done hanya karena worker exit code 0.

## 19. R — Retry and continuation

Failure retry maksimal sesuai policy. Setelah threshold, task `blocked`.

Continuation flow:

```text
review -> comment @assignee -> todo -> running -> review
```

Mention assignee pada done/review/blocked boleh requeue. Preserve previous result; clear hanya completion marker yang memang perlu. Attempt baru harus punya log/result snapshot terpisah.

## 20. S — Stop and cancellation

Stop hanya menghentikan runtime yang sedang owned dispatcher. Jangan PATCH running sembarangan. Verify task row, event tail, worker process, dan result setelah stop.

Late worker result tidak boleh mengubah state terminal attempt baru.

## 21. T — Troubleshooting matrix

| Symptom | Root cause | Fix |
|---|---|---|
| `Permission denied: /Users` | VPS treat Mac path as local | register exact remote workspace; route node-agent/SSH |
| `executor_unavailable` | binary missing atau PATH launchd beda | `command -v` pada worker; restart/reinstall agent |
| `blocker_auth` | auth/quota real atau stale metadata | inspect raw worker log; clear stale only with proof |
| `respawn_guarded` | retry guard aktif | diagnose cause; jangan blind reassign |
| stuck `running` | duplicate worker, missing result, stale claim | inspect row + events + logs + process count |
| empty diff | wrong repo/path atau untracked omitted | verify exact path; include `git ls-files --others` |
| exit code 3 | worker failed/evidence gap | inspect result and artifact; report `NOT VERIFIED` where needed |
| task reaches `done` too early | review gate bypass | restore success -> `review`; approve explicitly |

## 22. U — User-facing UI flow

Board UI:

```text
Sidebar Kanban
  -> board switcher/filter rail
  -> New Task
  -> task card
  -> running indicator + live worker log
  -> detail drawer/page
  -> review changes
  -> select files
  -> commit / commit & push / mark done
```

Board fixed viewport: horizontal board scroll, vertical scroll per column. Running cards non-draggable kecuali target escape yang backend izinkan. Detail drawer quick glance; detail page full history/reply/review.

## 23. V — Verify API and artifacts

Local code gate:

```sh
go vet ./...
go test ./...
go build -o bin/kanban-board ./cmd/server
cd web && pnpm build
```

Runtime proof harus membaca authenticated API, task row, events, worker log, node-agent result, dan artifact. Build saja tidak membuktikan binary/process live sudah reload.

## 24. W — Workspace cleanup

Test task live wajib dibersihkan dalam session yang sama: delete comments/events test, restore mutated status, remove temporary artifacts. Jangan meninggalkan fake context yang akan masuk ke worker berikutnya.

## 25. X — Exact deployment boundary

Deployment backend:

1. cek PM2 script path.
2. stop target process.
3. build ke exact executable path.
4. start/restart target.
5. verify PM2 online, binary mtime, authenticated API.

Frontend-only: build `web/dist`, lalu verify served bundle hash. Jangan report deploy dari build output saja.

## 26. Y — Failure-safe rules

- fail closed pada unknown executor/profile/workspace.
- no guessed credentials.
- no local access ke remote path.
- no fabricated test/browser result.
- no blind retry stuck task.
- no direct done dari worker success.
- no destructive cleanup tanpa scope jelas.

## 27. Z — Completion proof

Task Kanban selesai hanya saat semua ini ada:

```text
intent explicit
+ workspace exact
+ executor proven
+ dispatch transport proven
+ worker output captured
+ result persisted
+ diff inspected
+ acceptance verified
+ approval action recorded
= done
```

Kalau satu bukti hilang, state tetap `review` atau `blocked`, bukan dipaksa `done`.

## Related docs

- [Chat Flow — A sampai Z](chat-flow.md)
- [Legacy execution flow](../execution-flow.md)
- [Continuation and review flow](../superpowers/plans/2026-09-14-chat-performance-improvement.md)
