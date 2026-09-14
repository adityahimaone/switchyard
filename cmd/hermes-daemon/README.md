# hermes-daemon

Fast local Hermes chat bridge over a Unix-domain HTTP socket.

Persistent `hermes chat --resume` sessions per workspace sidestep cold-start overhead
from repeated CLI invocations.

## Running

```bash
# foreground
python3 cmd/hermes-daemon/main.py

# background with pm2
pm2 start cmd/hermes-daemon/main.py --name hermes-daemon --interpreter python3
```

Socket path: `/tmp/hermes-daemon.sock` (override with `HERMES_DAEMON_SOCK`).

## Endpoints

- `GET /health` → `{"status":"ready"}`
- `POST /query` body `{"prompt","workspace","profile","model"}` → SSE stream of `{"kind":"tool_output","text":"..."}` then `{"kind":"completed","text":"..."}` then `{"kind":"done"}`
- `GET /shutdown` → graceful stop

## Token savings

Prompt-side RTK rewrite is NOT applied to freeform chat input (RTK rewrites shell commands, not LLM prompts). Result-side Caveman output compaction can be wired separately.

## Integration

`chat_exec.go:RunChat` checks `daemonHealthy()` over the socket first; falls back to `hermes chat -Q` CLI on timeout/missing socket.
