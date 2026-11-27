import axios from 'axios';
import { mapWithConcurrency } from './util/concurrency.js';

const CONCURRENCY = 8;

/** Reads the deprecation notice from a package's latest-version document. */
export function extractDeprecation(latestDoc) {
  const deprecated = latestDoc?.deprecated;
  if (!deprecated) return null;
  return {
    deprecated: typeof deprecated === 'string' ? deprecated : 'This package is deprecated',
    latestVersion: latestDoc.version ?? null,
  };
}

/**
 * Flags packages whose latest version is deprecated. Fetches only the
 * latest-version document (a few KB), not the full package history.
 */
export async function suggestAlternatives(dependencies) {
  const deps = Object.keys(dependencies);
  const alternatives = {};

  await mapWithConcurrency(deps, CONCURRENCY, async (dep) => {
    try {
      const res = await axios.get(`https://registry.npmjs.org/${dep}/latest`);
      const info = extractDeprecation(res.data);
      if (info) alternatives[dep] = { name: dep, ...info };
    } catch {
      // per-dep registry failure — omit silently
    }
  });

  return alternatives;
}
