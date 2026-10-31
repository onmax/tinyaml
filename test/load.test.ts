import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, loadAll, YAMLException } from '../src/index.ts'

test('JSON_SCHEMA scalars', () => {
  assert.deepEqual(load('a: null\nb: ~\nc: true\nd: True\ne: 1\nf: 1.5\ng: 0x10\nh: 1e3\ni:\n'), {
    a: null, b: '~', c: true, d: 'True', e: 1, f: 1.5, g: '0x10', h: 1000, i: '',
  })
  assert.deepEqual(load('a: !!int "3"\nb: !!str 3\nc: !!float .inf\nd: !!null'), { a: 3, b: '3', c: Infinity, d: null })
})

test('frontmatter-shaped documents', () => {
  const text = `title: Hello
tags: [a, "b c"]
nested:
  list:
    - one
    - two: 2
      three: 3
body: |
  Line one
  Line two
folded: >
  joined
  together
`
  assert.deepEqual(load(text), {
    title: 'Hello',
    tags: ['a', 'b c'],
    nested: { list: ['one', { two: 2, three: 3 }] },
    body: 'Line one\nLine two\n',
    folded: 'joined together\n',
  })
})

test('anchors, aliases and self references', () => {
  const doc = load('base: &b {x: 1}\ncopy: *b\n') as Record<string, unknown>
  assert.equal(doc.copy, doc.base)
  const self = load('&a\nself: *a\n') as Record<string, unknown>
  assert.equal(self.self, self)
})

test('multiple documents and empty input', () => {
  assert.deepEqual(loadAll('a: 1\n---\nb: 2\n'), [{ a: 1 }, { b: 2 }])
  assert.deepEqual(loadAll(''), [])
  assert.equal(load(''), undefined)
  assert.throws(() => load('a\n---\nb'), YAMLException)
})

test('errors are YAMLExceptions with a position', () => {
  for (const bad of ['a: 1\na: 2', 'a: b: c', 'key: "x', '[a, b', '- a\n b: c', '\ta: 1', '*missing', '['.repeat(1000)]) {
    assert.throws(() => loadAll(bad), (error: Error) => error instanceof YAMLException && /\(\d+:\d+\)$/.test(error.message), bad)
  }
})

test('__proto__ is an own key, not the prototype', () => {
  const doc = load('__proto__: {polluted: true}') as Record<string, unknown>
  assert.deepEqual(Object.keys(doc), ['__proto__'])
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
})
