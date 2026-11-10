SHELL := /bin/bash

.PHONY: check test ship ship-fast help

help:
	@printf 'make check      vet + go test + web verify:fast\n'
	@printf 'make ship       verify, build, upload, swap, health check (rolls back on failure)\n'
	@printf 'make ship-fast  same, without tests\n'

# The gate that must be green before a deploy. Mirrors CI: Go vet/tests and the
# web typecheck + unit tests + design-token lint.
check:
	go vet ./...
	go test ./... -count=1
	pnpm --dir web verify:fast

test:
	go test ./... -count=1
	pnpm --dir web test

ship:
	./scripts/ship.sh

ship-fast:
	SHIP_SKIP_TESTS=1 ./scripts/ship.sh
