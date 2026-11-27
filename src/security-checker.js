import fs from 'fs';
import path from 'path';
import axios from 'axios';
import semver from 'semver';
import { mapWithConcurrency } from './util/concurrency.js';

const OSV_ENDPOINT = 'https://api.osv.dev/v1/query';
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;

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

/**
 * The version to upgrade to: for each advisory, the lowest fixed version above
 * the installed one; then the highest of those. Null if any advisory has no
 * such fix (upgrading wouldn't clear it).
 */
export function chooseFixVersion(installedVersion, issues) {
  const none = { fixVersion: null, majorUpgrade: false };
  if (!semver.valid(installedVersion)) return none;

  let fixVersion = null;
  for (const issue of issues) {
    const candidates = (issue.fixedIn ?? '')
      .split(', ')
      .filter((v) => semver.valid(v) && semver.gt(v, installedVersion))
      .sort(semver.compare);
    if (candidates.length === 0) return none;
    if (!fixVersion || semver.gt(candidates[0], fixVersion)) fixVersion = candidates[0];
  }
  if (!fixVersion) return none;

  return { fixVersion, majorUpgrade: semver.major(fixVersion) > semver.major(installedVersion) };
}

/**
 * Checks each installed package against OSV.dev.
 * `packages` is [{ name, scope: 'production' | 'development' }].
 */
export async function checkVulnerabilities(packages, directory) {
  const vulnerabilities = [];
  const skipped = [];
  let attempted = 0;
  let errored = 0;

  await mapWithConcurrency(packages, CONCURRENCY, async ({ name, scope }) => {
    const installedVersion = resolveInstalledVersion(directory, name);
    if (!installedVersion) {
      skipped.push(name);
      return;
    }
    attempted++;
    try {
      const res = await axios.post(
        OSV_ENDPOINT,
        { version: installedVersion, package: { name, ecosystem: 'npm' } },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      const issues = mapOsvVulns(res.data?.vulns, name);
      if (issues.length > 0) {
        vulnerabilities.push({
          name,
          installedVersion,
          scope,
          ...chooseFixVersion(installedVersion, issues),
          issues,
        });
      }
    } catch {
      errored++;
    }
  });

  vulnerabilities.sort((a, b) => a.name.localeCompare(b.name));
  skipped.sort();
  const failed = attempted > 0 && errored === attempted;
  return { vulnerabilities, skipped, failed };
}
