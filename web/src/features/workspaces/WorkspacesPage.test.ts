import { describe, expect, it } from "vitest"
import type { Workspace } from "@/api"
import { groupWorkspacesByPlatform } from "./WorkspacesPage"

function ws(partial: Partial<Workspace> & { id: string }): Workspace {
  return { name: partial.id, path: "", host: "", kind: "dir", ...partial }
}

describe("groupWorkspacesByPlatform", () => {
  it("groups by the same label the card badge renders", () => {
    const groups = groupWorkspacesByPlatform([
      ws({ id: "mac1", os: "mac", path: "/Users/x/Development", host: "mac-tailscale" }),
      ws({ id: "win1", os: "windows", path: "C:\\Development", host: "windows-tailscale" }),
      ws({ id: "vps1", os: "linux", path: "/home/me/app", host: "" }),
    ])
    expect(groups.map(([k]) => k)).toEqual(["mac", "windows", "vps"])
    expect(groups.every(([, list]) => list.length === 1)).toBe(true)
  })

  it("keeps a local host in the vps bucket, not linux", () => {
    // platformBadge reports local/loopback as "vps" even though inferOS() calls
    // it "linux", so grouping must follow the badge.
    const groups = groupWorkspacesByPlatform([ws({ id: "local", os: "linux", host: "" })])
    expect(groups[0][0]).toBe("vps")
  })

  it("derives windows from a drive-letter path when os is missing", () => {
    const groups = groupWorkspacesByPlatform([ws({ id: "nope", path: "C:\\Dev", host: "" })])
    expect(groups[0][0]).toBe("windows")
  })

  it("drops empty groups and keeps the canonical order", () => {
    const groups = groupWorkspacesByPlatform([
      ws({ id: "vps1", os: "linux", host: "" }),
      ws({ id: "mac1", os: "mac", path: "/Users/x/a", host: "mac-tailscale" }),
    ])
    expect(groups.map(([k]) => k)).toEqual(["mac", "vps"])
  })

  it("returns nothing for an empty list", () => {
    expect(groupWorkspacesByPlatform([])).toEqual([])
  })

  it("keeps every workspace in exactly one group", () => {
    const list = [
      ws({ id: "a", os: "mac", path: "/Users/x/a", host: "mac-tailscale" }),
      ws({ id: "b", os: "mac", path: "/Users/x/b", host: "mac-tailscale" }),
      ws({ id: "c", os: "windows", path: "C:\\Dev", host: "windows-tailscale" }),
    ]
    const groups = groupWorkspacesByPlatform(list)
    expect(groups.flatMap(([, items]) => items).map((w) => w.id).sort()).toEqual(["a", "b", "c"])
  })
})
