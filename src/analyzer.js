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
    const unusedDeps = await findUnusedDependencies(options.directory, filteredDependencies);

    spinner.text = 'Checking for security vulnerabilities...';
    const vulnerabilities = await checkVulnerabilities(filteredDependencies);

    let alternatives = {};
    if (options.suggestions !== false) {
      spinner.text = 'Finding better alternatives...';
      alternatives = await suggestAlternatives(filteredDependencies);
    }

    spinner.succeed('Analysis complete!');

    displayResults(unusedDeps, vulnerabilities, alternatives, options.verbose);
  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red('Error:'), error.message);
  }
}

function getSavingsEstimate(unusedDeps) {
  
  // Average size of an npm package in MB
  const AVERAGE_PACKAGE_SIZE_MB = 5;

  // Calculate the total estimated savings
  const totalSavingsMB = unusedDeps.length * AVERAGE_PACKAGE_SIZE_MB;

  // Return the formatted estimate
  return `~${totalSavingsMB}MB`;
}

// Define displayResults function
function displayResults(unusedDeps, vulnerabilities, alternatives, verbose) {
  console.log('\n' + chalk.bold('📦 DEPENDENCY DETECTIVE REPORT') + '\n');

  // Display unused dependencies
  console.log(chalk.bold('🗑️  Unused Dependencies:'));
  if (unusedDeps.length === 0) {
    console.log(chalk.green('  No unused dependencies found. Great job!'));
  } else {
    unusedDeps.forEach(dep => {
      console.log(`  ${chalk.yellow(dep.name)} ${chalk.dim(`v${dep.version}`)}`);
      if (verbose && dep.reason) {
        console.log(`    ${chalk.dim(dep.reason)}`);
      }
    });
    console.log(chalk.dim(`\n  Removing these could save approximately ${getSavingsEstimate(unusedDeps)} of disk space`));
  }

  // Display vulnerabilities
  console.log('\n' + chalk.bold('🔒 Security Vulnerabilities:'));
  if (vulnerabilities === null) {
    console.log(chalk.yellow('  ⚠  Skipped — SNYK_API_TOKEN not set.'));
    console.log(chalk.dim('     To enable: add SNYK_API_TOKEN=<your-token> to a .env file.'));
    console.log(chalk.dim('     Get a free token at https://snyk.io'));
  } else if (Object.keys(vulnerabilities).length === 0) {
    console.log(chalk.green('  No security vulnerabilities detected. You\'re secure!'));
  } else {
    Object.entries(vulnerabilities).forEach(([depName, issues]) => {
      console.log(`  ${chalk.red(depName)} ${chalk.dim(`(${issues.length} issues)`)}`);
      if (verbose) {
        issues.forEach(issue => {
          console.log(`    - ${issue.severity.toUpperCase()}: ${issue.title}`);
          console.log(`      ${chalk.dim(issue.description)}`);
        });
      }
    });
  }

  // Display alternative suggestions
  if (Object.keys(alternatives).length > 0) {
    console.log('\n' + chalk.bold('💡 Recommended Alternatives:'));
    Object.entries(alternatives).forEach(([depName, suggestion]) => {
      console.log(`  ${chalk.blue(depName)} → ${chalk.green(suggestion.name)}`);
      if (verbose) {
        console.log(`    ${chalk.dim(suggestion.reason)}`);
        console.log(`    ${chalk.dim(`Weekly downloads: ${suggestion.downloads.toLocaleString()}`)}`);
        console.log(`    ${chalk.dim(`Last updated: ${suggestion.lastUpdated}`)}`);
      }
    });
  }

  console.log('\n' + chalk.bold('📋 Next Steps:'));
  console.log('  1. Run with --verbose flag for more detailed information');
  console.log('  2. Consider removing unused dependencies with: npm uninstall [package-names]');
  console.log('  3. Address security vulnerabilities by updating affected packages');
  console.log('  4. Evaluate suggested alternatives for potential improvements\n');
}