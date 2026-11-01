// esprima.tokenize(code, { comment: true, loc: true }), which is all that
// comment-json asks of esprima, with a fast path for JSON with comments:
// double-quoted strings without escapes, JSON numbers, true, false, null,
// punctuation, and line and block comments between spaces, tabs and line
// breaks. It builds the tokens esprima builds, keys in the same order. On
// anything else it hands the whole text to esprima, which also throws its
// errors.
import * as esprima from './esprima.js'

const PUNCTUATION = '{}[],:-'

const point = (line, column) => ({line, column})

export const tokenize = code => {
  if (typeof code === 'string') {
    const tokens = fast(code)
    if (tokens) {
      return tokens
    }
  }

  return esprima.tokenize(code, {
    comment: true,
    loc: true
  })
}

const fast = code => {
  const tokens = []
  const length = code.length
  let index = 0
  let line = 1
  let lineStart = 0

  while (index < length) {
    const c = code.charCodeAt(index)

    // Whitespace and line breaks, which esprima counts the same way.
    if (c === 32 || c === 9) {
      index ++
      continue
    }

    if (c === 10 || c === 13) {
      index ++
      if (c === 13 && code.charCodeAt(index) === 10) {
        index ++
      }

      line ++
      lineStart = index
      continue
    }

    const start = point(line, index - lineStart)
    const from = index

    if (c === 47) {
      const next = code.charCodeAt(index + 1)
      if (next === 47) {
        index += 2
        while (index < length) {
          const d = code.charCodeAt(index)
          if (d === 10 || d === 13) {
            break
          }

          if (d === 0x2028 || d === 0x2029) {
            return null
          }

          index ++
        }

        tokens.push({
          type: 'LineComment',
          value: code.slice(from + 2, index),
          loc: {
            start,
            end: point(line, index - lineStart)
          }
        })
        continue
      }

      if (next === 42) {
        index += 2
        for (;;) {
          if (index >= length) {
            return null
          }

          const d = code.charCodeAt(index)
          if (d === 42 && code.charCodeAt(index + 1) === 47) {
            break
          }

          if (d === 0x2028 || d === 0x2029) {
            return null
          }

          index ++
          if (d === 10 || d === 13) {
            if (d === 13 && code.charCodeAt(index) === 10) {
              index ++
            }

            line ++
            lineStart = index
          }
        }

        const value = code.slice(from + 2, index)
        index += 2
        tokens.push({
          type: 'BlockComment',
          value,
          loc: {
            start,
            end: point(line, index - lineStart)
          }
        })
        continue
      }

      return null
    }

    let type
    if (c === 34) {
      // Up to the closing quote, with no escape, line break, or line or paragraph separator.
      index ++
      for (;;) {
        const d = code.charCodeAt(index)
        if (d === 34) {
          break
        }

        if (d !== d || d === 92 || d === 10 || d === 13 || d === 0x2028 || d === 0x2029) {
          return null
        }

        index ++
      }

      index ++
      type = 'String'
    } else if (c >= 48 && c <= 57) {
      // A JSON number: no leading zero before a digit, a fraction, an exponent.
      index ++
      if (c === 48) {
        const d = code.charCodeAt(index)
        if (d >= 48 && d <= 57) {
          return null
        }
      } else {
        index = digits(code, index)
      }

      if (code.charCodeAt(index) === 46) {
        const end = digits(code, index + 1)
        if (end === index + 1) {
          return null
        }

        index = end
      }

      const e = code.charCodeAt(index)
      if (e === 101 || e === 69) {
        let at = index + 1
        const sign = code.charCodeAt(at)
        if (sign === 43 || sign === 45) {
          at ++
        }

        const end = digits(code, at)
        if (end === at) {
          return null
        }

        index = end
      }

      type = 'Numeric'
    } else if (PUNCTUATION.includes(code[index])) {
      // esprima reads "--" and "-=" as one punctuator.
      if (c === 45) {
        const d = code.charCodeAt(index + 1)
        if (d === 45 || d === 61) {
          return null
        }
      }

      index ++
      type = 'Punctuator'
    } else {
      const word = code.startsWith('true', index) || code.startsWith('null', index)
        ? 4
        : code.startsWith('false', index)
          ? 5
          : 0
      if (!word) {
        return null
      }

      index += word
      type = code.charCodeAt(from) === 110
        ? 'Null'
        : 'Boolean'
    }

    // A word or number must end where esprima's would: before anything but
    // punctuation, whitespace, a line break, a quote or a slash.
    if (type !== 'Punctuator' && type !== 'String') {
      const d = code.charCodeAt(index)
      if (
        index < length
        && !(PUNCTUATION.includes(code[index]) || d === 32 || d === 9 || d === 10 || d === 13 || d === 34 || d === 47)
      ) {
        return null
      }
    }

    tokens.push({
      type,
      value: code.slice(from, index),
      loc: {
        start,
        end: point(line, index - lineStart)
      }
    })
  }

  return tokens
}

const digits = (code, index) => {
  for (;;) {
    const d = code.charCodeAt(index)
    // At the end, d is NaN, which no comparison holds for.
    if (!(d >= 48 && d <= 57)) {
      return index
    }

    index ++
  }
}
