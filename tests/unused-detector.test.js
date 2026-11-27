import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTypesUsage, findUnusedDependencies } from '../src/unused-detector.js';

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

function tempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-unused-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('skips generated folders', async () => {
  const dir = tempProject({
    '.next/server/x.js': "require('lodash');\n",
    'coverage/y.js': "require('lodash');\n",
    'src/a.js': '1;\n',
  });
  const { unusedDeps, fileImports } = await findUnusedDependencies(dir, { lodash: '^4.0.0' }, {});
  assert.deepEqual(unusedDeps.map((d) => d.name), ['lodash']);
  assert.ok(!fileImports.some((f) => f.file.startsWith('.next/') || f.file.startsWith('coverage/')));
});

test('fileImports uses POSIX paths', async () => {
  const dir = tempProject({ 'src/nested/a.js': "import x from 'lodash';\n" });
  const { fileImports } = await findUnusedDependencies(dir, { lodash: '^4.0.0' }, {});
  assert.deepEqual(fileImports.map((f) => f.file), ['src/nested/a.js']);
  assert.deepEqual(fileImports[0].imports, [{ source: 'lodash', typeOnly: false }]);
});

test('scans .storybook but not other hidden folders', async () => {
  const dir = tempProject({
    '.storybook/main.js': "require('lodash');\n",
    '.yarn/releases/yarn.cjs': "require('chalk');\n",
  });
  const { unusedDeps } = await findUnusedDependencies(dir, { lodash: '1', chalk: '1' }, {});
  assert.deepEqual(unusedDeps.map((d) => d.name), ['chalk']);
});
