import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parseFileImports } from './ast-parser.js';
import { scanConfigFiles } from './config-scanner.js';

export async function findUnusedDependencies(directory, dependencies) {
  const allDeps = Object.keys(dependencies);

  const files = await glob('**/*.{js,jsx,ts,tsx}', {
    cwd: directory,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const fileSets = await Promise.all(
    files.map(file => parseFileImports(path.join(directory, file)))
  );

  const allDepsSet = new Set(allDeps);
  const referenced = new Set();
  for (const set of fileSets) {
    for (const pkg of set) {
      if (allDepsSet.has(pkg)) referenced.add(pkg);
    }
  }

  const configReferenced = await scanConfigFiles(directory, allDeps);
  for (const pkg of configReferenced) referenced.add(pkg);

  const packageJson = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const scripts = Object.values(packageJson.scripts || {});
  for (const dep of allDeps) {
    const pattern = new RegExp(`(?:^|\\s|['"./])${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|['"./])`);
    if (scripts.some(script => pattern.test(script))) referenced.add(dep);
  }

  const unusedDeps = [];
  for (const dep of allDeps) {
    if (!referenced.has(dep)) {
      unusedDeps.push({
        name: dep,
        version: dependencies[dep],
        reason: 'Not imported in any source or config file',
      });
    }
  }

  return unusedDeps;
}
