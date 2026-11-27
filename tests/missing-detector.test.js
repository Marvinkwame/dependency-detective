import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findMissingDependencies, isDevFile } from '../src/missing-detector.js';

function projectWith(installed = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-missing-'));
  for (const [name, version] of Object.entries(installed)) {
    const pkgDir = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
  }
  return dir;
}

const imp = (source, typeOnly = false) => ({ source, typeOnly });

function run({ installed = {}, packageJson = {}, fileImports, isAlias = () => false, isIgnored = () => false }) {
  return findMissingDependencies({
    directory: projectWith(installed),
    packageJson,
    fileImports,
    isAlias,
    isIgnored,
  });
}

test('reports an installed but undeclared import as production missing', () => {
  const result = run({
    installed: { dayjs: '1.11.10' },
    fileImports: [{ file: 'src/a.js', imports: [imp('dayjs')] }],
  });
  assert.deepEqual(result.missing, [
    { name: 'dayjs', installedVersion: '1.11.10', scope: 'production', importedFrom: ['src/a.js'] },
  ]);
  assert.deepEqual(result.unresolvedImports, []);
});

test('test-only import is development scope', () => {
  const result = run({
    installed: { supertest: '6.3.4' },
    fileImports: [{ file: 'tests/api.test.js', imports: [imp('supertest')] }],
  });
  assert.equal(result.missing[0].scope, 'development');
});

test('app and test import → production, files sorted and de-duplicated', () => {
  const result = run({
    installed: { dayjs: '1.0.0' },
    fileImports: [
      { file: 'tests/a.test.js', imports: [imp('dayjs')] },
      { file: 'src/b.js', imports: [imp('dayjs'), imp('dayjs/plugin/utc')] },
    ],
  });
  assert.equal(result.missing[0].scope, 'production');
  assert.deepEqual(result.missing[0].importedFrom, ['src/b.js', 'tests/a.test.js']);
});

test('built-ins are skipped', () => {
  const result = run({
    fileImports: [
      {
        file: 'src/a.js',
        imports: ['fs', 'fs/promises', 'node:path', 'node:test', 'node:sqlite'].map((s) => imp(s)),
      },
    ],
  });
  assert.deepEqual(result, { missing: [], unresolvedImports: [] });
});

test('declared in any section, own name, aliases and ignored are skipped', () => {
  const result = run({
    installed: { a: '1', b: '1', c: '1', d: '1', self: '1', e: '1', f: '1' },
    packageJson: {
      name: 'self',
      dependencies: { a: '1' },
      devDependencies: { b: '1' },
      peerDependencies: { c: '1' },
      optionalDependencies: { d: '1' },
    },
    fileImports: [
      { file: 'src/x.js', imports: ['a', 'b', 'c', 'd', 'self', 'e', 'f', './local', '/abs'].map((s) => imp(s)) },
    ],
    isAlias: (s) => s === 'e',
    isIgnored: (n) => n === 'f',
  });
  assert.deepEqual(result, { missing: [], unresolvedImports: [] });
});

test('scoped subpath import resolves to package', () => {
  const result = run({
    installed: { '@scope/pkg': '2.0.0' },
    fileImports: [{ file: 'src/a.js', imports: [imp('@scope/pkg/sub')] }],
  });
  assert.equal(result.missing[0].name, '@scope/pkg');
  assert.equal(result.missing[0].installedVersion, '2.0.0');
});

test('type-only import satisfied by @types', () => {
  const base = {
    installed: { express: '4.0.0' },
    packageJson: { devDependencies: { '@types/express': '4.0.0' } },
  };
  assert.deepEqual(
    run({ ...base, fileImports: [{ file: 'src/a.ts', imports: [imp('express', true)] }] }).missing,
    []
  );
  assert.equal(
    run({ ...base, fileImports: [{ file: 'src/a.ts', imports: [imp('express')] }] }).missing.length,
    1
  );
});

test('scoped type-only import uses @types/scope__name', () => {
  const result = run({
    installed: { '@babel/core': '7.0.0' },
    packageJson: { devDependencies: { '@types/babel__core': '7.0.0' } },
    fileImports: [{ file: 'src/a.ts', imports: [imp('@babel/core', true)] }],
  });
  assert.deepEqual(result.missing, []);
});

test('not installed and not declared is unresolved', () => {
  const result = run({ fileImports: [{ file: 'src/App.js', imports: [imp('@acme/ui')] }] });
  assert.deepEqual(result, {
    missing: [],
    unresolvedImports: [{ specifier: '@acme/ui', importedFrom: ['src/App.js'] }],
  });
});

test('isDevFile', () => {
  for (const f of ['src/a.test.ts', 'src/a.spec.js', 'src/__tests__/x.js', 'test/x.js', 'tests/x.js', 'vite.config.ts', '.storybook/main.js']) {
    assert.ok(isDevFile(f), f);
  }
  for (const f of ['src/testing-utils.js', 'src/contest.js', 'src/config.js']) {
    assert.ok(!isDevFile(f), f);
  }
});
