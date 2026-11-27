import path from 'path';
import { glob } from 'glob';
import { parseFileImports } from './ast-parser.js';
import { scanConfigFiles } from './config-scanner.js';

export function resolveTypesUsage(referenced, deps) {
  const used = new Set();
  for (const dep of deps) {
    if (!dep.startsWith('@types/')) continue;
    if (dep === '@types/node') {
      used.add(dep);
      continue;
    }
    const base = dep.slice('@types/'.length);
    // @types encodes scoped packages as `scope__name` → `@scope/name`
    const baseName = base.includes('__') ? '@' + base.replace('__', '/') : base;
    if (referenced.has(baseName)) used.add(dep);
  }
  return used;
}

export async function findUnusedDependencies(directory, dependencies, packageJson) {
  const allDeps = Object.keys(dependencies);
  const warnings = [];

  const files = await glob('**/*.{js,jsx,ts,tsx,mjs,cjs}', {
    cwd: directory,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const parsed = await Promise.all(
    files.map((file) => parseFileImports(path.join(directory, file)))
  );

  const allDepsSet = new Set(allDeps);
  const referenced = new Set();
  const allReferenced = new Set();
  for (const { referenced: fileRefs, warnings: fileWarnings } of parsed) {
    for (const pkg of fileRefs) {
      allReferenced.add(pkg);
      if (allDepsSet.has(pkg)) referenced.add(pkg);
    }
    warnings.push(...fileWarnings);
  }

  const configReferenced = await scanConfigFiles(directory, allDeps, packageJson);
  for (const pkg of configReferenced) referenced.add(pkg);

  const scripts = Object.values(packageJson.scripts || {});
  for (const dep of allDeps) {
    const pattern = new RegExp(
      `(?:^|\\s|['"./])${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s|['"./])`
    );
    if (scripts.some((script) => pattern.test(script))) referenced.add(dep);
  }

  // @types/* resolution: use the full referenced set (all imports, not only deps)
  const typesUsed = resolveTypesUsage(allReferenced, allDeps);
  for (const dep of typesUsed) referenced.add(dep);

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

  return { unusedDeps, warnings };
}
