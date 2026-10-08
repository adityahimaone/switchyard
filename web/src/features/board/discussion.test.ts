import { describe, expect, it } from "vitest"
import type { TaskComment } from "../../api"
import {
  agentPhase, awaitedComment, deliveryNote, elapsedSeconds, formatElapsed, isPending, latestId,
  newAgentComments, phaseCopy, QUEUE_SLOW_AFTER_SEC, relativeTime, replyTarget, showHeader,
  unreadAgentCount, USER_AUTHOR, withMention,
} from "./discussion"

let nextId = 1
const c = (author: string, createdAt = 1000, id = nextId++, body = "x"): TaskComment => ({
  id, task_id: "t1", author, body, created_at: createdAt,
})
const me = (createdAt?: number, id?: number) => c(USER_AUTHOR, createdAt, id)
const agent = (createdAt?: number, id?: number) => c("default", createdAt, id)

describe("replyTarget", () => {
  it("prefers the assignee", () => {
    expect(replyTarget("karina", [agent()])).toBe("karina")
  })
  it("falls back to the last non-user author when nothing is assigned", () => {
    expect(replyTarget("", [c("jihyo"), c("default"), me()])).toBe("default")
  })
  it("is empty when nobody has spoken and nobody is assigned", () => {
    expect(replyTarget("  ", [me()])).toBe("")
  })
})

describe("withMention", () => {
  const names = ["default", "jihyo", "karina"]
  it("prefixes the target tag", () => {
    expect(withMention("please retry", "default", names)).toBe("@default please retry")
  })
  it("does not double-tag the target", () => {
    expect(withMention("@default please retry", "default", names)).toBe("@default please retry")
  })
  it("respects a draft that already tags a different agent", () => {
    expect(withMention("@jihyo can you look", "default", names)).toBe("@jihyo can you look")
  })
  it("sends untouched when there is no target (user turned the tag off)", () => {
    expect(withMention("  hello  ", "", names)).toBe("hello")
  })
  it("never tags an empty body", () => {
    expect(withMention("   ", "default", names)).toBe("")
  })
  it("mirrors the server check: substring on @name", () => {
    // Server: strings.Contains(body, "@"+assignee). A longer name sharing the
    // prefix therefore counts as a mention on the server too.
    expect(withMention("@defaultly odd", "default", names)).toBe("@defaultly odd")
  })
})

describe("awaiting + phase", () => {
  it("awaits only when the newest comment is the user's", () => {
    expect(awaitedComment([agent(), me()])).not.toBeNull()
    expect(awaitedComment([me(), agent()])).toBeNull()
    expect(awaitedComment([])).toBeNull()
  })

  it("is 'none' when an agent has the last word", () => {
    expect(agentPhase("running", awaitedComment([me(), agent()]))).toBe("none")
  })

  it("is 'sending' for an optimistic comment whatever the status says", () => {
    const optimistic = me(1000, -5)
    expect(isPending(optimistic)).toBe(true)
    expect(agentPhase("review", optimistic)).toBe("sending")
  })

	it.each(["triage", "todo", "scheduled", "ready"] as const)("is 'queued' while %s", (s) => {
		expect(agentPhase(s, me())).toBe("queued")
	})

	it("is 'working' while running", () => {
		expect(agentPhase("running", me())).toBe("working")
	})

	it("recognizes review as a completed delivery", () => {
		expect(agentPhase("review", me())).toBe("delivered")
		expect(phaseCopy("delivered", "default", 0, "review")?.label).toBe("Comment delivered")
	})

	it("keeps blocked parked until the requeue succeeds", () => {
		expect(agentPhase("blocked", me())).toBe("parked")
	})

	it.each(["done", "archived"] as const)("is 'parked' in %s", (s) => {
    expect(agentPhase(s, me())).toBe("parked")
  })
})

describe("phaseCopy", () => {
  it("renders nothing when idle", () => {
    expect(phaseCopy("none", "default", 0, "todo")).toBeNull()
  })
  it("names the agent and shows elapsed time while working", () => {
    expect(phaseCopy("working", "default", 75, "running")).toMatchObject({ label: "default is working", detail: "1m 15s" })
  })
  it("falls back to a generic name", () => {
    expect(phaseCopy("working", "", 3, "running")?.label).toBe("The agent is working")
  })
  it("escalates a long queue to a warning", () => {
    expect(phaseCopy("queued", "x", QUEUE_SLOW_AFTER_SEC - 1, "todo")?.tone).toBe("progress")
    expect(phaseCopy("queued", "x", QUEUE_SLOW_AFTER_SEC, "todo")?.tone).toBe("warn")
  })
  it("explains a parked comment using the real status", () => {
    const p = phaseCopy("parked", "x", 0, "done")
    expect(p?.tone).toBe("warn")
    expect(p?.detail).toContain("done")
  })
})

describe("deliveryNote", () => {
  it("says review and blocked are requeued by any comment (matches AddComment)", () => {
    expect(deliveryNote("review", "", false).text).toMatch(/back to todo/)
    expect(deliveryNote("blocked", "karina", false).text).toMatch(/back to todo/)
  })
  it("done reopens only when the assignee is tagged", () => {
    expect(deliveryNote("done", "karina", true).tone).toBe("info")
    expect(deliveryNote("done", "karina", false).tone).toBe("warn")
  })
  it("done with no assignee can never reopen", () => {
    const n = deliveryNote("done", "", true)
    expect(n.tone).toBe("warn")
    expect(n.text).toMatch(/no assignee/)
  })
  it("warns for archived", () => {
    expect(deliveryNote("archived", "x", true).tone).toBe("warn")
  })
  it("does not promise live delivery for running/todo", () => {
    expect(deliveryNote("running", "x", true).text).not.toMatch(/immediately|live|instantly/i)
  })
})

describe("unread + new", () => {
  const thread = [agent(10, 1), me(11, 2), agent(12, 3), agent(13, 4), me(14, -1)]
  it("counts only confirmed agent comments above the seen id", () => {
    expect(unreadAgentCount(thread, 0)).toBe(3)
    expect(unreadAgentCount(thread, 3)).toBe(1)
    expect(unreadAgentCount(thread, 4)).toBe(0)
  })
  it("ignores the user's own and optimistic comments", () => {
    expect(unreadAgentCount([me(1, 9), me(2, -2)], 0)).toBe(0)
  })
  it("finds the latest real id", () => {
    expect(latestId(thread)).toBe(4)
    expect(latestId([])).toBe(0)
  })
  it("lists new agent comments oldest first", () => {
    expect(newAgentComments(thread, 1).map((x) => x.id)).toEqual([3, 4])
  })
})

describe("showHeader", () => {
  it("always shows the first", () => expect(showHeader(undefined, agent())).toBe(true))
  it("hides on same author within five minutes", () => {
    expect(showHeader(agent(1000), agent(1100))).toBe(false)
  })
  it("shows when the author changes", () => {
    expect(showHeader(agent(1000), me(1001))).toBe(true)
  })
  it("shows again after a long gap", () => {
    expect(showHeader(agent(1000), agent(1000 + 301))).toBe(true)
  })
})

describe("time", () => {
  const now = 1_000_000 * 1000
  it("clamps a future timestamp (client clock behind server)", () => {
    expect(elapsedSeconds(1_000_000 + 30, now)).toBe(0)
  })
  it("formats elapsed time", () => {
    expect(formatElapsed(9)).toBe("9s")
    expect(formatElapsed(65)).toBe("1m 05s")
    expect(formatElapsed(900)).toBe("15m")
  })
  it("formats relative time", () => {
    expect(relativeTime(1_000_000 - 10, now)).toBe("just now")
    expect(relativeTime(1_000_000 - 120, now)).toBe("2m ago")
    expect(relativeTime(1_000_000 - 3 * 3600, now)).toBe("3h ago")
    expect(relativeTime(1_000_000 - 3 * 86400, now)).toMatch(/\w/)
  })
})
