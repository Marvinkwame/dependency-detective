import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findUnusedDependencies } from './unused-detector.js';
import { checkVulnerabilities } from './security-checker.js';
import { suggestAlternatives } from './alternative-suggester.js';

export async function analyzeProject(options = {}) {
  const spinner = ora('Analyzing your project dependencies...').start();
  const ignoreSet = new Set(options.ignore || []);
  const warnings = [];

  try {
    const packageJsonPath = path.join(options.directory, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      spinner.fail('No package.json found in the specified directory');
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    const filteredDependencies = Object.fromEntries(
      Object.entries(dependencies).filter(([depName]) => !ignoreSet.has(depName))
    );

    spinner.text = 'Scanning for unused dependencies...';
    const { unusedDeps, warnings: depWarnings } = await findUnusedDependencies(
      options.directory,
      filteredDependencies,
      packageJson
    );
    warnings.push(...depWarnings);

    spinner.text = 'Checking for security vulnerabilities...';
    const security = await checkVulnerabilities(filteredDependencies, options.directory);

    let deprecated = {};
    if (options.suggestions !== false) {
      spinner.text = 'Checking for deprecated packages...';
      deprecated = await suggestAlternatives(filteredDependencies);
    }

    spinner.succeed('Analysis complete!');

    displayResults({
      unusedDeps,
      security,
      deprecated,
      verbose: options.verbose,
      directory: options.directory,
    });

    if (warnings.length > 0) {
      console.log('\n' + chalk.dim('Warnings:'));
      for (const w of warnings) console.log(chalk.dim(`  - ${w}`));
    }
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('Error:'), error.message);
  }
}

function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(full);
    } else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // unreadable entry — skip
      }
    }
  }
  return total;
}

function getSavingsEstimate(unusedDeps, directory) {
  const nodeModules = path.join(directory, 'node_modules');
  if (!fs.existsSync(nodeModules)) return null;
  let bytes = 0;
  for (const dep of unusedDeps) {
    bytes += dirSize(path.join(nodeModules, dep.name));
  }
  return `~${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function displayResults({ unusedDeps, security, deprecated, verbose, directory }) {
  console.log('\n' + chalk.bold('📦 DEPENDENCY DETECTIVE REPORT') + '\n');

  // Unused dependencies
  console.log(chalk.bold('🗑️  Unused Dependencies:'));
  if (unusedDeps.length === 0) {
    console.log(chalk.green('  No unused dependencies found. Great job!'));
  } else {
    unusedDeps.forEach((dep) => {
      console.log(`  ${chalk.yellow(dep.name)} ${chalk.dim(`v${dep.version}`)}`);
      if (verbose && dep.reason) {
        console.log(`    ${chalk.dim(dep.reason)}`);
      }
    });
    const savings = getSavingsEstimate(unusedDeps, directory);
    if (savings) {
      console.log(chalk.dim(`\n  Removing these could free approximately ${savings} on disk`));
    }
  }

  // Security vulnerabilities
  console.log('\n' + chalk.bold('🔒 Security Vulnerabilities:'));
  const { vulnerabilities, skipped, failed } = security;
  if (failed) {
    console.log(chalk.yellow('  ⚠  Security check failed (network error). Try again later.'));
  } else if (Object.keys(vulnerabilities).length === 0) {
    console.log(chalk.green('  No known vulnerabilities detected.'));
  } else {
    Object.entries(vulnerabilities).forEach(([depName, issues]) => {
      console.log(`  ${chalk.red(depName)} ${chalk.dim(`(${issues.length} issues)`)}`);
      if (verbose) {
        issues.forEach((issue) => {
          console.log(`    - ${String(issue.severity).toUpperCase()}: ${issue.title}`);
          if (issue.description) console.log(`      ${chalk.dim(issue.description)}`);
        });
      }
    });
  }
  if (skipped && skipped.length > 0) {
    console.log(
      chalk.dim(
        `  ${skipped.length} package(s) not checked (not installed) — run \`npm install\` for full coverage.`
      )
    );
  }

  // Deprecated packages
  if (Object.keys(deprecated).length > 0) {
    console.log('\n' + chalk.bold('⚠️  Deprecated Packages:'));
    Object.entries(deprecated).forEach(([depName, info]) => {
      console.log(`  ${chalk.yellow(depName)}`);
      if (verbose) {
        console.log(`    ${chalk.dim(info.deprecated)}`);
        if (info.lastUpdated) console.log(`    ${chalk.dim(`Last updated: ${info.lastUpdated}`)}`);
      }
    });
  }

  // Next steps
  console.log('\n' + chalk.bold('📋 Next Steps:'));
  console.log('  1. Run with --verbose flag for more detailed information');
  console.log('  2. Consider removing unused dependencies with: npm uninstall [package-names]');
  console.log('  3. Address security vulnerabilities by updating affected packages');
  console.log('  4. Replace deprecated packages with maintained alternatives\n');
}
