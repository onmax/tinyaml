// Folding and YAML 1.1 quoting as js-yaml 3 and 4 dump, which @std/yaml
// keeps: the js-yaml 4 and std dumpers share them.

// YAML 1.1 readers take these as booleans.
export const COMPAT = /^(?:[yYnN]|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;

// Greedy: the longest piece within width, else the shortest one over it.
// Breaks never leave a line starting with a space, which would read as more-indented.
function foldLine(line: string, width: number): string {
  if (!line || line[0] === " ") return line;
  let start = 0;
  let curr = 0;
  let result = "";
  for (const { index } of line.matchAll(/ [^ ]/g)) {
    if (index - start > width) {
      const end = curr > start ? curr : index;
      result += `${line.slice(start, end)}\n`;
      start = end + 1;
    }
    curr = index;
  }
  return (
    result +
    (line.length - start > width && curr > start
      ? `${line.slice(start, curr)}\n${line.slice(curr + 1)}`
      : line.slice(start))
  );
}

// In folded style k line breaks read back as k-1, except next to more-indented
// lines and at the start, so those get no extra break.
export function fold(s: string, width: number): string {
  let prevMore = /^[\n ]/.test(s);
  return s.replace(/(\n+|^)([^\n]*)/g, (_, breaks: string, line: string) => {
    const more = line[0] === " ";
    const result =
      breaks + (breaks && !prevMore && !more && line ? "\n" : "") + foldLine(line, width);
    prevMore = more;
    return result;
  });
}
