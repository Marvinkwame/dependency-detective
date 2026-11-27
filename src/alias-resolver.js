import fs from 'fs';
import path from 'path';

const SOURCE_EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.d.ts', '.json'];

// Common framework aliases that look like packages but never are.
const ALIAS_PREFIXES = ['~/', '@/', '$'];

/**
 * Parses JSON that may contain // and /* *\/ comments and trailing commas,
 * as tsconfig.json and jsconfig.json allow. Throws on anything else invalid.
 */
export function parseJsonc(text) {
  return JSON.parse(removeTrailingCommas(stripComments(text)));
}

/** Calls `onChar(ch, i)` for characters outside strings; copies string contents verbatim. */
function scanOutsideStrings(text, onChar) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    const result = onChar(text[i], i);
    out += result.emit;
    i = result.next ?? i;
  }
  return out;
}

function stripComments(text) {
  return scanOutsideStrings(text, (ch, i) => {
    if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      return { emit: '\n', next: end === -1 ? text.length : end };
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      return { emit: ' ', next: end === -1 ? text.length : end + 1 };
    }
    return { emit: ch };
  });
}

function removeTrailingCommas(text) {
  return scanOutsideStrings(text, (ch, i) => {
    if (ch !== ',') return { emit: ch };
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    return { emit: text[j] === '}' || text[j] === ']' ? '' : ch };
  });
}

function patternToRegex(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Loads compilerOptions from a tsconfig/jsconfig, following relative `extends`
 * (string or array). Child options replace parent options key by key.
 * Returns { paths, baseUrlDir } where baseUrlDir is absolute or null.
 */
function loadCompilerOptions(configPath, warnings, seen = new Set()) {
  if (seen.has(configPath)) return { paths: null, baseUrlDir: null };
  seen.add(configPath);

  const config = parseJsonc(fs.readFileSync(configPath, 'utf8'));
  const configDir = path.dirname(configPath);

  let result = { paths: null, baseUrlDir: null };
  const parents = Array.isArray(config.extends) ? config.extends : config.extends ? [config.extends] : [];
  for (const parent of parents) {
    if (typeof parent !== 'string' || !parent.startsWith('.')) continue; // package extends: not followed
    let parentPath = path.resolve(configDir, parent);
    if (!fs.existsSync(parentPath) && fs.existsSync(`${parentPath}.json`)) parentPath = `${parentPath}.json`;
    let inherited;
    try {
      inherited = loadCompilerOptions(parentPath, warnings, seen);
    } catch (err) {
      // e.g. ./.nuxt/tsconfig.json before `nuxt prepare` — keep the child's own options
      warnings.push(`Could not read ${parent} (extended by ${path.basename(configPath)}): ${err.message}`);
      continue;
    }
    result = {
      paths: inherited.paths ?? result.paths,
      baseUrlDir: inherited.baseUrlDir ?? result.baseUrlDir,
    };
  }

  const own = config.compilerOptions ?? {};
  return {
    paths: own.paths ?? result.paths,
    baseUrlDir: own.baseUrl !== undefined ? path.resolve(configDir, own.baseUrl) : result.baseUrlDir,
  };
}

function existsUnder(dir, segment) {
  return SOURCE_EXTENSIONS.some((ext) => fs.existsSync(path.join(dir, segment + ext)));
}

/**
 * Builds a matcher for import specifiers that are project aliases rather than
 * packages: tsconfig/jsconfig `paths` and `baseUrl` folders, package.json
 * subpath imports (#…), scheme imports (astro:content, virtual:…) and common
 * framework prefixes (~/, @/, $). Node built-ins are not handled here.
 */
export function loadAliasMatcher(directory, packageJson = {}) {
  const warnings = [];
  let pathRegexes = [];
  let baseUrlDir = null;

  const configName = ['tsconfig.json', 'jsconfig.json'].find((name) =>
    fs.existsSync(path.join(directory, name))
  );
  if (configName) {
    try {
      const options = loadCompilerOptions(path.join(directory, configName), warnings);
      pathRegexes = Object.keys(options.paths ?? {}).map(patternToRegex);
      baseUrlDir = options.baseUrlDir;
    } catch (err) {
      warnings.push(`Could not read ${configName} (path aliases ignored): ${err.message}`);
    }
  }

  const isAlias = (specifier) => {
    if (specifier.startsWith('node:')) return false;
    if (specifier.startsWith('#')) return true; // package.json "imports"
    if (specifier.includes(':')) return true;
    if (ALIAS_PREFIXES.some((prefix) => specifier.startsWith(prefix))) return true;
    if (pathRegexes.some((re) => re.test(specifier))) return true;
    if (baseUrlDir && existsUnder(baseUrlDir, specifier.split('/')[0])) return true;
    return false;
  };

  return { isAlias, warnings };
}
