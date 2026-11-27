import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectPackageManager } from '../src/package-manager.js';
import { buildFixCommands } from '../src/fix-commands.js';

function dirWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-pm-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), '');
  return dir;
}

test('detectPackageManager reads the lockfile', () => {
  assert.deepEqual(detectPackageManager(dirWith(['pnpm-lock.yaml'])), { name: 'pnpm', warning: null });
  assert.deepEqual(detectPackageManager(dirWith(['yarn.lock'])), { name: 'yarn', warning: null });
  assert.deepEqual(detectPackageManager(dirWith(['bun.lockb'])), { name: 'bun', warning: null });
  assert.deepEqual(detectPackageManager(dirWith(['bun.lock'])), { name: 'bun', warning: null });
  assert.deepEqual(detectPackageManager(dirWith(['package-lock.json'])), { name: 'npm', warning: null });
  assert.deepEqual(detectPackageManager(dirWith([])), { name: 'npm', warning: null });
});

test('detectPackageManager falls back to npm with a warning on conflicting lockfiles', () => {
  const { name, warning } = detectPackageManager(dirWith(['yarn.lock', 'pnpm-lock.yaml']));
  assert.equal(name, 'npm');
  assert.match(warning, /yarn\.lock/);
  assert.match(warning, /pnpm-lock\.yaml/);
});

const sample = {
  missing: [
    { name: 'dayjs', installedVersion: '1.11.10', scope: 'production' },
    { name: 'supertest', installedVersion: '6.3.4', scope: 'development' },
  ],
  unused: [{ name: 'moment' }],
  vulnerabilities: [
    { name: 'axios', scope: 'production', fixVersion: '1.12.0', majorUpgrade: false },
    { name: 'vite', scope: 'development', fixVersion: '5.0.13', majorUpgrade: false },
  ],
};

test('full npm example', () => {
  assert.deepEqual(buildFixCommands({ packageManager: 'npm', ...sample }), [
    'npm install dayjs@^1.11.10',
    'npm install -D supertest@^6.3.4',
    'npm uninstall moment',
    'npm install axios@1.12.0',
    'npm install -D vite@5.0.13',
  ]);
});

test('pnpm verbs', () => {
  const cmds = buildFixCommands({ packageManager: 'pnpm', ...sample });
  assert.equal(cmds[0], 'pnpm add dayjs@^1.11.10');
  assert.equal(cmds[2], 'pnpm remove moment');
  assert.equal(cmds[4], 'pnpm add -D vite@5.0.13');
});

test('yarn and bun verbs', () => {
  assert.equal(buildFixCommands({ packageManager: 'yarn', ...sample })[1], 'yarn add -D supertest@^6.3.4');
  assert.equal(buildFixCommands({ packageManager: 'bun', ...sample })[1], 'bun add -d supertest@^6.3.4');
  assert.equal(buildFixCommands({ packageManager: 'bun', ...sample })[2], 'bun remove moment');
});

test('groups list several packages sorted in one command', () => {
  const cmds = buildFixCommands({
    packageManager: 'npm',
    missing: [],
    unused: [{ name: 'moment' }, { name: 'jquery' }],
    vulnerabilities: [],
  });
  assert.deepEqual(cmds, ['npm uninstall jquery moment']);
});

test('unused and vulnerable → uninstall only', () => {
  const cmds = buildFixCommands({
    packageManager: 'npm',
    missing: [],
    unused: [{ name: 'moment' }],
    vulnerabilities: [{ name: 'moment', scope: 'production', fixVersion: '2.29.4', majorUpgrade: false }],
  });
  assert.deepEqual(cmds, ['npm uninstall moment']);
});

test('missing and vulnerable → one pinned install', () => {
  const cmds = buildFixCommands({
    packageManager: 'npm',
    missing: [{ name: 'dayjs', installedVersion: '1.0.0', scope: 'production' }],
    unused: [],
    vulnerabilities: [{ name: 'dayjs', scope: 'production', fixVersion: '1.0.5', majorUpgrade: false }],
  });
  assert.deepEqual(cmds, ['npm install dayjs@1.0.5']);
});

test('no fix → omitted', () => {
  const cmds = buildFixCommands({
    packageManager: 'npm',
    missing: [],
    unused: [],
    vulnerabilities: [{ name: 'x', scope: 'production', fixVersion: null, majorUpgrade: false }],
  });
  assert.deepEqual(cmds, []);
});

test('major upgrade → own line with comment', () => {
  const cmds = buildFixCommands({
    packageManager: 'npm',
    missing: [],
    unused: [],
    vulnerabilities: [
      { name: 'axios', scope: 'production', fixVersion: '1.12.0', majorUpgrade: false },
      { name: 'lodash', scope: 'production', fixVersion: '5.0.0', majorUpgrade: true },
    ],
  });
  assert.deepEqual(cmds, [
    'npm install axios@1.12.0',
    'npm install lodash@5.0.0  # major upgrade, check the changelog',
  ]);
});

test('nothing to fix → []', () => {
  assert.deepEqual(
    buildFixCommands({ packageManager: 'npm', missing: [], unused: [], vulnerabilities: [] }),
    []
  );
});
