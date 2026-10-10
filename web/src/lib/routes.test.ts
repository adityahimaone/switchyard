import { describe, expect, it } from "vitest"
import { parseRoute } from "./routes"

describe("parseRoute projects", () => {
  it("renders /projects as the Chat page (projects are chats, not a page)", () => {
    expect(parseRoute("/projects")).toMatchObject({ page: "chat" })
    expect(parseRoute("/projects").projectID).toBeUndefined()
  })

  it("reads a project id and its session", () => {
    expect(parseRoute("/projects/cp_1")).toMatchObject({ page: "chat", projectID: "cp_1" })
    expect(parseRoute("/projects/cp_1/cs_9")).toMatchObject({ page: "chat", projectID: "cp_1", chatSessionID: "cs_9" })
  })

  it("keeps a landing-view session out of projectID via the `-` sentinel", () => {
    // Without the sentinel `cs_9` would be read as a project id and the
    // landing view would try to open a project that does not exist.
    const r = parseRoute("/projects/-/cs_9")
    expect(r.page).toBe("chat")
    expect(r.projectID).toBeUndefined()
    expect(r.chatSessionID).toBe("cs_9")
  })
})
