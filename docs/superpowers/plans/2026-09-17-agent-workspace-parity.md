# Agent Workspace Parity Implementation Plan

> Worker: use TDD red → green. Follow `docs/superpowers/specs/2026-09-17-hermes-webui-parity-roadmap-design.md`. Do not run remote paths locally.

**Goal:** Add remote-safe file browsing/editing and profile-scoped Skills/Memory writes.

**Architecture:** Workspace file operations route through node-agent using workspace ID and registered host. Local paths may use local execution only after validation. Remote paths (`/Users/`, `/c/`, `/d/`) always use node-agent. Skills and memory stay profile-scoped and use atomic writes.

**Tech stack:** Go stdlib HTTP/filesystem, existing node-agent HTTP contract, SQLite metadata where needed, React/TanStack Query, existing shadcn components.

## Files

Create:
- `internal/kanban/workspace_files.go` — file metadata, root validation, local/remote operation adapter.
- `internal/kanban/workspace_files_test.go` — traversal, symlink, upload, atomic-write tests.
- `cmd/server/workspace_file_routes.go` — file/tree/preview/edit/upload/download/terminal routes.

Modify:
- `internal/kanban/nodeagent.go` — bounded file/terminal request helpers.
- `cmd/server/main.go` — register routes.
- `internal/kanban/skills.go` or existing skills domain — profile-scoped CRUD contract.
- `internal/kanban/memory.go` or existing memory domain — atomic profile-scoped writes.
- `web/src/api.ts` — typed methods.
- `web/src/features/workspaces/WorkspacesPage.tsx` — tree and file actions.
- `web/src/features/skills/SkillsPage.tsx` — editor and linked files.
- `web/src/features/memory/MemoryPage.tsx` — editor and save state.
- `plan.md` — progress ticks.

### Task 1: Workspace operation contract

- [ ] Define `WorkspaceFile`, `WorkspaceFileRequest`, and `WorkspaceFileResult`.
- [ ] Resolve registered workspace by ID, not arbitrary path from request.
- [ ] Reject unregistered workspace and root escape before operation.
- [ ] Add tests for `..`, encoded traversal, symlink escape, empty path, and remote path.
- [ ] Commit `feat(workspace): define remote-safe file contract`.

### Task 2: Tree, preview, download

- [ ] Add GET tree endpoint with bounded depth and entry count.
- [ ] Add preview endpoint with MIME sniff, max bytes, and binary fallback.
- [ ] Add download endpoint with safe `Content-Disposition`.
- [ ] Route remote operations through node-agent; return host/transport metadata.
- [ ] Add local and mocked-node tests.
- [ ] Commit `feat(workspace): add remote-safe file browsing`.

### Task 3: Mutations and upload

- [ ] Add atomic edit using temp file + rename on local host.
- [ ] Add create, mkdir, rename, delete with root guard.
- [ ] Add multipart upload with size and MIME limits.
- [ ] Implement equivalent node-agent requests for remote workspace.
- [ ] Preserve failed-write data and return stable errors.
- [ ] Commit `feat(workspace): add guarded file mutations`.

### Task 4: Embedded terminal

- [ ] Reuse node-agent terminal start/input/output/close contract.
- [ ] Add session ID ownership and bounded output.
- [ ] Add cancellation and disconnect cleanup.
- [ ] Reject terminal start for unregistered workspace.
- [ ] Add tests for lifecycle and output cap.
- [ ] Commit `feat(workspace): add remote embedded terminal`.

### Task 5: Workspace UI

- [ ] Add tree, breadcrumbs, preview, upload/download, edit, create, rename, delete.
- [ ] Add terminal drawer with output cap and stop action.
- [ ] Add git branch/dirty status from existing workspace health metadata.
- [ ] Use shared system Select/Combobox when search is needed.
- [ ] Add browser-rendered acceptance for local and remote workspace markers.
- [ ] Commit `feat(workspace): add file browser UI`.

### Task 6: Skills CRUD

- [ ] Add profile-scoped list/read/write/create/delete endpoints.
- [ ] Guard skill path traversal and linked-file paths.
- [ ] Atomic-write `SKILL.md`; preserve linked files separately.
- [ ] Add editor, linked-file viewer, search, and delete confirmation.
- [ ] Test inactive profile isolation.
- [ ] Commit `feat(skills): add profile-scoped editor`.

### Task 7: Memory writes

- [ ] Add profile-scoped `MEMORY.md` and `USER.md` read/write endpoints.
- [ ] Atomic-write files and return modified timestamp.
- [ ] Reject unsupported scope and oversized body.
- [ ] Add editor with dirty-state guard and save/error feedback.
- [ ] Test profile isolation and failed-write preservation.
- [ ] Commit `feat(memory): add atomic profile-scoped writes`.

### Task 8: Verification

- [ ] Run `go vet ./...`, `go test ./...`, `go build ./cmd/server`.
- [ ] Run `pnpm build` from `web/`.
- [ ] Run local file smoke.
- [ ] Run remote Mac canary through node-agent; prove no VPS `/Users` access.
- [ ] Verify worker log, transport, and returned artifact.
- [ ] Tick Phase 2 acceptance in `plan.md`.
