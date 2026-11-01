// The two calls of Node's assert that jju's document.js makes, for its own
// invariants, without Node's assert.
export function assert(value) {
  if (!value) throw failure(`${String(value)} == true`)
}

assert.equal = (actual, expected) => {
  // eslint-disable-next-line eqeqeq
  if (actual != expected) throw failure(`${String(actual)} == ${String(expected)}`)
}

function failure(message) {
  const error = new Error(message)
  error.name = 'AssertionError'
  error.code = 'ERR_ASSERTION'
  return error
}
