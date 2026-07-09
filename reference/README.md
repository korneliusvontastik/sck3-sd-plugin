# reference/

Local-only scratch space. Nothing in this folder ships or gets committed except this file.

## `defaultProfile.xml` (gitignored — you won't see this after a fresh clone)

CIG's **full, proprietary** action list (~1,100 actions), extracted straight from your local
`Data.p4k`. It exists only so dev tooling (`scripts/export-csv.ts`, `parser.real.test.ts`) can run
against the complete, real game data instead of a hand-picked excerpt.

Generate it with:

```bash
npx tsx scripts/extract-default-profile.ts [path/to/Data.p4k]
```

**Never commit this file.** It's CIG's data, not ours — see `.gitignore`.

## Not to be confused with `sck3/tests/keybindkrafter/fixtures/defaultProfile.sample.xml`

That's a hand-trimmed, tracked, public-safe excerpt (2 actionmaps / 9 actions — just enough to
exercise axis-detection edge cases) used by the regular test suite and CI. This folder's
`defaultProfile.xml` is the full extract, used only by the opt-in `parser.real.test.ts` (skips
itself cleanly when the file is absent) and `export-csv.ts`.
