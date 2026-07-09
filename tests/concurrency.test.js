import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../src/util/concurrency.js';

test('maps all items preserving input order', async () => {
  const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (x) => x * 2);
  assert.deepEqual(out, [2, 4, 6, 8]);
});

test('never runs more than `limit` concurrently', async () => {
  let active = 0;
  let max = 0;
  await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
    active++;
    max = Math.max(max, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
  });
  assert.ok(max <= 2, `observed max concurrency ${max} exceeded 2`);
});

test('empty input returns empty array', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
});
