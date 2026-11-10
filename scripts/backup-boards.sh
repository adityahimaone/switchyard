#!/usr/bin/env bash
#
# Nightly board backup. Runs ON the VPS (cron), not from a laptop.
#
# The boards are SQLite files that only exist on this host. There is no backup of
# them anywhere else, and one of them is 85 MB with 57 real tasks. Copying the
# file with `cp` while the server writes is not safe; the sqlite3 backup API
# takes a consistent snapshot of a live database.
#
#   ssh vps-pub 'bash ~/apps/kanban-board/scripts/backup-boards.sh'
#
# Retention: 7 snapshots per board, oldest pruned.

set -euo pipefail

python3 - <<'PY'
import glob
import os
import sqlite3
import time

home = os.path.expanduser("~")
src_glob = os.path.join(home, ".hermes", "kanban", "boards", "*", "kanban.db")
dest = os.path.join(home, ".hermes", "kanban", "backups", "boards")
os.makedirs(dest, exist_ok=True)
stamp = time.strftime("%Y%m%d-%H%M%S")

written = []
for src_path in sorted(glob.glob(src_glob)):
    slug = os.path.basename(os.path.dirname(src_path))
    out = os.path.join(dest, "%s-%s.db" % (slug, stamp))
    try:
        src = sqlite3.connect("file:%s?mode=ro" % src_path, uri=True)
        dst = sqlite3.connect(out)
        with dst:
            src.backup(dst)
        dst.close()
        src.close()
        written.append((slug, os.path.getsize(out)))
    except Exception as exc:  # one broken board must not skip the rest
        print("backup FAILED %s: %s" % (slug, exc))

for slug, size in written:
    print("backup %-16s %6.1f MB" % (slug, size / 1048576))

# Retention: keep the 7 newest snapshots per board.
for pattern in sorted(set(p.rsplit("-", 2)[0] for p in glob.glob(os.path.join(dest, "*.db")))):
    snaps = sorted(glob.glob(pattern + "-*.db"), reverse=True)
    for old in snaps[7:]:
        os.remove(old)
        print("pruned %s" % os.path.basename(old))
PY
