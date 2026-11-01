#!/bin/sh
# Every comparison with the libraries tinyaml replaces, their own tests, the
# suite scores, and the size of every entry, in one run. Each check states the
# differences it expects and exits non-zero on anything else. This prints
# each check's summary, and the whole output of any check that fails, and
# exits non-zero if one did. Run `pnpm fixtures` first. With DIST=1 every
# check runs against the built dist/ instead of src/, through
# scripts/dist-loader.ts: `pnpm build` first.
#
# Fuzz runs use N=5000 inputs with seed 1. The parse fuzzers record each
# difference they expect in scripts/baselines/ (see scripts/baseline.ts), for
# seed 1 and 5,000 inputs, and any smaller N checks a prefix of those. With
# UPDATE=1 they rewrite their records instead, after a deliberate change, or
# to record a larger N: review `git diff scripts/baselines` before committing.
# Usage: pnpm compare, DIST=1 pnpm compare, UPDATE=1 pnpm compare, or
# N=40000 UPDATE=1 scripts/compare.sh
cd "$(dirname "$0")/.." || exit 1
if [ -n "$DIST" ]; then
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import $PWD/scripts/dist-loader.ts"
  export NODE_OPTIONS
fi
n=${N:-5000}
# A count that isn't a positive integer would fuzz nothing and pass.
case $n in
  '' | *[!0-9]* | 0*)
    echo "N must be a positive integer, not '$n'" >&2
    exit 1
    ;;
esac
update=${UPDATE:+--update}
logs=$(mktemp -d) || exit 1
trap 'rm -rf "$logs"' EXIT
count=0
failed=""

check() {
  name=$1
  shift
  count=$((count + 1))
  log="$logs/$count.log"
  "$@" > "$log" 2>&1
  status=$?
  # The summary is what a check prints flush left: no samples, no failures.
  awk -v name="$name" '/^[ -]/ || /^FAIL / || /^$/ { next }
    { printf "%-26s %s\n", (shown++ ? "" : name), $0 }
    END { if (!shown) printf "%-26s (no summary)\n", name }' "$log"
  if [ "$status" -ne 0 ]; then
    failed="$failed
  $name (exit $status)"
    echo "  ^ failed with exit status $status; its output:"
    sed 's/^/  | /' "$log"
  fi
}

check "tinyaml vs the suite" node scripts/root-suite.ts
check "correctness scores" node --no-warnings scripts/correctness.ts
check "js-yaml 4 suite" node scripts/suite.ts
check "js-yaml 4 load fuzz" node --no-warnings scripts/fuzz.ts "$n" 1 $update
check "js-yaml 4 dump fuzz" node scripts/dump-fuzz.ts "$n" 1
check "js-yaml 4 own tests" sh scripts/js-yaml-tests/run.sh
check "js-yaml 5 suite" node scripts/js-yaml-v5-suite.ts
check "js-yaml 5 load fuzz" node --no-warnings scripts/js-yaml-v5-fuzz.ts "$n" 1 $update
check "js-yaml 5 dump fuzz" node scripts/js-yaml-v5-dump-fuzz.ts "$n" 1
check "js-yaml 5 own tests" sh scripts/js-yaml-v5-tests/run.sh
check "yaml suite" node --no-warnings scripts/yaml-suite.ts
check "yaml parse fuzz" node --no-warnings scripts/yaml-fuzz.ts "$n" 1 $update
check "yaml stringify fuzz" node --no-warnings scripts/yaml-stringify-fuzz.ts "$n" 1
check "yaml own tests" node scripts/yaml-upstream/run.ts
check "yamljs suite" node scripts/yamljs-suite.ts
check "yamljs parse fuzz" node scripts/yamljs-fuzz.ts "$n" 1 $update
check "yamljs dump fuzz" node scripts/yamljs-dump-fuzz.ts "$n" 1
check "yamljs own specs" node scripts/yamljs-specs.ts
check "std suite" node scripts/std-suite.ts
check "std parse fuzz" node scripts/std-fuzz.ts "$n" 1 $update
check "std stringify fuzz" node scripts/std-stringify-fuzz.ts "$n" 1
check "std own tests" node scripts/std-tests.ts

echo
node scripts/size.ts
status=$?
[ "$status" -eq 0 ] || failed="$failed
  size (exit $status)"

if [ -n "$failed" ]; then
  echo
  echo "Failed:$failed"
  exit 1
fi
