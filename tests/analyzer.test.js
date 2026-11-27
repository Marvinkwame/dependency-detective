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
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

// Fakes an installed package. Note: installed packages are sent to OSV, so these
// tests may make a network call; their assertions hold whether or not it succeeds.
function install(dir, name, version) {
  const pkgDir = path.join(dir, 'node_modules', name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
}

function runCli(args) {
  const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const emptyReport = {
  unused: [],
  missing: [],
  vulnerabilities: [],
  deprecated: [],
};

test('exitCodeFor is 0 for a clean report', () => {
  assert.equal(exitCodeFor(emptyReport), 0);
});

test('exitCodeFor is 1 for unused deps, production vulnerabilities or production missing', () => {
  assert.equal(exitCodeFor({ ...emptyReport, unused: [{ name: 'x' }] }), 1);
  assert.equal(exitCodeFor({ ...emptyReport, vulnerabilities: [{ scope: 'production' }] }), 1);
  assert.equal(exitCodeFor({ ...emptyReport, missing: [{ scope: 'production' }] }), 1);
});

test('exitCodeFor is 0 for dev-only vulnerabilities and dev-use missing', () => {
  assert.equal(exitCodeFor({ ...emptyReport, vulnerabilities: [{ scope: 'development' }] }), 0);
  assert.equal(exitCodeFor({ ...emptyReport, missing: [{ scope: 'development' }] }), 0);
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
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.unresolvedImports, []);
  assert.deepEqual(report.fixCommands, ['npm uninstall lodash']);
  assert.equal(report.packageManager, 'npm');
  assert.deepEqual(report.summary, {
    missingProduction: 0,
    missingDev: 0,
    unused: 1,
    vulnerableProduction: 0,
    vulnerableDev: 0,
    deprecated: 0,
  });
});

test('--json reports production missing and exits 1', () => {
  const dir = tempProject({ name: 'app' }, { 'src/a.js': "import dayjs from 'dayjs';\n" });
  install(dir, 'dayjs', '1.11.10');
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  const report = JSON.parse(stdout);
  assert.equal(report.missing[0].name, 'dayjs');
  assert.ok(report.fixCommands.includes('npm install dayjs@^1.11.10'));
  assert.equal(code, 1);
});

test('dev-use missing only exits 0', () => {
  const dir = tempProject({ name: 'app' }, { 'tests/a.test.js': "require('supertest');\n" });
  install(dir, 'supertest', '6.3.4');
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  assert.equal(JSON.parse(stdout).summary.missingDev, 1);
  assert.equal(code, 0);
});

test('declared-but-ignored import is not missing', async () => {
  const dir = tempProject(
    { dependencies: { postcss: '^8.0.0' }, dependencyDetective: { ignore: ['postcss'] } },
    { 'src/a.js': "require('postcss');\n" }
  );
  install(dir, 'postcss', '8.4.0');
  const report = await runAnalysis({ directory: dir, suggestions: false });
  assert.deepEqual(report.missing, []);
});

test('unresolved import is a warning, exit 0', () => {
  const dir = tempProject({ name: 'app' }, { 'src/a.js': "import ui from '@acme/ui';\n" });
  const { code, stdout } = runCli(['--json', '--no-suggestions', '-d', dir]);
  const report = JSON.parse(stdout);
  assert.ok(report.warnings.some((w) => w.includes('@acme/ui')));
  assert.equal(code, 0);
});

test('human report shows Missing Dependencies and Suggested commands', () => {
  const dir = tempProject({ name: 'app' }, { 'src/a.js': "import dayjs from 'dayjs';\n" });
  install(dir, 'dayjs', '1.11.10');
  const { stdout } = runCli(['--no-suggestions', '-d', dir]);
  assert.match(stdout, /Missing Dependencies/);
  assert.ok(stdout.includes('npm install dayjs@^1.11.10'));
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
