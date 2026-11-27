import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findUnusedDependencies } from './unused-detector.js';
import { checkVulnerabilities } from './security-checker.js';
import { suggestAlternatives } from './alternative-suggester.js';

export const EXIT_OK = 0;
export const EXIT_ISSUES = 1;
export const EXIT_ERROR = 2;

class AnalysisError extends Error {}

/**
 * Runs every check and returns a plain report object. Prints nothing.
 * `onProgress` receives a short status message before each step.
 */
export async function runAnalysis(options = {}, onProgress = () => {}) {
  const directory = path.resolve(options.directory ?? process.cwd());
  const ignoreSet = new Set(options.ignore || []);

  const packageJsonPath = path.join(directory, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new AnalysisError(`No package.json found in ${directory}`);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (err) {
    throw new AnalysisError(`Could not read ${packageJsonPath}: ${err.message}`);
  }

  const dependencies = Object.fromEntries(
    Object.entries({
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    }).filter(([depName]) => !ignoreSet.has(depName))
  );

  onProgress('Scanning for unused dependencies...');
  const { unusedDeps, warnings } = await findUnusedDependencies(directory, dependencies, packageJson);

  onProgress('Checking for security vulnerabilities...');
  const security = await checkVulnerabilities(dependencies, directory);

  let deprecated = null;
  if (options.suggestions !== false) {
    onProgress('Checking for deprecated packages...');
    const found = await suggestAlternatives(dependencies);
    deprecated = Object.values(found).map((info) => ({
      name: info.name,
      message: info.deprecated,
      lastUpdated: info.lastUpdated,
    }));
  }

  const unused = unusedDeps.map(({ name, version }) => ({ name, version }));
  const vulnerabilities = Object.entries(security.vulnerabilities).map(([name, issues]) => ({
    name,
    issues,
  }));

  return {
    directory,
    unused,
    estimatedSavingsBytes: getSavingsBytes(unused, directory),
    vulnerabilities,
    notChecked: security.skipped,
    securityCheckFailed: security.failed,
    deprecated,
    warnings,
    summary: {
      unused: unused.length,
      vulnerable: vulnerabilities.length,
      deprecated: deprecated?.length ?? 0,
    },
  };
}

/** 1 when there are unused dependencies or known vulnerabilities, else 0. */
export function exitCodeFor(report) {
  return report.unused.length > 0 || report.vulnerabilities.length > 0 ? EXIT_ISSUES : EXIT_OK;
}

/** CLI entry: prints the report (human-readable or JSON) and returns an exit code. */
export async function analyzeProject(options = {}) {
  if (options.json) {
    try {
      const report = await runAnalysis(options);
      console.log(JSON.stringify(report, null, 2));
      return exitCodeFor(report);
    } catch (error) {
      console.log(JSON.stringify({ error: error.message }, null, 2));
      return EXIT_ERROR;
    }
  }

  const spinner = ora('Analyzing your project dependencies...').start();
  try {
    const report = await runAnalysis(options, (text) => {
      spinner.text = text;
    });
    spinner.succeed('Analysis complete!');
    displayResults(report, options.verbose);
    return exitCodeFor(report);
  } catch (error) {
    if (error instanceof AnalysisError) {
      spinner.fail(error.message);
    } else {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error.message);
    }
    return EXIT_ERROR;
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

function getSavingsBytes(unused, directory) {
  const nodeModules = path.join(directory, 'node_modules');
  if (unused.length === 0 || !fs.existsSync(nodeModules)) return null;
  let bytes = 0;
  for (const dep of unused) {
    bytes += dirSize(path.join(nodeModules, dep.name));
  }
  return bytes;
}

function displayResults(report, verbose) {
  console.log('\n' + chalk.bold('📦 DEPENDENCY DETECTIVE REPORT') + '\n');

  // Unused dependencies
  console.log(chalk.bold('🗑️  Unused Dependencies:'));
  if (report.unused.length === 0) {
    console.log(chalk.green('  No unused dependencies found. Great job!'));
  } else {
    for (const dep of report.unused) {
      console.log(`  ${chalk.yellow(dep.name)} ${chalk.dim(`v${dep.version}`)}`);
      if (verbose) {
        console.log(`    ${chalk.dim('Not imported in any source, config file or script')}`);
      }
    }
    if (report.estimatedSavingsBytes !== null) {
      const mb = (report.estimatedSavingsBytes / (1024 * 1024)).toFixed(1);
      console.log(chalk.dim(`\n  Removing these could free about ${mb}MB on disk`));
    }
  }

  // Security vulnerabilities
  console.log('\n' + chalk.bold('🔒 Security Vulnerabilities:'));
  if (report.securityCheckFailed) {
    console.log(chalk.yellow('  ⚠  Security check failed (network error). Try again later.'));
  } else if (report.vulnerabilities.length === 0) {
    console.log(chalk.green('  No known vulnerabilities detected.'));
  } else {
    for (const { name, issues } of report.vulnerabilities) {
      console.log(`  ${chalk.red(name)} ${chalk.dim(`(${issues.length} issues)`)}`);
      if (verbose) {
        for (const issue of issues) {
          console.log(`    - ${String(issue.severity).toUpperCase()}: ${issue.title}`);
          const meta = [issue.fixedIn && `fixed in ${issue.fixedIn}`, issue.url].filter(Boolean);
          if (meta.length > 0) console.log(`      ${chalk.dim(meta.join(' · '))}`);
        }
      }
    }
  }
  if (report.notChecked.length > 0) {
    console.log(
      chalk.dim(
        `  ${report.notChecked.length} package(s) not checked (not installed) — run \`npm install\` for full coverage.`
      )
    );
  }

  // Deprecated packages
  if (report.deprecated?.length > 0) {
    console.log('\n' + chalk.bold('⚠️  Deprecated Packages:'));
    for (const info of report.deprecated) {
      console.log(`  ${chalk.yellow(info.name)}`);
      if (verbose) {
        console.log(`    ${chalk.dim(info.message)}`);
        if (info.lastUpdated) console.log(`    ${chalk.dim(`Last updated: ${info.lastUpdated}`)}`);
      }
    }
  }

  if (report.warnings.length > 0) {
    console.log('\n' + chalk.dim('Warnings:'));
    for (const w of report.warnings) console.log(chalk.dim(`  - ${w}`));
  }

  // Next steps
  console.log('\n' + chalk.bold('📋 Next Steps:'));
  console.log('  1. Run with --verbose flag for more detailed information');
  console.log('  2. Consider removing unused dependencies with: npm uninstall [package-names]');
  console.log('  3. Address security vulnerabilities by updating affected packages');
  console.log('  4. Replace deprecated packages with maintained alternatives\n');
}
