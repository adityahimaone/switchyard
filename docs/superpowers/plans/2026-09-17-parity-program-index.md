# Switchyard Hermes WebUI Parity Program

Status: planning complete; implementation not started
Date: 2026-09-17

## Source documents

- Design: `docs/superpowers/specs/2026-09-17-hermes-webui-parity-roadmap-design.md`
- Phase 1 design: `docs/superpowers/specs/2026-09-17-chat-workspace-v1-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-09-17-chat-workspace-v1.md`
- Phase 2 plan: `docs/superpowers/plans/2026-09-17-agent-workspace-parity.md`
- Phase 3 plan: `docs/superpowers/plans/2026-09-17-operations-trust-parity.md`
- Existing attachment plan: `docs/superpowers/plans/2026-09-16-attachment-vision.md`

## Execution order

1. Chat Workspace v1.
2. Attachment + Vision plan if not already fully verified.
3. Agent Workspace parity.
4. Operations and Trust parity.
5. Separate design approval for MCP, extensions, and gateway sessions.

## Program gates

Before each phase:

- Read linked design and plan.
- Confirm clean/intentional worktree and current branch.
- Use isolated worktree for implementation.
- Confirm remote workspace routing rules.
- Create task cards with explicit board, workspace, profile, executor, priority.

During each phase:

- TDD red → green.
- One focused commit per slice.
- Run fresh tests after each slice.
- Keep `plan.md` granular: touched, partial, fully verified, weighted completion.

Before phase completion:

- `go vet ./...`
- `go test ./...`
- `go build ./cmd/server`
- `pnpm build` from `web/`
- Authenticated live API smoke.
- Browser-rendered acceptance for UI claims.
- Remote Mac canary for remote-workspace claims.
- Exact diff and security review.

## Deferred

Do not implement yet:

- Public share links.
- Multi-user collaboration.
- Arbitrary extension marketplace.
- Gateway session integration.
- MCP server exposure.

Each needs separate data ownership, auth, and threat-model design.
