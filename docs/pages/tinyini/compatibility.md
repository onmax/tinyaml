---
title: Compatibility with ini 7.0.0
label: Compatibility
description: How tinyini was checked against ini 7.0.0, and every place it still differs.
---

I tested tinyini against ini 7.0.0 four ways:

- ini's own tests and tap snapshots, copied unchanged into `test/ini` and run with tinyini in place of ini, with the snapshots formatted by tcompare as tap 16 does. All 40 assertions pass, in all 5 files. The same harness passes 40 of 40 with ini itself.
- 1,000,000 inputs made by editing ini's fixtures and test strings, the config files in `test/samples` (two `.gitconfig` files, `.npmrc`, `.editorconfig`, `php.ini`, a systemd unit, `desktop.ini`, `setup.cfg`, `my.cnf`, and some odd cases, each also with CRLF endings, with a BOM, and as pkg-types' `parseGitConfig` rewrites them), and documents ini writes for random values. 970,041 of them are distinct. Each is parsed with `bracketedArray` unset, `true`, and `false`, and every tenth also with 10 odd options such as `null`, a string, a number, and frozen objects; `safe` and `unsafe` run on each too. That is 6,002,422 calls with 0 differences. The comparison covers prototypes, own key order, property flags, and shared references, the options object afterwards, and the error class and message for the 106,949 calls that throw (100,040 of them the `null` options). A second run of 200,000 with another seed, 198,308 of them distinct, also has 0 differences. The random numbers come from mulberry32.
- 10,000 random values, with nested and null-prototype objects, awkward keys and strings, dots, escapes, `__proto__` keys, arrays with holes, `undefined`, functions, symbols, BigInts, dates, `toJSON`, and cycles. Each is stringified with all 384 combinations of `align`, `sort`, `whitespace`, `newline`, `bracketedArray`, 3 platforms, and 4 sections, plus 12 odd options on every tenth value: 3,847,260 calls with byte-identical output and the same options object afterwards. Where ini throws, in 252,313 of them, tinyini throws the same error.
- The same values round-trip: `parse(stringify(x))` with tinyini gives what it gives with ini in all 3,590,262 checks.

Where tinyini differs:

- Strict mode. ini is CommonJS in sloppy mode, where a write to a primitive or a frozen object does nothing. tinyini is an ES module, so it checks for those cases and does nothing too: `parse("a=1\n[a]\nb=2")` returns `{ a: "1" }` in both. The copy of ini that confbox 0.3.2 bundles is an ES module and throws `Cannot create property 'b' on string '1'` there, so in confbox, tinyini returns ini's result where today it throws.
- Getters and proxies. ini reads `options.bracketedArray` again for every key line, where tinyini reads it once, and with `align` ini reads each value up to five times, where tinyini reads it twice. Only a getter or a proxy can tell.
- Arguments that are neither strings nor `String` objects but have their own `split` or `trim` method, passed to `parse` or `unsafe`, can give a different result.
- Stack depth. Both write nested objects recursively and run out of stack at different depths: here tinyini writes 5,469 nested objects to ini's 4,687.
- Packaging. ESM only, with named exports next to the default. The types are the signatures of `@types/ini` 4.1.1, plus exported `DecodeOptions` and `EncodeOptions`.
