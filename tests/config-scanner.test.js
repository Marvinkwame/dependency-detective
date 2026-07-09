import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReferenced } from '../src/config-scanner.js';

test('matches quoted references and subpaths', () => {
  assert.ok(isReferenced(`import x from 'tailwindcss'`, 'tailwindcss'));
  assert.ok(isReferenced(`require('tailwindcss/plugin')`, 'tailwindcss'));
  assert.ok(isReferenced(`plugins: ["@tailwindcss/forms"]`, '@tailwindcss/forms'));
});

test('does not match unrelated substrings', () => {
  assert.ok(!isReferenced(`// tailwindcss-typography notes`, 'tailwindcss'));
  assert.ok(!isReferenced(`const tailwindcssHelper = 1`, 'tailwindcss'));
});
