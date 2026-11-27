import fs from 'fs';
import path from 'path';

const CONFIG_FILES = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.cjs',
  'babel.config.js',
  'babel.config.json',
  'jest.config.js',
  'jest.config.ts',
  'vite.config.js',
  'vite.config.ts',
  'webpack.config.js',
  'webpack.config.cjs',
  'prettier.config.js',
  // ESLint flat config (default since ESLint 9)
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  // ESLint legacy config
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  '.babelrc',
  '.babelrc.json',
  'vitest.config.js',
  'vitest.config.ts',
  'tsconfig.json',
  '.stylelintrc',
  '.stylelintrc.json',
  'svelte.config.js',
  'astro.config.mjs',
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isReferenced(content, depName) {
  const pattern = new RegExp(`['"\`]${escapeRegex(depName)}['"\`/]`);
  return pattern.test(content);
}

// Legacy ESLint configs can name plugins and shareable configs by short name
// ("react" for eslint-plugin-react), and YAML configs leave names unquoted.
const ESLINT_LEGACY_FILES = new Set([
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
]);

/**
 * The short names ESLint accepts for a plugin or shareable-config package:
 *   eslint-plugin-react            → react
 *   eslint-config-airbnb           → airbnb
 *   @typescript-eslint/eslint-plugin → @typescript-eslint
 *   @scope/eslint-plugin-foo       → @scope/foo
 */
export function eslintShortNames(depName) {
  const unscoped = depName.match(/^eslint-(?:plugin|config)-(.+)$/);
  if (unscoped) return [unscoped[1]];

  const scoped = depName.match(/^(@[^/]+)\/eslint-(?:plugin|config)(?:-(.+))?$/);
  if (scoped) return [scoped[2] ? `${scoped[1]}/${scoped[2]}` : scoped[1]];

  return [];
}

/**
 * Whether a legacy ESLint config refers to depName, by full or short name,
 * quoted or not. Matches `react`, `plugin:react/recommended` and rule keys
 * like `react/jsx-key`, but not `react-hooks`.
 */
export function isEslintReference(content, depName) {
  const names = [depName, ...eslintShortNames(depName)];
  if (names.length === 1) return false;
  return names.some((name) =>
    new RegExp(`(?:^|[\\s'"\`\\[,:])${escapeRegex(name)}(?:$|[\\s'"\`\\],/])`, 'm').test(content)
  );
}

export async function scanConfigFiles(directory, dependencyNames, packageJson = {}) {
  if (!Array.isArray(dependencyNames) && !dependencyNames?.[Symbol.iterator]) {
    return new Set();
  }

  const referenced = new Set();

  const check = (content, eslintLegacy) => {
    for (const depName of dependencyNames) {
      if (
        isReferenced(content, depName) ||
        (eslintLegacy && isEslintReference(content, depName))
      ) {
        referenced.add(depName);
      }
    }
  };

  await Promise.all(
    CONFIG_FILES.map(async (configFile) => {
      let content;
      try {
        content = await fs.promises.readFile(path.join(directory, configFile), 'utf8');
      } catch {
        return; // file missing or unreadable — skip
      }
      check(content, ESLINT_LEGACY_FILES.has(configFile));
    })
  );

  if (packageJson?.eslintConfig) {
    check(JSON.stringify(packageJson.eslintConfig), true);
  }

  return referenced;
}
