#!/bin/sh
# Runs js-yaml 5.5.0's own test suite with every load/loadAll/dump call
# replayed through tinyaml, then summarizes. Needs .cache/js-yaml built
# (npm ci && npm run build && npm run spec:get inside it).
set -e
root=$(cd "$(dirname "$0")/../.." && pwd)
results="$root/.cache/js-yaml-results.jsonl"
rm -f "$results"
cd "$root/.cache/js-yaml"
TINYAML_RESULTS="$results" node --import "$root/scripts/js-yaml-tests/hooks.mjs" --test \
  'test/core/**/*.test.mjs' 'test/spec/*.test.mjs' > "$root/.cache/js-yaml-tests.log" 2>&1 || true
grep -E '^ℹ (tests|pass|fail) ' "$root/.cache/js-yaml-tests.log" | sed 's/^/js-yaml own assertions: /'
node "$root/scripts/js-yaml-tests/summary.ts" "$results" "$@"
