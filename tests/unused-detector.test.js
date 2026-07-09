import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTypesUsage } from '../src/unused-detector.js';

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
