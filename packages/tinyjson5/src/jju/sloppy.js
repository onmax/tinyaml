// tinyjson5: an assignment and a delete as jju's sloppy-mode code makes them,
// which fail silently where these strict modules would throw. On a primitive,
// as there, a setter its prototype has runs with the primitive as this. Each
// is a sloppy-mode function made once from a string, which runs at the speed
// of a plain assignment; where code can't be made from strings (a
// Content-Security-Policy, Node's --disallow-code-generation-from-strings),
// Reflect does the same, more slowly.
let set
let remove
try {
  set = Function('object', 'key', 'value', 'object[key] = value')
  remove = Function('object', 'key', 'delete object[key]')
} catch {}

export function sloppySet(object, key, value) {
  if (set) set(object, key, value)
  else if (object === null || object === undefined) object[key] = value
  else Reflect.set(Object(object), key, value, object)
}

export function sloppyDelete(object, key) {
  if (remove) remove(object, key)
  else if (object === null || object === undefined) delete object[key]
  else Reflect.deleteProperty(Object(object), key)
}
