import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOsvVulns } from '../src/security-checker.js';

test('mapOsvVulns maps OSV entries to display shape', () => {
  const vulns = [
    {
      id: 'GHSA-1',
      summary: 'Prototype pollution',
      details: 'A long description',
      database_specific: { severity: 'HIGH' },
    },
  ];
  assert.deepEqual(mapOsvVulns(vulns), [
    { severity: 'HIGH', title: 'Prototype pollution', description: 'A long description' },
  ]);
});

test('mapOsvVulns falls back when fields are missing', () => {
  const [mapped] = mapOsvVulns([{ id: 'GHSA-2' }]);
  assert.equal(mapped.severity, 'UNKNOWN');
  assert.equal(mapped.title, 'GHSA-2');
  assert.equal(mapped.description, '');
});

test('mapOsvVulns handles undefined input', () => {
  assert.deepEqual(mapOsvVulns(), []);
});
