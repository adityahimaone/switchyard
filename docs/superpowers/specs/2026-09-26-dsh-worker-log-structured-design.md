# DSH Worker Log Structured View

## Context
Current `WorkerLogPanel` renders raw DSH JSONL output line-by-line with basic JSON pretty-printing. Human readability is poor — turns/steps/thinking/text are all flat.

## Scope
Enhance `WorkerLogPanel` (in `web/src/features/board/OutputPanels.tsx`) to detect DSH JSONL and render a structured timeline. Non-DSH logs unchanged.

## Detection
Output is DSH if:
- Any line parses as JSON with `"type"` ∈ {session, status, thinking, text, final}
- OR provenance line contains `executor=dsh`

## UI Structure

### Meta Strip (from provenance/session event)
```
Session: session-b7c54d06  |  Workspace: habbit-tracking-next  |  CWD: /Users/.../habbit-tracking-next
```

### Timeline (grouped by turn → step)
```
Turn 3
  Step 1
    💭 thinking  (collapsed by default)
    📝 text      (rendered inline)
    ✓ step_end   tokens: 158 in / 27 out / total 11,337 (cache 11,152)
  ✓ turn_end
Answer (final event)
  "We need execute command. Need commentary tool."
```

### Visual Spec
- **Turn header**: `text-xs font-semibold uppercase tracking-wider text-cyan-300`
- **Step subheader**: `text-xs text-cyan-400/70 ml-2`
- **Thinking**: collapsed `💭 thinking…` → expand → italic grey text
- **Text**: current log line rendering (ansiSpans + workerHint)
- **Step end**: inline `text-emerald-500/80` with token counts
- **Turn end**: inline `text-emerald-500`
- **Final/Answer**: boxed `bg-cyan-500/10 border-cyan-500/20 p-2 rounded text-cyan-100`
- **Raw toggle**: header button "Structured ▼ / Raw JSONL" — defaults structured

## Streaming Behavior
- Poll interval: 1.2s (existing)
- On each chunk: attempt to parse complete JSON lines
- Incomplete line at end → render raw, re-parse on next poll
- Lines not matching DSH schema → fall through to current raw rendering

## Files to Modify
- `web/src/features/board/OutputPanels.tsx` — new `parseDshLogEvents`, `DshLogTimeline`, integrate into `WorkerLogPanel`

## Non-Goals
- Don't change `DshResultPanel` (result panel)
- Don't add executor auto-detection to `ResultStack`
- Don't modify backend

## Test Cases
1. Your exact example → structured timeline renders
2. Partial JSONL mid-stream → raw lines until complete
3. Non-DSH output → no behavior change
4. ANSI-colored text in DSH `text` field → colors preserved
5. Missing provenance → timeline still works, meta strip absent

## Verification
- `pnpm --dir web build` passes
- `go build ./...` passes
- Live DSH task on board shows structured log