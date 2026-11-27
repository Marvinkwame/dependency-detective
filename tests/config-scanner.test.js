import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isReferenced, eslintShortNames, isEslintReference, scanConfigFiles } from '../src/config-scanner.js';

test('matches quoted references and subpaths', () => {
  assert.ok(isReferenced(`import x from 'tailwindcss'`, 'tailwindcss'));
  assert.ok(isReferenced(`require('tailwindcss/plugin')`, 'tailwindcss'));
  assert.ok(isReferenced(`plugins: ["@tailwindcss/forms"]`, '@tailwindcss/forms'));
});

test('does not match unrelated substrings', () => {
  assert.ok(!isReferenced(`// tailwindcss-typography notes`, 'tailwindcss'));
  assert.ok(!isReferenced(`const tailwindcssHelper = 1`, 'tailwindcss'));
});

test('eslintShortNames maps plugin and config packages to their short names', () => {
  assert.deepEqual(eslintShortNames('eslint-plugin-react'), ['react']);
  assert.deepEqual(eslintShortNames('eslint-config-airbnb'), ['airbnb']);
  assert.deepEqual(eslintShortNames('@typescript-eslint/eslint-plugin'), ['@typescript-eslint']);
  assert.deepEqual(eslintShortNames('@scope/eslint-plugin-foo'), ['@scope/foo']);
  assert.deepEqual(eslintShortNames('@vue/eslint-config-typescript'), ['@vue/typescript']);
  assert.deepEqual(eslintShortNames('@scope/eslint-config'), ['@scope']);
  assert.deepEqual(eslintShortNames('react'), []);
  assert.deepEqual(eslintShortNames('eslint'), []);
});

test('isEslintReference matches short names in legacy JSON and YAML configs', () => {
  assert.ok(isEslintReference(`{ "plugins": ["react"] }`, 'eslint-plugin-react'));
  assert.ok(isEslintReference(`{ "extends": ["plugin:react/recommended"] }`, 'eslint-plugin-react'));
  assert.ok(isEslintReference(`{ "rules": { "react/jsx-key": "error" } }`, 'eslint-plugin-react'));
  assert.ok(isEslintReference(`extends:\n  - airbnb\n`, 'eslint-config-airbnb'));
  assert.ok(isEslintReference(`extends: airbnb/hooks`, 'eslint-config-airbnb'));
  assert.ok(isEslintReference(`{ "extends": ["plugin:@typescript-eslint/recommended"] }`, '@typescript-eslint/eslint-plugin'));
  assert.ok(isEslintReference(`{ "plugins": ["eslint-plugin-react"] }`, 'eslint-plugin-react'));
});

test('isEslintReference does not match other packages sharing a prefix', () => {
  assert.ok(!isEslintReference(`{ "plugins": ["react-hooks"] }`, 'eslint-plugin-react'));
  assert.ok(!isEslintReference(`{ "extends": ["airbnb-base"] }`, 'eslint-config-airbnb'));
});

function tempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-eslint-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('scanConfigFiles reads eslint.config.mjs flat config', async () => {
  const dir = tempProject({
    'eslint.config.mjs': `import js from '@eslint/js';\nimport react from 'eslint-plugin-react';\nexport default [js.configs.recommended, react.configs.flat.recommended];\n`,
  });
  const found = await scanConfigFiles(dir, ['@eslint/js', 'eslint-plugin-react', 'lodash']);
  assert.deepEqual([...found].sort(), ['@eslint/js', 'eslint-plugin-react']);
});

test('scanConfigFiles resolves short names in .eslintrc.yml', async () => {
  const dir = tempProject({
    '.eslintrc.yml': `extends:\n  - airbnb\n  - plugin:react/recommended\nplugins:\n  - "@typescript-eslint"\n`,
  });
  const found = await scanConfigFiles(dir, [
    'eslint-config-airbnb',
    'eslint-plugin-react',
    '@typescript-eslint/eslint-plugin',
    'eslint-plugin-vue',
  ]);
  assert.deepEqual([...found].sort(), [
    '@typescript-eslint/eslint-plugin',
    'eslint-config-airbnb',
    'eslint-plugin-react',
  ]);
});

test('scanConfigFiles reads the eslintConfig field of package.json', async () => {
  const dir = tempProject({});
  const packageJson = { eslintConfig: { extends: ['prettier'], plugins: ['import'] } };
  const found = await scanConfigFiles(
    dir,
    ['eslint-config-prettier', 'eslint-plugin-import', 'eslint-plugin-vue'],
    packageJson
  );
  assert.deepEqual([...found].sort(), ['eslint-config-prettier', 'eslint-plugin-import']);
});
