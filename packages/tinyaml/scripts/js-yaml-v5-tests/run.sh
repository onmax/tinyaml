#!/bin/sh
# Runs js-yaml 5.5.0's own test suite twice: once with tinyaml/js-yaml-v5 in
# place of js-yaml, then with every load, loadAll and dump call compared
# against js-yaml 5; summary.ts checks both against what's expected and sets
# the exit status. Needs .cache/js-yaml: js-yaml 5.5.0's repository with
# `npm ci && npm run build && npm run spec:get` run inside it, as
# `pnpm fixtures` does. Each run writes its logs to a directory of its own,
# so two runs at once don't read each other's calls; a failed run keeps it.
set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
here="$root/scripts/js-yaml-v5-tests"
out=$(mktemp -d "$root/.cache/js-yaml5-run.XXXXXX")
results="$out/results.jsonl"
status=0
cd "$root/.cache/js-yaml"
node --import "$here/direct.mjs" --test --test-reporter=tap 'test/core/**/*.test.mjs' 'test/spec/*.test.mjs' > "$out/direct.log" 2>&1 || true
node "$here/summary.ts" direct "$out/direct.log" || status=1
TINYAML_RESULTS="$results" node --import "$here/diff.mjs" --test 'test/core/**/*.test.mjs' 'test/spec/*.test.mjs' > "$out/diff.log" 2>&1 || true
sed -nE 's/^ℹ (tests|pass|fail) /js-yaml 5 own assertions, wrapped: \1 /p' "$out/diff.log"
node "$here/summary.ts" diff "$results" "$@" || status=1
if [ "$status" -eq 0 ]; then rm -rf "$out"; else echo "logs kept in $out"; fi
exit "$status"
