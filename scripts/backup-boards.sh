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
# Storage budget: an uncompressed snapshot set is ~108 MB, which on a 92%-full
# disk would be a problem by itself. Snapshots are gzipped (SQLite text payloads
# compress well) and kept 5 per board, so the whole thing costs tens of MB
# rather than hundreds. Empty boards are skipped.

set -euo pipefail

python3 - <<'PY'
import glob
import gzip
import os
import shutil
import sqlite3
import time

home = os.path.expanduser("~")
src_glob = os.path.join(home, ".hermes", "kanban", "boards", "*", "kanban.db")
dest = os.path.join(home, ".hermes", "kanban", "backups", "boards")
os.makedirs(dest, exist_ok=True)
stamp = time.strftime("%Y%m%d-%H%M%S")
KEEP = 5

written = []
for src_path in sorted(glob.glob(src_glob)):
    slug = os.path.basename(os.path.dirname(src_path))
    try:
        src = sqlite3.connect("file:%s?mode=ro" % src_path, uri=True)
        try:
            tasks = src.execute("select count(*) from tasks").fetchone()[0]
        except sqlite3.Error:
            tasks = 0
        if tasks == 0:
            src.close()
            print("skip   %-16s no tasks" % slug)
            continue

        tmp = os.path.join(dest, "%s-%s.db.tmp" % (slug, stamp))
        out = os.path.join(dest, "%s-%s.db.gz" % (slug, stamp))
        dst = sqlite3.connect(tmp)
        with dst:
            src.backup(dst)
        dst.close()
        src.close()

        with open(tmp, "rb") as f_in, gzip.open(out, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        os.remove(tmp)
        written.append((slug, tasks, os.path.getsize(out)))
    except Exception as exc:  # one broken board must not skip the rest
        print("FAILED %-16s %s" % (slug, exc))

for slug, tasks, size in written:
    print("backup %-16s tasks=%-4d %6.1f MB gz" % (slug, tasks, size / 1048576))

# Retention: keep the newest KEEP snapshots per board.
by_board = {}
for path in glob.glob(os.path.join(dest, "*.db.gz")):
    base = os.path.basename(path)[: -len(".db.gz")]
    by_board.setdefault(base.rsplit("-", 2)[0], []).append(path)
for slug, snaps in by_board.items():
    for old in sorted(snaps, reverse=True)[KEEP:]:
        os.remove(old)
        print("pruned %s" % os.path.basename(old))

total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(dest, "*.db.gz")))
print("total on disk: %.1f MB across %d snapshots" % (total / 1048576, len(glob.glob(os.path.join(dest, "*.db.gz")))))
PY
