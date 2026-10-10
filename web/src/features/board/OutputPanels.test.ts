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
  it("reads Claude Code result and session_id without treating other frames as the answer", () => {
    const raw = [
      'provenance executor=claude ws=/repo claude_session_id=claude-1',
      '{"type":"system","subtype":"init","session_id":"not-terminal"}',
      '{"type":"result","subtype":"success","is_error":false,"session_id":"claude-1","result":"Updated the feature."}',
    ].join("\n")
    const parsed = parseHarnessResult(raw, "claude")
    expect(parsed.answer).toBe("Updated the feature.")
    expect(parsed.provenance?.sessionId).toBe("claude-1")
    expect(parsed.events).toHaveLength(2)
  })

  it("falls back to Claude result session_id when provenance lacks it", () => {
    const parsed = parseHarnessResult('{"type":"result","session_id":"claude-only","result":"done"}', "claude")
    expect(parsed.answer).toBe("done")
    expect(parsed.provenance?.sessionId).toBe("claude-only")
  })

  it("does not interpret Claude result fields as Command Code output", () => {
    const parsed = parseHarnessResult('{"type":"result","session_id":"claude-1","result":"Claude answer"}', "commandcode")
    expect(parsed.answer).toContain("No final answer text returned")
  })

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

  it("extracts the answer from a real dsh chat turn, ignoring thinking/tool/status frames", () => {
    // Verbatim from a live chat run in a project (executor dsh). The chat used
    // to render this whole blob; it must reduce to the final answer + provenance.
    const raw = [
      'provenance executor=dsh requested=dsh bin=/opt/homebrew/bin/dsh args=["--profile" "headless" "--json"] ws=/Users/adityahimawan/Development/habbit-tracking-next dsh_session_id=session-853d3b4e-ad27-4c1f-9a96-43f48416ebd4 dsh_session_cwd=/Users/adityahimawan/Development/habbit-tracking-next',
      '{"type":"session","sessionId":"session-853d3b4e-ad27-4c1f-9a96-43f48416ebd4","cwd":"/Users/adityahimawan/Development/habbit-tracking-next"}',
      '{"type":"status","phase":"turn_start","turn":1}',
      '{"type":"tool_call","callId":"call_01","tool":"bash","input":{"command":"echo OKE"}}',
      '{"type":"tool_result","callId":"call_01","status":"completed","result":"OKE\\n"}',
      '{"type":"thinking","text":"ran echo OKE"}',
      '{"type":"text","text":"\\n\\nOKE"}',
      '{"type":"status","phase":"turn_end","turn":1,"reason":{"kind":"completed"}}',
      '{"type":"final","text":"\\n\\nOKE"}',
      "EXECUTOR_PROOF=dsh",
      'provenance executor=dsh requested=dsh ws=/Users/adityahimawan/Development/habbit-tracking-next',
    ].join("\n")
    const parsed = parseHarnessResult(raw, "dsh")
    expect(parsed.answer.trim()).toBe("OKE")
    expect(parsed.provenance?.workspace).toBe("/Users/adityahimawan/Development/habbit-tracking-next")
    expect(parsed.provenance?.cwd).toBe("/Users/adityahimawan/Development/habbit-tracking-next")
    expect(parsed.provenance?.sessionId).toBe("session-853d3b4e-ad27-4c1f-9a96-43f48416ebd4")
    expect(parsed.provenance?.bin).toBe("/opt/homebrew/bin/dsh")
    // No raw JSON leaks into the answer surface.
    expect(parsed.answer).not.toContain("{")
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
