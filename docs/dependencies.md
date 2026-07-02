# Dependencies — What's in package.json and Why

This explains every dependency in `sck3/package.json` in plain language.

---

## How dependencies work

`package.json` is the project's ingredient list. When you run `npm install`, npm downloads everything in that list into `node_modules/`. You never touch `node_modules/` directly — npm manages it.

Two buckets:
- **`dependencies`** — needed at runtime (ships with the plugin)
- **`devDependencies`** — needed to build and test, not shipped

---

## Runtime dependencies (ship with the plugin)

### `@elgato/streamdeck`
The official Elgato SDK. It handles the two-way connection between your TypeScript code and the physical Stream Deck device — button presses in, display updates out. Without this, your plugin can't talk to the hardware.

### `fast-xml-parser`
Star Citizen stores all keybinds as XML files (`actionmaps.xml`). This library reads and writes XML from TypeScript. Think of it as a translator between SC's file format and JavaScript objects your code can work with.

### `opentype.js`
Stream Deck's key-image rasterizer doesn't reliably support custom `@font-face` fonts, so key-face text (`sck3/src/rendering/keyLabel.ts`) can't just rely on CSS. This library parses the bundled TTF font file directly and converts label text into raw SVG `<path>` outline data itself, so the rendered SVG needs zero font support from whatever renders it.

---

## Dev dependencies (build tools, not shipped)

### `@elgato/cli`
A command-line tool that comes with the Elgato SDK. It's what powers `npm run build` and `npm run watch`. It also lets you restart the plugin on your Stream Deck from the terminal without unplugging anything.

### `rollup` + `@rollup/plugin-*`
Rollup is a **bundler** — it takes all your TypeScript files (which might be split across dozens of files) and packages them into one single `.js` file that the Stream Deck can actually load. The `@rollup/plugin-*` packages are add-ons that teach rollup specific tricks:
- `plugin-typescript` — understands TypeScript (rollup only speaks JavaScript natively)
- `plugin-node-resolve` — finds packages you've imported from `node_modules`
- `plugin-commonjs` — handles older-style packages that don't use modern JS modules
- `plugin-terser` — compresses the final JS file (removes whitespace, shortens variable names) to make it smaller

### `typescript`
The TypeScript compiler. Converts your `.ts` files to `.js`. In this project rollup calls it automatically — you rarely need to run it directly.

### `@tsconfig/node20`
A pre-made TypeScript configuration with sensible Node.js defaults. The project's `tsconfig.json` inherits from this so we don't have to configure everything from scratch — the actual runtime is Node.js 24 (see `manifest.json`'s `Nodejs.Version`), but this config base is still a compatible starting point.

### `@types/node`
TypeScript needs to know what functions are available in Node.js (things like reading files, working with paths). This package provides those type definitions so TypeScript doesn't complain when you use `fs.readFileSync` or `path.join`.

### `@types/opentype.js`
Type definitions for `opentype.js` (see above) — a runtime dependency, but its types ship separately since the library itself is plain JavaScript.

### `tslib`
A small helper library TypeScript uses internally when it compiles your code. You don't call it directly — the compiler adds `import { ... } from 'tslib'` to the output automatically to keep the compiled code smaller.

### `vitest`
The test runner. Runs all the files in `tests/` that end in `.test.ts` and tells you if they pass or fail. Similar to Jest if you've heard of it, but faster and built for TypeScript. `npm run test` calls this.
