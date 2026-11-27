import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeprecation } from '../src/alternative-suggester.js';

test('extractDeprecation returns the message and latest version', () => {
  assert.deepEqual(
    extractDeprecation({ version: '2.88.2', deprecated: 'request has been deprecated' }),
    { deprecated: 'request has been deprecated', latestVersion: '2.88.2' }
  );
});

test('extractDeprecation returns null for a healthy package', () => {
  assert.equal(extractDeprecation({ version: '5.0.0' }), null);
});

test('extractDeprecation uses a default message when deprecated is true', () => {
  assert.deepEqual(extractDeprecation({ version: '1.0.0', deprecated: true }), {
    deprecated: 'This package is deprecated',
    latestVersion: '1.0.0',
  });
});

test('extractDeprecation handles a missing document', () => {
  assert.equal(extractDeprecation(undefined), null);
});
