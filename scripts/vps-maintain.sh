#!/usr/bin/env bash
#
# Disk and release hygiene for the control-plane host.
#
# The box runs at ~92% and that is not cosmetic: SQLite needs temp space for
# writes, and a full disk blocks the dispatcher. Two things grow without bound —
# release binaries (every deploy leaves the previous one behind) and deploy
# backups (one directory per ship).
#
#   ./scripts/vps-maintain.sh            # report only
#   ./scripts/vps-maintain.sh --apply    # delete the pruned files
#
# It never touches task_events or task results. Those are data, and deleting
# them is a decision for the operator, not a maintenance script.

set -euo pipefail

HOST="${SHIP_HOST:-vps-pub}"
APP_DIR="${SHIP_APP_DIR:-apps/kanban-board}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

ssh -o BatchMode=yes "$HOST" bash -s -- "$APP_DIR" "$APPLY" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"; APPLY="$2"
cd "$HOME/$APP_DIR"

echo "== disk =="
df -h "$HOME" | tail -1
echo

echo "== release binaries =="
# Keep the live binary plus the single newest fallback. The rest are superseded
# builds from earlier deploys and nothing references them.
mapfile -t OTHERS < <(find bin -maxdepth 1 -type f ! -name 'kanban-board' -printf '%T@\t%p\n' | sort -rn | cut -f2-)
reclaim=0
echo "  keep   bin/kanban-board ($(du -h bin/kanban-board | cut -f1), live)"
for i in "${!OTHERS[@]}"; do
  f="${OTHERS[$i]}"
  size=$(stat -c%s "$f")
  if [ "$i" -eq 0 ]; then
    echo "  keep   $f ($(du -h "$f" | cut -f1), fallback)"
  else
    reclaim=$((reclaim + size))
    echo "  prune  $f ($(du -h "$f" | cut -f1))"
  fi
done
echo

echo "== deploy backups =="
mapfile -t BACKUPS < <(find "$HOME/backups" -maxdepth 1 -type d -name 'kanban-board-*' | sort -r)
for i in "${!BACKUPS[@]}"; do
  d="${BACKUPS[$i]}"
  if [ "$i" -lt 3 ]; then
    echo "  keep   $(basename "$d") ($(du -sh "$d" | cut -f1))"
  else
    reclaim=$((reclaim + $(du -s "$d" | cut -f1) * 1024))
    echo "  prune  $(basename "$d") ($(du -sh "$d" | cut -f1))"
  fi
done
echo

echo "== board databases =="
du -h "$HOME"/.hermes/kanban/boards/*/kanban.db 2>/dev/null | sort -h | tail -6
echo

echo "== task_events payload (data — reported only, never pruned here) =="
python3 - <<'PY'
import glob, os, sqlite3
total = 0
for p in sorted(glob.glob(os.path.expanduser("~/.hermes/kanban/boards/*/kanban.db"))):
    try:
        con = sqlite3.connect("file:%s?mode=ro" % p, uri=True)
        rows, size = con.execute("select count(*), coalesce(sum(length(payload)),0) from task_events").fetchone()
        con.close()
        if size > 0:
            total += size
            print("  %-16s events=%5d payload=%6.1f MB" % (os.path.basename(os.path.dirname(p)), rows, size / 1048576))
    except Exception:
        pass
print("  total reclaimable after retention + VACUUM: ~%.0f MB" % (total / 1048576))
PY
echo

if [ "$APPLY" = "1" ]; then
  echo "== applying =="
  for i in "${!OTHERS[@]}"; do
    [ "$i" -eq 0 ] && continue
    rm -f "${OTHERS[$i]}" && echo "  removed ${OTHERS[$i]}"
  done
  for i in "${!BACKUPS[@]}"; do
    [ "$i" -lt 3 ] && continue
    rm -rf "${BACKUPS[$i]}" && echo "  removed $(basename "${BACKUPS[$i]}")"
  done
  echo
  df -h "$HOME" | tail -1
else
  echo "dry run — pass --apply to delete the pruned entries"
  echo "reclaimable now: ~$((reclaim / 1048576)) MB"
fi
REMOTE
