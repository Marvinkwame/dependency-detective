import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commandNames, scriptsUse, findScriptReferences } from '../src/script-scanner.js';

function tempProject(installed = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-scripts-'));
  for (const [name, pkg] of Object.entries(installed)) {
    const pkgDir = path.join(dir, 'node_modules', name);
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, ...pkg }));
  }
  return dir;
}

test('commandNames reads object and string bin fields from node_modules', () => {
  const dir = tempProject({
    typescript: { bin: { tsc: './bin/tsc', tsserver: './bin/tsserver' } },
    '@scope/tool': { bin: './cli.js' },
  });
  assert.deepEqual(commandNames(dir, 'typescript').sort(), ['tsc', 'tsserver', 'typescript']);
  assert.deepEqual(commandNames(dir, '@scope/tool').sort(), ['@scope/tool', 'tool']);
});

test('commandNames falls back to known commands when the package is not installed', () => {
  const dir = tempProject();
  assert.ok(commandNames(dir, 'typescript').includes('tsc'));
  assert.ok(commandNames(dir, 'npm-run-all').includes('run-s'));
  assert.deepEqual(commandNames(dir, 'left-pad'), ['left-pad']);
});

test('scriptsUse matches commands chained, prefixed, or via npx and .bin paths', () => {
  const uses = (script, cmd) => scriptsUse([script], cmd);
  assert.ok(uses('tsc -p .', 'tsc'));
  assert.ok(uses('npm run clean&&tsc', 'tsc'));
  assert.ok(uses('cross-env NODE_ENV=production tsc', 'tsc'));
  assert.ok(uses('npx tsc --noEmit', 'tsc'));
  assert.ok(uses('node_modules/.bin/tsc', 'tsc'));
  assert.ok(uses('(tsc; echo done)', 'tsc'));
  assert.ok(uses('lint-staged || exit 1', 'lint-staged'));
});

test('scriptsUse does not match other words containing the command', () => {
  assert.ok(!scriptsUse(['tsc-watch src'], 'tsc'));
  assert.ok(!scriptsUse(['echo mytsc'], 'tsc'));
  assert.ok(!scriptsUse(['run-script build'], 'run-s'));
});

test('findScriptReferences returns packages whose commands appear in scripts', () => {
  const dir = tempProject({
    typescript: { bin: { tsc: './bin/tsc' } },
    '@biomejs/biome': { bin: { biome: './bin/biome' } },
    rimraf: { bin: { rimraf: './dist/bin.js' } },
    lodash: {},
  });
  const scripts = { build: 'rimraf dist && tsc', lint: 'biome check .' };
  const found = findScriptReferences(dir, ['typescript', '@biomejs/biome', 'rimraf', 'lodash'], scripts);
  assert.deepEqual([...found].sort(), ['@biomejs/biome', 'rimraf', 'typescript']);
});
