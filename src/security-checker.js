import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { mapWithConcurrency } from './util/concurrency.js';

const OSV_ENDPOINT = 'https://api.osv.dev/v1/query';
const CONCURRENCY = 8;

function fixedVersions(vuln, packageName) {
  const fixed = new Set();
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== packageName) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) fixed.add(event.fixed);
      }
    }
  }
  return fixed.size > 0 ? [...fixed].join(', ') : null;
}

export function mapOsvVulns(vulns = [], packageName) {
  return vulns.map((v) => ({
    id: v.id ?? null,
    severity: v.database_specific?.severity ?? 'UNKNOWN',
    title: v.summary ?? v.id ?? 'Unknown vulnerability',
    fixedIn: fixedVersions(v, packageName),
    url: v.id ? `https://osv.dev/vulnerability/${v.id}` : null,
  }));
}

export function resolveInstalledVersion(directory, dep) {
  try {
    const pkgPath = path.join(directory, 'node_modules', dep, 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || null;
  } catch {
    return null;
  }
}

export async function checkVulnerabilities(dependencies, directory) {
  const deps = Object.keys(dependencies);
  const vulnerabilities = {};
  const skipped = [];
  let attempted = 0;
  let errored = 0;

  await mapWithConcurrency(deps, CONCURRENCY, async (dep) => {
    const version = resolveInstalledVersion(directory, dep);
    if (!version) {
      skipped.push(dep);
      return;
    }
    attempted++;
    try {
      const res = await axios.post(OSV_ENDPOINT, {
        version,
        package: { name: dep, ecosystem: 'npm' },
      });
      const issues = mapOsvVulns(res.data?.vulns, dep);
      if (issues.length > 0) vulnerabilities[dep] = issues;
    } catch {
      errored++;
    }
  });

  const failed = attempted > 0 && errored === attempted;
  return { vulnerabilities, skipped, failed };
}
