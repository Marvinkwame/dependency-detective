#!/usr/bin/env node

import { createRequire } from 'module';
import { program } from 'commander';
import { analyzeProject } from "./src/analyzer.js"
import 'dotenv/config';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');


program
  .version(version)
  .description('Analyzes your project dependencies to identify unused packages, security risks, and suggest alternatives')
  .option('-d, --directory <path>', 'project directory to analyze', process.cwd())
  .option('-v, --verbose', 'show detailed output')
  .option('--no-suggestions', 'skip suggesting alternative packages')
  .option('--ignore <packages>', 'comma-separated package names to exclude from analysis', '')
  .action(async (options) => {
    const ignoreList = options.ignore
      ? options.ignore.split(',').map(p => p.trim()).filter(Boolean)
      : [];
    await analyzeProject({ ...options, ignore: ignoreList });
  });

program.parse(process.argv);