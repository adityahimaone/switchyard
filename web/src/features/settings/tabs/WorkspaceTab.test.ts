import { describe, expect, it } from "vitest"
import { workspaceAvatarSrc, type WorkspaceIdentity } from "./WorkspaceTab"

describe("workspaceAvatarSrc", () => {
  it("uses the server revisioned URL for uploaded avatars", () => {
    const identity: WorkspaceIdentity = {
      name: "Switchyard",
      avatar_url: "/api/workspace/avatar?v=abc123",
      has_uploaded_avatar: true,
    }

    expect(workspaceAvatarSrc(identity)).toBe("/api/workspace/avatar?v=abc123")
  })

  it("preserves legacy remote URLs and empty state", () => {
    expect(workspaceAvatarSrc({ name: "Old", avatar_url: "https://example.com/avatar.png", has_uploaded_avatar: false }, null))
      .toBe("https://example.com/avatar.png")
    expect(workspaceAvatarSrc(undefined, null)).toBe("")
  })
})
