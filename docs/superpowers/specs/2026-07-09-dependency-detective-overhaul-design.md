# dependency-detective correctness overhaul — design

**Date:** 2026-07-09
**Target version:** 0.3.0 (behavior change — output materially differs from 0.2.0)
**Status:** Approved for implementation

## Problem

Two of the tool's three advertised features are effectively dead:

1. **Alternative suggestions** — relies on `packageData.deprecated` (no such top-level field on
   the npm registry root document) and `npms.io`'s `alternatives` array (the field no longer
   exists in the response). Verified live: the registry root has no top-level `deprecated` or
   `downloads`; npms.io returns only `analyzedAt/collected/evaluation/score`. The feature returns
   `{}` on essentially every run.
2. **Security check** — calls the retired Snyk v1 test endpoint (`snyk.io/api/v1/test/...`, returns
   401) and requires every user to sign up for a token. Even a configured token hits a deprecated
   API.

The one working feature (unused-dependency detection) has correctness gaps that produce false
positives, most notably flagging `@types/*` and tool packages as unused, and missing `.mjs`/`.cjs`
files.

Net effect: a developer runs the tool and gets a noisy unused list, an empty security section, and
zero alternatives — concluding either that the tool is broken or that their project is perfect.
Both are wrong. The goal of this release is: **the output stops lying.**

## Scope

In scope: make all three features actually work, fix unused-detector false positives, add a real
test suite, and update the README to match reality. Every change serves "make the three advertised
features work" — no unrelated refactoring.

Out of scope (captured for later): `--fix`/interactive removal (Release 2), monorepo/workspace
support, Vue/Svelte/Astro single-file-component scanning, `--json`/CI mode, maintenance/abandonment
signals, supply-chain flags, config file.

## Design

### 1. Security check → OSV.dev (`src/security-checker.js`)

Rewrite from scratch. OSV.dev is a free public vulnerability API (Google/OpenSSF) requiring no token
or signup.

- For each dependency, POST to `https://api.osv.dev/v1/query` with body
  `{ "version": <exact>, "package": { "name": <dep>, "ecosystem": "npm" } }`.
- **Version resolution — skip, don't guess.** The exact version comes *only* from
  `node_modules/<dep>/package.json` `.version`. If the package is not installed (no such file),
  the dep is **skipped** and recorded as "not checked (not installed)". We never strip the
  semver range and test a guessed floor version, because that can report a vuln that does not apply
  to the actually-installed version.
- Map each OSV `vulns[]` entry to the existing display shape so `analyzer.js` display code needs
  minimal change:
  `{ severity: v.database_specific?.severity ?? 'UNKNOWN', title: v.summary, description: v.details }`.
- Run all dependency queries in parallel with a concurrency cap (8).
- Remove all `SNYK_API_TOKEN` / `axios` Snyk code.

**Return contract:** returns an object `{ vulnerabilities, skipped, failed }` where:
- `vulnerabilities`: `{ [depName]: issue[] }` for deps with findings (unchanged shape).
- `skipped`: `string[]` of deps not checked because they were not installed.
- `failed`: `boolean` — true only if *every* network call failed (treated as "check failed").

`analyzer.js` interprets this (see §4). This replaces the old `null`-means-no-token contract.

### 2. Alternatives → deprecation-only (`src/alternative-suggester.js`)

Reduce to an objective, low-maintenance check. No curated swap map (opinionated, goes stale), no
downloads endpoint.

- For each dependency, fetch `https://registry.npmjs.org/<dep>`.
- Determine the latest version via `data['dist-tags'].latest`, then check
  `data.versions[latest].deprecated`. This is the field that actually exists (deprecation is
  per-version, not top-level).
- If deprecated, emit `{ name: dep, deprecated: <message>, lastUpdated: data.time?.modified }`.
- Parallel with concurrency cap (8). Only deprecated packages produce output — never an empty-but-
  present entry.
- Display header changes from "Recommended Alternatives" to "Deprecated Packages" (see §4).
- The `--no-suggestions` flag and `options.suggestions` gate are retained (they now gate the
  deprecation check).

### 3. Unused-detector correctness (`src/unused-detector.js`)

- Glob pattern becomes `**/*.{js,jsx,ts,tsx,mjs,cjs}` (adds `.mjs`, `.cjs`).
- **`@types/*` resolution:** after collecting `referenced`, a dependency named `@types/<base>` is
  treated as used if `<base>` is in `referenced`. Special case: `@types/node` is always treated as
  used. Scoped base names encoded by `@types` as `@scope__name` map back to `@scope/name`.
- Accept the already-parsed `packageJson` object as a parameter instead of re-reading and
  re-parsing `package.json` synchronously. The scripts scan reads `packageJson.scripts` from the
  passed object.

### 4. `analyzer.js`

- Pass the parsed `packageJson` into `findUnusedDependencies(directory, filteredDependencies, packageJson)`.
- **Savings estimate:** replace the fabricated `5MB × count`. Compute the actual on-disk size of
  each unused package's `node_modules/<dep>` folder (recursive sum). If `node_modules` is absent,
  omit the savings line entirely rather than inventing a number.
- **Security display:** consume the new `{ vulnerabilities, skipped, failed }` contract:
  - `failed === true` → "Security check failed (network error)."
  - no vulnerabilities and none skipped → "No known vulnerabilities."
  - vulnerabilities present → list as today.
  - if any `skipped`, append a dim note: "N package(s) not checked (not installed) — run `npm install` for full coverage."
- **Deprecated display:** rename the section to "⚠️  Deprecated Packages"; each entry shows the
  package name and (in verbose) the deprecation message + last-updated date.
- **Warning buffering:** collect warnings returned by the AST parser and API modules and print them
  *after* `spinner.succeed()`, so mid-analysis `console.warn` no longer corrupts the ora spinner.

### 5. Warning plumbing (`src/ast-parser.js` + API modules)

- `parseFileImports` returns `{ referenced, warnings }` (or pushes to a passed-in collector) instead
  of calling `console.warn` directly. `unused-detector.js` aggregates and surfaces them up to
  `analyzer.js`.
- Security and alternatives modules likewise return any per-dep error strings rather than printing
  mid-spinner.

### 6. Tests (new — `node --test`, no new dependencies)

Use Node's built-in test runner. Network code is tested by exercising the *pure mapping functions*
against fixture payloads — the actual HTTP calls are not mocked (deliberate coverage gap: we test
the transform logic that breaks silently, not the network glue).

- `extractPackageName`: bare, scoped, subpath, relative.
- AST extraction: `import`, `require`, dynamic `import()`, `export ... from` all captured; built-ins
  and relative paths handled.
- config-scanner `isReferenced`: positive match (quoted + subpath) and no-false-positive (substring
  that is not a quoted reference).
- `@types/*` resolution: `@types/react` used iff `react` referenced; `@types/node` always used.
- OSV response mapping: fixture `vulns[]` → display shape, including missing `database_specific`.
- Deprecation mapping: fixture registry doc with a deprecated latest version → suggestion shape.

Wire `npm test` to `node --test`.

### 7. README

- Security section: OSV.dev, no token required; remove all Snyk setup instructions.
- Alternatives → "Deprecated Packages" section describing deprecation-only behavior.
- Fix the savings-claim wording (real size or omitted).
- Roadmap: mark AST + config scanning done (already), note OSV migration; add `--fix` as next.
- Update example output to reflect the new sections.
- Bump version references to 0.3.0.

## Data flow

```
index.js
  └─ analyzeProject(options)                      [analyzer.js]
       ├─ parse package.json once
       ├─ findUnusedDependencies(dir, deps, pkgJson)   [unused-detector.js]
       │     ├─ glob **/*.{js,jsx,ts,tsx,mjs,cjs}
       │     ├─ parseFileImports(file) ×N (parallel)   [ast-parser.js]  → {referenced,warnings}
       │     ├─ scanConfigFiles(dir, deps)             [config-scanner.js]
       │     ├─ scripts scan (from passed pkgJson)
       │     └─ @types/* resolution → unusedDeps + warnings
       ├─ checkVulnerabilities(deps, dir)              [security-checker.js]
       │     └─ per dep: resolve installed version → OSV query (cap 8)
       │        → { vulnerabilities, skipped, failed }
       ├─ suggestAlternatives(deps)                    [alternative-suggester.js]
       │     └─ per dep: registry fetch → versions[latest].deprecated (cap 8)
       │        → { [dep]: {deprecated,lastUpdated} }
       └─ displayResults(...)  + print buffered warnings after spinner
```

## Error handling

- Missing `package.json` → fail spinner, return (unchanged).
- Unparseable source file → skip file, collect a warning (no throw).
- OSV/registry per-dep network error → count toward `failed` only if all fail; otherwise that dep is
  silently omitted from findings with a collected warning.
- Missing `node_modules` → security check skips uninstalled deps; savings line omitted.

## Testing strategy

- Unit tests via `node --test` over pure functions (§6).
- Manual end-to-end verification: run against this repo (has `node_modules`) and confirm OSV returns
  real findings for any known-vuln dep, deprecated-package detection works, and `@types`-style
  false positives are gone. Run against a copy with `node_modules` removed to confirm the skip path.

## Risks / known limitations (carried forward)

- Vue/Svelte/Astro SFCs are still not scanned → possible false positives in those projects.
- Binary-only devDeps not in scripts (husky, rimraf) may still show as unused (no tooling allowlist
  by design — YAGNI).
- On-disk savings undercounts shared transitive deps — it is an honest approximation, not exact.
- OSV coverage/severity differs from commercial DBs; this is the accepted tradeoff for zero-setup.
