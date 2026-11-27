import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAnalysis, exitCodeFor } from '../src/analyzer.js';

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.js');

// Packages are never installed in these projects, so the security check skips
// them and, with suggestions off, no network calls are made.
function tempProject(packageJson, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-analyzer-'));
  if (packageJson) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson));
  }
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function runCli(args) {
  const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const emptyReport = {
  unused: [],
  vulnerabilities: [],
  deprecated: [],
};

test('exitCodeFor is 0 for a clean report', () => {
  assert.equal(exitCodeFor(emptyReport), 0);
});

test('exitCodeFor is 1 when there are unused deps or vulnerabilities', () => {
  assert.equal(exitCodeFor({ ...emptyReport, unused: [{ name: 'x' }] }), 1);
  assert.equal(exitCodeFor({ ...emptyReport, vulnerabilities: [{ name: 'x', issues: [{}] }] }), 1);
});

test('exitCodeFor ignores deprecated packages', () => {
  assert.equal(exitCodeFor({ ...emptyReport, deprecated: [{ name: 'request' }] }), 0);
});

test('runAnalysis returns a plain report object', async () => {
  const dir = tempProject(
    { dependencies: { express: '^4.0.0', lodash: '^4.0.0' } },
    { 'index.js': "import express from 'express';\n" }
  );
  const report = await runAnalysis({ directory: dir, suggestions: false });
  assert.deepEqual(report.unused, [{ name: 'lodash', version: '^4.0.0' }]);
  assert.deepEqual(report.vulnerabilities, []);
  assert.deepEqual(report.notChecked.sort(), ['express', 'lodash']);
  assert.equal(report.securityCheckFailed, false);
  assert.equal(report.deprecated, null);
  assert.deepEqual(report.summary, { unused: 1, vulnerable: 0, deprecated: 0 });
});

test('--json prints only JSON and exits 1 when unused deps are found', () => {
  const dir = tempProject(
    { dependencies: { lodash: '^4.0.0' } },
    { 'index.js': 'console.log(1);\n' }
  );
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  assert.equal(code, 1);
  const report = JSON.parse(stdout);
  assert.deepEqual(report.unused, [{ name: 'lodash', version: '^4.0.0' }]);
});

test('--json exits 0 for a clean project', () => {
  const dir = tempProject(
    { dependencies: { lodash: '^4.0.0' } },
    { 'index.js': "require('lodash');\n" }
  );
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).unused, []);
});

test('missing package.json exits 2, with a JSON error in --json mode', () => {
  const dir = tempProject(null);
  const json = runCli(['--json', '-d', dir]);
  assert.equal(json.code, 2);
  assert.match(JSON.parse(json.stdout).error, /package\.json/);

  const human = runCli(['-d', dir]);
  assert.equal(human.code, 2);
});

test('runAnalysis skips packages in the saved ignore list and --ignore', async () => {
  const dir = tempProject(
    {
      dependencies: { lodash: '^4.0.0', postcss: '^8.0.0', moment: '^2.0.0' },
      devDependencies: { '@types/node': '^20.0.0', '@types/lodash': '^4.0.0' },
      dependencyDetective: { ignore: ['postcss', '@types/*'] },
    },
    { 'a.js': "require('lodash');\n" }
  );
  const report = await runAnalysis({ directory: dir, suggestions: false, ignore: ['moment'] });
  assert.deepEqual(report.unused, []);
  assert.deepEqual(report.ignored, ['@types/lodash', '@types/node', 'moment', 'postcss']);
});

test('--json exits 0 when the only unused package is in the saved ignore list', () => {
  const dir = tempProject(
    { dependencies: { postcss: '^8.0.0' }, dependencyDetective: { ignore: ['postcss'] } },
    { 'a.js': '1;\n' }
  );
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).ignored, ['postcss']);
});

test('an invalid saved ignore list exits 2 with an explanation', () => {
  const dir = tempProject({ dependencyDetective: { ignore: 'postcss' } });
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  assert.equal(code, 2);
  assert.match(JSON.parse(stdout).error, /dependencyDetective\.ignore/);
});

test('human-readable mode also exits 1 when unused deps are found', () => {
  const dir = tempProject({ dependencies: { lodash: '^4.0.0' } }, { 'a.js': '1;\n' });
  assert.equal(runCli(['--no-suggestions', '-d', dir]).code, 1);
});
