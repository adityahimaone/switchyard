# Power chain for the Windows PC (smart plug + Wake-on-LAN)

Scripts the board server runs for the `windows` power target
(`~/.hermes/kanban/power-targets.json` -> `internal/kanban/power.go`,
`cmd/server/power_routes.go`). They are versioned here because `~/bin` is not a
repo; `~/bin/<name>` is a symlink to its copy in this directory.

| script | role |
| --- | --- |
| `pc-on` | plug cycle -> BIOS AC-restore boot -> poll SSH; exit status describes the MACHINE (falls back to the plug's draw when Tailscale lags) |
| `pc-off` | graceful shutdown -> 30s wait -> forced retry (15s) -> cut the outlet; exit status describes the OUTLET |
| `pc-cycle` | `pc-off`, then `pc-on`; fails closed if the outlet cannot be verified OFF |
| `plug-force` | set the relay and VERIFY the read-back (retries 5x) — use instead of bare `plug off`/`plug on` |
| `plug` | wrapper running `plug.py` under the dedicated venv (`~/.local/share/plug-venv`) |
| `plug.py` | Tuya Cloud API client (on/off/status/live/energy) |
| `win-off` | Windows shutdown over Tailscale SSH |

Deploy on a host (the always-on VPS owns the plug):

```sh
cd ~/apps/kanban-board/scripts/power
for f in pc-on pc-off pc-cycle plug-force plug plug.py win-off; do
  ln -sf "$PWD/$f" ~/bin/$f
done
```

Requires `~/bin/tuya.conf` (API key/secret, region, device id) and the
`plug-venv` with `tinytuya` — neither is in this repo.
