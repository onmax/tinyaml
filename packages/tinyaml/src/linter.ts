import { parseAll } from "./index.ts";

export type Rule = "tinyaml/invalid-yaml" | "tinyaml/ambiguous-value";

export interface Diagnostic {
  rule: Rule;
  severity: "error" | "warn";
  line: number;
  column: number;
  message: string;
  fix: string;
}

export interface RuleInfo {
  code: string;
  title: string;
  severity: "error" | "warn";
}

export const rules: Record<Rule, RuleInfo> = {
  "tinyaml/invalid-yaml": {
    code: "TINYAML0001",
    title: "YAML that tinyaml can't load",
    severity: "error",
  },
  "tinyaml/ambiguous-value": {
    code: "TINYAML0002",
    title: "A plain value other YAML readers don't read as a string",
    severity: "warn",
  },
};

// Plain scalars that load as strings here but as something else in js-yaml's default
// schema or in YAML 1.1 readers such as PyYAML, with what those readers make of them and the fix.
const AMBIGUOUS: [RegExp, string, string][] = [
  [
    /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/,
    "YAML 1.1 readers such as PyYAML read it as a boolean",
    "Quote it to keep the string, or write `true` or `false`.",
  ],
  [
    /^(?:[-+]?(?:0x[\da-fA-F][\da-fA-F_]*|0o[0-7][0-7_]*|0b[01][01_]*|\.(?:inf|Inf|INF)|\d[\d_]*(?:\.[\d_]*)?(?:[eE][-+]?\d+)?)|\.(?:nan|NaN|NAN))$/,
    "js-yaml's default schema reads it as a number",
    "Quote it to keep the string, or write it as a JSON number.",
  ],
  [
    /^[-+]?\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?$/,
    "js-yaml's YAML 1.1 schema reads it as a sexagesimal number",
    "Quote it to keep the string, or write it as a JSON number.",
  ],
  [
    /^(?:\d{4}-\d\d-\d\d|\d{4}-\d\d?-\d\d?(?:[Tt]|[ \t]+)\d\d?:\d\d:\d\d(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d\d?(?::\d\d)?))?)$/,
    "js-yaml's default schema reads it as a date",
    "Quote it so every reader gets the same string.",
  ],
];

// Walk complete nodes, rather than matching words inside comments or scalars. The
// parser validates the stream first; this scan only needs lexical boundaries.
function* plainScalars(text: string) {
  const source = text.replace(/\r\n?/g, "\n");
  let at = source.startsWith("\uFEFF") ? 1 : 0;
  let line = 1;
  let start = at;
  let flow = 0;
  let parentIndent = -1;
  let nodeColumn = 0;
  let tagged = false;
  let quoted = false;
  const advance = () => {
    if (source[at++] === "\n") {
      line++;
      start = at;
    }
  };
  const lineEnd = (offset: number) => {
    const end = source.indexOf("\n", offset);
    return end < 0 ? source.length : end;
  };
  const separated = (offset: number) =>
    offset >= source.length || /[ \t\n,[\]{}]/.test(source[offset]!);
  const marker = (offset: number) =>
    /^(?:---|\.\.\.)(?:[ \t\n]|$)/.test(source.slice(offset, offset + 4));

  while (at < source.length) {
    const ch = source[at]!;
    if (/[ \t\n]/.test(ch)) {
      advance();
      continue;
    }
    if (ch === "#" || (at === start && ch === "%")) {
      at = lineEnd(at);
      continue;
    }
    if (at === start && marker(at)) {
      at += 3;
      parentIndent = -1;
      tagged = false;
      continue;
    }
    if (ch === "&" || ch === "!" || ch === "*") {
      if (ch === "!") tagged = true;
      if (source.startsWith("!<", at)) at = source.indexOf(">", at) + 1;
      else while (at < source.length && !separated(at)) at++;
      if (ch === "*") tagged = false;
      continue;
    }
    if (ch === "[" || ch === "{") {
      flow++;
      at++;
      tagged = false;
      quoted = false;
      continue;
    }
    if (ch === "]" || ch === "}" || ch === ",") {
      if (ch !== ",") flow--;
      quoted = ch !== ",";
      at++;
      parentIndent = -1;
      continue;
    }
    if ((ch === "-" || ch === "?") && separated(at + 1)) {
      parentIndent = at - start;
      at++;
      continue;
    }
    if (ch === ":" && (quoted || separated(at + 1))) {
      // An explicit value on its own line is indented with the mapping,
      // independently of the key after `?` on the preceding line.
      parentIndent = /^[ \t]*$/.test(source.slice(start, at)) ? at - start : nodeColumn;
      quoted = false;
      at++;
      continue;
    }
    nodeColumn = at - start;
    quoted = ch === '"' || ch === "'";
    if (ch === '"' || ch === "'") {
      at++;
      while (at < source.length) {
        if (source[at] === ch) {
          at++;
          if (ch !== "'" || source[at] !== "'") break;
        } else if (ch === '"' && source[at] === "\\") advance();
        advance();
      }
    } else if (ch === "|" || ch === ">") {
      const header = source.slice(at, lineEnd(at));
      const explicit = /[1-9]/.exec(header.split("#")[0]!);
      let contentIndent = explicit ? Math.max(0, parentIndent) + Number(explicit[0]) : undefined;
      at = lineEnd(at);
      if (at < source.length) advance();
      while (at < source.length) {
        const end = lineEnd(at);
        const content = source.slice(at, end);
        if (/[^ \t]/.test(content)) {
          const indent = /^ */.exec(content)![0].length;
          if (marker(at) || indent <= parentIndent || indent < (contentIndent ?? indent)) break;
          contentIndent ??= indent;
        }
        at = end;
        if (at < source.length) advance();
      }
    } else {
      const from = at;
      const scalarLine = line;
      const column = at - start + 1;
      while (at < source.length) {
        const next = source[at]!;
        if (
          (flow && /[[\]{},]/.test(next)) ||
          (next === ":" && separated(at + 1)) ||
          (next === "#" && /[ \t]/.test(source[at - 1]!))
        )
          break;
        if (next === "\n") {
          let following = at + 1;
          while (
            following < source.length &&
            /^[ \t]*$/.test(source.slice(following, lineEnd(following)))
          )
            following = lineEnd(following) + 1;
          const indent = /^ */.exec(source.slice(following))![0].length;
          const first = source[following + indent];
          if (
            !first ||
            first === "#" ||
            marker(following) ||
            (flow ? /[\]{} ,]/.test(first) : indent <= parentIndent)
          )
            break;
        }
        advance();
      }
      if (!tagged) {
        const raw = source.slice(from, at).replace(/[ \t\n]+$/, "");
        // Let the parser fold complete multiline plain scalars while keeping
        // the original start position for the diagnostic.
        const token = raw.includes("\n") ? parseAll(raw)[0] : raw;
        if (typeof token === "string") yield { token, line: scalarLine, column };
      }
    }
    parentIndent = -1;
    tagged = false;
  }
}

/** Lints one YAML stream. Never throws. */
export function lint(text: string): Diagnostic[] {
  try {
    parseAll(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const at = /^(.*) \((\d+):(\d+)\)$/.exec(message);
    return [
      {
        rule: "tinyaml/invalid-yaml",
        severity: "error",
        line: at ? Number(at[2]) : 1,
        column: at ? Number(at[3]) : 1,
        message: `tinyaml can't load this YAML: ${at?.[1] ?? message}.`,
        fix: "Fix the YAML at this position.",
      },
    ];
  }

  const found: Diagnostic[] = [];
  for (const { token, line, column } of plainScalars(text)) {
    const reading = AMBIGUOUS.find(([pattern]) => pattern.test(token));
    if (!reading || typeof parseAll(token)[0] !== "string") continue;
    found.push({
      rule: "tinyaml/ambiguous-value",
      severity: "warn",
      line,
      column,
      message: `\`${token}\` loads as the string "${token}", but ${reading[1]}.`,
      fix: reading[2],
    });
  }
  return found;
}

export interface LintedFile {
  file: string;
  /** `undefined` when the file can't be read. */
  text?: string;
  diagnostics: Diagnostic[];
}

/** Lints each file, reading it with `read`. */
export async function lintFiles(
  files: readonly string[] | AsyncIterable<string> | Iterable<string>,
  read: (file: string) => string | undefined | Promise<string | undefined>,
): Promise<LintedFile[]> {
  const results: LintedFile[] = [];
  for await (const file of files) {
    const text = await read(file);
    results.push({ file, text, diagnostics: text === undefined ? [] : lint(text) });
  }
  return results;
}
