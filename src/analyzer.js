import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findUnusedDependencies } from './unused-detector.js';
import { checkVulnerabilities } from './security-checker.js';
import { suggestAlternatives } from './alternative-suggester.js';
import { readIgnoreConfig, createIgnoreMatcher } from './ignore.js';
import { loadAliasMatcher } from './alias-resolver.js';
import { findMissingDependencies } from './missing-detector.js';
import { detectPackageManager } from './package-manager.js';
import { buildFixCommands } from './fix-commands.js';

export const EXIT_OK = 0;
export const EXIT_ISSUES = 1;
export const EXIT_ERROR = 2;

const FILES_SHOWN = 3;

class AnalysisError extends Error {}

/**
 * Runs every check and returns a plain report object. Prints nothing.
 * `onProgress` receives a short status message before each step.
 */
export async function runAnalysis(options = {}, onProgress = () => {}) {
  const directory = path.resolve(options.directory ?? process.cwd());

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

  let savedIgnore;
  try {
    savedIgnore = readIgnoreConfig(packageJson);
  } catch (err) {
    throw new AnalysisError(err.message);
  }
  const isIgnored = createIgnoreMatcher([...savedIgnore, ...(options.ignore || [])]);

  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  const ignored = Object.keys(allDependencies).filter(isIgnored).sort();
  const dependencies = Object.fromEntries(
    Object.entries(allDependencies).filter(([depName]) => !isIgnored(depName))
  );

  onProgress('Scanning for unused and missing dependencies...');
  const { unusedDeps, warnings: parseWarnings, fileImports } = await findUnusedDependencies(
    directory,
    dependencies,
    packageJson
  );
  const { isAlias, warnings: aliasWarnings } = loadAliasMatcher(directory, packageJson);
  // Checked against every declared package (not the ignore-filtered list).
  const { missing, unresolvedImports } = findMissingDependencies({
    directory,
    packageJson,
    fileImports,
    isAlias,
    isIgnored,
  });

  onProgress('Checking for security vulnerabilities...');
  const prodNames = new Set(Object.keys(packageJson.dependencies || {}));
  const security = await checkVulnerabilities(
    [
      ...Object.keys(dependencies).map((name) => ({
        name,
        scope: prodNames.has(name) ? 'production' : 'development',
      })),
      ...missing.map(({ name, scope }) => ({ name, scope })),
    ],
    directory
  );

  let deprecated = null;
  if (options.suggestions !== false) {
    onProgress('Checking for deprecated packages...');
    const found = await suggestAlternatives(dependencies);
    deprecated = Object.values(found)
      .map((info) => ({ name: info.name, message: info.deprecated, latestVersion: info.latestVersion }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const unused = unusedDeps.map(({ name, version }) => ({ name, version }));
  const vulnerabilities = security.vulnerabilities;
  const packageManager = detectPackageManager(directory);

  const warnings = [
    ...parseWarnings,
    ...aliasWarnings,
    ...(packageManager.warning ? [packageManager.warning] : []),
    ...unresolvedImports.map(
      ({ specifier, importedFrom }) =>
        `Unresolved import "${specifier}" in ${importedFrom.join(', ')} (not installed, not declared; alias?)`
    ),
  ];

  const count = (list, scope) => list.filter((item) => item.scope === scope).length;

  return {
    directory,
    packageManager: packageManager.name,
    missing,
    unresolvedImports,
    unused,
    estimatedSavingsBytes: getSavingsBytes(unused, directory),
    vulnerabilities,
    notChecked: security.skipped,
    securityCheckFailed: security.failed,
    deprecated,
    fixCommands: buildFixCommands({
      packageManager: packageManager.name,
      missing,
      unused,
      vulnerabilities,
    }),
    ignored,
    warnings,
    summary: {
      missingProduction: count(missing, 'production'),
      missingDev: count(missing, 'development'),
      unused: unused.length,
      vulnerableProduction: count(vulnerabilities, 'production'),
      vulnerableDev: count(vulnerabilities, 'development'),
      deprecated: deprecated?.length ?? 0,
    },
  };
}

/**
 * 1 when there are unused dependencies, production vulnerabilities or
 * production-use missing dependencies; else 0. Dev-only findings never fail.
 */
export function exitCodeFor(report) {
  const production = (list = []) => list.some((item) => item.scope === 'production');
  return report.unused.length > 0 || production(report.vulnerabilities) || production(report.missing)
    ? EXIT_ISSUES
    : EXIT_OK;
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

function fileList(files, verbose) {
  if (verbose || files.length <= FILES_SHOWN) return files.join(', ');
  return `${files.slice(0, FILES_SHOWN).join(', ')} +${files.length - FILES_SHOWN} more`;
}

function printMissing(entries, verbose) {
  for (const dep of entries) {
    console.log(`  ${chalk.red(dep.name)}  ${chalk.dim(`(installed ${dep.installedVersion}, not in package.json)`)}`);
    console.log(`    ${chalk.dim(fileList(dep.importedFrom, verbose))}`);
  }
}

function vulnerabilityLine(v) {
  const high = v.issues.filter((i) => ['HIGH', 'CRITICAL'].includes(String(i.severity).toUpperCase())).length;
  const counts = `${v.issues.length} ${v.issues.length === 1 ? 'issue' : 'issues'}${high ? ` (${high} high)` : ''}`;
  const fix = v.fixVersion
    ? `→ fix: ${v.fixVersion}${v.majorUpgrade ? ' (major upgrade)' : ''}`
    : '→ no fix available yet';
  return `  ${chalk.red(v.name)} ${v.installedVersion}  ${chalk.dim(counts)} ${fix}`;
}

function printVulnerabilities(list, verbose) {
  for (const v of list) {
    console.log(vulnerabilityLine(v));
    if (!verbose) continue;
    for (const issue of v.issues) {
      console.log(`    - ${String(issue.severity).toUpperCase()}: ${issue.title}`);
      const meta = [issue.fixedIn && `fixed in ${issue.fixedIn}`, issue.url].filter(Boolean);
      if (meta.length > 0) console.log(`      ${chalk.dim(meta.join(' · '))}`);
    }
  }
}

function displayResults(report, verbose) {
  console.log('\n' + chalk.bold('📦 DEPENDENCY DETECTIVE REPORT'));

  // Missing dependencies — deploy-breaking, so first
  const missingProd = report.missing.filter((m) => m.scope === 'production');
  const missingDev = report.missing.filter((m) => m.scope === 'development');
  if (missingProd.length > 0) {
    console.log('\n' + chalk.bold('🚨 Missing Dependencies:'));
    printMissing(missingProd, verbose);
  }
  if (missingDev.length > 0) {
    console.log('\n' + chalk.bold("🧪 Missing Dev Dependencies (tests/config only — won't fail the run):"));
    printMissing(missingDev, verbose);
  }

  // Security vulnerabilities
  const prodVulns = report.vulnerabilities.filter((v) => v.scope === 'production');
  const devVulns = report.vulnerabilities.filter((v) => v.scope === 'development');
  console.log('\n' + chalk.bold('🔒 Security Vulnerabilities (production):'));
  if (report.securityCheckFailed) {
    console.log(chalk.yellow('  ⚠  Security check failed (network error). Try again later.'));
  } else if (prodVulns.length === 0) {
    console.log(chalk.green('  No known vulnerabilities detected.'));
  } else {
    printVulnerabilities(prodVulns, verbose);
  }
  if (report.notChecked.length > 0) {
    console.log(
      chalk.dim(
        `  ${report.notChecked.length} package(s) not checked (not installed) — run \`npm install\` for full coverage.`
      )
    );
  }
  if (devVulns.length > 0) {
    console.log('\n' + chalk.bold("🧪 Security Vulnerabilities (dev only — won't fail the run):"));
    printVulnerabilities(devVulns, verbose);
  }

  // Unused dependencies
  console.log('\n' + chalk.bold('🗑️  Unused Dependencies:'));
  if (report.unused.length === 0) {
    console.log(chalk.green('  No unused dependencies found. Great job!'));
  } else {
    for (const dep of report.unused) {
      console.log(`  ${chalk.yellow(dep.name)} ${chalk.dim(dep.version)}`);
      if (verbose) {
        console.log(`    ${chalk.dim('Not imported in any source, config file or script')}`);
      }
    }
    if (report.estimatedSavingsBytes !== null) {
      const mb = (report.estimatedSavingsBytes / (1024 * 1024)).toFixed(1);
      console.log(chalk.dim(`\n  Removing these could free about ${mb}MB on disk`));
    }
  }

  // Deprecated packages
  if (report.deprecated?.length > 0) {
    console.log('\n' + chalk.bold('⚠️  Deprecated Packages:'));
    for (const info of report.deprecated) {
      const latest = info.latestVersion ? chalk.dim(`  (latest ${info.latestVersion})`) : '';
      console.log(`  ${chalk.yellow(info.name)}${latest}`);
      if (verbose) console.log(`    ${chalk.dim(info.message)}`);
    }
  }

  // Suggested commands
  if (report.fixCommands.length > 0) {
    console.log('\n' + chalk.bold(`🔧 Suggested commands (${report.packageManager}):`));
    for (const cmd of report.fixCommands) console.log(`  ${cmd}`);
    const majors = report.vulnerabilities.filter(
      (v) => v.majorUpgrade && report.fixCommands.some((cmd) => cmd.includes(`${v.name}@${v.fixVersion}`))
    );
    for (const v of majors) {
      console.log(chalk.yellow(`  ⚠  ${v.name}@${v.fixVersion} is a major upgrade — check the changelog first`));
    }
  }

  if (report.warnings.length > 0) {
    console.log('\n' + chalk.dim('Warnings:'));
    for (const w of report.warnings) console.log(chalk.dim(`  - ${w}`));
  }

  if (report.ignored.length > 0) {
    console.log(chalk.dim(`Ignored (${report.ignored.length}): ${report.ignored.join(', ')}`));
  }

  console.log('');
}
