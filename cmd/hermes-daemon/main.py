#!/usr/bin/env python3
"""Small local Hermes chat bridge over a Unix-domain HTTP socket."""

import json
import os
import re
import socketserver
import subprocess
import threading
from http.server import BaseHTTPRequestHandler

SOCKET_PATH = os.environ.get("HERMES_DAEMON_SOCK", "/tmp/hermes-daemon.sock")
MAX_OUTPUT = 100_000
SESSION_RE = re.compile(r"Session:\s*(\S+)")

sessions = {}
sessions_lock = threading.Lock()


def rewrite_prompt(prompt):
    # RTK rewrites shell commands, not free-form chat prompts. Keep chat literal.
    return prompt


def query(payload):
    workspace = str(payload.get("workspace") or "")
    prompt = str(payload.get("prompt") or "")
    profile = str(payload.get("profile") or "")
    model = str(payload.get("model") or "")
    with sessions_lock:
        session_id = sessions.get(workspace, "")

    args = ["hermes", "chat", "-Q", "--reasoning", "minimal"]
    if session_id:
        args.extend(["--resume", session_id])
    if profile and profile != "default":
        args.extend(["--profile", profile])
    if model:
        args.extend(["--model", model])
    args.extend(["--query-file", "-"])

    try:
        proc = subprocess.Popen(
            args,
            cwd=workspace or None,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        return {"error": str(exc), "events": []}

    output = []
    events = []
    try:
        stdout, _ = proc.communicate(rewrite_prompt(prompt), timeout=600)
    except subprocess.TimeoutExpired:
        proc.kill()
        stdout, _ = proc.communicate()
        return {"error": "hermes daemon query timeout", "events": []}

    for line in stdout.splitlines():
        if sum(len(part) for part in output) < MAX_OUTPUT:
            output.append(line + "\n")
        events.append({"kind": "tool_output", "text": line})

    result = "".join(output).strip()
    match = SESSION_RE.search(stdout)
    if proc.returncode == 0 and match:
        with sessions_lock:
            sessions[workspace] = match.group(1)
    if proc.returncode != 0:
        return {"error": result or f"hermes exited with {proc.returncode}", "events": events}
    events.append({"kind": "completed", "text": result})
    events.append({"kind": "done"})
    return {"events": events}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        if os.environ.get("HERMES_DAEMON_LOG"):
            super().log_message(format, *args)

    def send_json(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ready"})
            return
        if self.path == "/shutdown":
            self.send_json(200, {"status": "stopping"})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/query":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": f"invalid JSON: {exc}"})
            return
        result = query(payload)
        if result.get("error"):
            self.send_json(502, result)
            return
        body = b"".join(
            (b"data: " + json.dumps(event).encode() + b"\n\n")
            for event in result["events"]
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(SOCKET_PATH) or ".", exist_ok=True)
    with UnixServer(SOCKET_PATH, Handler) as server:
        os.chmod(SOCKET_PATH, 0o600)
        server.serve_forever()
    try:
        os.unlink(SOCKET_PATH)
    except FileNotFoundError:
        pass


if __name__ == "__main__":
    main()
