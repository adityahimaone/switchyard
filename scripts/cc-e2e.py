#!/usr/bin/env python3
"""CommandCode 3-loop session-continuity test for Switchyard.

Drives one card through three review rounds on a single workspace and asserts the
bound session survives: loop 1 is a cold run, loops 2 and 3 must resume the exact
session bound in loop 1.

The board schema is cloned from a live board so every column the dispatcher
writes exists. A hand-written schema missing task_events.kind made finalize fail
*after* the worker had already succeeded, leaving the card stuck in `running`.

Usage:
  cc-win-e2e.py --host mac|windows init     (re)create the board from live schema
  cc-win-e2e.py --host mac|windows seed     queue loop 1 (read-only diagnostic)
  cc-win-e2e.py --host mac|windows status   task, binding, comments, events, result
  cc-win-e2e.py --host mac|windows wait     block until the card leaves running
  cc-win-e2e.py --host mac|windows loop N   post review comment + reopen for loop 2|3
  cc-win-e2e.py --host mac|windows reset    archive the card

`--host` is optional and defaults to windows; it only selects the board,
workspace and ssh target.
"""
import argparse
import json
import os
import sqlite3
import sys
import time

HOME = os.path.expanduser("~")
BOARDS = f"{HOME}/.hermes/kanban/boards"
DONOR = f"{BOARDS}/f8-saas/kanban.db"

TARGETS = {
    "windows": {
        "board": "cc-win-e2e",
        "task": "cc-win-loop",
        "workspace": r"C:\Development\Next\next-portfolio-blog",
        "ssh": "windows-tailscale",
    },
    "mac": {
        "board": "cc-mac-e2e",
        "task": "cc-mac-loop",
        "workspace": "/Users/adityahimawan/Development/next-portfolio-blog",
        "ssh": "mac-tailscale",
    },
}

LOOP_PROMPTS = {
    1: """[CONTINUATION] You are continuing a session on this workspace.

This is a read-only diagnostic. Do NOT edit, create, or delete any file.

Report exactly these five facts, one per line, and nothing else:
1. codegraph: is a codegraph index available for this workspace? Answer yes or no.
2. node: the output of `node --version`
3. git: the current branch name, or "no git repo"
4. root: the count of entries in the project root
5. ready: the word READY1
""",
    2: """[CONTINUATION] You are continuing the same session.

Still read-only. Do NOT edit, create, or delete any file.

Answer with exactly one line: the word READY2
""",
    3: """[CONTINUATION] You are continuing the same session.

Still read-only. Do NOT edit, create, or delete any file.

Answer with exactly one line: the word READY3
""",
}


def die(msg):
    sys.exit(msg)


def connect(db):
    con = sqlite3.connect(db, timeout=20)
    con.execute("PRAGMA busy_timeout=20000")
    return con


def init(t):
    if not os.path.exists(DONOR):
        die(f"donor board missing: {DONOR}")
    os.makedirs(f"{BOARDS}/{t['board']}", exist_ok=True)
    db = f"{BOARDS}/{t['board']}/kanban.db"
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(db + suffix):
            os.remove(db + suffix)
    donor = sqlite3.connect(DONOR, timeout=20)
    rows = donor.execute(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    donor.close()

    con = connect(db)
    for (sql,) in rows:
        con.execute(sql)
    if "harness_kind" not in {r[1] for r in con.execute("PRAGMA table_info(harness_bindings)")}:
        con.execute(
            "ALTER TABLE harness_bindings ADD COLUMN harness_kind TEXT NOT NULL DEFAULT 'dsh'"
        )
    tcols = {r[1] for r in con.execute("PRAGMA table_info(tasks)")}
    for col in ("omp_session_id", "workspace_transport", "workspace_ssh_target"):
        if col not in tcols:
            default = "TEXT NOT NULL DEFAULT ''" if col.endswith("_id") else "TEXT"
            con.execute(f"ALTER TABLE tasks ADD COLUMN {col} {default}")
    con.commit()
    n = len(con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
    con.close()
    with open(f"{BOARDS}/{t['board']}/board.json", "w") as f:
        json.dump(
            {
                "slug": t["board"],
                "name": f"CommandCode {t['board']} E2E",
                "description": f"3-loop CommandCode continuity test on {t['ssh']}",
                "icon": "🧪",
                "color": "#e0673a",
                "default_workdir": t["workspace"],
                "project_id": None,
                "created_at": int(time.time()),
                "archived": False,
            },
            f,
            indent=2,
        )
    print(json.dumps({"board": t["board"], "tables": n, "workspace": t["workspace"]}))


def add_event(con, task, kind, payload, run_id=None):
    con.execute(
        "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) VALUES (?,?,?,?,?)",
        (task, run_id, kind, json.dumps(payload) if payload is not None else None, int(time.time())),
    )


def seed(t):
    db = f"{BOARDS}/{t['board']}/kanban.db"
    con = connect(db)
    con.execute("DELETE FROM tasks WHERE id=?", (t["task"],))
    con.execute("DELETE FROM harness_bindings WHERE card_id=?", (t["task"],))
    con.execute("DELETE FROM task_comments WHERE task_id=?", (t["task"],))
    con.execute("DELETE FROM task_events WHERE task_id=?", (t["task"],))
    con.execute(
        """INSERT INTO tasks
           (id, title, body, assignee, status, priority, created_by, created_at,
            workspace_kind, workspace_transport, workspace_ssh_target, workspace_path,
            executor, execution_mode, max_iterations, consecutive_failures)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            t["task"],
            f"CommandCode {t['ssh']} 3-loop continuity test",
            LOOP_PROMPTS[1],
            "default",
            "todo",
            0,
            "cc-e2e",
            int(time.time()),
            "repo",
            "node-agent",
            t["ssh"],
            t["workspace"],
            "commandcode",
            "direct",
            1,
            0,
        ),
    )
    add_event(con, t["task"], "created", {"loop": 1, "note": "read-only diagnostic"})
    con.commit()
    con.close()
    print(json.dumps({"seeded": t["task"], "workspace": t["workspace"], "executor": "commandcode"}))


def status(t):
    db = f"{BOARDS}/{t['board']}/kanban.db"
    con = connect(db)
    cur = con.execute(
        """SELECT id, status, executor, workspace_path, current_run_id,
                  consecutive_failures, last_failure_error, commandcode_session_id,
                  omp_session_id, length(COALESCE(result,'')) AS result_len
           FROM tasks WHERE id=?""",
        (t["task"],),
    )
    cols = [d[0] for d in cur.description]
    task = dict(zip(cols, cur.fetchone() or [])) or None
    cur2 = con.execute(
        """SELECT harness_kind, harness_session_id, status, last_turn_seq, last_comment_id
           FROM harness_bindings WHERE card_id=?""",
        (t["task"],),
    )
    bcols = [d[0] for d in cur2.description]
    brow = cur2.fetchone()
    binding = dict(zip(bcols, brow)) if brow else None
    comments = con.execute(
        "SELECT id, author, body FROM task_comments WHERE task_id=? ORDER BY id", (t["task"],)
    ).fetchall()
    events = con.execute(
        "SELECT created_at, kind, payload FROM task_events WHERE task_id=? ORDER BY id",
        (t["task"],),
    ).fetchall()
    result = con.execute("SELECT result FROM tasks WHERE id=?", (t["task"],)).fetchone()
    con.close()

    print("=== TASK ===")
    print(json.dumps(task, indent=2, default=str))
    print("=== BINDING ===")
    print(json.dumps(binding, indent=2, default=str))
    print("=== COMMENTS ===")
    for c in comments:
        print(f"  #{c[0]} {c[1]}: {c[2][:70]}")
    print("=== EVENTS ===")
    for e in events:
        if e[1] in ("remote_dispatched", "created", "reopened", "comment"):
            print(f"  {e[0]} {e[1]}: {str(e[2])[:90]}")
    print("=== RESULT (tail) ===")
    text = (result[0] if result and result[0] else "")
    print(text[-1500:] if text else "<empty>")


def wait(t, loop=None, timeout_s=300):
    db = f"{BOARDS}/{t['board']}/kanban.db"
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        con = connect(db)
        st, res, fails, err = con.execute(
            "SELECT status, COALESCE(result,''), consecutive_failures, COALESCE(last_failure_error,'')"
            " FROM tasks WHERE id=?",
            (t["task"],),
        ).fetchone()
        con.close()
        if (st, len(res)) != last:
            print(f"  status={st} result_len={len(res)} fails={fails}")
            last = (st, len(res))
        if st not in ("running", "todo", "ready") and len(res) > 0:
            print(json.dumps({"loop": loop, "status": st, "ok": st == "review",
                              "failures": fails, "error": err[:200]}))
            return 0 if st == "review" else 1
        if fails and st == "blocked":
            print(json.dumps({"loop": loop, "status": "blocked", "error": err[:300]}))
            return 1
        time.sleep(5)
    print(json.dumps({"loop": loop, "timeout": True,
                      "note": "card not finalized; check ~/.pm2/logs/kanban-board-error.log"}))
    return 2


def advance(t, loop):
    if loop not in (2, 3):
        die("loop must be 2 or 3")
    db = f"{BOARDS}/{t['board']}/kanban.db"
    con = connect(db)
    row = con.execute("SELECT status FROM tasks WHERE id=?", (t["task"],)).fetchone()
    if row is None:
        die("card not found; run seed first")
    prev = row[0]
    body = f"Loop {loop} feedback:\n{LOOP_PROMPTS[loop]}"
    cur = con.execute(
        "INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?,?,?,?)",
        (t["task"], "cc-e2e", body, int(time.time())),
    )
    cid = cur.lastrowid
    add_event(con, t["task"], "comment", {"loop": loop, "comment_id": cid})
    con.execute(
        "UPDATE tasks SET status='todo', completed_at=NULL, last_failure_error=NULL WHERE id=?",
        (t["task"],),
    )
    add_event(con, t["task"], "reopened", {"loop": loop, "prev_status": prev})
    con.commit()
    con.close()
    print(json.dumps({"loop": loop, "comment_id": cid, "prev_status": prev, "new_status": "todo"}))


def reset(t):
    db = f"{BOARDS}/{t['board']}/kanban.db"
    con = connect(db)
    con.execute("UPDATE tasks SET status='archived' WHERE id=?", (t["task"],))
    add_event(con, t["task"], "archived", {"note": "test complete"})
    con.commit()
    con.close()
    print(json.dumps({"archived": t["task"], "board": t["board"]}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["init", "seed", "status", "wait", "loop", "reset"])
    ap.add_argument("n", nargs="?", type=int)
    ap.add_argument("--host", choices=list(TARGETS), default="windows")
    ap.add_argument("--loop", type=int, default=None)
    ap.add_argument("--timeout", type=int, default=300)
    a = ap.parse_args()
    t = TARGETS[a.host]
    if a.cmd == "init":
        init(t)
    elif a.cmd == "seed":
        seed(t)
    elif a.cmd == "status":
        status(t)
    elif a.cmd == "wait":
        sys.exit(wait(t, a.loop, a.timeout))
    elif a.cmd == "loop":
        advance(t, a.n if a.n else a.loop)
    elif a.cmd == "reset":
        reset(t)


if __name__ == "__main__":
    main()
