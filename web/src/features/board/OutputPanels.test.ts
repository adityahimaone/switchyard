import { describe, expect, it } from "vitest"
import { parseHarnessResult, parseHarnessLogEvents } from "./OutputPanels"

const commandCodeOutput = [
  'provenance executor=commandcode requested=commandcode bin=/usr/local/bin/cmd args=["-p"] ws=/Users/example/repo commandcode_session_id=cc-9f4e',
  '{"type":"event","event":{"type":"tool_running","toolName":"read_file","description":"main.go"}}',
  '{"type":"result","subtype":"success","sessionId":"cc-9f4e","stopReason":"end_turn","usage":{"inputTokens":120,"outputTokens":40,"totalTokens":160},"finalText":"Refactored main.go."}',
  "EXECUTOR_PROOF=commandcode",
  "",
].join("\n")

describe("parseHarnessResult", () => {
  it("reads the answer and session from a Command Code result frame", () => {
    const parsed = parseHarnessResult(commandCodeOutput, "commandcode")
    expect(parsed.answer).toBe("Refactored main.go.")
    expect(parsed.provenance?.sessionId).toBe("cc-9f4e")
    expect(parsed.provenance?.workspace).toBe("/Users/example/repo")
  })

  it("never treats progress event wrappers as the answer", () => {
    const parsed = parseHarnessResult(commandCodeOutput, "commandcode")
    expect(parsed.answer).not.toContain("read_file")
  })

  it("falls back to the result frame sessionId when provenance lacks the field", () => {
    const raw = '{"type":"result","subtype":"success","sessionId":"cc-only","finalText":"hi"}'
    const parsed = parseHarnessResult(raw, "commandcode")
    expect(parsed.answer).toBe("hi")
  })

  it("reports a clear message when a run returns no answer", () => {
    const raw = 'provenance executor=commandcode ws=/repo\n{"type":"result","subtype":"error","finalText":""}'
    const parsed = parseHarnessResult(raw, "commandcode")
    expect(parsed.answer).toContain("No final answer text returned")
  })

  it("survives a partially streamed trailing line", () => {
    const raw = '{"type":"result","sessionId":"cc-1","finalText":"ok"}\n{"type":"result","subty'
    const parsed = parseHarnessResult(raw, "commandcode")
    expect(parsed.answer).toBe("ok")
  })

  it("still parses dsh flat events unchanged", () => {
    const raw = [
      'provenance executor=dsh ws=/repo dsh_session_id=dsh-1',
      '{"type":"text","text":"working"}',
      '{"type":"final","text":"done"}',
    ].join("\n")
    const parsed = parseHarnessResult(raw, "dsh")
    expect(parsed.answer).toBe("done")
    expect(parsed.provenance?.sessionId).toBe("dsh-1")
  })
})

describe("parseHarnessLogEvents", () => {
  it("detects a Command Code run from its provenance line", () => {
    const parsed = parseHarnessLogEvents('provenance executor=commandcode ws=/repo commandcode_session_id=cc-1')
    expect(parsed.isDsh).toBe(true)
    expect(parsed.meta.sessionId).toBe("cc-1")
  })

  it("renders Command Code progress frames as timeline entries", () => {
    const raw = [
      'provenance executor=commandcode ws=/repo',
      '{"type":"event","event":{"type":"tool_running","toolName":"edit_file","description":"main.go"}}',
    ].join("\n")
    const parsed = parseHarnessLogEvents(raw)
    expect(parsed.events.some((e) => e.kind === "text" && e.text?.includes("edit_file"))).toBe(true)
  })

  it("promotes the result frame to the final answer and session", () => {
    const raw = [
      'provenance executor=commandcode ws=/repo',
      '{"type":"result","sessionId":"cc-7","finalText":"all set"}',
    ].join("\n")
    const parsed = parseHarnessLogEvents(raw)
    expect(parsed.events.some((e) => e.kind === "final" && e.text === "all set")).toBe(true)
    expect(parsed.meta.sessionId).toBe("cc-7")
  })

  it("does not misdetect plain text output as a harness run", () => {
    const parsed = parseHarnessLogEvents("just some shell output\nnothing structured here")
    expect(parsed.events.every((e) => e.kind === "raw")).toBe(true)
  })
})
