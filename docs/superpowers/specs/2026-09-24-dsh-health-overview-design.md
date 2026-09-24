# DSH Health Overview — Design

Date: 2026-09-24
Status: Approved
Scope: Kanban Board — Overview shows DSH liveness per remote node (Mac now, Windows later)

## Goal

Minimal feature: show "DSH on Mac/Windows is live" in Overview. Not deep diagnostics, not smoke runs. Fast, cheap, cross-platform.

## Decisions

- Check scope: binary + profile config only. NO model smoke call (costs tokens), NO gateway ping (provides "dead model key" truth only via real call — rejected).
- Poll cadence: env `DSH_HEALTH_INTERVAL_SECONDS`, default 60. Manual refresh bypasses cache via `?refresh_dsh=1`.
- API shape: extend `GET /api/nodes` (already polls 10s from Overview). No new endpoint.
- UI shape: extend NodeFleetCard. Per-node DSH sub-block. Node card stays green when agent up; DSH sub-block alone flags red/amber. Mild failure tolerated.
- Cross-platform: resolve `dsh` via PATH (same mechanism as executor detection). No mac-path hardcode.

## Node-agent probe

Per node, run (cached, TTL above):

1. `dsh --version` → binary present? version string.
2. `dsh --profile headless --dump-config` → provider, base_url, model resolved? profile valid?

Result shape:

```
dsh_health {
  ok: bool,
  version: string,       // "0.x.y"
  model: string,         // from dump-config
  provider: string,      // from dump-config
  error: string,         // no_binary | bad_profile | timeout | <raw detail>
  checked_at: int64      // unix seconds
}
```

Error taxonomy:
- `no_binary` — dsh not found on PATH
- `bad_profile` — headless profile missing provider/base/model, or `--dump-config` parse failed
- `timeout` — probe exceeded budget (5s per command)
- raw detail string appended

Cache: in-memory per node-agent process. `refresh_dsh=1` on `GET /api/nodes` forwarded to node-agents → force recheck. 10s poll shows cached result.

## API

```
GET /api/nodes
  → NodeAgentStatus.nodes[].dsh_health?   // omitted until first check
GET /api/nodes?refresh_dsh=1
  → force all nodes to recheck now
```

## UI (OverviewPage → NodeFleetCard)

- Per node row: small DSH line under node info.
  - ok: green dot `DSH live · v{version} · {model}`
  - !ok: amber/red dot `DSH down` + error code (no_binary / bad_profile / timeout + detail)
- Header: "Check DSH" button → refetch with `refresh_dsh=1`.
- Node card green while agent reachable regardless of DSH health.

## Tests

- Go unit: version parse, dump-config parse, cache TTL, force bypass.
- Frontend build.
- Deploy: VPS binary + Mac node-agent (GOOS=darwin GOARCH=arm64, launchd restart).
- Live verify via Tailscale: node registration shows dsh_health.ok=true with real Mac dsh version/model.

## Out of scope (later)

- Windows node-agent (same PATH mechanism, verify when Windows online)
- Model smoke / gateway ping
- Alerting/cron fanout