# Plug energy dashboard (1d / 7d / 30d / custom range) — design

## Goal
On the Overview page's "Energy" card (Windows PC · smart plug), let Adit pick a
range — preset 1 day / 7 days / 30 days, or a custom date range — and read the
energy used in that range as **kWh and rupiah**, plus the **per-day averages**.

Example: "1–3 October = how many kWh, how many rupiah".

## The constraint that shapes everything
Tuya Cloud keeps only a **rolling ~28h** of `cur_power` DP history on this plan.
Measured directly: requesting 30 days with `max_fetches` 60 / 500 / 5000 all
return the **same** 155 samples spanning 28.0h. `max_fetches` does **not**
extend retention. There is no lifetime energy DP (`total_forward_energy` absent;
`add_ele` is a resetting delta).

Consequences:
- **1 day** works straight from Tuya (already does).
- **7d / 30d / custom** are impossible from Tuya. They need our own sampler that
  persists the draw over time.
- The sampler is **forward-only**. No backfill of past weeks/months exists —
  data starts accruing the day the sampler ships.

## Data flow
```
~/bin/plug-live  (reads cur_power only, ~1–3s)
      │  every 60s, started in cmd/server
      ▼
~/.hermes/kanban/power.db   power_samples(node_id, ts, watts)
      │
GET /api/nodes/{id}/power/energy?from=&to=
      │  Go: time-weighted integrate + WIB day buckets + tariff
      ▼
{ total_kwh, total_rp, avg_kwh_per_day, avg_rp_per_day, daily[], coverage }
      │
OverviewPage  Energy card: preset 1D/7D/30D/Custom + <input type=date> ×2
```

## 1. Storage — `~/.hermes/kanban/power.db` (SQLite, modernc)
```sql
CREATE TABLE IF NOT EXISTS power_samples (
  node_id TEXT    NOT NULL,
  ts      INTEGER NOT NULL,   -- unix seconds (UTC)
  watts   REAL    NOT NULL,   -- instantaneous draw
  PRIMARY KEY (node_id, ts)
) WITHOUT ROWID;
```
One row per minute per node ≈ 0.5M rows/year — trivial for SQLite. No pruning
(YAGNI); add a retention delete later if the file ever matters.

## 2. Sampler — `internal/kanban/power_sample.go`
- `StartPowerSampler(ctx, interval)` — goroutine started from `cmd/server/main.go`.
- Loads power config; for each target that declares a `sample` script, on every
  tick (and **once immediately** at start) runs `PowerAction(nodeID,"sample")`,
  parses `power_w`, inserts a row.
- A single sequential loop (one plug). Errors are logged and skipped — a failed
  read never kills the loop, and a missing `sample` script makes it a no-op.
- New action `"sample"` added to `resolvePowerScript`; script
  `~/bin/plug-live` = `exec "$(dirname "$0")/plug" live`.
- Uses the **live** reading (cheap), not the 7-day `metrics` log (slow, wasteful
  at 60s cadence).

## 3. Aggregation — `internal/kanban/power_energy.go`
`PowerEnergyRange(nodeID string, from, to time.Time, tariff float64) (EnergyRange, error)`

- Read samples in `[from, to]`, **plus the one sample just before `from`** so the
  interval straddling the start edge is integrated, not dropped.
- Time-weighted integration between consecutive samples:
  `kwh += (w0+w1)/2 * (t1-t0)/3600/1000`.
- **Gap guard:** if `t1-t0 > 300s`, skip that interval (VPS/plug was offline —
  do not credit phantom kWh). This is the difference between an honest number
  and one that grows when the box sleeps.
- Bucket per **WIB (UTC+7, fixed)** calendar day for `daily[]`.
- `days` = WIB calendar days touched by `[from,to)`; averages divide by it.
- `coverage_from` = `MIN(ts)` in the DB, so the UI can warn when the requested
  range predates the data instead of silently showing a low total.

```go
type EnergyRange struct {
  NodeID       string      `json:"node_id"`
  From, To     int64       `json:"from,to"`          // unix seconds
  TariffPerKWh float64     `json:"tariff_per_kwh"`
  TotalKWh     float64     `json:"total_kwh"`
  TotalRp      float64     `json:"total_rp"`
  Days         int         `json:"days"`
  AvgKWhPerDay float64     `json:"avg_kwh_per_day"`
  AvgRpPerDay  float64     `json:"avg_rp_per_day"`
  Daily        []EnergyDay `json:"daily"`            // {date,kwh,rp}
  Samples      int         `json:"samples"`
  SpanSeconds  int64       `json:"span_seconds"`
  CoverageFrom int64       `json:"coverage_from"`    // earliest sample ever
}
```

## 4. Route — `GET /api/nodes/{id}/power/energy?from=&to=`
- `from` / `to` accept either **unix seconds** or **`YYYY-MM-DD`** (WIB). A date
  `to` is inclusive: it is treated as that whole day (`+1d 00:00 WIB`, exclusive).
- Default (no params) = last 24h.
- Tariff read from `power-targets.json` `tariff_per_kwh` (default **1444.70**).
- Lives in `power_routes.go`; add its line to
  `cmd/server/routes_inventory_test.go` `expectedRoutes`.
- **Why a new route, not extend `/power/metrics`:** `power.go`'s invariant is
  that no caller input is ever interpolated into a command — it runs one fixed
  script. A range query reads our DB in Go (no shell, no injection) and needs
  `from`/`to`. Different shape ⇒ different route.

## 5. Config — `~/.hermes/kanban/power-targets.json`
Add to the Windows target:
```json
"sample": "~/bin/plug-live",
"tariff_per_kwh": 1444.70
```
New `powerTargetCfg` fields `Sample`, `TariffPerKWh`. Tariff is per-target
because a second plug could sit on a different tariff.

## 6. UI — extend `PowerEnergyCard` in `OverviewPage.tsx`
- Preset segmented control **1D / 7D / 30D / Custom**; Custom reveals two native
  `<input type="date">` (no new dependency — YAGNI).
- Stat row (range-based): **Total kWh**, **Total Rp**, **Avg kWh/day**,
  **Avg Rp/day**. Live Draw/Voltage/Current stays from `/power/metrics`.
- The old Tuya-sourced "Today" stat is **replaced** by the range total so the two
  sources never disagree on screen.
- Coverage notice when `from < coverage_from`: "data mulai <date>".
- Rupiah via `Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0})`.
- `getPowerEnergy(id, from, to)` added to `api.ts`.

## 7. Testing (TDD)
- Go `power_energy_test.go`: integration math, **gap skip**, WIB day bucketing,
  tariff + averages, `from`/`to` parsing (unix + date, inclusive `to`),
  `coverage_from`. In-memory `modernc` sqlite.
- Go `power_sample_test.go`: schema create, insert dedupe (same ts), readback.
- `routes_inventory_test.go`: new route line.
- TS `PowerEnergyCard.test.tsx`: range stats render, rupiah formatting, preset
  switch, coverage notice, empty-range message.
- Full: `go test ./...`, `go vet ./...`, `pnpm --dir web build`, `git diff --check`.

## 8. Slices
1. Storage + sampler + config (`sample` action, `plug-live`, tariff field) + tests
2. Aggregation + tests
3. Route + inventory line
4. Frontend api + card + tests
5. Build, verify live route, deploy (PM2 kanban-board), coverage accrues

## Explicitly skipped (YAGNI)
- Daily breakdown table in the UI (Adit chose totals + averages).
- Tuya 28h backfill on first run.
- PLN standing charge / abonemen — kWh × tariff only.
- Alerts / thresholds.
- Historical backfill (impossible — forward-only by decision).
