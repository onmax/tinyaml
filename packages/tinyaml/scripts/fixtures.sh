#!/bin/sh
# Downloads what the comparisons run against into .cache: the YAML test suite,
# and the source and tests of each library tinyaml stands in for. Skips what's
# already there, and fails if anything is still missing at the end.
# Usage: pnpm fixtures
set -e
cd "$(dirname "$0")/.."
get() {
  [ -d ".cache/$1" ] || git clone --quiet --depth 1 --branch "$2" "https://github.com/$3" ".cache/$1"
}
get yaml-test-suite data-2022-01-17 yaml/yaml-test-suite
get js-yaml4 4.3.2 nodeca/js-yaml
get js-yaml 5.5.0 nodeca/js-yaml
get yaml-src v2.9.1 eemeli/yaml
get yamljs-src v0.3.0 jeremyfa/yaml.js
[ -d .cache/js-yaml4/node_modules ] || (cd .cache/js-yaml4 && npm ci --ignore-scripts --silent)
[ -d .cache/js-yaml/dist ] ||
  (cd .cache/js-yaml && npm ci --ignore-scripts --silent && npm run build --silent && npm run spec:get --silent)
for path in yaml-test-suite/229Q/in.yaml js-yaml4/node_modules js-yaml/dist \
  js-yaml/test/spec/yaml-test-suite yaml-src/tests yamljs-src/test/spec; do
  [ -e ".cache/$path" ] || { echo "fixtures: .cache/$path is missing" >&2; exit 1; }
done
