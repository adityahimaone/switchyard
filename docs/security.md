# Security model

This documents how Switchyard protects the one thing that matters: **an
authenticated request can make a worker machine run shell commands**. A login
bypass here is remote code execution on your Mac or Windows hosts, not just data
exposure.

## Authentication

Every `/api/*` route requires a valid session except four:

| Route | Why it is public |
|---|---|
| `GET /api/auth/status` | Tells the UI whether to show the login screen |
| `POST /api/auth/login` | The login form itself |
| `POST /api/auth/logout` | Must work to clear a stale cookie |
| `POST /api/auth/password` | Needed to rotate the credential while signed in |

Enforcement lives in `authHandler` (`cmd/server/main.go`).

### Password storage

Passwords are hashed with **argon2id** (m=64 MiB, t=3, p=2) and stored as a PHC
string that carries its own parameters:

```
$argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
```

Because the parameters travel with the hash, they can be raised later without a
schema change, and an existing login is transparently rehashed to current
parameters the next time it is used.

Hashes written by the **older SHA-256 chain** are still accepted and are
upgraded to argon2id on the first successful login after upgrading the binary.
Upgrading never locks anyone out.

Comparison is constant-time (`crypto/subtle`). The minimum password length is 12
characters.

### First run

`EnsureAuthSeed` creates the admin credential once, in this order:

1. `SWITCHYARD_ADMIN_PASSWORD` — used verbatim, never logged. Must be 12+ chars.
2. `SWITCHYARD_DEV=1` — seeds the known dev password `123456`. For tests and
   local development only; it is below the minimum on purpose and must never be
   set in production.
3. Otherwise — a random 24-character password is generated and **printed to the
   startup log exactly once**. It is not stored in plaintext and cannot be
   recovered later.

A generated password is flagged `must_change`, and the UI withholds the app
behind `ForcePasswordChange` until you pick your own. That is the mechanism that
guarantees the seeded credential is rotated.

Set `SWITCHYARD_ADMIN_PASSWORD_REQUIRED=1` to make a missing password a hard
startup failure instead of a logged one. It only affects a database being seeded
for the first time, so enabling it later cannot lock you out.

### Sessions

- Tokens are 32 random bytes, stored **hashed** (SHA-256) in `auth.db`.
- The cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the request
  arrived over HTTPS — including via `X-Forwarded-Proto` from the reverse proxy.
  Over plain HTTP (a LAN visit) `Secure` is omitted, because a `Secure` cookie
  sent over `http://` is silently dropped and looks like a random logout.
- Expired sessions are purged hourly by a background janitor, not just when the
  expired token happens to be presented again.

## Rate limiting

`POST /api/auth/login` and the wrong-current-password path of
`POST /api/auth/password` are throttled by an in-memory limiter
(`cmd/server/ratelimit.go`):

- **Per client IP** — 5 consecutive failures, then a lockout starting at 2s and
  doubling per extra failure, capped at 15 minutes.
- **Global backstop** — trips at 4× the per-IP threshold, so a botnet is slowed
  even when no single address crosses the threshold.

The client key prefers the left-most `X-Forwarded-For` entry, falling back to
`RemoteAddr`. Behind a proxy every request otherwise arrives from the proxy and
all clients would share one bucket.

A successful login clears that client's counters, so a user who mistypes twice
is not left near the threshold.

The limiter runs **before** the password is hashed. That is deliberate: each
argon2id verification costs real CPU, so an unlimited endpoint is a cheap way to
pin every core and starve the dispatchers.

This is process-local state, which matches the single-instance deployment. A
multi-node deployment would need shared state.

## Transport and headers

State-changing requests whose `Origin` does not match the request host are
rejected with 403 (`sameOriginGuard`). Requests with no `Origin` are allowed, so
curl and the MCP server still work. `SameSite=Lax` is the primary defence; this is
defence in depth.

All responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy:
no-referrer`, `X-Frame-Options: DENY`, and a Content-Security-Policy that
forbids inline scripts and framing.

### nginx

TLS is terminated in front of this server, so the proxy must forward the scheme
or the `Secure` cookie flag is never set:

```nginx
location / {
    proxy_pass         http://127.0.0.1:8790;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;

    # The SSE stream must not be buffered or timed out by the proxy.
    proxy_buffering    off;
    proxy_read_timeout 1h;
}
```

`X-Forwarded-Proto` is trusted because this server is expected to sit behind a
proxy you control. If you expose it directly, the only consequence of a forged
header is that your own client gains the `Secure` flag — which fails closed.

## Server hardening

`newServer` (`cmd/server/main.go`) sets `ReadHeaderTimeout`, `ReadTimeout`,
`IdleTimeout` and `MaxHeaderBytes`.

`WriteTimeout` is deliberately **unset**: the SSE endpoint holds a response open
for the life of the tab, and a write deadline would sever every event stream on a
schedule rather than on real inactivity.

`SIGTERM`/`SIGINT` stops the dispatchers first — so no new task is claimed during
a drain — then drains in-flight requests for up to 15s. This is what stops a
deploy from cutting an approve off mid-commit.

## Command execution

The review gate is the only path from `review` to `done`. Agents never commit or
push; results land in `review` and a human approves.

- Workspace paths are single-quoted before being interpolated into a shell
  command line that runs on the worker, so a path carrying shell
  metacharacters is a literal path rather than an injection. The risk is not
  SSH-specific: node-agent receives the same script.
- Approve is idempotent and serialised per task, so a double-click or a retried
  request cannot commit twice or wedge a card in `review`.
- Terminals run on a worker through node-agent. There is deliberately **no local
  `sh -c` path** for a caller-supplied command.
- Cron job ids are bound as SQL parameters, and validated against a strict
  allowlist before being passed to the `hermes` CLI.

## Transport and schema

There is exactly one dispatch path. The legacy `ssh` transport is retired: at
startup, any task still carrying `workspace_transport='ssh'` is rewritten to
`node-agent` (`MigrateRetiredTransport`). That rewrite is what keeps a card
parked in `review` from being stranded, since approve is the only way out of
that column. It preserves the existing target and never changes task status.

The review gate shells out to no worker directly. `runGit` reaches the worker
through node-agent, so there is no SSH key or `BatchMode` invocation left in the
request path.

Switchyard shares Hermes's `kanban.db` without owning it, and Hermes does not set
SQLite's `user_version`, so there is no version number to compare. Instead the
server checks the columns it depends on at startup and logs any board that no
longer matches (`CheckAllBoardSchemas`). This is reported rather than fatal: a
board mid-upgrade should not take the healthy boards down with it.

## Known limitations

- **Auto-approve flags.** Headless runs pass `--yolo` / `--auto-approve` to the
  agent harnesses. Prompt injection in a task description, attachment, or repo
  file can therefore lead to arbitrary commands on the worker. Run workers as a
  low-privilege user and keep secrets out of the worker environment.
- **`TYPESAFE_API_KEY`.** When set, task text is sent to a third party for
  classification. Treat it as opt-in per deployment.
- **Single shared password.** No roles, no per-user identity, no audit log of who
  approved what. Tracked as feature F8 in the audit.
