// The two calls of Node's assert that jju's document.js makes, for its own
// invariants, which a reviver can break through update(). On Node (22.3 and
// later have process.getBuiltinModule; the package needs 22.12) this is
// Node's assert, as jju requires it; elsewhere a stand-in throws an error
// with its name, code, actual, expected and operator, and a shorter message.
const failure = (actual, expected) => Object.assign(new Error(`${actual} == ${expected}`), {
  name: 'AssertionError', code: 'ERR_ASSERTION', actual, expected, operator: '=='
})

function standIn(value) {
  if (!value) throw failure(value, true)
}

standIn.equal = (actual, expected) => {
  // eslint-disable-next-line eqeqeq
  if (actual != expected) throw failure(actual, expected)
}

export const assert = globalThis.process?.getBuiltinModule?.('node:assert') ?? standIn
