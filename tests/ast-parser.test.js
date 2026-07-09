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
