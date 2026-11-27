import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

test('parseFileImports returns raw specifiers', async () => {
  const { imports } = await parseFileImports(path.join(here, 'fixtures', 'sample-imports.js'));
  const sources = imports.map((i) => i.source);
  for (const s of ['lodash/get', './local.js', 'express', 'ora']) {
    assert.ok(sources.includes(s), `missing ${s}`);
  }
});

test('parseFileImports flags type-only imports', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-ast-'));
  const file = path.join(dir, 'a.ts');
  fs.writeFileSync(file, "import type { A } from 'a';\nimport b from 'b';\nexport type { C } from 'c';\n");
  const { imports } = await parseFileImports(file);
  const kind = Object.fromEntries(imports.map((i) => [i.source, i.typeOnly]));
  assert.deepEqual(kind, { a: true, b: false, c: true });
});
