// tinyjson5: the built-ins the faster paths call where comment-json and
// esprima don't, or not as often, which only the engine's own make
// unobservable. Each is read from its own property descriptor, so no getter
// runs, and kept only if it was the engine's own built-in of that name at
// load. `untouched(object, key)` says whether a global is still that one, the
// same way. Otherwise the faster paths step aside for comment-json's own.
//
// Object.getOwnPropertyDescriptor is the one read directly. A program that
// replaces it, or Function.prototype.toString, before this module loads can
// make anything look like a built-in: that's outside what this checks.
const descriptor_of = Object.getOwnPropertyDescriptor

// object[key] if it's an own data property, read without running a getter.
const own = (object, key) => {
  try {
    const descriptor = descriptor_of(object, key)
    const value = descriptor && descriptor_of(descriptor, 'value')
    return value ? value.value : undefined
  } catch {
    return undefined
  }
}

const to_source = own(Function.prototype, 'toString')
const apply = own(Reflect, 'apply')

// Whether fn is the engine's own function of that name, which no bound
// function or user function prints as.
const native = (fn, name) => {
  try {
    return typeof fn === 'function' && apply(to_source, fn, []) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}

// [object, key] for each built-in kept here.
const PAIRS = [
  [Symbol, 'for'],
  [Symbol, 'keyFor'],
  [Object, 'getOwnPropertySymbols'],
  [Object, 'getPrototypeOf'],
  [Object, 'create'],
  [Function.prototype, 'call'],
  [Function.prototype, 'bind'],
  [Map.prototype, 'get'],
  [Map.prototype, 'set'],
  [String.prototype, 'charCodeAt'],
  [String.prototype, 'slice'],
  [Array.prototype, 'push']
]
const VALUES = PAIRS.map(([object, key]) => own(object, key))
const ALL_NATIVE = native(to_source, 'toString') && native(apply, 'apply')
  && native(descriptor_of, 'getOwnPropertyDescriptor') && native(own(globalThis, 'Map'), 'Map')
  && PAIRS.every(([, key], i) => native(VALUES[i], key))

// The built-in kept for object[key], or undefined if there is none.
export const builtin = (object, key) => {
  if (ALL_NATIVE)
    for (let i = 0; i < PAIRS.length; i ++)
      if (PAIRS[i][0] === object && PAIRS[i][1] === key) return VALUES[i]
  return undefined
}

// Whether object[key] is still the built-in kept for it.
export const untouched = (object, key) => {
  const value = builtin(object, key)
  return value !== undefined && own(object, key) === value
}

// fn as a function of its this and arguments, uncurry(fn)(object, ...args),
// which looks nothing up on Function.prototype when called.
export const uncurry = fn => ALL_NATIVE
  ? apply(builtin(Function.prototype, 'bind'), builtin(Function.prototype, 'call'), [fn])
  : undefined

export {descriptor_of, own}
