# Chat Flow — A sampai Z

Dokumen canonical untuk direct Chat ke agent. Chat berdiri sendiri dari Kanban task flow. Chat mengelola conversation/session, bukan board task, dispatcher claim, review diff, atau commit gate.

## 1. Boundary Chat vs Kanban

| Area | Chat | Kanban |
|---|---|---|
| Tujuan | direct prompt/response ke agent | execute tracked task pada workspace |
| Unit utama | session, message, run | board, task, attempt |
| Agent scope | Hermes conversational runtime | Hermes/Codex/shell executor |
| Live state | loading, running, done, error, cancelled | todo, running, review, done, blocked |
| Transport | local daemon/CLI atau remote node-agent | dispatcher + node-agent/SSH |
| Output | assistant message + run events | worker log + result + diff |
| Completion | response persisted | review approved + evidence |
| Context | session resume | task body/result/comments |

Chat tidak memakai Kanban dispatcher. Kanban tidak memakai chat session sebagai task state.

## 2. A — Access chat

User membuka Chat dari sidebar. Route canonical:

```text
/chat/:sessionID
```

App membaca `sessionID` dari URL sebelum mengambil history list. Session hydration tidak menunggu full sidebar scan. Create/select session memperbarui URL; browser back/forward membuka room sesuai route.

Chat sidebar internal berisi search, filter, grouped history, title, workspace, model, dan session state. Sidebar visibility dikontrol App shell; hidden state menghilangkan width supaya chat content melebar.

## 3. B — Build or select session

Session disimpan di `~/.hermes/kanban/chat.db`.

```sql
chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  agent TEXT DEFAULT 'hermes',
  profile TEXT DEFAULT 'default',
  workspace TEXT DEFAULT '',
  model TEXT DEFAULT '',
  hermes_session_id TEXT DEFAULT '',
  created_at INTEGER,
  updated_at INTEGER,
  archived INTEGER DEFAULT 0
)
```

Session identity Switchyard (`cs_...`) berbeda dari Hermes session identity. Field `hermes_session_id` menjadi durable resume key.

Chat allowlist saat ini `hermes` only. `codex`, `shell`, dan `auto` tetap Kanban executor, bukan conversational Chat agent.

## 4. C — Compose message

Composer menerima prompt dengan:

- native autosize textarea.
- Enter untuk send.
- Shift+Enter untuk newline.
- profile/model/workspace selectors.
- attach/command actions sesuai UI contract.
- model search dengan bounded roster.

Message role user disimpan sebelum execution. Jangan mengirim password, API key, token, atau credential di prompt.

## 5. D — Dispatch request

API membuat user message dan run, lalu segera mengembalikan `202`.

```text
POST /api/chat/sessions/{id}/messages
  -> validate session/profile/model/workspace
  -> insert chat_messages(role=user)
  -> insert chat_runs(state=loading)
  -> start async RunChat
  -> return run_id
```

Run tidak boleh blocking HTTP request sampai model selesai. Frontend memakai run ID untuk progress dan terminal state.

## 6. E — Entry validation

Validation dilakukan di backend:

- session exists.
- agent allowed (`hermes`).
- profile exists dan valid.
- model/provider cocok dengan roster.
- workspace local valid atau exact registered remote path.
- prompt tidak kosong.
- remote path tidak diproses lokal.

`ValidateChatModel` memakai cache roster pendek; jangan reread config setiap send.

## 7. F — Fast path

Prompt deterministic sempit boleh dijawab lokal tanpa LLM:

- greeting exact: `hello`, `hi`, `halo`, `hey`, `hai` dengan optional `!`.
- date/day prompt yang didukung contract.

Fast path tetap membuat run dan assistant message supaya history konsisten. Jangan memperluas allowlist secara longgar; false match mengubah intent user.

## 8. G — Generate context

Untuk model execution, context dirakit dari:

1. profile dan model selection.
2. workspace metadata.
3. session messages.
4. persisted `hermes_session_id` jika ada.
5. memory, skills, tools, dan CodeGraph metadata sesuai execution path.

Transport SSE atau daemon tidak mengubah context contract. Chat DB tetap source of truth untuk reconnect dan rebuild.

## 9. H — Hermes routing

Local path:

```text
RunChat
  -> daemon healthy?
  -> daemon query
  -> CLI fallback jika daemon unavailable/fails
```

Daemon memakai Unix socket `/tmp/hermes-daemon.sock`. CLI normal memakai:

```sh
hermes chat -Q --reasoning minimal --query-file -
```

Prompt pendek dapat memakai `--reasoning none` sesuai policy. Ini mengurangi agent-side work, bukan jaminan provider TTFT rendah.

Remote workspace path diroute melalui node-agent. VPS tidak boleh menjalankan `/Users/...` sebagai local cwd.

## 10. I — Identity and resume

First message:

```text
chat session tidak punya hermes_session_id
  -> Hermes membuat session baru
  -> output/daemon completed membawa session_id
  -> Go persist hermes_session_id ke chat_sessions
```

Next message:

```text
read hermes_session_id dari DB
  -> daemon/CLI memakai --resume <sid>
  -> Hermes load prior context
  -> completed returns sid
  -> persist kembali jika berubah
```

Daemon in-memory map bukan durability layer. Setelah daemon restart, seed map dari explicit persisted ID. Jangan mengandalkan map lama.

## 11. J — Job state machine

```text
loading -> running -> done
                    \-> error
                    \-> cancelled
```

State meanings:

- `loading`: run dibuat, executor belum aktif.
- `running`: Hermes process/daemon request aktif.
- `done`: assistant output tersimpan.
- `error`: execution/provider/validation failure.
- `cancelled`: user/system stop berhasil dicatat.

Setiap transition append `chat_run_events` dan broadcast event.

## 12. K — Keep live UI updated

SSE primary:

```text
GET /api/events/stream
```

Event path:

- `chat_run_event` + `tool_output`: append progressive stream buffer per run.
- `chat_run`: fetch run state pada transition; terminal state invalidates messages/active run.
- `chat_session_*`: invalidate sidebar/session cache.

Polling hanya fallback saat SSE unavailable. Jangan polling run events agresif ketika SSE sehat; itu menggandakan DB read dan UI invalidation.

## 13. L — Loading and activity UX

UI states:

```text
loading -> AgentProgress + task/activity plan
running -> elapsed + streaming output + Stop
terminal -> final response + footer
```

Worker Log hanya tampil saat loading/running ketika ada live process output. Assistant response tanpa bubble/card chrome berat; action footer berisi copy, model, time/elapsed, retry.

Reduced-motion setting harus dihormati. Timer memakai run `started_at`, bukan mount time.

## 14. M — Message persistence

Schema:

```sql
chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,
  content TEXT,
  run_id TEXT,
  created_at INTEGER
)

chat_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  agent TEXT,
  profile TEXT,
  workspace TEXT,
  model TEXT,
  state TEXT,
  prompt TEXT,
  output TEXT,
  error TEXT,
  started_at INTEGER,
  ended_at INTEGER
)

chat_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT,
  kind TEXT,
  payload TEXT,
  created_at INTEGER
)
```

Successful output menjadi assistant message dengan `run_id`. Failed run tetap disimpan dengan error dan event supaya UI/history tidak kehilangan failure.

## 15. N — Network and SSE reconnect

Reconnect behavior:

1. reconnect EventSource.
2. hydrate active room dari route.
3. fetch current run state.
4. fetch persisted messages/events bila stream gap.
5. clear stream buffer hanya setelah terminal state/persisted output confirmed.

SSE adalah live transport, bukan source of truth. DB state wajib bisa membangun ulang room setelah refresh.

## 16. O — Output and markdown

Assistant output dirender inline dengan markdown/code support sesuai Chat UI. Preserve raw content in DB. Streaming partial text tidak boleh overwrite persisted final response sebelum completion.

Jika output daemon buffered, UI hanya dapat menampilkan event yang benar-benar diterima. Jangan klaim true token streaming jika daemon masih menunggu process completion.

## 17. P — Provider and model switching

Model/profile selection berlaku pada run/session contract yang dipilih user. Roster berasal dari configured provider/profile, bukan hardcoded duplicate list.

Saat model/profile berubah:

- validate new selection.
- persist selected session defaults jika contract mengharuskan.
- preserve previous messages.
- resume behavior harus explicit; jangan assume beda model punya compatible context.

If provider rejects prompt, surface provider error. Jangan retry blind atau menyamarkan refusal sebagai success.

## 18. Q — Query failure and retry

Resume failure recovery:

```text
run dengan --resume gagal
  -> clear stale daemon/DB session ID
  -> retry fresh once
  -> success: persist new sid
  -> failure: state=error
```

Retry button membuat run baru dengan prompt yang sama atau explicit user action. Jangan membuat duplicate run diam-diam dari network retry.

## 19. R — Remote chat

Remote workspace memakai node-agent transport dan exact workspace registry. Verify:

- workspace host.
- transport.
- node availability.
- result provenance.
- remote worker log.

Remote chat bukan Kanban task. Tidak ada board task row, review diff, atau automatic commit dari Chat run.

## 20. S — Stop and cancellation

Stop action membatalkan active run secara cooperative/owned process path. Persist `cancelled` event/state. UI clear loading hanya setelah backend confirms terminal state.

Late output setelah cancellation tidak boleh membuat run kembali `done`. Guard terminal state update berdasarkan run ID/state.

## 21. T — Troubleshooting

| Symptom | Root cause | Fix |
|---|---|---|
| second prompt lupa context | `hermes_session_id` kosong/tidak dikirim | inspect DB + completed session ID; persist and resume |
| context hilang setelah daemon restart | hanya mengandalkan in-memory map | seed daemon dari persisted DB ID |
| `Permission denied: /Users` | remote path diproses VPS lokal | register exact workspace; route node-agent |
| chat stuck loading | async run/process/SSE gap | inspect run state + events + daemon/worker log |
| duplicate messages | aggressive polling atau retry tanpa idempotency | SSE primary; retry by run identity |
| model rejected | provider/model behavior | surface error; verify profile/model; no fabricated success |
| stale session resume | Hermes session deleted/rotated | clear stale ID, retry fresh once |
| UI shows no live output | daemon buffers stdout | label behavior honestly; use CLI/stream path if required |

## 22. U — User-facing interaction flow

```text
Sidebar Chat
  -> new/select /chat/:sessionID
  -> choose profile/model/workspace
  -> type prompt
  -> send
  -> loading
  -> running + progress/stream
  -> assistant response
  -> copy/retry
  -> next prompt resumes same Hermes session
```

Chat history filters sessions. Kanban board history filters tasks. Jangan merge sidebar state atau route identity kedua feature.

## 23. V — Verify one chat run

Minimal evidence:

1. API returns `202` + run ID.
2. user message persisted.
3. run transitions `loading -> running -> terminal`.
4. SSE carries run events or fallback is explicit.
5. assistant message persisted on success.
6. `hermes_session_id` persisted for non-fast-path Hermes run.
7. second prompt uses same session and preserves context.
8. error/cancel state remains terminal.

Inspect authenticated endpoints and DB readback. Build success alone does not prove room continuity.

## 24. W — Warm daemon vs CLI fallback

Daemon saves cold-start overhead but session map is volatile. CLI is slower but explicit session parsing can persist identity. Both paths must implement same:

- prompt input.
- profile/model/workspace.
- resume ID.
- session ID extraction.
- terminal result.
- error/retry semantics.

Test both paths when changing session continuity.

## 25. X — Exact data ownership

- `chat_sessions`: room identity and defaults.
- `chat_messages`: conversation transcript.
- `chat_runs`: execution attempt state/output.
- `chat_run_events`: live/reconnect timeline.
- daemon map: acceleration cache only.
- SSE: transport only.
- Kanban DB task tables: not Chat state.

No cross-feature mutation without explicit API contract.

## 26. Y — Safety rules

- allowlist Chat agent.
- validate profile/model/workspace server-side.
- never type or log credentials.
- fail closed on unregistered remote paths.
- preserve terminal run state.
- keep raw error evidence.
- no fake latency, token usage, progress, or provider success.
- mark unavailable browser evidence `NOT VERIFIED`.

## 27. Z — Completion proof

Chat run complete only when:

```text
session identified
+ prompt persisted
+ run state terminal
+ output/error persisted
+ event path verified
+ Hermes session ID persisted when applicable
+ next-turn resume verified
= Chat flow valid
```

Chat completion never means Kanban task done. Kanban completion never means Chat room response complete.

## Related docs

- [Kanban Board Flow — A sampai Z](kanban-board-flow.md)
- [Current chat architecture](chat-flow-architecture.md)
- [Legacy execution flow](../execution-flow.md)

## JEV chat preflight

Chat runs perform a compact structured preflight before Hermes when the message is complex, has attachments, or has a long session context. TypeSafe JEV evaluates intent, context scope, workspace need, confirmation need, attachment analysis, and compaction in one request.

- Short greetings and acknowledgements stay on the local fast path.
- High-risk actions create a durable ten-minute confirmation record before execution.
- `confirm` consumes that record and resumes the intended action.
- When compaction is required, Switchyard sends bounded recent context and starts a fresh Hermes session instead of resuming the stale one.
- Routing decisions are persisted as `chat_run_events(kind=routing)` and JEV usage is persisted in `jev_usage`.
- `create task ...` is confirmation-gated and creates a default-board Kanban task after confirmation.
