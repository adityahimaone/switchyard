#!/usr/bin/env python3
# Bardi smart-plug control via Tuya Cloud API (works from VPS, no LAN/Mac needed).
# Usage: plug.py on|off|toggle|status|devices
import os, sys, json, tinytuya

CONF = os.path.expanduser("~/bin/tuya.conf")

def load():
    d = {}
    with open(CONF) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            d[k.strip()] = v.strip()
    return d

def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)

c = load()
for k in ("API_KEY", "API_SECRET"):
    if not c.get(k):
        die(f"Missing {k} in {CONF}. Run the Tuya setup first.")
if not c.get("REGION"):
    die("Missing REGION in tuya.conf (eu/us/cn/in/sg).")

cloud = tinytuya.Cloud(apiRegion=c["REGION"], apiKey=c["API_KEY"], apiSecret=c["API_SECRET"])
did = c.get("DEVICE_ID", "").strip()
cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

if cmd == "devices":
    print(json.dumps(cloud.getdevices(), indent=2))
    sys.exit(0)

if not did:
    die("Missing DEVICE_ID in tuya.conf. Run: plug.py devices  (then paste the plug's id)")

def switch_code():
    # find the DP code for the relay (usually switch_1 / switch)
    props = cloud.getproperties(did)
    for p in (props.get("result") or {}).get("properties", props.get("result") or []):
        if isinstance(p, dict) and str(p.get("code", "")).startswith("switch"):
            return p.get("code")
    return "switch_1"

def cur_state():
    st = cloud.getstatus(did)
    for dp in (st.get("result") or []):
        if isinstance(dp, dict) and str(dp.get("code", "")).startswith("switch"):
            return dp.get("code"), dp.get("value")
    return "switch_1", None

def setswitch(code, value):
    return cloud.sendcommand(did, {"commands": [{"code": code, "value": value}]})

def _live():
    """Current readings. Scale from the DP spec: power/10 W, voltage/10 V, current mA."""
    st = cloud.getstatus(did)
    dp = {d["code"]: d["value"] for d in (st.get("result") or []) if isinstance(d, dict)}
    return {
        "switch": dp.get("switch_1"),
        "power_w": round(dp.get("cur_power", 0) / 10.0, 1),
        "voltage_v": round(dp.get("cur_voltage", 0) / 10.0, 1),
        "current_a": round(dp.get("cur_current", 0) / 1000.0, 3),
        "add_ele_raw": dp.get("add_ele"),
    }

def _intervals(samples):
    """(t0, t1, v0, v1) for each consecutive pair of cur_power reports.

    Tuya reports a DP only on change, so between two reports the earlier value
    still held — the pair is a valid interval to integrate over.
    """
    return [
        (samples[i - 1][0], samples[i][0], samples[i - 1][1], samples[i][1])
        for i in range(1, len(samples))
    ]


def _power_series(samples, bucket_s):
    """Time-weighted mean watts per bucket, so a mostly-idle bucket is not
    pulled up by a single high sample. Splits each interval at bucket edges."""
    acc = {}
    for t0, t1, v0, v1 in _intervals(samples):
        if t1 <= t0:
            continue
        cur = t0
        while cur < t1:
            b = cur - cur % bucket_s
            nxt = min(b + bucket_s, t1)
            f0 = (cur - t0) / (t1 - t0)
            f1 = (nxt - t0) / (t1 - t0)
            w0 = (v0 + (v1 - v0) * f0) / 10.0
            w1 = (v0 + (v1 - v0) * f1) / 10.0
            e = acc.setdefault(b, [0.0, 0.0])  # kWh, seconds
            e[0] += (w0 + w1) / 2 * (nxt - cur) / 3600 / 1000
            e[1] += nxt - cur
            cur = nxt
    return [
        {"t": b, "w": round(kwh * 1000 / (sec / 3600), 1) if sec else 0.0, "kwh": round(kwh, 4)}
        for b, (kwh, sec) in sorted(acc.items())
    ]


def energy(days):
    """kWh from the cur_power DP reports.

    The plug's own `add_ele` counter is a resetting delta, not a lifetime total
    (verified: it moved 0.012 kWh while ~0.43 kWh was actually drawn), so it is
    reported raw and never used for the totals.
    """
    import datetime as dt
    tz = dt.timezone(dt.timedelta(hours=7))  # WIB: the plug is in Jakarta
    r = cloud.getdevicelog(deviceid=did, start=-days, end=0, evtype=7, size=0, max_fetches=60)
    logs = (r.get("result") or {}).get("logs") or []
    samples = sorted(
        (int(e["event_time"]) // 1000, int(e["value"]))
        for e in logs
        if e.get("code") == "cur_power" and str(e.get("value", "")).isdigit()
    )

    buckets, total = {}, 0.0
    for t0, t1, v0, v1 in _intervals(samples):
        kwh = (v0 + v1) / 2 / 10.0 * (t1 - t0) / 3600 / 1000
        total += kwh
        day = dt.datetime.fromtimestamp(t1, tz).date()
        buckets[day] = buckets.get(day, 0.0) + kwh

    # Bucket the draw into ~30 bars, never finer than a minute.
    span = (samples[-1][0] - samples[0][0]) if len(samples) > 1 else 0
    bucket_s = max(60, round(span / 30)) if span else 60

    daily = [{"date": d.isoformat(), "kwh": round(v, 3)} for d, v in sorted(buckets.items())]
    today = dt.datetime.now(tz).date()
    powers = [v / 10.0 for _, v in samples]
    return {
        "window_days": days,
        "total_kwh": round(total, 3),
        "today_kwh": round(buckets.get(today, 0.0), 3),
        "daily": daily,
        "series": _power_series(samples, bucket_s),
        "bucket_seconds": bucket_s,
        "samples": len(samples),
        "peak_w": round(max(powers), 1) if powers else 0,
    }

if cmd == "on":
    out = setswitch(switch_code(), True)
elif cmd == "off":
    out = setswitch(switch_code(), False)
elif cmd == "toggle":
    code, cur = cur_state()
    if cur is None:
        die("Could not read switch state:\n" + json.dumps(cloud.getstatus(did), indent=2))
    out = setswitch(code, not cur)
elif cmd == "status":
    out = cloud.getstatus(did)
elif cmd == "live":
    out = _live()
elif cmd == "energy":
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    out = {"live": _live(), **energy(days)}
else:
    die("Usage: plug.py on|off|toggle|status|live|energy [days]|devices")

print(json.dumps(out, indent=2))
