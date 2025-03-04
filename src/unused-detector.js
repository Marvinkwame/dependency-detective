//const fs = require('fs');
//const path = require('path');
//const glob = require('glob');

import fs from "fs"
import path from "path"
import { glob } from "glob"

export async function findUnusedDependencies(directory, dependencies) {
  const unusedDeps = [];
  const allDeps = Object.keys(dependencies);

  // Get all JavaScript/TypeScript files in the project
  const files = glob.sync('**/*.{js,jsx,ts,tsx}', {
    cwd: directory,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const fileContents = files.map(file =>
    fs.readFileSync(path.join(directory, file), 'utf8')
  );

  allDeps.forEach(dep => {
    const version = dependencies[dep];
    let isUsed = false;

    
    const importPatterns = [
      new RegExp(`import.*from\\s+['"]${dep}['\"]`),
      new RegExp(`import\\s+['"]${dep}['\"]`),
      new RegExp(`require\\s*\\(\\s*['"]${dep}['\"]\\s*\\)`),
      new RegExp(`import\\s*\\(\\s*['"]${dep}['\"]\\s*\\)`),
    ];

    // Also check for submodule imports
    const submodulePattern = new RegExp(`import.*from\\s+['"]${dep}/`);
    const submoduleRequirePattern = new RegExp(`require\\s*\\(\\s*['"]${dep}/`);

    // Check if the dependency is mentioned in any file
    for (const content of fileContents) {
      if (
        importPatterns.some(pattern => pattern.test(content)) ||
        submodulePattern.test(content) ||
        submoduleRequirePattern.test(content)
      ) {
        isUsed = true;
        break;
      }
    }

    // Check package.json for dependencies that might be used in scripts
    const packageJson = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const scripts = packageJson.scripts || {};

    if (!isUsed) {
      // Check if it's used in npm scripts
      isUsed = Object.values(scripts).some(script => script.includes(dep));
    }

    // If the dependency is still not found to be used, add it to the unused list
    if (!isUsed) {
      unusedDeps.push({
        name: dep,
        version,
        reason: `Not imported or used in scripts`,
      });
    }
  });

  return unusedDeps;
}