#!/bin/sh
# Runs js-yaml 4.3.2's own test suite twice: once with tinyaml in place of
# js-yaml (direct.mjs), then with every call compared against js-yaml
# (diff.mjs). summary.ts checks both against what's expected and sets the
# exit status. Run `pnpm fixtures` first.
# Each run writes its logs to a directory of its own, so two runs at once
# don't read each other's calls; a failed run keeps it.
# Usage: scripts/js-yaml-tests/run.sh [-v]
set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/js-yaml-tests"
out=$(mktemp -d "$root/.cache/js-yaml4-run.XXXXXX")
results="$out/results.jsonl"
status=0
cd "$root/.cache/js-yaml4"
# The suite fails on the tests summary.ts expects to fail; it judges them.
node --import "$here/direct.mjs" --test --test-reporter=tap test/core/*.test.* > "$out/direct.log" 2>&1 || true
node "$here/summary.ts" direct "$out/direct.log" "$@" || status=1
TINYAML_RESULTS="$results" node --import "$here/diff.mjs" --test test/core/*.test.* > "$out/diff.log" 2>&1 || true
node "$here/summary.ts" diff "$results" "$@" || status=1
if [ "$status" -eq 0 ]; then rm -rf "$out"; else echo "logs kept in $out"; fi
exit "$status"
