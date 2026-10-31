// Single-pass recursive descent over char codes. No tokens, no AST: every
// node is built straight into the JS value it resolves to under js-yaml's
// JSON_SCHEMA. Parser state lives in module scope because parsing is
// synchronous and never re-entered.

import { YAMLException } from './error.ts'

const SPACE = 32
const TAB = 9
const LF = 10
const HASH = 35
const COLON = 58
const COMMA = 44
const DASH = 45
const QUOTE = 39
const DQUOTE = 34
const BANG = 33
const AMP = 38
const STAR = 42
const QMARK = 63
const PIPE = 124
const GT = 62
const LBRACKET = 91
const RBRACKET = 93
const LBRACE = 123
const RBRACE = 125
const BACKSLASH = 92
const DOT = 46

const NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/
// One character class, so V8 can scan for it quickly; it also matches valid
// surrogate pairs, which then get the exact check per scalar.
const MAYBE_UNPRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uD800-\uDFFF\uFFFE\uFFFF]/
const URI_CHAR = "(?:%[\\da-fA-F]{2}|[\\w\\-#;/?:@&=+$,.!~*'()\\[\\]])"
const TAG_CHAR = "(?:%[\\da-fA-F]{2}|[\\w\\-#;/?:@&=+$.~*'()])"
const TAG_HANDLE = /^(?:!|!!|![\da-zA-Z-]+!)$/
const TAG_SUFFIX = new RegExp(`^${TAG_CHAR}+$`)
const TAG_PREFIX = new RegExp(`^(?:!${URI_CHAR}*|${TAG_CHAR}${URI_CHAR}*)$`)

const YAML_TAG = 'tag:yaml.org,2002:'
const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d*)?(?:[eE][-+]?\d+)?$/
const EXPLICIT_INT = /^[-+]?(?:0b[01]+|0o[0-7]+|0x[\da-fA-F]+|\d+)$/
const EXPLICIT_FLOAT = /^(?:[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/

const ESCAPES: Record<string, string> = {
  0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1B',
  ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xA0', L: '\u2028', P: '\u2029',
}

let src = ''
let pos = 0
// Offset of the current line's first character. Everything that steps over a
// line break updates it, so `column()` never has to search backwards.
let lineStart = 0
let len = 0
let anchors = new Map<string, unknown>()

// A scalar's raw text plus whether it was plain, so tags and the schema can
// resolve it after the fact.
let plain = false
// The current line's indentation contains a tab.
let tabbed = false
// The last scalar spanned more than one line.
let crossed = false
// The last implicit key was omitted (`: value`); js-yaml then allows a
// compact mapping as the value.
let emptyKey = false
// An anchor read but not yet attached. Collections claim it as soon as they
// exist, so their own children can alias them.
let pendingAnchor: string | undefined
// Nesting of the node being parsed. js-yaml rejects the 100th level, counting
// collections, scalar values and flow keys but not implicit block keys.
let depth = 0
let unprintable = false
const MAX_DEPTH = 100

function nest(): void {
  if (++depth >= MAX_DEPTH) fail(`nesting exceeded maxDepth (${MAX_DEPTH})`)
}

function leaf(): void {
  if (depth + 1 >= MAX_DEPTH) fail(`nesting exceeded maxDepth (${MAX_DEPTH})`)
}
// %TAG handles of the current document.
let handles = new Map<string, string>()

function fail(message: string): never {
  const before = src.slice(0, pos)
  const line = before.split('\n').length
  throw new YAMLException(`${message} (${line}:${pos - before.lastIndexOf('\n')})`)
}



// NaN (end of input) counts as a break.
function isBreak(ch: number): boolean {
  return ch === LF || ch !== ch
}

function isBlank(ch: number): boolean {
  return ch === SPACE || ch === TAB || ch === LF || ch !== ch
}

function isFlowIndicator(ch: number): boolean {
  return ch === COMMA || ch === LBRACKET || ch === RBRACKET || ch === LBRACE || ch === RBRACE
}

function column(): number {
  return pos - lineStart
}

function skipSpace(): void {
  let ch = src.charCodeAt(pos)
  while (ch === SPACE || ch === TAB) ch = src.charCodeAt(++pos)
}

// Spaces before the first other character of the current line.
function leadingSpaces(): number {
  let i = lineStart
  while (src.charCodeAt(i) === SPACE) i++
  return i - lineStart
}

function skipComment(): void {
  if (src.charCodeAt(pos) === HASH) {
    if (pos > 0 && !isBlank(src.charCodeAt(pos - 1))) fail('comments must be separated from other tokens by white space characters')
    const end = src.indexOf('\n', pos)
    pos = end < 0 ? len : end
  }
}

// Skips whitespace, comments and line breaks. Returns the column of the next
// content, or -1 at end of input.
function skipLines(): number {
  for (;;) {
    skipSpace()
    skipComment()
    if (src.charCodeAt(pos) !== LF) break
    lineStart = ++pos
  }
  if (pos >= len) return -1
  const col = column()
  // Tabs may separate a scalar or flow node from the margin, but can't
  // indent block collections; those check `tabbed`.
  tabbed = false
  for (let i = pos - col; i < pos; i++) if (src.charCodeAt(i) === TAB) tabbed = true
  return col
}

function isDocMarker(): boolean {
  const ch = src.charCodeAt(pos)
  return (
    (ch === DASH || ch === DOT) &&
    (pos === 0 || src.charCodeAt(pos - 1) === LF) &&
    src.charCodeAt(pos + 1) === ch &&
    src.charCodeAt(pos + 2) === ch &&
    isBlank(src.charCodeAt(pos + 3))
  )
}

function expectLineEnd(): void {
  skipSpace()
  const ch = src.charCodeAt(pos)
  if (ch !== HASH && !isBreak(ch)) fail('end of line expected')
}

export function loadAll(input: string): unknown[] {
  src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  if (src.includes('\r')) src = src.replace(/\r\n?/g, '\n')
  // A byte order mark may start any later document too.
  if (src.includes('\uFEFF')) src = src.replace(/\n\uFEFF/g, '\n')
  pos = src.indexOf('\0')
  if (pos >= 0) fail('null byte is not allowed in input')
  pos = lineStart = 0
  depth = 0
  len = src.length
  unprintable = MAYBE_UNPRINTABLE.test(src)
  const docs: unknown[] = []
  try {
    for (;;) {
      let col = skipLines()
      let directives = false
      handles = new Map([['!!', YAML_TAG], ['!', '!']])
      let version = false
      const declared = new Set<string>()
      while (col === 0 && src.charCodeAt(pos) === 37 /* % */) {
        directives = true
        let end = src.indexOf('\n', pos)
        if (end < 0) end = len
        const args = src.slice(pos + 1, end).split(/[ \t]+/)
        const comment = args.findIndex((arg) => arg.charCodeAt(0) === HASH)
        if (comment >= 0) args.length = comment
        const name = args.shift()
        if (!name) fail('directive name must not be less than one character in length')
        if (name === 'YAML') {
          if (version) fail('duplication of %YAML directive')
          if (args.length !== 1) fail('YAML directive accepts exactly one argument')
          const match = /^(\d+)\.\d+$/.exec(args[0]!)
          if (!match) fail('ill-formed argument of the YAML directive')
          if (match[1] !== '1') fail('unacceptable YAML version of the document')
          version = true
        } else if (name === 'TAG') {
          const [handle, prefix] = args
          if (args.length !== 2) fail('TAG directive accepts exactly two arguments')
          if (!TAG_HANDLE.test(handle!)) fail('ill-formed tag handle (first argument) of the TAG directive')
          if (declared.has(handle!)) fail(`there is a previously declared suffix for "${handle}" tag handle`)
          if (!TAG_PREFIX.test(prefix!)) fail('ill-formed tag prefix (second argument) of the TAG directive')
          declared.add(handle!)
          handles.set(handle!, prefix!)
        }
        pos = end
        col = skipLines()
      }
      if (col < 0) {
        if (directives) fail('directives end mark is expected')
        break
      }
      anchors = new Map()
      // js-yaml measures indentation only after a line break, so on the very
      // first line an indented `---` still starts a document, and the
      // top-level node's parent indent is -1.
      const firstLine = lineStart === 0
      const explicit =
        src.charCodeAt(pos) === DASH && (isDocMarker() || (firstLine && src.startsWith('---', pos) && isBlank(src.charCodeAt(pos + 3))))
      if (explicit) pos += 3
      else if (directives) fail('directives end mark is expected')
      else if (isDocMarker()) {
        pos += 3
        expectLineEnd()
        continue
      }
      docs.push(parseValue(explicit || firstLine ? -1 : col - 1, false))
      col = skipLines()
      if (col < 0) break
      if (!isDocMarker()) fail('end of the stream or a document separator is expected')
      if (src.charCodeAt(pos) === DOT) {
        pos += 3
        expectLineEnd()
      }
    }
  } finally {
    src = ''
    anchors = new Map()
  }
  return docs
}

interface Props {
  tag: string | undefined
  anchor: string | undefined
}

function parseProps(): Props | undefined {
  let props: Props | undefined
  for (;;) {
    const ch = src.charCodeAt(pos)
    if (ch !== BANG && ch !== AMP) return props
    props ??= { tag: undefined, anchor: undefined }
    const start = ++pos
    if (ch === BANG && src.charCodeAt(pos) === 60 /* < */) {
      const end = src.indexOf('>', pos)
      if (end < 0) fail('unexpected end of the stream within a verbatim tag')
      if (props.tag !== undefined) fail('duplication of a tag property')
      props.tag = src.slice(start + 1, end)
      pos = end + 1
    } else {
      let c = src.charCodeAt(pos)
      while (!isBlank(c) && !isFlowIndicator(c)) c = src.charCodeAt(++pos)
      const name = src.slice(start, pos)
      if (ch === AMP) {
        if (!name) fail('name of an anchor node must contain at least one character')
        if (props.anchor !== undefined) fail('duplication of an anchor property')
        props.anchor = pendingAnchor = name
      } else {
        if (props.tag !== undefined) fail('duplication of a tag property')
        const bang = name.indexOf('!')
        const handle = bang < 0 ? '!' : `!${name.slice(0, bang + 1)}`
        const suffix = name.slice(bang + 1)
        if (!TAG_HANDLE.test(handle)) fail('named tag handle cannot contain such characters')
        const prefix = handles.get(handle)
        if (prefix === undefined) fail(`undeclared tag handle "${handle}"`)
        if (name !== '' && !TAG_SUFFIX.test(suffix)) fail('tag suffix cannot contain such characters')
        props.tag = name === '' ? '!' : prefix + decodeURIComponent(suffix)
      }
    }
    if (!isBlank(src.charCodeAt(pos)) && !isFlowIndicator(src.charCodeAt(pos))) fail('a whitespace character is expected after a node property')
    skipSpace()
  }
}

function claim<T>(container: T): T {
  if (pendingAnchor !== undefined) anchors.set(pendingAnchor, container)
  pendingAnchor = undefined
  return container
}

function applyProps(value: unknown, props: Props | undefined, isScalar: boolean): unknown {
  pendingAnchor = undefined
  if (!props) return value
  const tag = props.tag
  if (tag !== undefined && tag !== '!') value = isScalar ? resolveTagged(value as string, tag) : checkCollection(value, tag)
  if (props.anchor !== undefined) anchors.set(props.anchor, value)
  return value
}

function checkCollection(value: unknown, tag: string): unknown {
  if (tag === `${YAML_TAG}${Array.isArray(value) ? 'seq' : 'map'}`) return value
  return fail(`unknown tag !<${tag}>`)
}

function resolveTagged(text: string, tag: string): unknown {
  const type = tag.startsWith(YAML_TAG) ? tag.slice(YAML_TAG.length) : ''
  let value: unknown
  if (type === 'str') return text
  if (text === '' && (type === 'map' || type === 'seq')) return type === 'map' ? {} : []
  if (type === 'null') {
    if (text === 'null' || text === '') return null
  } else if (type === 'bool') {
    if (text === 'true' || text === 'false') return text === 'true'
  } else if (type === 'int') {
    if (EXPLICIT_INT.test(text)) value = parseInt(text)
  } else if (type === 'float') {
    if (EXPLICIT_FLOAT.test(text)) value = parseFloat(text)
  } else {
    fail(`unknown scalar tag !<${tag}>`)
  }
  if (typeof value === 'number' && (isFinite(value) || (type === 'float' && /\.(?:inf|nan)$/i.test(text)))) return value
  return fail(`cannot resolve a node with !<${tag}> explicit tag`)
}

// Handles the sign and base prefixes that the explicit int pattern allows.
function parseInt(text: string): number {
  const sign = text.charCodeAt(0) === DASH ? -1 : 1
  const body = sign < 0 || text.charCodeAt(0) === 43 ? text.slice(1) : text
  const base = body[1] === 'b' ? 2 : body[1] === 'o' ? 8 : body[1] === 'x' ? 16 : 10
  return sign * Number.parseInt(base === 10 ? body : body.slice(2), base)
}

function parseFloat(text: string): number {
  const lower = text.toLowerCase()
  if (lower.endsWith('.nan')) return NaN
  if (lower.endsWith('.inf')) return lower.charCodeAt(0) === DASH ? -Infinity : Infinity
  return Number(text)
}

function resolvePlain(text: string): unknown {
  const ch = text.charCodeAt(0)
  if (ch === 110 /* n */) return text === 'null' ? null : text
  if (ch === 116 /* t */) return text === 'true' ? true : text
  if (ch === 102 /* f */) return text === 'false' ? false : text
  if ((ch === DASH || (ch >= 48 && ch <= 57)) && JSON_NUMBER.test(text)) {
    const n = Number(text)
    if (isFinite(n)) return n
  }
  return text
}

// The node after a `key:`, `-` or `---`, on this line or the following ones.
// `indent` is the parent block's column. `outer` holds properties already
// read on an earlier line.
function parseValue(indent: number, inSeq: boolean, compact = inSeq, outer?: Props): unknown {
  const start = pos
  skipSpace()
  const col = column()
  // Something before us on this line: block collections can't start here,
  // except in a compact `- ` entry.
  let before = pos - 1
  while (src.charCodeAt(before) === SPACE || src.charCodeAt(before) === TAB) before--
  const inline = !compact && before >= 0 && src.charCodeAt(before) !== LF
  let separatedByTab = false
  for (let i = start; i < pos; i++) if (src.charCodeAt(i) === TAB) separatedByTab = true
  const props = parseProps()
  const ch = src.charCodeAt(pos)
  if (ch === HASH || isBreak(ch)) {
    const merged = mergeProps(outer, props)
    const save = pos
    const saveLine = lineStart
    const next = skipLines()
    if (next > indent && !isDocMarker()) return parseBlockNode(indent < 0 ? next - 1 : indent, next, merged)
    if (next === indent && !inSeq && src.charCodeAt(pos) === DASH && isBlank(src.charCodeAt(pos + 1)) && !isDocMarker()) {
      return applyProps(parseBlockSeq(next), merged, false)
    }
    pos = save
    lineStart = saveLine
    return applyProps('', merged, true)
  }
  // A node that starts its line keeps the line's own indentation status.
  tabbed = inline ? separatedByTab : tabbed || separatedByTab
  return parseBlockNode(indent, col, outer, props, inline)
}

function mergeProps(a: Props | undefined, b: Props | undefined): Props | undefined {
  if (!a || !b) return a ?? b
  if ((a.tag !== undefined && b.tag !== undefined) || (a.anchor !== undefined && b.anchor !== undefined)) {
    fail('bad indentation of a mapping entry')
  }
  return { tag: b.tag ?? a.tag, anchor: b.anchor ?? a.anchor }
}

// A block node starting at column `col`. `node` are properties of this node
// from an earlier line; `own` are those on this line, which belong to the
// key when the node turns out to be a mapping.
function parseBlockNode(
  indent: number,
  col: number,
  node: Props | undefined,
  own = parseProps(),
  inline = false,
): unknown {
  let ch = src.charCodeAt(pos)
  if (own && (ch === HASH || isBreak(ch))) return parseValue(indent, false, false, mergeProps(node, own))
  if ((ch === DASH || ch === QMARK) && isBlank(src.charCodeAt(pos + 1))) {
    if (tabbed) fail('tab characters must not be used in indentation')
    if (inline || (own && ch === DASH)) fail('bad indentation of a mapping entry')
    return applyProps(ch === DASH ? parseBlockSeq(col) : parseBlockMap(col, undefined), mergeProps(node, own), false)
  }
  if (ch === PIPE || ch === GT) {
    leaf()
    return applyProps(parseBlockScalar(indent), mergeProps(node, own), true)
  }
  let key: unknown
  let isScalar = true
  crossed = false
  emptyKey = ch === COLON && isBlank(src.charCodeAt(pos + 1))
  if (emptyKey) {
    key = ''
    plain = true
  } else if (ch === STAR) {
    if (own) fail('alias node should not have any properties')
    key = parseAlias()
    isScalar = false
  } else if (ch === LBRACKET || ch === LBRACE) {
    if (tabbed && leadingSpaces() <= indent) fail('deficient indentation')
    key = parseFlowCollection(indent)
    isScalar = false
  } else if (ch === QUOTE || ch === DQUOTE) {
    key = parseQuoted(indent)
  } else {
    key = parsePlain(indent, false, true)
  }
  const wasPlain = plain
  const multiline = crossed
  skipSpace()
  ch = src.charCodeAt(pos)
  if (ch === COLON && (isBlank(src.charCodeAt(pos + 1)) || !wasPlain)) {
    if (!isBlank(src.charCodeAt(pos + 1))) fail('a whitespace character is expected after the key-value separator within a block mapping')
    if (tabbed) fail('tab characters must not be used in indentation')
    if (inline) fail('bad indentation of a mapping entry')
    if (multiline) fail('can not read a block mapping entry; a multiline key may not be an implicit key')
    if (!isScalar && typeof key === 'object' && key !== null) fail('object-based map does not support complex keys')
    const resolved = applyProps(isScalar && wasPlain && !own?.tag ? resolvePlain(key as string) : key, own, isScalar)
    pendingAnchor = node?.anchor
    return applyProps(parseBlockMap(col, resolved), node, false)
  }
  if (!wasPlain) expectLineEnd()
  if (key !== '' || !wasPlain) leaf()
  const props = mergeProps(node, own)
  return applyProps(isScalar && wasPlain && !props?.tag ? resolvePlain(key as string) : key, props, isScalar)
}

function parseAlias(): unknown {
  const start = ++pos
  let ch = src.charCodeAt(pos)
  while (!isBlank(ch) && !isFlowIndicator(ch)) ch = src.charCodeAt(++pos)
  const name = src.slice(start, pos)
  if (!anchors.has(name)) fail(`unidentified alias "${name}"`)
  plain = false
  return anchors.get(name)
}

function setKey(map: Record<string, unknown>, key: unknown, value: unknown): void {
  if (typeof key === 'object' && key !== null) fail('object-based map does not support complex keys')
  const name = String(key)
  if (Object.hasOwn(map, name)) fail('duplicated mapping key')
  if (name === '__proto__') Object.defineProperty(map, name, { value, enumerable: true, configurable: true, writable: true })
  else map[name] = value
}

// `key` is the already-parsed first key, or undefined when the map starts
// with an explicit `?` entry. The position is on the `:` or `?`.
function parseBlockMap(col: number, key: unknown): Record<string, unknown> {
  nest()
  const map: Record<string, unknown> = claim({})
  for (;;) {
    let value: unknown = ''
    if (key === undefined) {
      // Explicit entry: `? key`, then an optional `: value` at the same column.
      pos++
      key = parseValue(col, true)
      const next = skipLines()
      if (next === col && src.charCodeAt(pos) === COLON && isBlank(src.charCodeAt(pos + 1))) {
        pos++
        value = parseValue(col, true)
      } else {
        setKey(map, key, value)
        if (next !== col || isDocMarker()) {
          if (next > col) fail('bad indentation of a mapping entry')
          break
        }
        key = parseNextKey()
        continue
      }
    } else {
      pos++
      value = parseValue(col, false, emptyKey)
    }
    setKey(map, key, value)
    const next = skipLines()
    if (next !== col || isDocMarker()) {
      if (next > col) fail('bad indentation of a mapping entry')
      break
    }
    key = parseNextKey()
  }
  depth--
  return map
}

// The key of the next entry, or undefined for an explicit `?` entry. Leaves
// the position on the key's `:`.
function parseNextKey(): unknown {
  if (tabbed) fail('tab characters must not be used in indentation')
  if (src.charCodeAt(pos) === QMARK && isBlank(src.charCodeAt(pos + 1))) return undefined
  const props = parseProps()
  const ch = src.charCodeAt(pos)
  let key: unknown = ''
  plain = true
  crossed = false
  if (ch === STAR) {
    if (props) fail('alias node should not have any properties')
    key = parseAlias()
  } else if (ch === QUOTE || ch === DQUOTE) key = parseQuoted(-1)
  else if (ch === LBRACKET || ch === LBRACE) fail('object-based map does not support complex keys')
  emptyKey = ch === COLON && isBlank(src.charCodeAt(pos + 1))
  if (!emptyKey && ch !== STAR && ch !== QUOTE && ch !== DQUOTE) key = parsePlain(-1, false, false)
  const wasPlain = plain
  skipSpace()
  if (src.charCodeAt(pos) !== COLON || crossed) fail('can not read a block mapping entry; a multiline key may not be an implicit key')
  if (!isBlank(src.charCodeAt(pos + 1))) fail('a whitespace character is expected after the key-value separator within a block mapping')
  return applyProps(wasPlain && !props?.tag ? resolvePlain(key as string) : key, props, ch !== STAR)
}

function parseBlockSeq(col: number): unknown[] {
  nest()
  const seq: unknown[] = claim([])
  for (;;) {
    pos++
    seq.push(parseValue(col, true))
    const next = skipLines()
    if (next !== col || src.charCodeAt(pos) !== DASH || !isBlank(src.charCodeAt(pos + 1)) || isDocMarker()) {
      if (next > col) fail('bad indentation of a sequence entry')
      break
    }
  }
  depth--
  return seq
}

function parseBlockScalar(indent: number): string {
  const folded = src.charCodeAt(pos) === GT
  let chomp = 0 // -1 strip, 0 clip, 1 keep
  let explicit = 0
  for (;;) {
    const ch = src.charCodeAt(++pos)
    if (ch === 43 /* + */ || ch === DASH) {
      if (chomp) fail('repeat of a chomping mode identifier')
      chomp = ch === DASH ? -1 : 1
    } else if (ch >= 49 && ch <= 57) {
      if (explicit) fail('repeat of an indentation width identifier')
      explicit = ch - 48
    } else if (ch === 48) {
      fail('bad explicit indentation width of a block scalar; it cannot be less than one')
    } else break
  }
  if (!isBlank(src.charCodeAt(pos))) fail('a whitespace character is expected after a block scalar indicator')
  expectLineEnd()
  skipComment()

  let textIndent = explicit ? indent + explicit : -1
  let maxEmpty = 0
  const lines: string[] = [] // '' marks an empty line
  // pos is on the line break that ends the previous line.
  while (pos < len) {
    const lineStart = pos + 1
    let p = lineStart
    while (src.charCodeAt(p) === SPACE) p++
    const spaces = p - lineStart
    if (isBreak(src.charCodeAt(p)) && (textIndent < 0 || spaces <= textIndent)) {
      if (p >= len && !spaces) break
      if (spaces > maxEmpty) maxEmpty = spaces
      lines.push('')
      pos = p
      continue
    }
    if (textIndent < 0) {
      if (src.charCodeAt(p) === TAB && spaces <= indent) fail('tab characters must not be used in indentation')
      if (spaces <= indent) break
      if (spaces < maxEmpty) fail('leading empty lines contain more spaces than the first non-empty line')
      textIndent = spaces
    } else if (spaces < textIndent) break
    if (spaces === 0) {
      pos = p
      if (isDocMarker()) {
        pos = lineStart - 1
        break
      }
    }
    let end = src.indexOf('\n', p)
    if (end < 0) end = len
    lines.push(src.slice(lineStart + textIndent, end))
    pos = end
  }
  plain = false

  checkPrintable(lines.join('\n'))
  let last = lines.length
  while (last > 0 && lines[last - 1] === '') last--
  const trailing = lines.length - last
  if (!last) return chomp > 0 ? '\n'.repeat(trailing) : ''
  let out = ''
  if (!folded) out = lines.slice(0, last).join('\n')
  else {
    let empty = 0
    let prevMore = true // no fold before the first line
    for (let i = 0; i < last; i++) {
      const line = lines[i]!
      if (line === '') {
        empty++
        continue
      }
      const ch = line.charCodeAt(0)
      const more = ch === SPACE || ch === TAB
      if (i === empty) out += '\n'.repeat(empty)
      else out += !more && !prevMore ? (empty ? '\n'.repeat(empty) : ' ') : '\n'.repeat(empty + 1)
      out += line
      prevMore = more
      empty = 0
    }
  }
  if (chomp < 0) return out
  return chomp > 0 ? `${out}\n${'\n'.repeat(trailing)}` : `${out}\n`
}

// Folds the line break(s) at `pos` inside a flow or plain scalar. Returns the
// text they stand for, and leaves `pos` at the next line's first content.
function foldBreaks(): string {
  let breaks = 0
  while (src.charCodeAt(pos) === LF) {
    lineStart = ++pos
    breaks++
    skipSpace()
  }
  crossed = true
  return breaks === 1 ? ' ' : '\n'.repeat(breaks - 1)
}

function trimEnd(text: string): string {
  let end = text.length
  let ch = text.charCodeAt(end - 1)
  while (ch === SPACE || ch === TAB) ch = text.charCodeAt(--end - 1)
  return end === text.length ? text : text.slice(0, end)
}

function parseQuoted(indent: number): string {
  const quote = src.charCodeAt(pos)
  let out = ''
  let start = ++pos
  for (;;) {
    const ch = src.charCodeAt(pos)
    if (ch !== ch) fail(`unexpected end of the stream within a ${quote === QUOTE ? 'single' : 'double'} quoted scalar`)
    if (ch === quote) {
      if (quote === QUOTE && src.charCodeAt(pos + 1) === QUOTE) {
        out += src.slice(start, pos + 1)
        start = pos += 2
        continue
      }
      out += src.slice(start, pos++)
      break
    }
    if (ch < SPACE && ch !== TAB && ch !== LF) fail('expected valid JSON character')
    if (ch === LF) {
      out += trimEnd(src.slice(start, pos))
      out += foldBreaks()
      if (isDocMarker()) fail(`unexpected end of the document within a ${quote === QUOTE ? 'single' : 'double'} quoted scalar`)
      if (pos < len && leadingSpaces() <= indent) fail('deficient indentation')
      start = pos
      continue
    }
    if (ch === BACKSLASH && quote === DQUOTE) {
      out += src.slice(start, pos)
      const e = src[++pos]
      if (e === '\n') {
        // Escaped line break: join without a space, keep empty lines.
        out += foldBreaks().replace(' ', '')
      } else if (e === 'x' || e === 'u' || e === 'U') {
        const size = e === 'x' ? 2 : e === 'u' ? 4 : 8
        const hex = src.slice(pos + 1, pos + 1 + size)
        if (!/^[\da-fA-F]+$/.test(hex) || hex.length < size) fail('expected hexadecimal character')
        out += String.fromCodePoint(Number.parseInt(hex, 16))
        pos += size + 1
      } else if (e !== undefined && e in ESCAPES) {
        out += ESCAPES[e]
        pos++
      } else fail('unknown escape sequence')
      start = pos
      continue
    }
    pos++
  }
  plain = false
  return out
}

// Scans a plain scalar. In block context it may continue on more indented
// lines; `multiline` is false for implicit keys.
function parsePlain(indent: number, flow: boolean, multiline: boolean): string {
  let ch = src.charCodeAt(pos)
  if (
    ch === HASH || ch === COMMA || ch === RBRACKET || ch === RBRACE || ch === 37 || ch === 64 || ch === 96 ||
    ch === PIPE || ch === GT ||
    ((ch === DASH || ch === QMARK || ch === COLON) && (isBlank(src.charCodeAt(pos + 1)) || (flow && isFlowIndicator(src.charCodeAt(pos + 1)))))
  ) {
    fail(`unexpected character "${src[pos]}"`)
  }
  let out = ''
  for (;;) {
    const start = pos
    let end = pos
    for (;;) {
      // Fast path: letters and most punctuation sort above ':'.
      if (ch > COLON && ch !== LBRACKET && ch !== RBRACKET && ch !== LBRACE && ch !== RBRACE) {
        end = ++pos
        ch = src.charCodeAt(pos)
        continue
      }
      if (isBreak(ch)) break
      if (ch === COLON) {
        const next = src.charCodeAt(pos + 1)
        if (isBlank(next) || (flow && isFlowIndicator(next))) break
      } else if (ch === HASH) {
        const prev = src.charCodeAt(pos - 1)
        if (prev === SPACE || prev === TAB) break
      } else if (flow && isFlowIndicator(ch)) break
      if (ch !== SPACE && ch !== TAB) end = pos + 1
      ch = src.charCodeAt(++pos)
    }
    out += src.slice(start, end)
    if (!multiline || ch !== LF) {
      // In flow context the scalar owns its trailing white space, as in js-yaml.
      if (!flow || ch === LF) pos = end
      break
    }
    // Look ahead for a continuation line.
    const save = pos
    const saveLine = lineStart
    const wasCrossed = crossed
    const folded = foldBreaks()
    ch = src.charCodeAt(pos)
    if (
      pos >= len || ch === HASH || isDocMarker() ||
      (flow ? isFlowIndicator(ch) || (ch === COLON && isBlank(src.charCodeAt(pos + 1))) : column() <= indent ||
        (ch === COLON && isBlank(src.charCodeAt(pos + 1))))
    ) {
      pos = save
      lineStart = saveLine
      crossed = wasCrossed
      break
    }
    if (leadingSpaces() <= indent) fail(flow ? 'deficient indentation' : 'tab characters must not be used in indentation')
    out += folded
  }
  plain = true
  checkPrintable(out)
  return out
}

// Comments may hold anything, so only scalars are checked, and only when the
// input as a whole contains a non-printable character.
function checkPrintable(text: string): void {
  if (unprintable && NON_PRINTABLE.test(text)) fail('the stream contains non-printable characters')
}

// Skips white space, comments and line breaks inside a flow collection whose
// block parent sits at column `indent`. Returns whether a line ended.
function skipFlowSpace(indent: number): boolean {
  let lines = false
  let tab = false
  for (;;) {
    const start = pos
    skipSpace()
    for (let i = start; i < pos; i++) if (src.charCodeAt(i) === TAB) tab = true
    skipComment()
    if (src.charCodeAt(pos) !== LF) break
    lineStart = ++pos
    lines = true
  }
  if ((lines || tab) && pos < len && ((lines && isDocMarker()) || leadingSpaces() <= indent)) fail('deficient indentation')
  return lines
}

function parseFlowCollection(indent: number): unknown {
  const isMap = src.charCodeAt(pos) === LBRACE
  const close = isMap ? RBRACE : RBRACKET
  nest()
  const result: unknown = claim(isMap ? {} : [])
  pos++
  for (;;) {
    skipFlowSpace(indent)
    let ch = src.charCodeAt(pos)
    if (ch === close) {
      pos++
      break
    }
    if (ch !== ch) fail('unexpected end of the stream within a flow collection')
    let explicit = false
    if (ch === QMARK && isBlank(src.charCodeAt(pos + 1))) {
      explicit = true
      pos++
      skipFlowSpace(indent)
      ch = src.charCodeAt(pos)
    }
    const empty =
      (explicit && (ch === COMMA || ch === close)) || (ch === COLON && (isBlank(src.charCodeAt(pos + 1)) || isFlowIndicator(src.charCodeAt(pos + 1))))
    if (empty) plain = true
    else if (ch === COMMA) fail("expected the node content, but found ','")
    crossed = false
    const key = empty ? '' : parseFlowNode(indent)
    const multiline = crossed
    const broken = skipFlowSpace(indent)
    ch = src.charCodeAt(pos)
    // An implicit key in a flow sequence must end on its own line.
    if (ch === COLON && (broken || multiline) && !isMap && !explicit) fail('missed comma between flow collection entries')
    let value: unknown = ''
    let pair = isMap || explicit
    if (ch === COLON) {
      pos++
      pair = true
      skipFlowSpace(indent)
      ch = src.charCodeAt(pos)
      if (ch !== COMMA && ch !== close) value = parseFlowNode(indent)
      skipFlowSpace(indent)
      ch = src.charCodeAt(pos)
    }
    if (isMap) setKey(result as Record<string, unknown>, key, value)
    else if (pair) {
      const entry = {}
      setKey(entry, key, value)
      ;(result as unknown[]).push(entry)
    } else (result as unknown[]).push(key)
    if (ch === COMMA) pos++
    else if (ch !== close) fail('missed comma between flow collection entries')
  }
  plain = false
  depth--
  return result
}

function parseFlowNode(indent: number): unknown {
  const props = parseProps()
  if (props && skipFlowSpace(indent) && leadingSpaces() <= Math.max(indent, 0)) fail('missed comma between flow collection entries')
  const ch = src.charCodeAt(pos)
  let value: unknown
  let isScalar = true
  if (ch === LBRACKET || ch === LBRACE) {
    value = parseFlowCollection(indent)
    isScalar = false
  } else if (ch === STAR) {
    if (props) fail('alias node should not have any properties')
    value = parseAlias()
    isScalar = false
  } else if (ch === QUOTE || ch === DQUOTE) value = parseQuoted(indent)
  else if (
    props &&
    (ch === COMMA || ch === RBRACKET || ch === RBRACE ||
      (ch === COLON && (isBlank(src.charCodeAt(pos + 1)) || isFlowIndicator(src.charCodeAt(pos + 1)))))
  ) {
    value = ''
    plain = true
  } else value = parsePlain(indent, true, true)
  if (isScalar && (value !== '' || !plain)) leaf()
  const wasPlain = plain
  const result = applyProps(isScalar && plain && !props?.tag ? resolvePlain(value as string) : value, props, isScalar)
  plain = wasPlain
  return result
}
