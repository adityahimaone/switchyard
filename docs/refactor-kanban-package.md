# Splitting `internal/kanban` — assessment and plan

**Status:** not started. This is audit item 13's second half; the first half
(splitting `main.go`) is done.

`internal/kanban` is 57 non-test files / ~13,100 lines, plus 52 test files /
~7,800 lines. It is a catch-all package, and the audit is right that it should
be split. This document records *why it has not been done yet* and what a real
attempt would have to solve first, so the next person does not have to rediscover
it by hand.

## Why this is not a mechanical split

Two things make it substantially harder than moving files:

1. **Three genuine import cycles** exist between the natural clusters. Go will
   not compile two packages that import each other, so each has to be broken
   before either can be extracted.
2. **The symbols that cross cluster boundaries are unexported.** Unexported
   identifiers cannot be used from another package, so ~24 of them and roughly
   150–190 call sites would have to be exported or relocated to a new shared
   package first.

The surface is not hypothetical — it was measured by reading the source:

| Shared symbol | Defined in | Called from |
|---|---|---|
| `hermesHome()` | `kanban.go:70` | **19 files**, ~45 sites |
| `openDB(slug)` | `kanban.go:119` | **11 files**, ~25 sites |
| `broadcastEvent()` | `events.go:34` | **12 files**, ~35 sites |
| `insertEvent()` | `kanban.go:457` | 7 files, ~15 sites |
| `profileDir()` | `profile.go:136` | 7 files, ~12 sites |
| `localWorkspacePath()` | `workspace.go:116` | 5 files |
| `shellQuote()` | `workspace.go:369` | 3 files (codegraph) |
| `newChatID()` | `chat.go:125` | `attachments.go:149` |

## The cycles

| Cycle | Edges |
|---|---|
| **nodeagent ↔ reliability** | `nodeagent.go:449,484,608` → `insertEventTx` (`reliability.go:386`); `reliability.go:91,129,165,269` → `NodeAgentHealth` (`nodeagent.go:522`) |
| **attachments ↔ chat** | `attachments.go:149` → `newChatID` (`chat.go:125`); `chat.go:390` + `chat_routing.go:242` → `ListChatAttachments` |
| **kanban → workspace** | `kanban.go:317,319` → `transportForPath`, `validateWorkspacePath` (`workspace_validate.go`) |

`providers.go:136,160` → `invalidateChatRosterCache` (`chat_validation.go:18`)
is a fourth, one-directional edge that becomes a cycle the moment chat and
profiles are in the same package and something else moves.

## Proposed layout

| Package | Files | Lines | Notes |
|---|---|---|---|
| `internal/store` | `kanban.go`, `dataops.go`, `switchyard_backend.go`, `comments.go`, `boards.go` | ~2,100 | The hub: `Board`/`Task` types, `openDB`, `hermesHome`, events. Everything depends on it. |
| `internal/auth` | `auth.go`, `password_hash.go` | ~600 | **Cleanest extraction.** Zero outbound cross-cluster dependencies. |
| `internal/cron` | `cron.go` | ~500 | Self-contained; only needs `hermesHome`. |
| `internal/chat` | `chat*.go` | ~2,100 | Blocked by the attachments cycle. |
| `internal/workspace` | `workspace*.go` | ~1,400 | Blocked by the kanban→workspace cycle. |
| `internal/nodeagent` | `nodeagent*.go` | ~1,100 | Blocked by the nodeagent↔reliability cycle. |
| `internal/profile` | `profile*.go`, `providers.go` | ~1,100 | Blocked by the providers→chat edge. |
| `internal/attachments` | `attachments.go`, `blobstore.go`, `vision*.go` | ~830 | Blocked by the attachments↔chat cycle. |
| `internal/reliability` | `reliability.go`, `notifications.go`, `events.go` | ~600 | Blocked by the nodeagent cycle. |
| `internal/ecosystem` | `ecosystem.go`, `mcp_*.go` | ~770 | Needs `profileDir` from the shared layer. |
| `internal/overview` | `overview.go` + the small ones (flow, codegraph, inspect, jev, ai, executor settings) | ~1,700 | Each is individually small; combined they are a reasonable package. |

## Order of work

Each step keeps `go test ./...` green.

1. **Create the shared layer.** A small package holding `hermesHome`, `openDB`,
   `boardDir`, `insertEvent`, `broadcastEvent`, `tableColumns`, and the
   `Board`/`Task`/`TaskEvent` types. Nothing else can be extracted before this
   exists. This is the prerequisite, not a step.
2. **Extract `auth`.** No cycles, no shared-symbol changes beyond `hermesHome`.
   Good first move: it proves the extraction mechanics work.
3. **Extract `cron`.** Same profile.
4. **Break the three cycles**, in this order (cheapest first):
   - *kanban → workspace*: move `transportForPath` / `validateWorkspacePath` into
     the shared layer, or invert the dependency by having `kanban.go` take the
     transport as a parameter instead of resolving it.
   - *providers → chat*: move the chat roster cache into the shared layer, or
     have `providers` emit an event that chat subscribes to.
   - *attachments ↔ chat*: move `newChatID` into the shared layer. That alone
     breaks this cycle; the reverse edge is exported already.
   - *nodeagent ↔ reliability*: the hardest. `insertEventTx` should move to the
     store layer next to `insertEvent`, which removes the nodeagent→reliability
     edge; then `NodeAgentHealth` needs an interface or a callback.
5. **Extract the remaining clusters**, one at a time.
6. **Relocate white-box tests.** 27 of 52 test files reference internals from
   other clusters (~1,000–1,800 lines). Either move each test with its code or
   export the internals it needs.

## Constraints to respect

- **`cmd/server` opens the board database directly.** `review.go:71,440,461` and
  `remote_dispatch.go:69` call `kanban.BoardDBPath(slug)`, open the `*sql.DB`
  themselves, and pass it back into `ResolveHarnessBindingFor`,
  `TaskCommentsAfter`, `ClaimTaskRun` and `PersistTaskIdentity`. Those functions
  **must stay in the same package as `BoardDBPath`** or the import graph
  inverts. If this is ever cleaned up, clean it up first: hand the `*sql.DB` over
  the package boundary instead of passing it in.
- **Package-level singletons** need a home: the SSE `Hub` (read by
  `cmd/server/main.go:1247`), the attachment `activeStore` blob store (swapped at
  startup by `main.go:1271`), the auth DB handle, the notification ring buffer,
  and the codegraph job registry.
- **`flow.go` has an `init()`** that starts a background sync goroutine at package
  load. Moving it changes when that starts; keep it explicit.
- **Do not rename the module at the same time.** The Go module is still
  `kanban-board` while the product is Switchyard. Doing both in one change makes
  a compile error ambiguous between the two.

## Why `shellQuote` is duplicated

`cmd/server/review.go` defines its own `shellQuote` rather than using
`internal/kanban`'s, purely because the original is unexported. It is a real
duplicate with its own test (`cmd/server/shellquote_test.go`). The shared layer
in step 1 should own it and both callers should use it — that duplication is
exactly the cost this package shape is charging.
