/**
 * Reads the saved ignore list from package.json:
 *   "dependencyDetective": { "ignore": ["postcss", "@types/*"] }
 * Throws if the field is present but malformed, so mistakes aren't silent.
 */
export function readIgnoreConfig(packageJson = {}) {
  const config = packageJson.dependencyDetective;
  if (config === undefined) return [];

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('"dependencyDetective" in package.json must be an object, e.g. { "ignore": ["postcss"] }');
  }
  if (config.ignore === undefined) return [];

  if (!Array.isArray(config.ignore) || !config.ignore.every((p) => typeof p === 'string')) {
    throw new Error('"dependencyDetective.ignore" in package.json must be an array of package names');
  }
  return config.ignore;
}

function patternToRegex(pattern) {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

/** Returns a function that says whether a package name matches any pattern. `*` is a wildcard. */
export function createIgnoreMatcher(patterns = []) {
  const regexes = patterns.map(patternToRegex);
  return (name) => regexes.some((re) => re.test(name));
}
