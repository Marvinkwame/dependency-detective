import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonc, loadAliasMatcher } from '../src/alias-resolver.js';

function tempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-alias-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    if (name.endsWith('/')) {
      fs.mkdirSync(full, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

test('parseJsonc handles comments and trailing commas', () => {
  assert.deepEqual(parseJsonc('{ // c\n "a": [1,2,], /* x */ "b": "http://x" }'), {
    a: [1, 2],
    b: 'http://x',
  });
});

test('paths keys are aliases', () => {
  const dir = tempProject({
    'tsconfig.json': { compilerOptions: { paths: { '@/*': ['src/*'], utils: ['src/utils'] } } },
  });
  const { isAlias } = loadAliasMatcher(dir, {});
  assert.ok(isAlias('@/components/Button'));
  assert.ok(isAlias('utils'));
  assert.ok(!isAlias('lodash'));
});

test('follows relative extends', () => {
  const dir = tempProject({
    'tsconfig.json': { extends: './.nuxt/tsconfig.json' },
    '.nuxt/tsconfig.json': { compilerOptions: { paths: { '#app': ['x'], '~~/*': ['y/*'] } } },
  });
  const { isAlias } = loadAliasMatcher(dir, {});
  assert.ok(isAlias('~~/x'));
});

test('child paths replace parent paths', () => {
  const dir = tempProject({
    'tsconfig.json': { extends: './base.json', compilerOptions: { paths: { 'child/*': ['c/*'] } } },
    'base.json': { compilerOptions: { paths: { 'parent/*': ['p/*'] } } },
  });
  const { isAlias } = loadAliasMatcher(dir, {});
  assert.ok(isAlias('child/x'));
  assert.ok(!isAlias('parent/x'));
});

test('jsconfig.json is used when there is no tsconfig.json', () => {
  const dir = tempProject({ 'jsconfig.json': { compilerOptions: { paths: { 'app/*': ['src/*'] } } } });
  assert.ok(loadAliasMatcher(dir, {}).isAlias('app/x'));
});

test('baseUrl local folders are aliases', () => {
  const dir = tempProject({
    'tsconfig.json': { compilerOptions: { baseUrl: 'src' } },
    'src/utils/': null,
    'src/config.ts': 'export {};\n',
  });
  const { isAlias } = loadAliasMatcher(dir, {});
  assert.ok(isAlias('utils/date'));
  assert.ok(isAlias('config'));
  assert.ok(!isAlias('lodash'));
});

test('package.json imports, colon schemes and framework prefixes', () => {
  const dir = tempProject({});
  const { isAlias } = loadAliasMatcher(dir, { imports: { '#internal/*': './src/internal/*' } });
  for (const s of ['#internal/x', 'astro:content', 'virtual:pwa', '~/utils', '@/x', '$app/stores', '$lib']) {
    assert.ok(isAlias(s), s);
  }
  assert.ok(!isAlias('node:fs'));
});

test('broken tsconfig warns', () => {
  const dir = tempProject({ 'tsconfig.json': '{ "compilerOptions": ' });
  const { warnings } = loadAliasMatcher(dir, {});
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /tsconfig\.json/);
});

test('parseJsonc drops a trailing comma followed by a comment', () => {
  assert.deepEqual(parseJsonc('{"a":1, // c\n}'), { a: 1 });
  assert.deepEqual(parseJsonc('{"a":[1,/*x*/]}'), { a: [1] });
  assert.deepEqual(parseJsonc('{"a":1,\n// c\n}'), { a: 1 });
});

test('a missing relative extends target keeps the config own options', () => {
  const dir = tempProject({
    'tsconfig.json': { extends: './.nuxt/tsconfig.json', compilerOptions: { paths: { 'app/*': ['src/*'] } } },
  });
  const { isAlias, warnings } = loadAliasMatcher(dir, {});
  assert.ok(isAlias('app/x'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\.nuxt/);
});
