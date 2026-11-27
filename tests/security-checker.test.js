import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOsvVulns, chooseFixVersion } from '../src/security-checker.js';

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

test('chooseFixVersion picks the lowest fix above installed per advisory, then the max', () => {
  assert.deepEqual(
    chooseFixVersion('1.6.0', [{ fixedIn: '0.30.0, 1.12.0' }, { fixedIn: '1.8.2' }]),
    { fixVersion: '1.12.0', majorUpgrade: false }
  );
});

test('chooseFixVersion flags major upgrades', () => {
  assert.deepEqual(chooseFixVersion('4.17.15', [{ fixedIn: '5.0.0' }]), {
    fixVersion: '5.0.0',
    majorUpgrade: true,
  });
});

test('chooseFixVersion returns null when an advisory has no fix', () => {
  assert.deepEqual(chooseFixVersion('1.0.0', [{ fixedIn: '1.0.1' }, { fixedIn: null }]), {
    fixVersion: null,
    majorUpgrade: false,
  });
});

test('chooseFixVersion ignores fixes at or below the installed version', () => {
  assert.deepEqual(chooseFixVersion('2.0.0', [{ fixedIn: '1.9.0' }]), {
    fixVersion: null,
    majorUpgrade: false,
  });
});
