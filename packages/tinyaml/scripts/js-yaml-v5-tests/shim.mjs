// tinyaml/js-yaml-v5, plus stand-ins for the js-yaml 5 API it doesn't include
// (events, AST, presenter, visit), so test files that import them still
// load. The constants are js-yaml 5's own; the functions throw, and the
// tests that call them fail with UNSUPPORTED in the message.
import * as real from "../../.cache/js-yaml/dist/js-yaml.mjs";

export * from "../../src/js-yaml-v5/index.ts";

const unsupported = (name) => () => {
  throw new Error(`UNSUPPORTED: ${name} is not part of tinyaml/js-yaml-v5`);
};

export const {
  CHOMPING_CLIP,
  CHOMPING_KEEP,
  CHOMPING_MODE,
  CHOMPING_STRIP,
  COLLECTION_STYLE_BLOCK,
  COLLECTION_STYLE_FLOW,
  EVENT_ALIAS,
  EVENT_DOCUMENT,
  EVENT_ID,
  EVENT_MAPPING,
  EVENT_POP,
  EVENT_SCALAR,
  EVENT_SEQUENCE,
  SCALAR_STYLE_DOUBLE_QUOTED,
  SCALAR_STYLE_FOLDED_BLOCK,
  SCALAR_STYLE_LITERAL_BLOCK,
  SCALAR_STYLE_PLAIN,
  SCALAR_STYLE_SINGLE_QUOTED,
  VISIT_BREAK,
  VISIT_SKIP,
} = real;
export const parseEvents = unsupported("parseEvents");
export const getScalarValue = unsupported("getScalarValue");
export const constructFromEvents = unsupported("constructFromEvents");
export const eventsToAst = unsupported("eventsToAst");
export const jsToAst = unsupported("jsToAst");
export const present = unsupported("present");
export const visit = unsupported("visit");
