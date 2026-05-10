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
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
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

function isReferenced(content, depName) {
  const pattern = new RegExp(`['"\`]${escapeRegex(depName)}['"\`/]`);
  return pattern.test(content);
}

export async function scanConfigFiles(directory, dependencyNames) {
  if (!Array.isArray(dependencyNames) && !dependencyNames?.[Symbol.iterator]) {
    return new Set();
  }

  const referenced = new Set();

  await Promise.all(
    CONFIG_FILES.map(async (configFile) => {
      try {
        const content = await fs.promises.readFile(
          path.join(directory, configFile), 'utf8'
        );
        for (const depName of dependencyNames) {
          if (isReferenced(content, depName)) referenced.add(depName);
        }
      } catch {
        // file missing or unreadable — skip
      }
    })
  );

  return referenced;
}
