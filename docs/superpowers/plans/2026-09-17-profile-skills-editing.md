# Profile Skills Editing Implementation Plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** Allow profile create/edit forms to add and remove skills from the global Hermes skill registry.

**架构：** Keep selected skill names in profile-local `skills.json`; validate every name against global `~/.hermes/skills` registry. Profile API returns selected names and accepts full replacement lists. Frontend loads registry, renders selected badges, and submits selected names with profile fields.

**技术栈：** Go HTTP API, React, TanStack Query, existing shadcn/ui primitives.

---

### Task 1: Profile skill persistence and validation

**Files:**
- Modify: `internal/kanban/profile.go`
- Test: `internal/kanban/manage_test.go`

- [ ] Add failing tests proving create, replace, remove, empty list, and unknown-skill rejection.
- [ ] Run `go test ./internal/kanban -run 'Test(ProfileSkills|CreateAndPatchProfile)' -count=1`; expect failures because skills are currently directory-read-only.
- [ ] Implement `skills.json` read/write, normalize/dedupe names, and validate names through `ListSkills`/`SkillContent` without path traversal.
- [ ] Preserve legacy profile `skills/` directories as read compatibility when `skills.json` is absent.
- [ ] Run targeted tests and full `go test ./internal/kanban`.

### Task 2: Profile API payloads

**Files:**
- Modify: `cmd/server/main.go`

- [ ] Add `skills []string` to POST and PUT request structs.
- [ ] Pass skills into `ProfileInput`; preserve PUT distinction so omitted skills leaves current selection unchanged while an explicit empty array clears it.
- [ ] Run `go test ./...`.

### Task 3: Profile form skill editor

**Files:**
- Modify: `web/src/features/profiles/ProfilesPage.tsx`

- [ ] Query `/api/skills` in `ProfileForm`.
- [ ] Initialize selected names from current profile, render removable badges, and add available registry skills through searchable native input/list interaction.
- [ ] Submit selected names for both create and edit.
- [ ] Remove read-only copy.

### Task 4: Verification

**Files:**
- No additional files.

- [ ] Run `gofmt` on changed Go files.
- [ ] Run `go test ./...`.
- [ ] Run `npm --prefix web run build`.
- [ ] Inspect git diff and confirm unrelated modified files remain untouched.
