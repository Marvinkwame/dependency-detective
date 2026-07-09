# dependency-detective v0.3.0 Correctness Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three of the tool's advertised features actually work — OSV-backed vulnerability checks, deprecation-only alternatives, and false-positive-free unused detection — with a real test suite.

**Architecture:** ES modules, CLI orchestrated by `analyzer.js`. Network calls go through a small hand-rolled concurrency-capped helper. Pure mapping/logic functions are extracted from each module and unit-tested with Node's built-in `node --test`; network glue itself is not mocked (deliberate coverage boundary).

**Tech Stack:** Node 22 (`node --test`), `@babel/parser`, `axios`, `chalk`, `ora`, `glob`, `commander`, `dotenv`.

## Global Constraints

- Target version: **0.3.0** (behavior change from 0.2.0).
- No new runtime dependencies. Tests use built-in `node:test` / `node:assert`.
- Security backend: **OSV.dev** (`https://api.osv.dev/v1/query`), no token. Never test a guessed version — resolve the exact installed version from `node_modules/<dep>/package.json` or **skip** the dep.
- Alternatives: **deprecation-only** via `registry.npmjs.org/<dep>` `versions[latest].deprecated`. No curated swap list, no downloads endpoint.
- Concurrency cap for all per-dependency network loops: **8**.
- No `console.warn`/`console.error` during the ora spinner — warnings are collected and printed after `spinner.succeed()`.
- All source is ESM (`import`/`export`), matching the existing files.

---

## File Structure

- **Create** `src/util/concurrency.js` — `mapWithConcurrency(items, limit, fn)` helper.
- **Create** `tests/concurrency.test.js`, `tests/ast-parser.test.js`, `tests/config-scanner.test.js`, `tests/unused-detector.test.js`, `tests/security-checker.test.js`, `tests/alternative-suggester.test.js`.
- **Create** `tests/fixtures/sample-imports.js` — fixture source file for AST parsing.
- **Modify** `src/ast-parser.js` — export `extractPackageName`; return `{ referenced, warnings }`.
- **Modify** `src/config-scanner.js` — export `isReferenced`.
- **Modify** `src/unused-detector.js` — glob `mjs,cjs`; add/export `resolveTypesUsage`; accept `packageJson` param; return `{ unusedDeps, warnings }`.
- **Modify** `src/security-checker.js` — rewrite for OSV; export `mapOsvVulns`, `resolveInstalledVersion`; new return contract.
- **Modify** `src/alternative-suggester.js` — rewrite deprecation-only; export `extractDeprecation`.
- **Modify** `src/analyzer.js` — wire new contracts, real savings, deprecated section, warning buffering.
- **Modify** `package.json` — `test` script → `node --test`; version → `0.3.0`.
- **Modify** `README.md` — OSV, deprecation-only, honest savings, roadmap.

---

## Task 1: Concurrency helper

**Files:**
- Create: `src/util/concurrency.js`
- Test: `tests/concurrency.test.js`

**Interfaces:**
- Produces: `export async function mapWithConcurrency(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` — runs `fn` over `items` with at most `limit` in flight, results in input order.

- [ ] **Step 1: Write the failing test**

```js
// tests/concurrency.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/util/concurrency.js';

test('maps all items preserving input order', async () => {
  const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (x) => x * 2);
  assert.deepEqual(out, [2, 4, 6, 8]);
});

test('never runs more than `limit` concurrently', async () => {
  let active = 0;
  let max = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
  });
  assert.ok(max <= 2, `observed max concurrency ${max} exceeded 2`);
});

test('empty input returns empty array', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/concurrency.test.js`
Expected: FAIL — cannot find module `../src/util/concurrency.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/util/concurrency.js
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/concurrency.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/util/concurrency.js tests/concurrency.test.js
git commit -m "feat: add concurrency-capped map helper"
```

---

## Task 2: AST parser — export name helper, buffer warnings

**Files:**
- Modify: `src/ast-parser.js`
- Create: `tests/fixtures/sample-imports.js`, `tests/ast-parser.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export function extractPackageName(source: string): string`
  - `export async function parseFileImports(filePath: string): Promise<{ referenced: Set<string>, warnings: string[] }>` (return shape **changed** from `Set` to `{ referenced, warnings }`).

- [ ] **Step 1: Write the fixture file**

```js
// tests/fixtures/sample-imports.js
import express from 'express';
const chalk = require('chalk');
import('ora').then(() => {});
export { get } from 'lodash/get';
import fs from 'fs';
import local from './local.js';
```

- [ ] **Step 2: Write the failing test**

```js
// tests/ast-parser.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPackageName, parseFileImports } from '../src/ast-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('extractPackageName handles bare, scoped, subpath, relative', () => {
  assert.equal(extractPackageName('express'), 'express');
  assert.equal(extractPackageName('lodash/get'), 'lodash');
  assert.equal(extractPackageName('@babel/core'), '@babel/core');
  assert.equal(extractPackageName('@babel/core/lib/x'), '@babel/core');
  assert.equal(extractPackageName('./local'), './local');
});

test('parseFileImports captures import, require, dynamic import, export-from', async () => {
  const { referenced, warnings } = await parseFileImports(
    path.join(here, 'fixtures', 'sample-imports.js')
  );
  assert.ok(referenced.has('express'));
  assert.ok(referenced.has('chalk'));
  assert.ok(referenced.has('ora'));
  assert.ok(referenced.has('lodash'));
  assert.deepEqual(warnings, []);
});

test('parseFileImports returns empty result for missing file', async () => {
  const { referenced, warnings } = await parseFileImports('/no/such/file.js');
  assert.equal(referenced.size, 0);
  assert.deepEqual(warnings, []);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/ast-parser.test.js`
Expected: FAIL — `extractPackageName` is not exported / `parseFileImports` returns a Set (no `.referenced`).

- [ ] **Step 4: Apply the implementation changes**

In `src/ast-parser.js`, change the `extractPackageName` declaration to be exported:

```js
export function extractPackageName(source) {
  if (source.startsWith('.')) return source;
  if (source.startsWith('@')) {
    return source.split('/').slice(0, 2).join('/');
  }
  return source.split('/')[0];
}
```

Replace the whole `parseFileImports` function with this version (collects warnings instead of `console.warn`, returns `{ referenced, warnings }`):

```js
export async function parseFileImports(filePath) {
  const referenced = new Set();
  const warnings = [];

  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return { referenced, warnings };
  }

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: BABEL_PLUGINS,
      errorRecovery: true,
    });
  } catch (err) {
    warnings.push(`Could not parse ${filePath}: ${err.message}`);
    return { referenced, warnings };
  }

  walk(ast, {
    ImportDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    ExportNamedDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    ExportAllDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    CallExpression(node) {
      if (
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments?.[0]?.type === 'StringLiteral'
      ) {
        referenced.add(extractPackageName(node.arguments[0].value));
      }
    },
    ImportExpression(node) {
      if (node.source?.type === 'StringLiteral') {
        referenced.add(extractPackageName(node.source.value));
      }
    },
  });

  return { referenced, warnings };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/ast-parser.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ast-parser.js tests/ast-parser.test.js tests/fixtures/sample-imports.js
git commit -m "refactor: export extractPackageName, return warnings from parseFileImports"
```

---

## Task 3: config-scanner — export `isReferenced`

**Files:**
- Modify: `src/config-scanner.js`
- Test: `tests/config-scanner.test.js`

**Interfaces:**
- Produces: `export function isReferenced(content: string, depName: string): boolean` (was module-private).

- [ ] **Step 1: Write the failing test**

```js
// tests/config-scanner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReferenced } from '../src/config-scanner.js';

test('matches quoted references and subpaths', () => {
  assert.ok(isReferenced(`import x from 'tailwindcss'`, 'tailwindcss'));
  assert.ok(isReferenced(`require('tailwindcss/plugin')`, 'tailwindcss'));
  assert.ok(isReferenced(`plugins: ["@tailwindcss/forms"]`, '@tailwindcss/forms'));
});

test('does not match unrelated substrings', () => {
  assert.ok(!isReferenced(`// tailwindcss-typography notes`, 'tailwindcss'));
  assert.ok(!isReferenced(`const tailwindcssHelper = 1`, 'tailwindcss'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config-scanner.test.js`
Expected: FAIL — `isReferenced` is not exported.

- [ ] **Step 3: Add the export**

In `src/config-scanner.js`, change `function isReferenced(...)` to `export function isReferenced(...)`:

```js
export function isReferenced(content, depName) {
  const pattern = new RegExp(`['"\`]${escapeRegex(depName)}['"\`/]`);
  return pattern.test(content);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/config-scanner.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config-scanner.js tests/config-scanner.test.js
git commit -m "refactor: export isReferenced for testing"
```

---

## Task 4: unused-detector — `@types/*`, mjs/cjs, packageJson param, warnings

**Files:**
- Modify: `src/unused-detector.js`
- Test: `tests/unused-detector.test.js`

**Interfaces:**
- Consumes: `parseFileImports` now returns `{ referenced, warnings }` (Task 2).
- Produces:
  - `export function resolveTypesUsage(referenced: Set<string>, deps: string[]): Set<string>` — deps of the form `@types/<base>` that should count as used.
  - `export async function findUnusedDependencies(directory: string, dependencies: Record<string,string>, packageJson: object): Promise<{ unusedDeps: {name,version,reason}[], warnings: string[] }>` (signature **changed**: added `packageJson`; return shape changed from array to `{ unusedDeps, warnings }`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unused-detector.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTypesUsage } from '../src/unused-detector.js';

test('marks @types/* used when its base package is referenced', () => {
  const referenced = new Set(['react', '@babel/core']);
  const deps = ['@types/react', '@types/babel__core', '@types/lodash', '@types/node'];
  const used = resolveTypesUsage(referenced, deps);
  assert.ok(used.has('@types/react'), 'react referenced');
  assert.ok(used.has('@types/babel__core'), 'maps to @babel/core');
  assert.ok(used.has('@types/node'), 'node always used');
  assert.ok(!used.has('@types/lodash'), 'lodash not referenced');
});

test('ignores non-@types deps', () => {
  const used = resolveTypesUsage(new Set(['react']), ['react', 'lodash']);
  assert.equal(used.size, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unused-detector.test.js`
Expected: FAIL — `resolveTypesUsage` is not exported.

- [ ] **Step 3: Rewrite `src/unused-detector.js`**

Replace the entire file with:

```js
import path from 'path';
import { glob } from 'glob';
import { parseFileImports } from './ast-parser.js';
import { scanConfigFiles } from './config-scanner.js';

export function resolveTypesUsage(referenced, deps) {
  const used = new Set();
  for (const dep of deps) {
    if (!dep.startsWith('@types/')) continue;
    if (dep === '@types/node') {
      used.add(dep);
      continue;
    }
    const base = dep.slice('@types/'.length);
    // @types encodes scoped packages as `scope__name` → `@scope/name`
    const baseName = base.includes('__') ? '@' + base.replace('__', '/') : base;
    if (referenced.has(baseName)) used.add(dep);
  }
  return used;
}

export async function findUnusedDependencies(directory, dependencies, packageJson) {
  const allDeps = Object.keys(dependencies);
  const warnings = [];

  const files = await glob('**/*.{js,jsx,ts,tsx,mjs,cjs}', {
    cwd: directory,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const parsed = await Promise.all(
    files.map((file) => parseFileImports(path.join(directory, file)))
  );

  const allDepsSet = new Set(allDeps);
  const referenced = new Set();
  const allReferenced = new Set();
  for (const { referenced: fileRefs, warnings: fileWarnings } of parsed) {
    for (const pkg of fileRefs) {
      allReferenced.add(pkg);
      if (allDepsSet.has(pkg)) referenced.add(pkg);
    }
    warnings.push(...fileWarnings);
  }

  const configReferenced = await scanConfigFiles(directory, allDeps);
  for (const pkg of configReferenced) referenced.add(pkg);

  const scripts = Object.values(packageJson.scripts || {});
  for (const dep of allDeps) {
    const pattern = new RegExp(
      `(?:^|\\s|['"./])${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|['"./])`
    );
    if (scripts.some((script) => pattern.test(script))) referenced.add(dep);
  }

  // @types/* resolution: use the full referenced set (all imports, not only deps)
  const typesUsed = resolveTypesUsage(allReferenced, allDeps);
  for (const dep of typesUsed) referenced.add(dep);

  const unusedDeps = [];
  for (const dep of allDeps) {
    if (!referenced.has(dep)) {
      unusedDeps.push({
        name: dep,
        version: dependencies[dep],
        reason: 'Not imported in any source or config file',
      });
    }
  }

  return { unusedDeps, warnings };
}
```

Note: `fs`/`path` re-read of package.json is removed; the caller passes `packageJson`. `resolveTypesUsage` is fed `allReferenced` (every import seen, including packages not in deps) so a `@types/react` resolves even when `react` itself is a dependency that is separately counted.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unused-detector.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/unused-detector.js tests/unused-detector.test.js
git commit -m "fix: resolve @types/* usage, scan mjs/cjs, take packageJson param"
```

---

## Task 5: security-checker — OSV.dev rewrite

**Files:**
- Modify: `src/security-checker.js`
- Test: `tests/security-checker.test.js`

**Interfaces:**
- Consumes: `mapWithConcurrency` (Task 1).
- Produces:
  - `export function mapOsvVulns(vulns?: object[]): {severity,title,description}[]`
  - `export function resolveInstalledVersion(directory: string, dep: string): string | null`
  - `export async function checkVulnerabilities(dependencies: Record<string,string>, directory: string): Promise<{ vulnerabilities: Record<string, object[]>, skipped: string[], failed: boolean }>`

- [ ] **Step 1: Write the failing test**

```js
// tests/security-checker.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOsvVulns } from '../src/security-checker.js';

test('mapOsvVulns maps OSV entries to display shape', () => {
  const vulns = [
    {
      id: 'GHSA-1',
      summary: 'Prototype pollution',
      details: 'A long description',
      database_specific: { severity: 'HIGH' },
    },
  ];
  assert.deepEqual(mapOsvVulns(vulns), [
    { severity: 'HIGH', title: 'Prototype pollution', description: 'A long description' },
  ]);
});

test('mapOsvVulns falls back when fields are missing', () => {
  const [mapped] = mapOsvVulns([{ id: 'GHSA-2' }]);
  assert.equal(mapped.severity, 'UNKNOWN');
  assert.equal(mapped.title, 'GHSA-2');
  assert.equal(mapped.description, '');
});

test('mapOsvVulns handles undefined input', () => {
  assert.deepEqual(mapOsvVulns(), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/security-checker.test.js`
Expected: FAIL — `mapOsvVulns` not exported.

- [ ] **Step 3: Rewrite `src/security-checker.js`**

Replace the entire file with:

```js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { mapWithConcurrency } from './util/concurrency.js';

const OSV_ENDPOINT = 'https://api.osv.dev/v1/query';
const CONCURRENCY = 8;

export function mapOsvVulns(vulns = []) {
  return vulns.map((v) => ({
    severity: v.database_specific?.severity ?? 'UNKNOWN',
    title: v.summary ?? v.id ?? 'Unknown vulnerability',
    description: v.details ?? '',
  }));
}

export function resolveInstalledVersion(directory, dep) {
  try {
    const pkgPath = path.join(directory, 'node_modules', dep, 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || null;
  } catch {
    return null;
  }
}

export async function checkVulnerabilities(dependencies, directory) {
  const deps = Object.keys(dependencies);
  const vulnerabilities = {};
  const skipped = [];
  let attempted = 0;
  let errored = 0;

  await mapWithConcurrency(deps, CONCURRENCY, async (dep) => {
    const version = resolveInstalledVersion(directory, dep);
    if (!version) {
      skipped.push(dep);
      return;
    }
    attempted++;
    try {
      const res = await axios.post(OSV_ENDPOINT, {
        version,
        package: { name: dep, ecosystem: 'npm' },
      });
      const issues = mapOsvVulns(res.data?.vulns);
      if (issues.length > 0) vulnerabilities[dep] = issues;
    } catch {
      errored++;
    }
  });

  const failed = attempted > 0 && errored === attempted;
  return { vulnerabilities, skipped, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/security-checker.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/security-checker.js tests/security-checker.test.js
git commit -m "feat: replace retired Snyk API with OSV.dev, skip uninstalled deps"
```

---

## Task 6: alternative-suggester — deprecation-only rewrite

**Files:**
- Modify: `src/alternative-suggester.js`
- Test: `tests/alternative-suggester.test.js`

**Interfaces:**
- Consumes: `mapWithConcurrency` (Task 1).
- Produces:
  - `export function extractDeprecation(registryDoc: object): { deprecated: string, lastUpdated: string|null } | null`
  - `export async function suggestAlternatives(dependencies: Record<string,string>): Promise<Record<string, {name,deprecated,lastUpdated}>>`

- [ ] **Step 1: Write the failing test**

```js
// tests/alternative-suggester.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeprecation } from '../src/alternative-suggester.js';

test('extractDeprecation returns message for deprecated latest version', () => {
  const doc = {
    'dist-tags': { latest: '2.88.2' },
    versions: { '2.88.2': { deprecated: 'request has been deprecated' } },
    time: { modified: '2020-01-01T00:00:00.000Z' },
  };
  assert.deepEqual(extractDeprecation(doc), {
    deprecated: 'request has been deprecated',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  });
});

test('extractDeprecation returns null for a healthy package', () => {
  const doc = {
    'dist-tags': { latest: '5.0.0' },
    versions: { '5.0.0': {} },
    time: { modified: '2024-01-01T00:00:00.000Z' },
  };
  assert.equal(extractDeprecation(doc), null);
});

test('extractDeprecation returns null when latest is missing', () => {
  assert.equal(extractDeprecation({}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/alternative-suggester.test.js`
Expected: FAIL — `extractDeprecation` not exported.

- [ ] **Step 3: Rewrite `src/alternative-suggester.js`**

Replace the entire file with:

```js
import axios from 'axios';
import { mapWithConcurrency } from './util/concurrency.js';

const CONCURRENCY = 8;

export function extractDeprecation(registryDoc) {
  const latest = registryDoc?.['dist-tags']?.latest;
  if (!latest) return null;
  const deprecated = registryDoc.versions?.[latest]?.deprecated;
  if (!deprecated) return null;
  return {
    deprecated: typeof deprecated === 'string' ? deprecated : 'This package is deprecated',
    lastUpdated: registryDoc.time?.modified ?? null,
  };
}

export async function suggestAlternatives(dependencies) {
  const deps = Object.keys(dependencies);
  const alternatives = {};

  await mapWithConcurrency(deps, CONCURRENCY, async (dep) => {
    try {
      const res = await axios.get(`https://registry.npmjs.org/${dep}`);
      const info = extractDeprecation(res.data);
      if (info) alternatives[dep] = { name: dep, ...info };
    } catch {
      // per-dep registry failure — omit silently
    }
  });

  return alternatives;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/alternative-suggester.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/alternative-suggester.js tests/alternative-suggester.test.js
git commit -m "feat: deprecation-only alternatives via real registry field"
```

---

## Task 7: analyzer — wire new contracts, real savings, deprecated section, warnings

**Files:**
- Modify: `src/analyzer.js`

**Interfaces:**
- Consumes: `findUnusedDependencies(dir, deps, packageJson) → { unusedDeps, warnings }`; `checkVulnerabilities(deps, dir) → { vulnerabilities, skipped, failed }`; `suggestAlternatives(deps) → { [dep]: {name,deprecated,lastUpdated} }`.
- Produces: no exported interface change (`analyzeProject` still the entry point).

- [ ] **Step 1: Rewrite `src/analyzer.js`**

Replace the entire file with:

```js
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findUnusedDependencies } from './unused-detector.js';
import { checkVulnerabilities } from './security-checker.js';
import { suggestAlternatives } from './alternative-suggester.js';

export async function analyzeProject(options = {}) {
  const spinner = ora('Analyzing your project dependencies...').start();
  const ignoreSet = new Set(options.ignore || []);
  const warnings = [];

  try {
    const packageJsonPath = path.join(options.directory, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      spinner.fail('No package.json found in the specified directory');
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    const filteredDependencies = Object.fromEntries(
      Object.entries(dependencies).filter(([depName]) => !ignoreSet.has(depName))
    );

    spinner.text = 'Scanning for unused dependencies...';
    const { unusedDeps, warnings: depWarnings } = await findUnusedDependencies(
      options.directory,
      filteredDependencies,
      packageJson
    );
    warnings.push(...depWarnings);

    spinner.text = 'Checking for security vulnerabilities...';
    const security = await checkVulnerabilities(filteredDependencies, options.directory);

    let deprecated = {};
    if (options.suggestions !== false) {
      spinner.text = 'Checking for deprecated packages...';
      deprecated = await suggestAlternatives(filteredDependencies);
    }

    spinner.succeed('Analysis complete!');

    displayResults({
      unusedDeps,
      security,
      deprecated,
      verbose: options.verbose,
      directory: options.directory,
    });

    if (warnings.length > 0) {
      console.log('\n' + chalk.dim('Warnings:'));
      for (const w of warnings) console.log(chalk.dim(`  - ${w}`));
    }
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('Error:'), error.message);
  }
}

function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // unreadable entry — skip
      }
    }
  }
  return total;
}

function getSavingsEstimate(unusedDeps, directory) {
  const nodeModules = path.join(directory, 'node_modules');
  if (!fs.existsSync(nodeModules)) return null;
  let bytes = 0;
  for (const dep of unusedDeps) {
    bytes += dirSize(path.join(nodeModules, dep.name));
  }
  return `~${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function displayResults({ unusedDeps, security, deprecated, verbose, directory }) {
  console.log('\n' + chalk.bold('📦 DEPENDENCY DETECTIVE REPORT') + '\n');

  // Unused dependencies
  console.log(chalk.bold('🗑️  Unused Dependencies:'));
  if (unusedDeps.length === 0) {
    console.log(chalk.green('  No unused dependencies found. Great job!'));
  } else {
    unusedDeps.forEach((dep) => {
      console.log(`  ${chalk.yellow(dep.name)} ${chalk.dim(`v${dep.version}`)}`);
      if (verbose && dep.reason) {
        console.log(`    ${chalk.dim(dep.reason)}`);
      }
    });
    const savings = getSavingsEstimate(unusedDeps, directory);
    if (savings) {
      console.log(chalk.dim(`\n  Removing these could free approximately ${savings} on disk`));
    }
  }

  // Security vulnerabilities
  console.log('\n' + chalk.bold('🔒 Security Vulnerabilities:'));
  const { vulnerabilities, skipped, failed } = security;
  if (failed) {
    console.log(chalk.yellow('  ⚠  Security check failed (network error). Try again later.'));
  } else if (Object.keys(vulnerabilities).length === 0) {
    console.log(chalk.green('  No known vulnerabilities detected.'));
  } else {
    Object.entries(vulnerabilities).forEach(([depName, issues]) => {
      console.log(`  ${chalk.red(depName)} ${chalk.dim(`(${issues.length} issues)`)}`);
      if (verbose) {
        issues.forEach((issue) => {
          console.log(`    - ${String(issue.severity).toUpperCase()}: ${issue.title}`);
          if (issue.description) console.log(`      ${chalk.dim(issue.description)}`);
        });
      }
    });
  }
  if (skipped && skipped.length > 0) {
    console.log(
      chalk.dim(
        `  ${skipped.length} package(s) not checked (not installed) — run \`npm install\` for full coverage.`
      )
    );
  }

  // Deprecated packages
  if (Object.keys(deprecated).length > 0) {
    console.log('\n' + chalk.bold('⚠️  Deprecated Packages:'));
    Object.entries(deprecated).forEach(([depName, info]) => {
      console.log(`  ${chalk.yellow(depName)}`);
      if (verbose) {
        console.log(`    ${chalk.dim(info.deprecated)}`);
        if (info.lastUpdated) console.log(`    ${chalk.dim(`Last updated: ${info.lastUpdated}`)}`);
      }
    });
  }

  // Next steps
  console.log('\n' + chalk.bold('📋 Next Steps:'));
  console.log('  1. Run with --verbose flag for more detailed information');
  console.log('  2. Consider removing unused dependencies with: npm uninstall [package-names]');
  console.log('  3. Address security vulnerabilities by updating affected packages');
  console.log('  4. Replace deprecated packages with maintained alternatives\n');
}
```

- [ ] **Step 2: Manual end-to-end verification (has node_modules)**

Run: `node index.js --verbose`
Expected: Report prints with real sections. Security section shows either real findings or "No known vulnerabilities detected" (not a token message). Deprecated section appears only if a dep is deprecated. No `@types`-style false positives in the unused list. Spinner is not interleaved with warning text.

- [ ] **Step 3: Manual verification of the skip path (no node_modules)**

Run:
```bash
cp -r . ../dd-tmp-test && rm -rf ../dd-tmp-test/node_modules && node index.js --directory ../dd-tmp-test
```
Expected: Security section lists "N package(s) not checked (not installed)". No crash. Then clean up: `rm -rf ../dd-tmp-test`.

- [ ] **Step 4: Commit**

```bash
git add src/analyzer.js
git commit -m "feat: wire OSV/deprecation contracts, real savings, buffered warnings"
```

---

## Task 8: package.json — test script and version bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `test` script and version**

In `package.json`, set the version and test script:

```json
  "version": "0.3.0",
```

```json
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: All test files pass (concurrency, ast-parser, config-scanner, unused-detector, security-checker, alternative-suggester).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: wire npm test to node --test, bump to 0.3.0"
```

---

## Task 9: README — reflect OSV, deprecation-only, honest savings

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Edit the Configuration section**

Replace the entire `## ⚙️ Configuration` section (the Snyk token instructions) with:

```markdown
## ⚙️ Configuration

No configuration or API tokens are required. Vulnerability data comes from the free
[OSV.dev](https://osv.dev) database and works out of the box.

> Note: vulnerability checks read the **installed** version of each package from
> `node_modules`. Run `npm install` first for full coverage — uninstalled packages are
> reported as "not checked".
```

- [ ] **Step 2: Update the Features and How It Works sections**

In `## ✨ Features`, replace the alternatives bullet:

```markdown
- **Deprecated Package Detection**: Flags dependencies whose latest version has been officially deprecated by its maintainer
```

In `## 🧩 How It Works`, replace steps 4 and 5:

```markdown
4. **Security Checking**: It queries the free OSV.dev vulnerability database for the installed version of each package (no token required)
5. **Deprecation Analysis**: It checks the npm registry for packages whose latest version is officially deprecated
```

- [ ] **Step 3: Update the example output block**

Replace the `## 📊 Example Output` fenced block with:

```markdown
📦 DEPENDENCY DETECTIVE REPORT

🗑️  Unused Dependencies:
  jquery v3.6.0
  moment v2.29.4

  Removing these could free approximately ~3.2MB on disk

🔒 Security Vulnerabilities:
  lodash (1 issues)

⚠️  Deprecated Packages:
  request

📋 Next Steps:
  1. Run with --verbose flag for more detailed information
  2. Consider removing unused dependencies with: npm uninstall [package-names]
  3. Address security vulnerabilities by updating affected packages
  4. Replace deprecated packages with maintained alternatives
```

- [ ] **Step 4: Update the project structure and roadmap**

In `### Project Structure`, add the util file and update the alternatives description:

```markdown
    ├── security-checker.js    # Checks vulnerabilities via OSV.dev (no token)
    ├── alternative-suggester.js # Flags officially-deprecated packages
    └── util/
        └── concurrency.js     # Concurrency-capped async map helper
```

In `## 📝 Roadmap`, update the checkboxes:

```markdown
- [x] Improve detection accuracy with AST parsing
- [x] Scan config files for build-tool package references
- [x] Token-free vulnerability checks via OSV.dev
- [ ] `--fix` / interactive removal of unused dependencies
- [ ] Add support for monorepos and workspaces
- [ ] `--json` output and CI mode with exit codes
- [ ] Maintenance/abandonment signals for dependencies
```

- [ ] **Step 5: Update Limitations**

In `## ⚠️ Limitations`, replace the Snyk bullet:

```markdown
- Vulnerability checks read the installed version from `node_modules`; uninstalled packages are skipped
- Vue/Svelte/Astro single-file components are not yet scanned for imports
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document OSV, deprecation-only, and honest savings"
```

---

## Self-Review Notes

- **Spec coverage:** §1 OSV skip-don't-guess → Task 5. §2 deprecation-only → Task 6. §3 unused fixes (@types, mjs/cjs, packageJson param) → Task 4. §4 analyzer (savings, display, warnings) → Task 7. §5 warning plumbing → Tasks 2 + 4 + 7. §6 tests → Tasks 1–6. §7 README → Task 9. Version bump → Task 8. All covered.
- **Type consistency:** `{ referenced, warnings }` (Task 2) consumed in Task 4; `{ unusedDeps, warnings }` (Task 4) consumed in Task 7; `{ vulnerabilities, skipped, failed }` (Task 5) consumed in Task 7; `{ [dep]: {name,deprecated,lastUpdated} }` (Task 6) consumed in Task 7. `mapWithConcurrency(items, limit, fn)` (Task 1) called consistently in Tasks 5 and 6.
- **No placeholders:** every code step shows complete file contents or exact edits.
```
