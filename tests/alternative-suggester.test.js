import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeprecation } from '../src/alternative-suggester.js';

test('extractDeprecation returns message for deprecated latest version', () => {
  const doc = {
    'dist-tags': { latest: '2.88.2' },
    versions: { '2.88.2': { deprecated: 'request has been deprecated' } },
    time: { modified: '2020-01-01T00:00:00.000Z' },
  };
  assert.deepEqual(extractDeprecation(doc), {
    deprecated: 'request has been deprecated',
    lastUpdated: '2020-01-01T00:00:00.000Z',
  });
});

test('extractDeprecation returns null for a healthy package', () => {
  const doc = {
    'dist-tags': { latest: '5.0.0' },
    versions: { '5.0.0': {} },
    time: { modified: '2024-01-01T00:00:00.000Z' },
  };
  assert.equal(extractDeprecation(doc), null);
});

test('extractDeprecation returns null when latest is missing', () => {
  assert.equal(extractDeprecation({}), null);
});
