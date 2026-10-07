import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readDraft, readSeen, writeDraft, writeSeen } from "./discussionStore"

/* The store reads window.localStorage lazily, so a plain object pins
   the behaviour — there is no jsdom in this setup. */

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get length() { return map.size },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  }
}

let store: ReturnType<typeof fakeStorage>

beforeEach(() => {
  store = fakeStorage()
  vi.stubGlobal("window", { localStorage: store })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("seen marks", () => {
  it("is absent until written", () => {
    expect(readSeen("t1")).toBeUndefined()
  })
  it("round-trips an id", () => {
    writeSeen("t1", 42)
    expect(readSeen("t1")).toBe(42)
  })
  it("ignores corrupt or non-positive values", () => {
    store.setItem("switchyard:discussion-seen:t1", "NaN")
    expect(readSeen("t1")).toBeUndefined()
    store.setItem("switchyard:discussion-seen:t1", "0")
    expect(readSeen("t1")).toBeUndefined()
    store.setItem("switchyard:discussion-seen:t1", "-3")
    expect(readSeen("t1")).toBeUndefined()
  })
  it("is scoped per task", () => {
    writeSeen("t1", 7)
    expect(readSeen("t2")).toBeUndefined()
  })
})

describe("drafts", () => {
  it("is empty until written", () => {
    expect(readDraft("t1")).toBe("")
  })
  it("round-trips text", () => {
    writeDraft("t1", "can you retry?")
    expect(readDraft("t1")).toBe("can you retry?")
  })
  it("writing empty clears the draft", () => {
    writeDraft("t1", "half-written")
    writeDraft("t1", "")
    expect(readDraft("t1")).toBe("")
  })
  it("is scoped per task", () => {
    writeDraft("t1", "one")
    writeDraft("t2", "two")
    expect(readDraft("t1")).toBe("one")
    expect(readDraft("t2")).toBe("two")
  })
})

describe("unavailable storage", () => {
  it("reads as absent and writes do not throw when window is missing", () => {
    vi.unstubAllGlobals()
    expect(readSeen("t1")).toBeUndefined()
    expect(readDraft("t1")).toBe("")
    expect(() => {
      writeSeen("t1", 5)
      writeDraft("t1", "x")
    }).not.toThrow()
  })
})
