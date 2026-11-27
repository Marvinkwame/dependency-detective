import fs from 'fs';
import path from 'path';

const LOCKFILES = [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
];

/** Picks the package manager from the project's lockfile; npm when unclear. */
export function detectPackageManager(directory) {
  const found = LOCKFILES.filter(([file]) => fs.existsSync(path.join(directory, file)));
  const managers = [...new Set(found.map(([, name]) => name))];

  if (managers.length === 0) return { name: 'npm', warning: null };
  if (managers.length === 1) return { name: managers[0], warning: null };

  const files = found.map(([file]) => file).join(', ');
  return {
    name: 'npm',
    warning: `Found lockfiles for more than one package manager (${files}); suggested commands use npm`,
  };
}
