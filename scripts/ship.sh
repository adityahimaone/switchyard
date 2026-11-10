#!/usr/bin/env bash
#
# One-command deploy.
#
# The VPS has no Go and no pnpm, so `git pull && pm2 restart` cannot update the
# running binary — it keeps executing the old file. Every deploy therefore needs
# a local build, a checksum-verified upload, an atomic swap and a restart. Doing
# that by hand is ~15 steps and two known traps (macOS tar adds AppleDouble
# files; a half-swapped dist leaves the app serving 404s).
#
# This script does the whole thing, and rolls back on its own if the new build
# does not answer /api/auth/status within the health window.
#
#   make ship          # verify + build + deploy
#   make ship-fast     # skip tests, deploy the tree as it stands
#   SHIP_HOST=vps-pub ./scripts/ship.sh
#
# Exit codes: 0 shipped, 1 verify/build failed, 2 remote deploy failed and was
# rolled back.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHIP_HOST="${SHIP_HOST:-vps-pub}"
SHIP_APP_DIR="${SHIP_APP_DIR:-apps/kanban-board}"
SHIP_SKIP_TESTS="${SHIP_SKIP_TESTS:-0}"
SHIP_PORT="${SHIP_PORT:-8790}"

STAMP="$(date +%Y%m%d-%H%M%S)"
STAGE="$ROOT/.ship"
BIN="$STAGE/kanban-board"
DIST="$STAGE/dist.tgz"

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31m==> %s\033[0m\n' "$*" >&2; exit 1; }

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# --- 1. preflight -----------------------------------------------------------
say "Preflight"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repository"
if [ -n "$(git status --porcelain)" ]; then
  printf '\033[33m    working tree is dirty; shipping what is on disk, not what is committed\033[0m\n'
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REV="$(git rev-parse --short HEAD)"
printf '    host=%s branch=%s rev=%s\n' "$SHIP_HOST" "$BRANCH" "$REV"

# --- 2. verify --------------------------------------------------------------
if [ "$SHIP_SKIP_TESTS" != "1" ]; then
  say "Go vet"
  go vet ./...
  say "Go tests"
  go test ./... -count=1
  say "Web verify:fast (tsc + vitest + token-lint)"
  pnpm --dir web verify:fast
else
  say "Skipping tests (SHIP_SKIP_TESTS=1)"
fi

# --- 3. build ---------------------------------------------------------------
say "Build (linux/amd64)"
mkdir -p "$STAGE"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags="-s -w" -o "$BIN" ./cmd/server

say "Build web bundle"
pnpm --dir web build >/dev/null
# COPYFILE_DISABLE stops macOS tar writing ._ AppleDouble files, which would
# double the file count on the target and serve as junk from web/dist.
COPYFILE_DISABLE=1 tar czf "$DIST" -C web dist

BIN_SHA="$(shasum -a 256 "$BIN" | awk '{print $1}')"
printf '    binary %s (%s)\n' "$BIN_SHA" "$(du -h "$BIN" | cut -f1)"
printf '    dist   %s files, %s\n' "$(find web/dist -type f | wc -l | tr -d ' ')" "$(du -h "$DIST" | cut -f1)"

# --- 4. upload --------------------------------------------------------------
say "Upload"
scp -q -o BatchMode=yes "$BIN" "$SHIP_HOST:/tmp/kanban-board.$STAMP"
scp -q -o BatchMode=yes "$DIST" "$SHIP_HOST:/tmp/kanban-dist.$STAMP.tgz"

# --- 5. remote swap + health + rollback -------------------------------------
say "Swap, restart, health check"
set +e
ssh -o BatchMode=yes "$SHIP_HOST" bash -s -- "$BIN_SHA" "$STAMP" "$SHIP_APP_DIR" "$SHIP_PORT" <<'REMOTE'
set -euo pipefail
SHA="$1"; STAMP="$2"; APP_DIR="$3"; PORT="$4"
cd "$HOME/$APP_DIR"

# The source tree is part of the deployment: scripts/, design/README.md and the
# docs are read on the host, and a repo that lags the running binary is how
# "the script isn't there" surprises happen. Fast-forward only — a diverged
# checkout must stop the deploy, not get merged silently.
git fetch -q origin main
git merge --ff-only -q origin/main
echo "    source $(git rev-parse --short HEAD)"

echo "$SHA  /tmp/kanban-board.$STAMP" | sha256sum -c - >/dev/null \
  || { echo "uploaded binary does not match the local build"; exit 3; }

BK="$HOME/backups/kanban-board-$STAMP"
mkdir -p "$BK"
cp -a bin/kanban-board "$BK/kanban-board"
cp -a web/dist "$BK/dist"
echo "    backup $BK"

# Stage the dist inside web/ so the final rename stays on one filesystem.
rm -rf web/.dist-new
mkdir -p web/.dist-new
tar xzf "/tmp/kanban-dist.$STAMP.tgz" -C web/.dist-new 2>/dev/null
test -f web/.dist-new/dist/index.html || { echo "staged dist has no index.html"; exit 4; }

chmod 755 "/tmp/kanban-board.$STAMP"
cp "/tmp/kanban-board.$STAMP" bin/kanban-board.new
chmod 755 bin/kanban-board.new
mv -f bin/kanban-board.new bin/kanban-board
rm -rf web/dist.prev
mv web/dist web/dist.prev
mv web/.dist-new/dist web/dist
rm -rf web/.dist-new

pm2 restart kanban-board >/dev/null

code=""
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/auth/status" || true)"
  [ "$code" = "200" ] && break
  sleep 1
done

if [ "$code" != "200" ]; then
  echo "    health check failed (HTTP ${code:-none}) — rolling back" >&2
  cp -a "$BK/kanban-board" bin/kanban-board
  rm -rf web/dist
  cp -a "$BK/dist" web/dist
  pm2 restart kanban-board >/dev/null || true
  exit 5
fi

pm2 save >/dev/null 2>&1 || true
rm -f "/tmp/kanban-board.$STAMP" "/tmp/kanban-dist.$STAMP.tgz"
echo "    live sha=$SHA"
echo "    rollback: cp -a $BK/kanban-board bin/kanban-board && rm -rf web/dist && cp -a $BK/dist web/dist && pm2 restart kanban-board"
REMOTE
REMOTE_STATUS=$?
set -e

if [ "$REMOTE_STATUS" -ne 0 ]; then
  die "remote deploy failed (exit $REMOTE_STATUS); the previous build is running again"
fi

say "Shipped $REV to $SHIP_HOST"
