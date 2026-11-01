import { describe, expect, it } from "vite-plus/test";
import ini, { encode, safe, stringify, unsafe } from "../../src/ini/index.ts";

describe("stringify", () => {
  it("writes sections, arrays, and escapes", () => {
    expect(
      stringify(
        {
          name: "app",
          tags: ["a", "b"],
          note: "a;b",
          server: { http: { port: 8080 } },
          "x.y": { k: "v" },
        },
        { whitespace: true, platform: "linux" },
      ),
    ).toBe(
      "name = app\ntags[] = a\ntags[] = b\nnote = a\\;b\n\n[server.http]\nport = 8080\n\n[x\\.y]\nk = v\n",
    );
    expect(ini.encode).toBe(encode);
  });

  it("takes every ini option", () => {
    const value = { b: 1, aaa: [1], s: { k: "v" } };
    expect(
      stringify(value, {
        align: true,
        sort: true,
        newline: true,
        platform: "win32",
        section: "top",
      }),
    ).toBe("[top]\r\n\r\naaa[] = 1\r\nb     = 1\r\n\r\n[top.s]\r\n\r\nk = v\r\n");
    expect(stringify(value, { bracketedArray: false, platform: "linux" })).toBe(
      "b=1\naaa=1\n\n[s]\nk=v\n",
    );
    expect(stringify({ k: "v" }, "sec")).toBe(
      `[sec]${process.platform === "win32" ? "\r\n" : "\n"}k=v${process.platform === "win32" ? "\r\n" : "\n"}`,
    );
  });

  it("writes the normalized options back, as ini does", () => {
    const options: Record<string, unknown> = { align: 1 };
    stringify({}, options);
    expect(options).toEqual({
      align: false,
      newline: false,
      sort: false,
      whitespace: false,
      platform: process.platform,
      bracketedArray: true,
    });
  });

  it("escapes and unescapes single values", () => {
    expect(safe(" a ")).toBe('" a "');
    expect(safe("a#b")).toBe("a\\#b");
    expect(unsafe("a\\#b # c")).toBe("a#b");
    expect(unsafe('"x"')).toBe("x");
  });
});
