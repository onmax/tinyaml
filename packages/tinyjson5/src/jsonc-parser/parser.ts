// jsonc-parser 3.3.1's parser (MIT, Copyright (c) Microsoft Corporation):
// `visit` with its error recovery, and `parse`, `parseTree` and
// `getLocation` on top of it, with the same values, errors and callbacks.
// Token kinds and errors are the numbers of its SyntaxKind and
// ParseErrorCode, noted inline.
import type {
  JSONPath,
  JSONVisitor,
  Location,
  Node,
  NodeType,
  ParseError,
  ParseErrorCode,
  ParseOptions,
  Segment,
} from "./index.ts";
import { createScanner } from "./scanner.ts";

interface NodeImpl extends Node {
  type: NodeType;
  value?: any;
  offset: number;
  length: number;
  colonOffset?: number;
  parent?: NodeImpl;
  children?: NodeImpl[];
}

const DEFAULT: ParseOptions = { allowTrailingComma: false };

/** For a given offset, evaluates the location in the JSON document. */
export function getLocation(text: string, position: number): Location {
  const segments: Segment[] = [];
  const earlyReturnException = new Object();
  let previousNode: NodeImpl | undefined = undefined;
  const previousNodeInst: NodeImpl = {
    value: {},
    offset: 0,
    length: 0,
    type: "object",
    parent: undefined,
  };
  let isAtPropertyKey = false;
  function setPreviousNode(value: string, offset: number, length: number, type: NodeType) {
    previousNodeInst.value = value;
    previousNodeInst.offset = offset;
    previousNodeInst.length = length;
    previousNodeInst.type = type;
    previousNodeInst.colonOffset = undefined;
    previousNode = previousNodeInst;
  }
  try {
    walk(
      text,
      {
        onObjectBegin: (offset: number) => {
          if (position <= offset) throw earlyReturnException;
          previousNode = undefined;
          isAtPropertyKey = position > offset;
          segments.push("");
        },
        onObjectProperty: (name: string, offset: number, length: number) => {
          if (position < offset) throw earlyReturnException;
          setPreviousNode(name, offset, length, "property");
          segments[segments.length - 1] = name;
          if (position <= offset + length) throw earlyReturnException;
        },
        onObjectEnd: (offset: number) => {
          if (position <= offset) throw earlyReturnException;
          previousNode = undefined;
          segments.pop();
        },
        onArrayBegin: (offset: number) => {
          if (position <= offset) throw earlyReturnException;
          previousNode = undefined;
          segments.push(0);
        },
        onArrayEnd: (offset: number) => {
          if (position <= offset) throw earlyReturnException;
          previousNode = undefined;
          segments.pop();
        },
        onLiteralValue: (value: any, offset: number, length: number) => {
          if (position < offset) throw earlyReturnException;
          setPreviousNode(value, offset, length, getNodeType(value));
          if (position <= offset + length) throw earlyReturnException;
        },
        onSeparator: (sep: string, offset: number) => {
          if (position <= offset) throw earlyReturnException;
          if (sep === ":" && previousNode && previousNode.type === "property") {
            previousNode.colonOffset = offset;
            isAtPropertyKey = false;
            previousNode = undefined;
          } else if (sep === ",") {
            const last = segments[segments.length - 1];
            if (typeof last === "number") segments[segments.length - 1] = last + 1;
            else {
              isAtPropertyKey = true;
              segments[segments.length - 1] = "";
            }
            previousNode = undefined;
          }
        },
      },
      DEFAULT,
      true,
    );
  } catch (e) {
    if (e !== earlyReturnException) throw e;
  }
  return {
    path: segments,
    previousNode,
    isAtPropertyKey,
    matches: (pattern: Segment[]) => {
      let k = 0;
      for (let i = 0; k < pattern.length && i < segments.length; i++) {
        if (pattern[k] === segments[i] || pattern[k] === "*") k++;
        else if (pattern[k] !== "**") return false;
      }
      return k === pattern.length;
    },
  };
}

/** Parses the text, as fault-tolerantly as it can, and returns the value it holds. */
export function parse(
  text: string,
  errors: ParseError[] = [],
  options: ParseOptions = DEFAULT,
): any {
  let currentProperty: string | null = null;
  let currentParent: any = [];
  const previousParents: any[] = [];
  // Assigned, as jsonc-parser does: "__proto__" sets the prototype.
  function onValue(value: unknown) {
    if (Array.isArray(currentParent)) currentParent.push(value);
    else if (currentProperty !== null) currentParent[currentProperty] = value;
  }
  walk(
    text,
    {
      onObjectBegin: () => {
        const object = {};
        onValue(object);
        previousParents.push(currentParent);
        currentParent = object;
        currentProperty = null;
      },
      onObjectProperty: (name: string) => {
        currentProperty = name;
      },
      onObjectEnd: () => {
        currentParent = previousParents.pop();
      },
      onArrayBegin: () => {
        const array: unknown[] = [];
        onValue(array);
        previousParents.push(currentParent);
        currentParent = array;
        currentProperty = null;
      },
      onArrayEnd: () => {
        currentParent = previousParents.pop();
      },
      onLiteralValue: onValue,
      onError: (error: ParseErrorCode, offset: number, length: number) => {
        errors.push({ error, offset, length });
      },
    },
    options,
    true,
  );
  return currentParent[0];
}

/** Parses the text, as fault-tolerantly as it can, into a tree of nodes. */
export function parseTree(
  text: string,
  errors: ParseError[] = [],
  options: ParseOptions = DEFAULT,
): Node | undefined {
  // An artificial root.
  let currentParent: NodeImpl = {
    type: "array",
    offset: -1,
    length: -1,
    children: [],
    parent: undefined,
  };
  function ensurePropertyComplete(endOffset: number) {
    if (currentParent.type === "property") {
      currentParent.length = endOffset - currentParent.offset;
      currentParent = currentParent.parent!;
    }
  }
  function onValue(valueNode: NodeImpl): NodeImpl {
    currentParent.children!.push(valueNode);
    return valueNode;
  }
  walk(
    text,
    {
      onObjectBegin: (offset: number) => {
        currentParent = onValue({
          type: "object",
          offset,
          length: -1,
          parent: currentParent,
          children: [],
        });
      },
      onObjectProperty: (name: string, offset: number, length: number) => {
        currentParent = onValue({
          type: "property",
          offset,
          length: -1,
          parent: currentParent,
          children: [],
        });
        currentParent.children!.push({
          type: "string",
          value: name,
          offset,
          length,
          parent: currentParent,
        });
      },
      onObjectEnd: (offset: number, length: number) => {
        // In case a property's value is missing, it ends here.
        ensurePropertyComplete(offset + length);
        currentParent.length = offset + length - currentParent.offset;
        currentParent = currentParent.parent!;
        ensurePropertyComplete(offset + length);
      },
      onArrayBegin: (offset: number) => {
        currentParent = onValue({
          type: "array",
          offset,
          length: -1,
          parent: currentParent,
          children: [],
        });
      },
      onArrayEnd: (offset: number, length: number) => {
        currentParent.length = offset + length - currentParent.offset;
        currentParent = currentParent.parent!;
        ensurePropertyComplete(offset + length);
      },
      onLiteralValue: (value: any, offset: number, length: number) => {
        onValue({ type: getNodeType(value), offset, length, parent: currentParent, value });
        ensurePropertyComplete(offset + length);
      },
      onSeparator: (sep: string, offset: number) => {
        if (currentParent.type === "property") {
          if (sep === ":") currentParent.colonOffset = offset;
          else if (sep === ",") ensurePropertyComplete(offset);
        }
      },
      onError: (error: ParseErrorCode, offset: number, length: number) => {
        errors.push({ error, offset, length });
      },
    },
    options,
    true,
  );
  const result = currentParent.children![0];
  if (result) delete result.parent;
  return result;
}

/** Finds the node at the given path in a tree. */
export function findNodeAtLocation(root: Node | undefined, path: JSONPath): Node | undefined {
  if (!root) return undefined;
  let node = root;
  for (const segment of path) {
    if (typeof segment === "string") {
      if (node.type !== "object" || !Array.isArray(node.children)) return undefined;
      let found = false;
      for (const propertyNode of node.children) {
        if (
          Array.isArray(propertyNode.children) &&
          propertyNode.children[0]!.value === segment &&
          propertyNode.children.length === 2
        ) {
          node = propertyNode.children[1]!;
          found = true;
          break;
        }
      }
      if (!found) return undefined;
    } else {
      const index = segment;
      if (
        node.type !== "array" ||
        index < 0 ||
        !Array.isArray(node.children) ||
        index >= node.children.length
      )
        return undefined;
      node = node.children[index]!;
    }
  }
  return node;
}

/** The path of a node in its tree. */
export function getNodePath(node: Node): JSONPath {
  if (!node.parent || !node.parent.children) return [];
  const path = getNodePath(node.parent);
  if (node.parent.type === "property") path.push(node.parent.children[0]!.value);
  else if (node.parent.type === "array") {
    const index = node.parent.children.indexOf(node);
    if (index !== -1) path.push(index);
  }
  return path;
}

/** The JavaScript value of a node. */
export function getNodeValue(node: Node): any {
  switch (node.type) {
    case "array":
      return node.children!.map(getNodeValue);
    case "object": {
      const obj = Object.create(null);
      for (const prop of node.children!) {
        const valueNode = prop.children![1];
        if (valueNode) obj[prop.children![0]!.value] = getNodeValue(valueNode);
      }
      return obj;
    }
    case "null":
    case "string":
    case "number":
    case "boolean":
      return node.value;
    default:
      return undefined;
  }
}

export function contains(node: Node, offset: number, includeRightBound = false): boolean {
  return (
    (offset >= node.offset && offset < node.offset + node.length) ||
    (includeRightBound && offset === node.offset + node.length)
  );
}

/** The innermost node at the offset, with `includeRightBound` also one that ends there. */
export function findNodeAtOffset(
  node: Node,
  offset: number,
  includeRightBound = false,
): Node | undefined {
  if (contains(node, offset, includeRightBound)) {
    const children = node.children;
    if (Array.isArray(children))
      for (let i = 0; i < children.length && children[i]!.offset <= offset; i++) {
        const item = findNodeAtOffset(children[i]!, offset, includeRightBound);
        if (item) return item;
      }
    return node;
  }
  return undefined;
}

/** Parses the text and calls the visitor for each object, array and literal it reaches. */
export function visit(text: string, visitor: JSONVisitor, options: ParseOptions = DEFAULT): any {
  return walk(text, visitor, options, false);
}

// `visit`, where with `light` the callbacks only get the value, offset and
// length: all that parse, parseTree and getLocation read.
function walk(text: string, visitor: JSONVisitor, options: ParseOptions, light: boolean): boolean {
  const scanner = createScanner(text, false);
  const jsonPath: JSONPath = [];
  // jsonc-parser makes a new one for each call; each reads the path when called.
  const pathSupplier = () => jsonPath.slice();
  let suppressedCallbacks = 0;

  // The scanner's methods are closures, which need no `this`.
  /* eslint-disable typescript/unbound-method */
  const offset = scanner.getTokenOffset;
  const length = scanner.getTokenLength;
  const line = scanner.getTokenStartLine;
  const character = scanner.getTokenStartCharacter;
  /* eslint-enable typescript/unbound-method */
  const noArg = (fn?: (...args: any[]) => void) =>
    fn
      ? () => suppressedCallbacks === 0 && fn(offset(), length(), line(), character())
      : () => true;
  const oneArg = (fn?: (...args: any[]) => void) =>
    !fn
      ? () => true
      : light
        ? (arg: unknown) => fn(arg, offset(), length())
        : (arg: unknown) =>
            suppressedCallbacks === 0 && fn(arg, offset(), length(), line(), character());
  const oneArgWithPath = (fn?: (...args: any[]) => void) =>
    !fn
      ? () => true
      : light
        ? (arg: unknown) => fn(arg, offset(), length())
        : (arg: unknown) =>
            suppressedCallbacks === 0 &&
            fn(arg, offset(), length(), line(), character(), pathSupplier);
  const begin = (fn?: (...args: any[]) => boolean | void) =>
    !fn
      ? () => true
      : light
        ? () => fn(offset(), length())
        : () => {
            if (suppressedCallbacks > 0) suppressedCallbacks++;
            else if (fn(offset(), length(), line(), character(), pathSupplier) === false)
              suppressedCallbacks = 1;
          };
  const end = (fn?: (...args: any[]) => void) =>
    !fn
      ? () => true
      : light
        ? () => fn(offset(), length())
        : () => {
            if (suppressedCallbacks > 0) suppressedCallbacks--;
            if (suppressedCallbacks === 0) fn(offset(), length(), line(), character());
          };

  const onObjectBegin = begin(visitor.onObjectBegin);
  const onObjectProperty = oneArgWithPath(visitor.onObjectProperty);
  const onObjectEnd = end(visitor.onObjectEnd);
  const onArrayBegin = begin(visitor.onArrayBegin);
  const onArrayEnd = end(visitor.onArrayEnd);
  const onLiteralValue = oneArgWithPath(visitor.onLiteralValue);
  const onSeparator = oneArg(visitor.onSeparator);
  const onComment = noArg(visitor.onComment);
  const onError = oneArg(visitor.onError);

  const disallowComments = options && options.disallowComments;
  const allowTrailingComma = options && options.allowTrailingComma;

  function scanNext(): number {
    for (;;) {
      const token = scanner.scan();
      // Scan errors 4, 5, 3, 1, 2, 6 are parse errors 14, 15, 13, 11, 12, 16.
      switch (scanner.getTokenError()) {
        case 4:
          handleError(14);
          break;
        case 5:
          handleError(15);
          break;
        case 3:
          handleError(13);
          break;
        case 1:
          if (!disallowComments) handleError(11);
          break;
        case 2:
          handleError(12);
          break;
        case 6:
          handleError(16);
          break;
      }
      switch (token) {
        case 12:
        case 13:
          if (disallowComments) handleError(10); /* InvalidCommentToken */
          else onComment();
          break;
        case 16:
          handleError(1); /* InvalidSymbol */
          break;
        case 15:
        case 14:
          break;
        default:
          return token;
      }
    }
  }

  // Reports the error, then skips tokens until one in `skipUntil`, or past one in `skipUntilAfter`.
  function handleError(
    error: number,
    skipUntilAfter: number[] = [],
    skipUntil: number[] = [],
  ): void {
    onError(error);
    if (skipUntilAfter.length + skipUntil.length > 0) {
      let token: number = scanner.getToken();
      while (token !== 17) {
        if (skipUntilAfter.indexOf(token) !== -1) {
          scanNext();
          break;
        } else if (skipUntil.indexOf(token) !== -1) break;
        token = scanNext();
      }
    }
  }

  function parseString(isValue: boolean): boolean {
    const value = scanner.getTokenValue();
    if (isValue) onLiteralValue(value);
    else {
      onObjectProperty(value);
      jsonPath.push(value);
    }
    scanNext();
    return true;
  }

  function parseLiteral(): boolean {
    switch (scanner.getToken()) {
      case 11: {
        let value = Number(scanner.getTokenValue());
        if (isNaN(value)) {
          handleError(2); /* InvalidNumberFormat */
          value = 0;
        }
        onLiteralValue(value);
        break;
      }
      case 7:
        onLiteralValue(null);
        break;
      case 8:
        onLiteralValue(true);
        break;
      case 9:
        onLiteralValue(false);
        break;
      default:
        return false;
    }
    scanNext();
    return true;
  }

  function parseProperty(): boolean {
    if (scanner.getToken() !== 10) {
      handleError(3 /* PropertyNameExpected */, [], [2, 5]);
      return false;
    }
    parseString(false);
    if (scanner.getToken() === 6) {
      onSeparator(":");
      scanNext();
      if (!parseValue()) handleError(4 /* ValueExpected */, [], [2, 5]);
    } else handleError(5 /* ColonExpected */, [], [2, 5]);
    jsonPath.pop();
    return true;
  }

  function parseObject(): boolean {
    onObjectBegin();
    scanNext();
    let needsComma = false;
    while (scanner.getToken() !== 2 && scanner.getToken() !== 17) {
      if (scanner.getToken() === 5) {
        if (!needsComma) handleError(4, [], []);
        onSeparator(",");
        scanNext();
        if (scanner.getToken() === 2 && allowTrailingComma) break;
      } else if (needsComma) handleError(6 /* CommaExpected */, [], []);
      if (!parseProperty()) handleError(4, [], [2, 5]);
      needsComma = true;
    }
    onObjectEnd();
    if (scanner.getToken() !== 2) handleError(7 /* CloseBraceExpected */, [2], []);
    else scanNext();
    return true;
  }

  function parseArray(): boolean {
    onArrayBegin();
    scanNext();
    let isFirstElement = true;
    let needsComma = false;
    while (scanner.getToken() !== 4 && scanner.getToken() !== 17) {
      if (scanner.getToken() === 5) {
        if (!needsComma) handleError(4, [], []);
        onSeparator(",");
        scanNext();
        if (scanner.getToken() === 4 && allowTrailingComma) break;
      } else if (needsComma) handleError(6, [], []);
      if (isFirstElement) {
        jsonPath.push(0);
        isFirstElement = false;
      } else (jsonPath[jsonPath.length - 1] as number)++;
      if (!parseValue()) handleError(4, [], [4, 5]);
      needsComma = true;
    }
    onArrayEnd();
    if (!isFirstElement) jsonPath.pop();
    if (scanner.getToken() !== 4) handleError(8 /* CloseBracketExpected */, [4], []);
    else scanNext();
    return true;
  }

  function parseValue(): boolean {
    switch (scanner.getToken()) {
      case 3:
        return parseArray();
      case 1:
        return parseObject();
      case 10:
        return parseString(true);
      default:
        return parseLiteral();
    }
  }

  scanNext();
  if (scanner.getToken() === 17) {
    if (options.allowEmptyContent) return true;
    handleError(4, [], []);
    return false;
  }
  if (!parseValue()) {
    handleError(4, [], []);
    return false;
  }
  if (scanner.getToken() !== 17) handleError(9 /* EndOfFileExpected */, [], []);
  return true;
}

/** Removes comments, or with `replaceCh` replaces each of their characters but line breaks. */
export function stripComments(text: string, replaceCh?: string): string {
  const scanner = createScanner(text);
  const parts: string[] = [];
  let kind: number;
  let offset = 0;
  let pos: number;
  do {
    pos = scanner.getPosition();
    kind = scanner.scan();
    switch (kind) {
      case 12:
      case 13:
      case 17:
        if (offset !== pos) parts.push(text.substring(offset, pos));
        if (replaceCh !== undefined)
          parts.push(scanner.getTokenValue().replace(/[^\r\n]/g, replaceCh));
        offset = scanner.getPosition();
        break;
    }
  } while (kind !== 17);
  return parts.join("");
}

export function getNodeType(value: any): NodeType {
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      return "string";
    case "object":
      if (!value) return "null";
      if (Array.isArray(value)) return "array";
      return "object";
    default:
      return "null";
  }
}
