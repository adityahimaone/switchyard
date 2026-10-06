import { describe, expect, it } from "vitest"
import type { TaskEvent, TaskRun } from "@/api"
import { traceOrigin, traceSpansFromHistory } from "./taskTrace"

const ev = (id: number, kind: string, at: number, payload = "{}"): TaskEvent => ({
  id,
  task_id: "t1",
  kind,
  payload,
  created_at: at,
})

const run = (index: number, startedAt: number, endedAt: number, totalTokens = 0): TaskRun => ({
  index,
  started_at: startedAt,
  ended_at: endedAt,
  outcome: "completed",
  usage: { totalTokens, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  events: [],
})

describe("traceSpansFromHistory", () => {
  it("returns no spans for no events", () => {
    expect(traceSpansFromHistory([], [])).toEqual([])
  })

  it("derives one span per event, timed from the first event", () => {
    const events = [ev(1, "created", 100), ev(2, "assigned", 130), ev(3, "completed", 190)]
    const spans = traceSpansFromHistory(events, [])
    expect(spans.map((s) => s.label)).toEqual(["task.created", "agent.assigned", "task.completed"])
    expect(spans[0].start).toBe(0)
    // The first span runs until the second event: 30s in ms.
    expect(spans[0].end).toBe(30_000)
    // The last span closes a beat after its own timestamp.
    expect(spans[2].end).toBeGreaterThan(spans[2].start)
    expect(spans[1].kind).toBe("model")
    expect(spans[2].kind).toBe("io")
  })

  it("maps the executor, gate and verify to their span kinds", () => {
    const events = [
      ev(1, "remote_dispatched", 100),
      ev(2, "gate_started", 200),
      ev(3, "verify_started", 300),
    ]
    const spans = traceSpansFromHistory(events, [])
    expect(spans.map((s) => s.kind)).toEqual(["agent", "tool", "tool"])
  })

  it("marks failed events as error spans", () => {
    const events = [ev(1, "gate_failed", 100), ev(2, "verify_failed", 200), ev(3, "completed", 300)]
    const spans = traceSpansFromHistory(events, [])
    expect(spans[0].status).toBe("error")
    expect(spans[1].status).toBe("error")
    expect(spans[2].status).toBe("ok")
  })

  it("attaches a run's tokens and attempt to the event that opened it", () => {
    const events = [
      ev(1, "claimed", 100),
      ev(2, "remote_dispatched", 110, '{"executor":"shell","node_id":"mac"}'),
      ev(3, "completed", 900),
    ]
    const runs = [run(2, 105, 895, 12_400)]
    const spans = traceSpansFromHistory(events, runs)
    const dispatch = spans[1]
    expect(dispatch.tokens).toBe(12_400)
    expect(dispatch.attempt).toBe(2)
    expect(dispatch.detail).toBe("executor=shell node_id=mac")
    // The claim opened no counted run window of its own here.
    expect(spans[0].tokens).toBeUndefined()
  })

  it("summarizes the payload into a short detail line", () => {
    const events = [ev(1, "verify_started", 100, '{"source":"dispatcher","profile":"ui","command":"pnpm verify:ui"}')]
    const [span] = traceSpansFromHistory(events, [])
    expect(span.detail).toBe("profile=ui command=pnpm verify:ui")
  })

  it("falls back to the raw kind for unknown events", () => {
    const events = [ev(1, "mystery_event", 100)]
    const [span] = traceSpansFromHistory(events, [])
    expect(span.label).toBe("mystery.event")
    expect(span.kind).toBe("io")
  })

  it("floors same-second events to a visible span", () => {
    // Events share a second: each span is at least 1s wide,
    // so the axis shows bars instead of 1ms slivers.
    const events = [ev(1, "created", 100), ev(2, "claimed", 100), ev(3, "completed", 101)]
    const spans = traceSpansFromHistory(events, [])
    expect(spans[0].end).toBe(1000)
    expect(spans[1].end).toBe(1000)
    expect(spans[2].end).toBeGreaterThanOrEqual(spans[2].start + 1000)
  })

  it("derives the wall-clock origin from the first event", () => {
    expect(traceOrigin([ev(1, "created", 100)])).toBe(100_000)
    expect(traceOrigin([])).toBeUndefined()
    expect(traceOrigin([ev(1, "created", 0)])).toBeUndefined()
  })
})
