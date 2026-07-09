import axios from 'axios';
import { mapWithConcurrency } from './util/concurrency.js';

const CONCURRENCY = 8;

export function extractDeprecation(registryDoc) {
  const latest = registryDoc?.['dist-tags']?.latest;
  if (!latest) return null;
  const deprecated = registryDoc.versions?.[latest]?.deprecated;
  if (!deprecated) return null;
  return {
    deprecated: typeof deprecated === 'string' ? deprecated : 'This package is deprecated',
    lastUpdated: registryDoc.time?.modified ?? null,
  };
}

export async function suggestAlternatives(dependencies) {
  const deps = Object.keys(dependencies);
  const alternatives = {};

  await mapWithConcurrency(deps, CONCURRENCY, async (dep) => {
    try {
      const res = await axios.get(`https://registry.npmjs.org/${dep}`);
      const info = extractDeprecation(res.data);
      if (info) alternatives[dep] = { name: dep, ...info };
    } catch {
      // per-dep registry failure — omit silently
    }
  });

  return alternatives;
}
