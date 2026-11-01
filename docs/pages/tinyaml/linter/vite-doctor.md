---
title: Vite Doctor
description: Add the tinyaml linter rules to a Vite Doctor run with tinyaml/doctor.
---

`tinyaml/doctor` adds the [linter's rules](/tinyaml/linter/overview/#rules) to a [Vite Doctor](https://github.com/onmax/vite-doctor) run, so one report covers your code and your YAML.

## Setup

Install both packages. It needs `vite-doctor` 0.1.1 or later.

```sh
pnpm add -D tinyaml vite-doctor
```

Vite Doctor loads extensions from an executable config, so register it in `doctor.config.ts`:

```ts
// doctor.config.ts
import tinyaml from "tinyaml/doctor";
import { defineDoctorConfig } from "vite-doctor/config";

export default defineDoctorConfig({
  extends: ["auto", "tinyaml/recommended"],
  extensions: [tinyaml()],
});
```

`tinyaml/recommended` turns on both rules, next to Vite Doctor's own presets. Then run it:

```sh
pnpm vite-doctor . --config doctor.config.ts
```

Each problem reports with its own code, `TINYAML0001` or `TINYAML0002`, linked to the rule's section in the [linter docs](/tinyaml/linter/overview/#rules). Each diagnostic carries `why`, `fix`, and the YAML location in `sources`.

## Options

| Option    | Default                            | Description                                      |
| --------- | ---------------------------------- | ------------------------------------------------ |
| `include` | `**/*.{yaml,yml}`                  | The YAML to check, relative to the project root. |
| `exclude` | `**/node_modules/**`, `**/dist/**` | Globs to skip.                                   |

## This repository

tinyaml runs Vite Doctor on itself with `pnpm check:doctor`. Its [`doctor.config.ts`](https://github.com/onmax/tiny/blob/main/packages/tinyaml/doctor.config.ts) loads the extension from `src/` and adds `.cache/` to `exclude`, since the conformance scripts clone test suites there.
