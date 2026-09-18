# Phase 4 Ecosystem Design — Switchyard

Status: proposal approved for implementation in this workstream
Date: 2026-09-18
Repo: `~/apps/kanban-board`

## Goal

Add safe visibility and management contracts for MCP servers, extensions, and gateway sessions without expanding Switchyard into an arbitrary plugin runtime.

## Scope

1. MCP server registry
   - Profile-scoped declarative entries.
   - Name, transport (`stdio` or `http`), endpoint/command metadata, enabled state, capability summary.
   - Secrets stay server-side and are never returned.
   - Registry does not execute MCP commands in Switchyard.

2. Extension manifest registry
   - Declarative metadata only: ID, name, version, description, required capabilities.
   - Allowlisted capabilities: `read_tasks`, `read_logs`, `read_nodes`.
   - No arbitrary JavaScript, Go plugin loading, route registration, shell command, or filesystem access.
   - Manifest validation rejects unknown capabilities, traversal-like IDs, oversized input, and duplicate IDs.

3. Gateway session status
   - Read-only adapter health/status contract.
   - No gateway session creation until separate transport/auth design exists.
   - Explicit `disabled` state when gateway URL/config is absent.

## API

- `GET /api/ecosystem/mcp`
- `POST /api/ecosystem/mcp`
- `PATCH /api/ecosystem/mcp/{id}`
- `DELETE /api/ecosystem/mcp/{id}`
- `GET /api/ecosystem/extensions`
- `POST /api/ecosystem/extensions`
- `DELETE /api/ecosystem/extensions/{id}`
- `GET /api/ecosystem/gateway`

All routes use existing authenticated middleware. Bodies are bounded. IDs are validated. Mutations use atomic writes and emit SSE events.

## Storage

Use profile-scoped JSON under the existing Hermes profile directory:

- `ecosystem/mcp.json`
- `ecosystem/extensions.json`

Write temp file in same directory, fsync, rename, and chmod `0600` for MCP data. Extension metadata may use `0644` only if no secret fields are ever added; use `0600` uniformly for simplicity.

## Security

- Never execute registry commands or endpoints server-side in this phase.
- Never proxy arbitrary MCP traffic.
- Never return environment variables, headers, tokens, or command arguments containing secret values.
- HTTP MCP endpoints accept metadata only; URL validation allows HTTPS and loopback HTTP, rejects userinfo, file URLs, and private/link-local destinations except loopback.
- Gateway adapter remains fail-closed and reports `disabled` without complete config.

## Acceptance

- Invalid manifest/capability/ID rejected.
- Duplicate IDs rejected.
- Profile A cannot read or mutate profile B data.
- MCP secret fields never appear in response JSON.
- Atomic write preserves prior file on failure.
- Gateway returns `disabled` when not configured.
- `go test ./...`, `go vet ./...`, `go build ./cmd/server`, Vite build.
- Authenticated API smoke covers list/create/delete and redaction.

## Deferred

- MCP process lifecycle and tool invocation.
- Extension installation, code loading, and execution.
- Gateway session creation, streaming, authentication, and reconnect.
- Multi-user sharing and public manifests.
