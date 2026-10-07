import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { openEventStream, type ServerEvent } from "./api"

/* The stream is shared app-wide, so the tests drive a fake EventSource
   and watch which subscribers hear what. There is no DOM in this setup;
   the browser API only ever appears inside openEventStream. */

class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  onmessage: ((m: { data: string }) => void) | null = null
  private named = new Map<string, (m: { data: string }) => void>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(kind: string, fn: (m: { data: string }) => void) {
    this.named.set(kind, fn)
  }
  close() { this.closed = true }
  /** Deliver a message the way the browser would. */
  emit(kind: string, data: unknown) {
    this.emitRaw(kind, JSON.stringify(data))
  }
  emitRaw(kind: string, raw: string) {
    const fn = kind === "message" ? this.onmessage : this.named.get(kind)
    fn?.({ data: raw })
  }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal("EventSource", FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const commented = (id: number): ServerEvent => ({
  kind: "commented",
  data: { task_id: "t1" },
  at: id,
})

describe("openEventStream", () => {
  it("shares one stream between subscribers and fans events out", () => {
    const seen: ServerEvent[] = []
    const off1 = openEventStream((e) => seen.push(e))
    const off2 = openEventStream((e) => seen.push(e))
    expect(FakeEventSource.instances).toHaveLength(1)
    FakeEventSource.instances[0].emit("message", commented(1))
    expect(seen).toHaveLength(2)
    off1()
    off2()
  })

  it("delivers named events", () => {
    const seen: ServerEvent[] = []
    const off = openEventStream((e) => seen.push(e))
    FakeEventSource.instances[0].emit("commented", commented(2))
    expect(seen).toHaveLength(1)
    off()
  })

  it("keeps the stream open for the remaining subscribers", () => {
    const off1 = openEventStream(() => {})
    const seen: ServerEvent[] = []
    const off2 = openEventStream((e) => seen.push(e))
    off1()
    expect(FakeEventSource.instances[0].closed).toBe(false)
    FakeEventSource.instances[0].emit("message", commented(3))
    expect(seen).toHaveLength(1)
    off2()
  })

  it("closes the stream when the last subscriber leaves, and reopens on demand", () => {
    const off = openEventStream(() => {})
    const first = FakeEventSource.instances[0]
    off()
    expect(first.closed).toBe(true)
    const off2 = openEventStream(() => {})
    expect(FakeEventSource.instances).toHaveLength(2)
    off2()
  })

  it("drops a malformed message without breaking the stream", () => {
    const seen: ServerEvent[] = []
    const off = openEventStream((e) => seen.push(e))
    const source = FakeEventSource.instances[0]
    source.emitRaw("message", "{not json")
    expect(seen).toHaveLength(0)
    source.emit("message", commented(4))
    expect(seen).toHaveLength(1)
    off()
  })

  it("isolates a throwing listener from the rest", () => {
    const seen: ServerEvent[] = []
    const off1 = openEventStream(() => { throw new Error("listener bug") })
    const off2 = openEventStream((e) => seen.push(e))
    expect(() => FakeEventSource.instances[0].emit("message", commented(5))).not.toThrow()
    expect(seen).toHaveLength(1)
    off1()
    off2()
  })
})
