#!/usr/bin/env node

import { program } from 'commander';
import packageJson from './package.json' assert { type: 'json' }; 
import { analyzeProject } from "./src/analyzer.js"
import 'dotenv/config';


program
  .version(packageJson.version)
  .description('Analyzes your project dependencies to identify unused packages, security risks, and suggest alternatives')
  .option('-d, --directory <path>', 'project directory to analyze', process.cwd())
  .option('-v, --verbose', 'show detailed output')
  .option('--no-suggestions', 'skip suggesting alternative packages')
  .action(async (options) => {
    await analyzeProject(options);
  });

program.parse(process.argv);