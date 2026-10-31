// tinyaml must agree with js-yaml (JSON_SCHEMA) on every yaml-test-suite
// case, valid and invalid. Run `pnpm suite:fetch` first.
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('every yaml-test-suite case matches js-yaml', { skip: !existsSync('.cache/yaml-test-suite') && 'run pnpm suite:fetch' }, () => {
  const output = execFileSync(process.execPath, ['scripts/suite.ts', '-v'], { encoding: 'utf8' })
  assert.match(output, / 0 differ$/m, output)
})

test('mutated yaml-test-suite inputs match js-yaml', { skip: !existsSync('.cache/yaml-test-suite') && 'run pnpm suite:fetch' }, () => {
  const output = execFileSync(process.execPath, ['scripts/fuzz.ts', '5000', '1'], { encoding: 'utf8' })
  assert.match(output, / 0 disagree with js-yaml$/m, output)
})
