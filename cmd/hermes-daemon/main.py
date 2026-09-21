#!/usr/bin/env python3
"""Small local Hermes chat bridge over a Unix-domain HTTP socket."""

import json
import os
import re
import socketserver
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler

SOCKET_PATH = os.environ.get("HERMES_DAEMON_SOCK", "/tmp/hermes-daemon.sock")
MAX_OUTPUT = 100_000
SESSION_RE = re.compile(r"(?:Session|session_id):\s*(\S+)", re.IGNORECASE)
HERMES_EVENT_RE = re.compile(r"^\s*HERMES_EVENT:\s*(\{.*\})\s*$")

sessions = {}
sessions_lock = threading.Lock()


def rewrite_prompt(prompt):
    # RTK rewrites shell commands, not free-form chat prompts. Keep chat literal.
    return prompt


def structured_event(line):
    match = HERMES_EVENT_RE.match(line)
    if not match:
        return None
    try:
        event = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if not isinstance(event, dict) or not event.get("phase"):
        return None
    return event


def _tool_activity(name, payload, status):
    tool = (name or "tool").strip()
    lowered = tool.lower()
    args = payload if isinstance(payload, dict) else {}
    command = args.get("command") or args.get("cmd") or args.get("script") or args.get("query") or ""
    path = args.get("path") or args.get("file_path") or args.get("filename") or ""
    if any(token in lowered for token in ("terminal", "shell", "execute", "command", "bash", "powershell")):
        phase, label, detail = "shell_command", "Using terminal", command
    elif "skill" in lowered:
        phase, label, detail = "reading_skill", "Reading agent skill", path or command
    elif any(token in lowered for token in ("read", "write", "file", "directory", "glob", "grep", "search")):
        phase, label, detail = "file_operation", "Working with workspace files", path or command
    else:
        phase, label, detail = "tool_call", f"Using {tool}", command or path
    if not detail and isinstance(args, dict):
        detail = ", ".join(f"{key}={value}" for key, value in list(args.items())[:2])
    return {
        "kind": "activity",
        "phase": phase,
        "label": label,
        "name": tool,
        "detail": str(detail)[:500],
        "status": status,
    }


def query(payload, emit=None):
    workspace = str(payload.get("workspace") or "")
    prompt = str(payload.get("prompt") or "")
    profile = str(payload.get("profile") or "")
    model = str(payload.get("model") or "")
    # Prefer explicit Hermes session from Switchyard room; fallback to workspace bucket.
    session_key = str(payload.get("switchyard_session_id") or "")
    if not session_key:
        session_key = str(payload.get("session_id") or payload.get("hermes_session_id") or workspace)
    else:
        # Retry with empty session_id means "clear stale and start fresh" (Go retry path).
        if "session_id" in payload and str(payload.get("session_id") or "") == "":
            with sessions_lock:
                sessions.pop(session_key, None)
        if "hermes_session_id" in payload and str(payload.get("hermes_session_id") or "") == "":
            with sessions_lock:
                sessions.pop(session_key, None)
    explicit_session_id = str(payload.get("session_id") or payload.get("hermes_session_id") or "")
    with sessions_lock:
        session_id = sessions.get(session_key, "") or explicit_session_id
        if session_id:
            sessions[session_key] = session_id

    # stream-json is flushed by Hermes after every tool/text event. This removes
    # terminal rendering overhead and gives Switchyard a typed live activity feed.
    reasoning = str(payload.get("reasoning") or os.environ.get("HERMES_DAEMON_REASONING", "minimal"))
    args = ["hermes", "chat", "-Q", "--reasoning", reasoning, "--format", "stream-json"]
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
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        return {"error": str(exc), "events": []}

    events = []
    final_text = ""
    result_session_id = ""
    tool_details = {}

    def publish(event):
        events.append(event)
        if emit is not None:
            emit(event)

    try:
        proc.stdin.write(rewrite_prompt(prompt))
        proc.stdin.close()
        for raw_line in proc.stdout:
            line = raw_line.rstrip("\r\n")
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                if line:
                    publish({"kind": "tool_output", "text": line})
                continue
            event_type = event.get("type")
            if event_type == "system" and event.get("subtype") == "init":
                publish({"kind": "phase", "phase": "process_spawned", "label": "Starting Hermes", "status": "started"})
            elif event_type == "tool_use":
                activity = _tool_activity(event.get("name"), event.get("input") or {}, "started")
                tool_key = str(event.get("tool_call_id") or event.get("name") or "tool")
                tool_details[tool_key] = activity.get("detail") or ""
                publish(activity)
            elif event_type == "tool_result":
                tool_key = str(event.get("tool_call_id") or event.get("name") or "tool")
                activity = _tool_activity(event.get("name"), {"command": tool_details.pop(tool_key, "")}, "completed")
                duration = event.get("duration_ms")
                if duration is not None:
                    activity["duration"] = f"{float(duration) / 1000:.1f}s"
                if event.get("is_error"):
                    activity["status"] = "error"
                publish(activity)
            elif event_type == "text":
                text = str(event.get("text") or "")
                if text:
                    final_text += text
                    publish({"kind": "text_delta", "text": text})
            elif event_type == "result":
                final_text = str(event.get("text") or final_text)
                result_session_id = str(event.get("session_id") or "")
                if event.get("error"):
                    publish({"kind": "error", "error": str(event["error"])})
        proc.wait(timeout=600)
        stderr = proc.stderr.read() if proc.stderr else ""
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return {"error": "hermes daemon query timeout", "events": events}
    except OSError as exc:
        return {"error": str(exc), "events": events}

    stderr_session = SESSION_RE.search(stderr or "")
    if stderr_session:
        result_session_id = result_session_id or stderr_session.group(1)
    if proc.returncode == 0 and result_session_id:
        with sessions_lock:
            sessions[session_key] = result_session_id
    if proc.returncode != 0:
        return {"error": (stderr or final_text).strip() or f"hermes exited with {proc.returncode}", "events": events}

    completed = {"kind": "completed", "text": final_text.strip()}
    if result_session_id:
        completed["session_id"] = result_session_id
    publish(completed)
    publish({"kind": "done"})
    return {"events": events}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        if os.environ.get("HERMES_DAEMON_LOG"):
            print(format % args, file=sys.stderr, flush=True)

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
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.flush()

        def emit(event):
            body = b"data: " + json.dumps(event).encode() + b"\n\n"
            self.wfile.write(body)
            self.wfile.flush()

        result = query(payload, emit=emit)
        if result.get("error"):
            emit({"kind": "error", "error": result["error"]})


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
