#!/usr/bin/env bash
# Regenerate expectedRoutes in cmd/server/routes_inventory_test.go.
#
# Run this ONLY when a route is intentionally added or removed, and review the
# diff. The inventory is what stops the per-resource extraction from silently
# dropping a handler: a lost route still compiles and still passes every other
# test, and the UI just 404s on one screen.
#
# Usage: scripts/gen_route_inventory.sh [git-ref]
#   git-ref defaults to HEAD. Pass an older ref to compare against that point.
set -euo pipefail

REF="${1:-HEAD}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST="$DIR/cmd/server/routes_inventory_test.go"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$DIR" archive "$REF" cmd/server | tar -x -C "$TMP"

python3 - "$TMP" "$TEST" "$REF" <<'PY'
import glob, re, sys

tmp, test_path, ref = sys.argv[1], sys.argv[2], sys.argv[3]
routes = set()
for f in glob.glob(f"{tmp}/cmd/server/*.go"):
    if f.endswith("_test.go"):
        continue
    routes |= set(re.findall(r'mux\.HandleFunc\("([A-Z]+ [^"]+)"', open(f).read()))
routes = sorted(routes)

src = open(test_path).read()
head = src.split("// expectedRoutes is the full API surface")[0]
body = f'''// expectedRoutes is the full API surface, captured from every non-test file in
// cmd/server at {ref} — that is, BEFORE the extraction split moved main()'s
// handlers into per-resource files.
//
// It is an independent baseline rather than a restatement of the current code,
// so it detects a route that went missing during the move. Regenerate with:
//
//\tscripts/gen_route_inventory.sh
var expectedRoutes = map[string]bool{{
'''
for r in routes:
    body += '\t%-62s true,\n' % ('"%s":' % r)
body += "}\n"
open(test_path, "w").write(head + body)
print(f"wrote {len(routes)} routes from {ref}")
PY

gofmt -w "$TEST"
cd "$DIR" && go test ./cmd/server/ -run TestNoRoutesLost -v 2>&1 | tail -20
