import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOsvVulns } from '../src/security-checker.js';

test('mapOsvVulns maps OSV entries to a short display shape', () => {
  const vulns = [
    {
      id: 'GHSA-1',
      summary: 'Prototype pollution',
      details: 'A very long markdown write-up that should not be printed',
      database_specific: { severity: 'HIGH' },
      affected: [
        {
          package: { ecosystem: 'npm', name: 'lodash' },
          ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
        },
      ],
    },
  ];
  assert.deepEqual(mapOsvVulns(vulns, 'lodash'), [
    {
      id: 'GHSA-1',
      severity: 'HIGH',
      title: 'Prototype pollution',
      fixedIn: '4.17.21',
      url: 'https://osv.dev/vulnerability/GHSA-1',
    },
  ]);
});

test('mapOsvVulns only reads fixed versions for the queried package', () => {
  const [mapped] = mapOsvVulns(
    [
      {
        id: 'GHSA-3',
        affected: [
          { package: { name: 'other' }, ranges: [{ events: [{ fixed: '9.9.9' }] }] },
        ],
      },
    ],
    'lodash'
  );
  assert.equal(mapped.fixedIn, null);
});

test('mapOsvVulns falls back when fields are missing', () => {
  const [mapped] = mapOsvVulns([{ id: 'GHSA-2' }], 'x');
  assert.equal(mapped.severity, 'UNKNOWN');
  assert.equal(mapped.title, 'GHSA-2');
  assert.equal(mapped.fixedIn, null);
});

test('mapOsvVulns handles undefined input', () => {
  assert.deepEqual(mapOsvVulns(), []);
});
