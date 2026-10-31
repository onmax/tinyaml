// Median time per call over several rounds, tinyaml against js-yaml with
// the options Comark uses (loadAll + JSON_SCHEMA, dump with lineWidth -1).
import { readFileSync } from 'node:fs'
import * as jsYaml from 'js-yaml'
import { dump, loadAll } from '../src/index.ts'

const frontmatter = `title: Getting started
description: Install the SDK and send your first message
navigation: true
tags: [setup, guide]
`
const component = `icon: i-lucide-rocket
color: primary
links:
  - label: Docs
    to: /docs
    target: _blank
  - label: GitHub
    to: https://github.com/vercel/chat
`
const doc = readFileSync('.cache/js-yaml/package-lock.json', 'utf8')
const large = jsYaml.dump(JSON.parse(doc), { lineWidth: -1 })

const inputs = { frontmatter, component, large }
const values = Object.fromEntries(Object.entries(inputs).map(([name, text]) => [name, jsYaml.load(text, { schema: jsYaml.JSON_SCHEMA })]))

function time(fn: () => unknown): number {
  let iterations = 1
  for (;;) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    const elapsed = performance.now() - start
    if (elapsed > 50) return elapsed / iterations
    iterations *= 2
  }
}

function median(fn: () => unknown): number {
  const rounds = Array.from({ length: 7 }, () => time(fn)).sort((a, b) => a - b)
  return rounds[3]!
}

function format(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`
}

console.log(`large input: ${(large.length / 1024).toFixed(0)} KB of YAML`)
console.log('| Operation | js-yaml | tinyaml | Speedup |\n| --- | --- | --- | --- |')
for (const [name, text] of Object.entries(inputs)) {
  const a = median(() => jsYaml.loadAll(text, { schema: jsYaml.JSON_SCHEMA }))
  const b = median(() => loadAll(text))
  console.log(`| load ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`)
}
for (const [name, value] of Object.entries(values)) {
  const a = median(() => jsYaml.dump(value, { indent: 2, lineWidth: -1 }))
  const b = median(() => dump(value))
  console.log(`| dump ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`)
}
