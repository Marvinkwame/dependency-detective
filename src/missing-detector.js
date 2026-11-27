import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import { extractPackageName } from './ast-parser.js';

const DEV_SEGMENTS = new Set(['__tests__', 'test', 'tests', '.storybook']);
const DEV_BASENAME = /\.(test|spec|config)\.[^/]+$/;

const DECLARED_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/** Whether a POSIX-relative path is a test or config file (dev use). */
export function isDevFile(relPath) {
  const segments = relPath.split('/');
  const basename = segments[segments.length - 1];
  return DEV_BASENAME.test(basename) || segments.slice(0, -1).some((s) => DEV_SEGMENTS.has(s));
}

function isBuiltin(source) {
  return source.startsWith('node:') || builtinModules.includes(extractPackageName(source));
}

function typesPackageFor(name) {
  return name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`;
}

function installedVersion(directory, name) {
  try {
    const pkgPath = path.join(directory, 'node_modules', name, 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Finds packages imported by the code but not declared in package.json.
 * Installed ones are "missing" (they work only because something else pulled
 * them in); ones that aren't installed anywhere are "unresolved".
 */
export function findMissingDependencies({ directory, packageJson = {}, fileImports, isAlias, isIgnored }) {
  const declared = new Set(DECLARED_SECTIONS.flatMap((section) => Object.keys(packageJson[section] ?? {})));

  // name → Set of files importing it
  const byName = new Map();
  for (const { file, imports } of fileImports) {
    for (const { source, typeOnly } of imports) {
      if (source.startsWith('.') || source.startsWith('/')) continue;
      if (isBuiltin(source) || isAlias(source)) continue;

      const name = extractPackageName(source);
      if (name === packageJson.name || isIgnored(name) || declared.has(name)) continue;
      if (typeOnly && declared.has(typesPackageFor(name))) continue;

      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name).add(file);
    }
  }

  const missing = [];
  const unresolvedImports = [];
  for (const name of [...byName.keys()].sort()) {
    const importedFrom = [...byName.get(name)].sort();
    const version = installedVersion(directory, name);
    if (version === null) {
      unresolvedImports.push({ specifier: name, importedFrom });
    } else {
      missing.push({
        name,
        installedVersion: version,
        scope: importedFrom.every(isDevFile) ? 'development' : 'production',
        importedFrom,
      });
    }
  }

  return { missing, unresolvedImports };
}
