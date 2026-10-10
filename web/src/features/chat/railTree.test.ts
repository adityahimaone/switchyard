import { describe, expect, it } from "vitest"
import type { ChatSession } from "@/api"
import { buildRailTree, groupKeyFor } from "./railTree"

const DAY = 86_400
const now = Math.floor(new Date("2026-10-10T12:00:00").getTime() / 1000)

function s(over: Partial<ChatSession>): ChatSession {
  return {
    id: over.id ?? "cs_x", title: over.title ?? "t", agent: "hermes", profile: "default",
    workspace: "", model: "", created_at: now, updated_at: now, ...over,
  } as ChatSession
}

describe("groupKeyFor", () => {
  it("buckets by age from the start of today (timestamps are unix seconds)", () => {
    const nowMs = now * 1000
    expect(groupKeyFor(now, nowMs)).toBe("today")
    expect(groupKeyFor(now - DAY, nowMs)).toBe("yesterday")
    expect(groupKeyFor(now - 3 * DAY, nowMs)).toBe("prev7")
    expect(groupKeyFor(now - 10 * DAY, nowMs)).toBe("prev30")
    expect(groupKeyFor(now - 40 * DAY, nowMs)).toBe("older")
  })
})

describe("buildRailTree", () => {
  const nowMs = now * 1000
  it("puts pinned first, project sessions under their project, rest in recents", () => {
    const tree = buildRailTree([
      s({ id: "cs_pin", pinned: true, project_id: "cp_1" }),
      s({ id: "cs_proj", project_id: "cp_1" }),
      s({ id: "cs_loose", updated_at: now }),
    ], nowMs)

    expect(tree.pinned.map((x) => x.id)).toEqual(["cs_pin"])
    expect(tree.byProject.get("cp_1")?.map((x) => x.id)).toEqual(["cs_proj"])
    expect(tree.recentsGrouped.today.map((x) => x.id)).toEqual(["cs_loose"])
  })

  it("never renders a session twice: pinned wins over its project", () => {
    const tree = buildRailTree([s({ id: "cs_pin", pinned: true, project_id: "cp_1" })], nowMs)
    const inProject = tree.byProject.get("cp_1") ?? []
    const inRecents = Object.values(tree.recentsGrouped).flat()
    expect(tree.pinned.map((x) => x.id)).toEqual(["cs_pin"])
    expect(inProject).toHaveLength(0)
    expect(inRecents).toHaveLength(0)
  })

  it("groups loose sessions by age", () => {
    const tree = buildRailTree([
      s({ id: "cs_today", updated_at: now }),
      s({ id: "cs_old", updated_at: now - 40 * DAY }),
    ], nowMs)
    expect(tree.recentsGrouped.today.map((x) => x.id)).toEqual(["cs_today"])
    expect(tree.recentsGrouped.older.map((x) => x.id)).toEqual(["cs_old"])
  })
})
