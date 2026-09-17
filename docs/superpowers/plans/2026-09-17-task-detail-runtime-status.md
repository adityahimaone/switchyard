# Task Detail Runtime Status Implementation Plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Add agent, node, workspace CodeGraph, and current execution status to task detail sidebar and detail page only.

**架构：** Reuse existing `/api/nodes`, `/api/workspaces/{id}/codegraph`, task, and task-event APIs. Add one shared presentational status component so sidebar and full page show same semantics without duplicating status logic. CodeGraph availability remains a warning, never assignment blocker.

**技术栈：** React 19, TypeScript, TanStack Query, existing shadcn Badge/Card styles, Go APIs already present.

---

## Files

- Create: `web/src/features/board/TaskRuntimeStatus.tsx` — shared status cards and derived labels.
- Modify: `web/src/api.ts` — typed node-agent response and API helper.
- Modify: `web/src/features/board/TaskDetail.tsx` — compact status block in sidebar.
- Modify: `web/src/features/board/TaskDetailPage.tsx` — full status block and CodeGraph report query.
- Test: `web/src/features/board/TaskRuntimeStatus.test.ts` — pure status derivation checks using native assertions if test runner exists; otherwise TypeScript build is verification.

## Task 1: Add typed node health API

- [x] Inspect existing API conventions and node response shape.
- [x] Add `NodeAgentStatus` / `NodeAgent` interfaces and `nodeAgentHealth()` helper in `web/src/api.ts`.
- [x] Run `pnpm --dir web build`; expected current baseline compiles.

## Task 2: Build shared runtime status presentation

- [x] Add pure helpers for profile state, node matching, CodeGraph state, and execution phase.
- [x] Render compact/full variants with accessible labels and low-intensity status colors.
- [x] Keep unknown data explicit: `not checked`, `unknown`, or `unavailable`; never infer CodeGraph read from index existence.
- [x] Run build and confirm no TypeScript errors.

## Task 3: Wire sidebar

- [x] Query node health and workspace CodeGraph report only when workspace exists.
- [x] Render compact profile validity, node availability, CodeGraph indexed/stale/unavailable state, and latest execution phase below existing Agent/Workspace metadata.
- [x] Preserve assignment behavior: invalid profiles remain blocked by existing selector; offline/stale status remains warning only.
- [x] Run build.

## Task 4: Wire detail page

- [x] Reuse shared component with full variant.
- [x] Derive running/queued counts from already-loaded board tasks when available; avoid extra endpoint.
- [x] Keep existing event timeline and AgentTaskStatus unchanged.
- [x] Run build.

## Task 5: Verification

- [x] Run `go test ./...`.
- [x] Run `go vet ./...`.
- [x] Run `pnpm --dir web build`.
- [x] Inspect `git diff --check` and diff scope.
- [x] Verify no task card or Flow view files changed.
