// tinyjson5: the built-ins the faster paths call where comment-json and
// esprima don't, or not as often, which only the engine's own make
// unobservable. Each is read from its own property descriptor, starting from
// globalThis, so no getter runs, and kept only if it was the engine's own
// built-in of that name at load and does its own job on a known input.
// `untouched(object, key)` says whether a built-in is still that one, the
// same way. Otherwise the faster paths step aside for comment-json's own.
//
// What this reads before it can check anything is trusted: the globalThis
// and Object bindings, Object.getOwnPropertyDescriptor, which reads the rest,
// and Reflect.apply and Function.prototype.toString, which the check calls.
// A program that replaces one of those before this module loads can make
// anything look like a built-in.
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

const GLOBAL = globalThis
const prototype = name => own(own(GLOBAL, name), 'prototype')
const ObjectCtor = own(GLOBAL, 'Object')
const SymbolCtor = own(GLOBAL, 'Symbol')
const MapCtor = own(GLOBAL, 'Map')
const ReflectObject = own(GLOBAL, 'Reflect')
const object_prototype = prototype('Object')
const array_prototype = prototype('Array')
const string_prototype = prototype('String')
const number_prototype = prototype('Number')
const function_prototype = prototype('Function')
const map_prototype = prototype('Map')
const apply = own(ReflectObject, 'apply')
const to_source = own(function_prototype, 'toString')

// [object, key] for each built-in kept here, and its value at load.
const PAIRS = [
  [SymbolCtor, 'for'],
  [SymbolCtor, 'keyFor'],
  [ObjectCtor, 'getOwnPropertySymbols'],
  [ObjectCtor, 'getPrototypeOf'],
  [ObjectCtor, 'create'],
  [function_prototype, 'call'],
  [function_prototype, 'bind'],
  [map_prototype, 'get'],
  [map_prototype, 'set'],
  [string_prototype, 'charCodeAt'],
  [string_prototype, 'slice'],
  [array_prototype, 'push']
]
const VALUES = {__proto__: null}
for (let i = 0; i < PAIRS.length; i ++) {
  VALUES[i] = own(PAIRS[i][0], PAIRS[i][1])
}

// Whether fn is the engine's own function of that name, which no bound
// function or user function prints as.
const native = (fn, name) => {
  try {
    return typeof fn === 'function' && apply(to_source, fn, []) === `function ${name}() { [native code] }`
  } catch {
    return false
  }
}

// Whether each kept built-in does its own job, which another built-in of the
// same name put in its place (WeakMap's get on Map.prototype, Array's slice
// on String.prototype, Reflect's getPrototypeOf on Object) doesn't. Every
// receiver is made here, without a prototype to inherit an accessor from.
const behaves = () => {
  const symbol = apply(VALUES[0], SymbolCtor, ['tinyjson5'])
  if (typeof symbol !== 'symbol' || apply(VALUES[1], SymbolCtor, [symbol]) !== 'tinyjson5') {
    return false
  }

  const symbols = apply(VALUES[2], ObjectCtor, [{__proto__: null, [symbol]: 1}])
  const map = new MapCtor()
  const key = {__proto__: null}
  const list = {__proto__: null, length: 0}
  return symbols.length === 1 && symbols[0] === symbol
    && apply(VALUES[3], ObjectCtor, [1]) === number_prototype
    && apply(VALUES[3], ObjectCtor, [apply(VALUES[4], ObjectCtor, [null])]) === null
    && apply(apply(VALUES[6], VALUES[5], [VALUES[10]]), undefined, ['abc', 1, 2]) === 'b'
    && apply(VALUES[8], map, [key, list]) === map
    && apply(VALUES[7], map, [key]) === list
    && apply(VALUES[9], 'ab', [1]) === 98
    && apply(VALUES[11], list, [1]) === 1 && list.length === 1 && list[0] === 1
}

const check = () => {
  if (
    !native(to_source, 'toString') || !native(apply, 'apply')
    || !native(descriptor_of, 'getOwnPropertyDescriptor') || !native(MapCtor, 'Map')
    || own(map_prototype, 'constructor') !== MapCtor
  ) {
    return false
  }

  for (let i = 0; i < PAIRS.length; i ++) {
    if (!native(VALUES[i], PAIRS[i][1])) {
      return false
    }
  }

  return behaves()
}

let all_native = false
try {
  all_native = check()
} catch {}

const kept = i => all_native ? VALUES[i] : undefined

// fn as a function of its this and arguments, uncurry(fn)(object, ...args),
// which looks nothing up on Function.prototype when called.
const uncurry = fn => fn === undefined
  ? undefined
  : apply(VALUES[6], VALUES[5], [fn])

export const symbol_for = kept(0)
export const key_for = kept(1)
export const own_symbols = kept(2)
export const prototype_of = kept(3)
export const create = kept(4)
export const HostMap = all_native ? MapCtor : undefined
export const map_get = uncurry(kept(7))
export const map_set = uncurry(kept(8))

// Whether object[key] is still the built-in kept for it.
export const untouched = (object, key) => {
  if (!all_native) {
    return false
  }

  for (let i = 0; i < PAIRS.length; i ++) {
    if (PAIRS[i][0] === object && PAIRS[i][1] === key) {
      return own(object, key) === VALUES[i]
    }
  }

  return false
}

export {
  descriptor_of,
  own,
  object_prototype,
  array_prototype,
  string_prototype,
  SymbolCtor
}
