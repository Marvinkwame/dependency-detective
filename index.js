#!/usr/bin/env node

import { createRequire } from 'module';
import { program } from 'commander';
import { analyzeProject } from "./src/analyzer.js"

const require = createRequire(import.meta.url);
const { version } = require('./package.json');


program
  .version(version)
  .description("Checks your app's dependencies before release: missing, unused, vulnerable and deprecated packages, with commands to fix them")
  .option('-d, --directory <path>', 'project directory to analyze', process.cwd())
  .option('-v, --verbose', 'show detailed output')
  .option('--no-suggestions', 'skip suggesting alternative packages')
  .option('--ignore <packages>', 'comma-separated package names to exclude from analysis', '')
  .option('--json', 'print the report as JSON (for CI and scripts)')
  .addHelpText('after', `
Exit codes:
  0  nothing that needs fixing before release
  1  unused dependencies, production vulnerabilities or missing dependencies found
  2  the analysis could not run (e.g. no package.json)`)
  .action(async (options) => {
    const ignoreList = options.ignore
      ? options.ignore.split(',').map(p => p.trim()).filter(Boolean)
      : [];
    process.exitCode = await analyzeProject({ ...options, ignore: ignoreList });
  });

await program.parseAsync(process.argv);
