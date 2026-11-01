// tinyjson5: the built-ins the faster paths call where comment-json and
// esprima don't, or not as often, which only the engine's own make
// unobservable. Each is kept as it was at load, if it was the engine's own
// then, and `untouched` tells whether a global is still that one, from its
// own descriptor, without calling a getter. Otherwise the faster paths step
// aside for comment-json's own.
const {apply, getOwnPropertyDescriptor: descriptor_of} = Reflect
const {hasOwn: has_own} = Object
const to_source = Function.prototype.toString
const {call, bind} = Function.prototype
const NATIVE = /^function [\w$]*\(\) \{\s*\[native code\]\s*\}$/

const native = fn => {
  try {
    return typeof fn === 'function' && NATIVE.test(apply(to_source, fn, []))
  } catch {
    return false
  }
}

// [object, key] pairs, read once here at load.
const PAIRS = [
  [Symbol, 'for'],
  [Symbol, 'keyFor'],
  [Object, 'getOwnPropertySymbols'],
  [Object, 'getOwnPropertyDescriptor'],
  [Object, 'getPrototypeOf'],
  [Object, 'create'],
  [Object, 'hasOwn'],
  [Reflect, 'apply'],
  [Reflect, 'getOwnPropertyDescriptor'],
  [Map.prototype, 'get'],
  [Map.prototype, 'set'],
  [String.prototype, 'charCodeAt'],
  [String.prototype, 'slice'],
  [Array.prototype, 'push']
]
const values = PAIRS.map(([object, key]) => object[key])
const ALL_NATIVE = native(Map) && native(apply) && native(descriptor_of) && native(has_own) && native(call) && native(bind)
  && values.every(native) && NATIVE.test(apply(to_source, to_source, []))

// Whether object[key] is still the engine's own it was at load: an own data
// property holding the same function.
export const untouched = (object, key) => {
  if (!ALL_NATIVE) {
    return false
  }

  for (let i = 0; i < PAIRS.length; i ++) {
    if (PAIRS[i][0] === object && PAIRS[i][1] === key) {
      const descriptor = descriptor_of(object, key)
      return descriptor !== undefined && has_own(descriptor, 'value') && descriptor.value === values[i]
    }
  }

  return false
}

// fn as a function of its this and arguments, uncurry(fn)(object, ...args),
// which looks nothing up on Function.prototype again when called.
export const uncurry = fn => apply(bind, call, [fn])

export {has_own}
