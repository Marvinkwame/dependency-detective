import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIgnoreConfig, createIgnoreMatcher } from '../src/ignore.js';

test('readIgnoreConfig returns the saved ignore list', () => {
  assert.deepEqual(
    readIgnoreConfig({ dependencyDetective: { ignore: ['postcss', '@types/*'] } }),
    ['postcss', '@types/*']
  );
});

test('readIgnoreConfig returns [] when nothing is saved', () => {
  assert.deepEqual(readIgnoreConfig({}), []);
  assert.deepEqual(readIgnoreConfig({ dependencyDetective: {} }), []);
});

test('readIgnoreConfig rejects a list that is not an array of strings', () => {
  assert.throws(
    () => readIgnoreConfig({ dependencyDetective: { ignore: 'postcss' } }),
    /dependencyDetective\.ignore/
  );
  assert.throws(
    () => readIgnoreConfig({ dependencyDetective: { ignore: ['ok', 3] } }),
    /dependencyDetective\.ignore/
  );
  assert.throws(
    () => readIgnoreConfig({ dependencyDetective: 'postcss' }),
    /dependencyDetective/
  );
});

test('createIgnoreMatcher matches exact names', () => {
  const ignored = createIgnoreMatcher(['postcss', '@babel/core']);
  assert.ok(ignored('postcss'));
  assert.ok(ignored('@babel/core'));
  assert.ok(!ignored('postcss-loader'));
  assert.ok(!ignored('@babel/parser'));
});

test('createIgnoreMatcher supports * wildcards', () => {
  const ignored = createIgnoreMatcher(['@types/*', 'eslint-plugin-*', '*-loader']);
  assert.ok(ignored('@types/node'));
  assert.ok(ignored('@types/babel__core'));
  assert.ok(ignored('eslint-plugin-react'));
  assert.ok(ignored('css-loader'));
  assert.ok(!ignored('eslint'));
  assert.ok(!ignored('@typescript-eslint/parser'));
});

test('createIgnoreMatcher treats regex characters literally', () => {
  const ignored = createIgnoreMatcher(['lodash.get']);
  assert.ok(ignored('lodash.get'));
  assert.ok(!ignored('lodashXget'));
});

test('createIgnoreMatcher with no patterns ignores nothing', () => {
  assert.ok(!createIgnoreMatcher([])('anything'));
});
