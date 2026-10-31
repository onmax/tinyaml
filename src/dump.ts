// Writes JS values straight to YAML text, matching js-yaml's `dump` with
// `lineWidth: -1` byte for byte. js-yaml builds an AST first and then picks
// each scalar's style; this does both in one walk.

import { YAMLException } from './error.ts'

export interface DumpOptions {
  /** Spaces per indentation level. Default 2. */
  indent?: number
  /** Repeat shared objects instead of writing `&ref_N` anchors and aliases. */
  noRefs?: boolean
  /** Skip functions, symbols and other values YAML can't represent instead of throwing. */
  skipInvalid?: boolean
  /** Sort mapping keys, with string comparison or the given function. */
  sortKeys?: boolean | ((a: string, b: string) => number)
  /** Only `-1` (never fold long lines) is supported; it is also the default. */
  lineWidth?: -1
}

const NS = '[\\x21-\\x7E\\x85\\xA0-\\uD7FF\\uE000-\\uFEFE\\uFF00-\\uFFFD\\u{10000}-\\u{10FFFF}]'
const PLAIN_CHAR = `(?:(?![:#])${NS}|:(?=${NS}))#*`
const PLAIN_LINE = `(?:(?![-?:,\\[\\]{}#&*!|>'"%@\`])${NS}|[?:-](?=${NS}))#*(?:[ \\t]*${PLAIN_CHAR})*`
// Multi-line strings never reach the plain check, so one line is enough.
const PLAIN = new RegExp(`^${PLAIN_LINE}$`, 'u')
const SINGLE = /^[\t\x20-\uD7FF\uE000-\uFFFF\u{10000}-\u{10FFFF}]*$/u
const BLOCK = /^[\t\n\x20-\x7E\x85\xA0-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]*$/u
const INVISIBLE = /[\t\x7F-\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF]/
const ESCAPE = /["\\\x00-\x1F\x7F-\xA0\u2028\u2029\uD800-\uDFFF\uFEFF\uFFFE\uFFFF]/gu
const ESCAPES: Record<string, string> = {
  '\0': '0', '\x07': 'a', '\b': 'b', '\t': 't', '\n': 'n', '\v': 'v', '\f': 'f', '\r': 'r', '\x1B': 'e',
  '"': '"', '\\': '\\', '\x85': 'N', '\xA0': '_', '\u2028': 'L', '\u2029': 'P',
}

// Plain strings js-yaml's dump schema (YAML 1.1 plus core) would read back as
// something other than a string.
const NULL_OR_BOOL = /^(?:~|null|Null|NULL|[yYnN]|yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|<<)?$/
const INT = /^(?:[-+]?0b[01_]+|[-+]?0[0-7_]+|[-+]?0x[\da-fA-F_]+|[-+]?(?:0|[1-9][\d_]*)|0o[0-7]+|0x[\da-fA-F]+|[-+]?\d+)$/
const SEXAGESIMAL = /^[-+]?\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?$/
const FLOAT = /^(?:[-+]?(?:[\d][\d_]*)?\.[\d_]*(?:[eE][-+]\d+)?|[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|[-+]?\.\d+(?:[eE][-+]?\d+)?)$/
const SPECIAL_FLOAT = /^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/
const DATE = /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.\d*)?(?:[ \t]*(?:Z|[-+](\d\d?)(?::(\d\d))?))?)?$/
const FORBIDDEN_START = /^(?:---|\.\.\.)(?=$|[ \t\n\r])/

let indent = 2
let skipInvalid = false
let sortKeys: DumpOptions['sortKeys'] = false
let refs: Map<object, string | undefined> | undefined
let emitted = new Set<object>()
let openEnded = false

export function dump(input: unknown, options: DumpOptions = {}): string {
  indent = options.indent ?? 2
  skipInvalid = options.skipInvalid ?? false
  sortKeys = options.sortKeys ?? false
  emitted = new Set()
  openEnded = false
  refs = undefined
  if (!options.noRefs) {
    refs = new Map()
    let counter = 0
    const visit = (value: unknown): void => {
      if (typeof value !== 'object' || value === null) return
      if (refs!.has(value)) {
        if (refs!.get(value) === undefined) refs!.set(value, `ref_${counter++}`)
      } else if (Array.isArray(value)) {
        refs!.set(value, undefined)
        value.forEach(visit)
      } else if (isPlainObject(value)) {
        refs!.set(value, undefined)
        for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key])
      }
    }
    visit(input)
  }
  const body = write(input, 0, true, true)
  refs = undefined
  emitted = new Set()
  if (body === undefined) return ''
  return openEnded ? `${body}\n...\n` : `${body}\n`
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

// undefined is always dropped; other unrepresentable values throw unless
// `skipInvalid` is set.
function isValid(value: unknown): boolean {
  if (value === undefined) return false
  const type = typeof value
  if (
    type === 'string' || type === 'number' || type === 'boolean' || value === null || Array.isArray(value) ||
    value instanceof Date || value instanceof Uint8Array || (type === 'object' && isPlainObject(value as object))
  ) {
    return true
  }
  if (skipInvalid) return false
  throw new YAMLException(`unacceptable kind of an object to dump ${Object.prototype.toString.call(value)}`)
}

function newline(level: number): string {
  return `\n${' '.repeat(indent * level)}`
}

function write(value: unknown, level: number, block: boolean, compact: boolean): string | undefined {
  if (!isValid(value)) return undefined
  if (typeof value === 'string') return writeString(value, level, false, !block)
  openEnded = false
  if (value === null) return 'null'
  if (typeof value === 'number') return writeNumber(value)
  if (typeof value !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array) {
    const base64 = btoa(String.fromCharCode(...value))
    return base64 ? `!!binary ${base64}` : '!!binary'
  }

  const anchor = refs?.get(value)
  if (anchor !== undefined) {
    if (emitted.has(value)) return `*${anchor}`
    emitted.add(value)
    compact = false
  }
  if (indent < 2 && level > 0) compact = false
  let body = ''
  let flowBody = false
  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? null : item)).filter(isValid)
    flowBody = !block || !items.length
    if (flowBody) body = '[]'
    else {
      for (const item of items) {
        const text = write(item, level + 1, true, true)!
        if (!compact || body) body += newline(level)
        body += text === '' || text.charCodeAt(0) === 10 ? '-' : '- '
        body += text
      }
    }
  } else {
    const map = value as Record<string, unknown>
    const keys = Object.keys(map).filter((key) => isValid(map[key]))
    if (sortKeys) keys.sort(sortKeys === true ? undefined : sortKeys)
    flowBody = !block || !keys.length
    if (flowBody) body = '{}'
    else {
      for (const key of keys) {
        if (!compact || body) body += newline(level)
        const keyText = writeString(key, level + 1, true, false)
        const explicit = key.includes('\n') || (keyText.length > 1024 && [...keyText].length > 1024)
        body += explicit ? `? ${keyText}${newline(level)}` : keyText
        const text = write(map[key], level + 1, true, explicit)!
        body += text === '' || text.charCodeAt(0) === 10 ? ':' : ': '
        body += text
      }
    }
  }
  if (flowBody) openEnded = false
  else if (compact && level > 0 && indent > 2) body = ' '.repeat(indent - 2) + body
  if (anchor === undefined) return body
  return `&${anchor}${body.charCodeAt(0) === 10 ? '' : ' '}${body}`
}

function writeNumber(value: number): string {
  if (Number.isInteger(value) && !Object.is(value, -0) && !String(value).includes('e')) return String(value)
  if (value !== value) return '.nan'
  if (value === Infinity) return '.inf'
  if (value === -Infinity) return '-.inf'
  if (Object.is(value, -0)) return '-0.0'
  const text = String(value)
  return /^[-+]?\d+e/.test(text) ? text.replace('e', '.e') : text
}

function isAmbiguous(text: string): boolean {
  if (NULL_OR_BOOL.test(text)) return true
  const ch = text.charCodeAt(0)
  if (ch !== 43 && ch !== 45 && ch !== 46 && (ch < 48 || ch > 57)) return false
  if (SPECIAL_FLOAT.test(text) || SEXAGESIMAL.test(text)) return true
  if (INT.test(text) && isFinite(Number(text.replace(/^[-+]|_/g, '')))) return true
  if (FLOAT.test(text) && isFinite(Number.parseFloat(text.replace(/_/g, '')))) return true
  const date = DATE.exec(text)
  if (!date) return false
  const [, y, m, d, h, min, s, offH, offM] = date
  if (h === undefined ? m!.length < 2 || d!.length < 2 : +h > 23 || +min! > 59 || +s! > 59 || +(offH ?? 0) > 23 || +(offM ?? 0) > 59) {
    return false
  }
  const utc = new Date(0)
  utc.setUTCFullYear(+y!, +m! - 1, +d!)
  return utc.getUTCMonth() === +m! - 1 && utc.getUTCDate() === +d!
}

function writeString(text: string, level: number, isKey: boolean, flow: boolean): string {
  openEnded = false
  if (INVISIBLE.test(text) || /^\s+$/.test(text)) return writeDouble(text)
  const shift = indent * Math.max(1, level)
  if (!isKey && text.includes('\n')) {
    if (flow || !BLOCK.test(text) || (shift - (level === 0 ? -1 : indent * (level - 1)) > 9 && /^\n* /.test(text))) {
      return writeDouble(text)
    }
    const header = /^\n* /.test(text) ? String(level === 0 ? indent + 1 : indent) : ''
    const keep = text.endsWith('\n\n') || text === '\n'
    const chomp = text.endsWith('\n') ? (keep ? '+' : '') : '-'
    openEnded = keep
    const pad = ' '.repeat(shift)
    const body = text.replace(/^(?=.)/gm, pad)
    return `|${header}${chomp}\n${body.endsWith('\n') ? body.slice(0, -1) : body}`
  }
  if (
    text !== '' && text !== '=' && PLAIN.test(text) &&
    !(level === 0 && FORBIDDEN_START.test(text)) && !isAmbiguous(text)
  ) {
    return text
  }
  if (SINGLE.test(text) && !/[ \t]\n|\n[ \t]/.test(text)) return `'${text.replace(/'/g, "''")}'`
  return writeDouble(text)
}

function writeDouble(text: string): string {
  return `"${text.replace(ESCAPE, (ch) => {
    const short = ESCAPES[ch]
    if (short) return `\\${short}`
    const code = ch.charCodeAt(0)
    const hex = code.toString(16).toUpperCase()
    return code <= 255 ? `\\x${hex.padStart(2, '0')}` : `\\u${hex.padStart(4, '0')}`
  })}"`
}
