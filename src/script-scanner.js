import fs from 'fs';
import path from 'path';

// Used when a package isn't installed, so its `bin` field can't be read.
// Only packages whose command differs from their package name are listed.
const KNOWN_COMMANDS = {
  typescript: ['tsc', 'tsserver'],
  'npm-run-all': ['npm-run-all', 'run-s', 'run-p'],
  'npm-run-all2': ['npm-run-all', 'run-s', 'run-p'],
  '@angular/cli': ['ng'],
  '@nestjs/cli': ['nest'],
  '@biomejs/biome': ['biome'],
  '@playwright/test': ['playwright'],
  '@changesets/cli': ['changeset'],
  '@11ty/eleventy': ['eleventy'],
  '@sveltejs/kit': ['svelte-kit'],
  '@tauri-apps/cli': ['tauri'],
  '@vue/cli-service': ['vue-cli-service'],
  '@storybook/cli': ['storybook', 'sb'],
  '@graphql-codegen/cli': ['graphql-codegen', 'gql-gen'],
  'ts-node': ['ts-node', 'ts-node-esm'],
  'webpack-cli': ['webpack-cli', 'webpack'],
  'http-server': ['http-server', 'hs'],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The command names a dependency can be invoked by in npm scripts: its own
 * name plus every key of its `bin` field (read from node_modules). A string
 * `bin` installs a command named after the package, minus any scope.
 */
export function commandNames(directory, depName) {
  const names = new Set([depName]);

  let bin;
  try {
    const pkgPath = path.join(directory, 'node_modules', depName, 'package.json');
    bin = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).bin;
  } catch {
    for (const cmd of KNOWN_COMMANDS[depName] ?? []) names.add(cmd);
    return [...names];
  }

  if (typeof bin === 'string') {
    names.add(depName.startsWith('@') ? depName.split('/')[1] : depName);
  } else if (bin && typeof bin === 'object') {
    for (const cmd of Object.keys(bin)) names.add(cmd);
  }
  return [...names];
}

/**
 * Whether any script invokes `command` as a whole word: at the start, after
 * whitespace, a quote, `&&`/`||`/`;`/`(`, or a path such as node_modules/.bin/.
 */
export function scriptsUse(scripts, command) {
  const pattern = new RegExp(
    `(?:^|[\\s'"/(;&|])${escapeRegex(command)}(?:$|[\\s'"/);&|])`
  );
  return scripts.some((script) => pattern.test(script));
}

export function findScriptReferences(directory, dependencyNames, scriptsObject = {}) {
  const scripts = Object.values(scriptsObject);
  const referenced = new Set();
  if (scripts.length === 0) return referenced;

  for (const dep of dependencyNames) {
    if (commandNames(directory, dep).some((cmd) => scriptsUse(scripts, cmd))) {
      referenced.add(dep);
    }
  }
  return referenced;
}
