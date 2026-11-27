# dependency-detective 🕵️‍♂️

A pre-release dependency check for Node.js apps. One command tells you what would break once you ship — packages your code imports but `package.json` doesn't declare, and known vulnerabilities in production dependencies — plus what's unused or deprecated, and ends with the exact commands to fix it. Vulnerability data comes from the free OSV.dev database; no token required.


## 🔍 Overview

**dependency-detective** addresses a common pain point that virtually every Node.js developer faces - dependency management gets messy as projects grow, and it's hard to know which packages are actually being used, which ones pose security risks, and which ones could be replaced with better alternatives.

## ✨ Features

- **Missing Dependencies**: Finds packages your code imports that aren't in `package.json` but happen to be installed (pulled in by something else) — the classic "works on my machine" deploy failure
- **Security Vulnerabilities**: Checks installed versions against OSV.dev, split into production (fails the run) and dev-only (reported only), with the version that fixes each
- **Unused Dependencies**: Identifies packages that aren't imported, referenced in config files, or run by your scripts
- **Deprecated Packages**: Flags dependencies whose latest version has been officially deprecated by its maintainer
- **Suggested Commands**: Ends with ready-to-run `npm`/`pnpm`/`yarn`/`bun` commands to fix what it found

## 📋 Installation

```bash
# Install globally
npm install -g dependency-detective

# Or use with npx
npx dependency-detective
```

## ⚙️ Configuration

No configuration or API tokens are required. Vulnerability data comes from the free
[OSV.dev](https://osv.dev) database and works out of the box.

### Ignoring packages

Some packages are used in ways the tool can't see, such as a plugin loaded by name at
runtime. Save them in your `package.json` so every run (including CI) skips them:

```json
{
  "dependencyDetective": {
    "ignore": ["postcss", "@types/*", "eslint-plugin-*"]
  }
}
```

`*` matches any characters. Ignored packages are skipped by every check and listed at
the end of the report. Names passed with `--ignore` are added to this list.

> Note: vulnerability checks read the **installed** version of each package from
> `node_modules`. Run `npm install` first for full coverage — uninstalled packages are
> reported as "not checked".

## 🚀 Usage

```bash
# Run in your project directory
dependency-detective

# Or specify a different project directory
dependency-detective --directory /path/to/your/project

# Show more detailed information
dependency-detective --verbose

# Skip the deprecated-package check
dependency-detective --no-suggestions

# Print the report as JSON
dependency-detective --json
```

## 📊 Example Output

```
📦 DEPENDENCY DETECTIVE REPORT

🚨 Missing Dependencies:
  dayjs  (installed 1.11.10, not in package.json)
    src/index.ts

🧪 Missing Dev Dependencies (tests/config only — won't fail the run):
  supertest  (installed 6.3.4, not in package.json)
    tests/api.test.js

🔒 Security Vulnerabilities (production):
  lodash 4.17.15  5 issues (3 high) → fix: 4.18.0

🧪 Security Vulnerabilities (dev only — won't fail the run):
  request 2.88.2  1 issue → no fix available yet

🗑️  Unused Dependencies:
  moment ^2.29.0

  Removing these could free about 4.3MB on disk

⚠️  Deprecated Packages:
  request  (latest 2.88.2)

🔧 Suggested commands (npm):
  npm install dayjs@^1.11.10
  npm install -D supertest@^6.3.4
  npm uninstall moment
  npm install lodash@4.18.0

Warnings:
  - Unresolved import "@acme/ui" in src/index.ts (not installed, not declared; alias?)
```

**Missing vs. unresolved:** an import is *missing* when the package is installed but not
declared — it works today only because another package pulled it in. An import that isn't
installed or declared anywhere is listed as an *unresolved* warning instead, since it may be
a path alias the tool doesn't know about. Aliases from `tsconfig.json`/`jsconfig.json`
(`paths`, `baseUrl`, relative `extends`), `#` subpath imports, `scheme:` imports and the
`~/`, `@/` and `$` prefixes are recognised and skipped.

**Production vs. dev:** vulnerabilities are production when the package is in
`dependencies`, dev-only when it's only in `devDependencies`. Missing packages imported only
from test or config files (`*.test.*`, `*.spec.*`, `*.config.*`, `test/`, `tests/`,
`__tests__/`, `.storybook/`) are dev use.

## 🔧 Options

| Option | Description |
|--------|-------------|
| `-d, --directory <path>` | Project directory to analyze (default: current directory) |
| `-v, --verbose` | Show detailed output including reasons and statistics |
| `--no-suggestions` | Skip the deprecated-package check |
| `--ignore <packages>` | Comma-separated package names to exclude from all checks, added to the [saved ignore list](#ignoring-packages). `*` is a wildcard |
| `--json` | Print the report as JSON instead of the formatted report |
| `--help` | Display help information |
| `--version` | Display version number |

For packages you always want skipped, use the [saved ignore list](#ignoring-packages) instead of repeating `--ignore`.

## 🤖 Using in CI

The exit code tells your pipeline whether anything needs attention:

| Exit code | Meaning |
|-----------|---------|
| `0` | Nothing that needs fixing before release |
| `1` | Unused dependencies, production vulnerabilities, or missing dependencies used by app code |
| `2` | The analysis could not run (for example, no `package.json`) |

Dev-only vulnerabilities, missing packages used only by tests or config, unresolved imports and deprecated packages are reported but don't fail the run. If the vulnerability lookup itself fails (network error), `securityCheckFailed` is `true` in the JSON and the run doesn't fail on that alone.

```bash
# Fail the build on anything that needs fixing before release
npx dependency-detective

# Save a machine-readable report
npx dependency-detective --json > dependency-report.json
```

With `--json`, only JSON is written to stdout:

```json
{
  "directory": "/path/to/project",
  "packageManager": "npm",
  "missing": [
    { "name": "dayjs", "installedVersion": "1.11.10", "scope": "production", "importedFrom": ["src/index.ts"] }
  ],
  "unresolvedImports": [{ "specifier": "@acme/ui", "importedFrom": ["src/index.ts"] }],
  "unused": [{ "name": "moment", "version": "^2.29.4" }],
  "estimatedSavingsBytes": 4404019,
  "vulnerabilities": [
    {
      "name": "lodash",
      "installedVersion": "4.17.15",
      "scope": "production",
      "fixVersion": "4.17.21",
      "majorUpgrade": false,
      "issues": [
        {
          "id": "GHSA-35jh-r3h4-6jhm",
          "severity": "HIGH",
          "title": "Command Injection in lodash",
          "fixedIn": "4.17.21",
          "url": "https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm"
        }
      ]
    }
  ],
  "notChecked": [],
  "securityCheckFailed": false,
  "deprecated": [{ "name": "request", "message": "request has been deprecated", "latestVersion": "2.88.2" }],
  "fixCommands": ["npm install dayjs@^1.11.10", "npm uninstall moment", "npm install lodash@4.17.21"],
  "ignored": ["postcss"],
  "warnings": ["Unresolved import \"@acme/ui\" in src/index.ts (not installed, not declared; alias?)"],
  "summary": {
    "missingProduction": 1, "missingDev": 0, "unused": 1,
    "vulnerableProduction": 1, "vulnerableDev": 0, "deprecated": 1
  }
}
```

`deprecated` is `null` when the check is skipped with `--no-suggestions`. `fixVersion` is `null` when no released version fixes every advisory. If the analysis can't run, the output is `{ "error": "..." }` with exit code `2`.

> **Upgrading from 0.4:** the JSON changed in 0.5.0. `summary.vulnerable` is replaced by
> `vulnerableProduction` and `vulnerableDev`, `summary.missingProduction`/`missingDev` are
> new, and `deprecated[].lastUpdated` is replaced by `latestVersion`.

## 🧩 How It Works

1. **AST-Based Source Scanning**: The tool parses your JS/TS/JSX/TSX files using `@babel/parser` to accurately detect `import`, `require`, `export ... from`, and dynamic `import()` statements — no regex guessing
2. **Config File Scanning**: It also checks common config files (`tailwind.config.js`, `.eslintrc`, `postcss.config.js`, `vite.config.js`, `tsconfig.json`, and more) for packages referenced outside of source code. ESLint configs are understood in both flat (`eslint.config.*`) and legacy (`.eslintrc*`, including YAML and the `eslintConfig` field in `package.json`) form, including short names such as `react` for `eslint-plugin-react` and `airbnb` for `eslint-config-airbnb`
3. **Script Scanning**: It checks your `package.json` scripts for each package's commands, read from its `bin` field — so `tsc` counts as using `typescript` and `run-p` as using `npm-run-all`
4. **Dependency Analysis**: It cross-references all found references with your `package.json` — declared but never referenced is *unused*; imported and installed but not declared is *missing*
5. **Security Checking**: It queries the free OSV.dev vulnerability database for the installed version of each declared or missing package (no token required) and works out the lowest version that fixes every advisory
6. **Deprecation Analysis**: It checks the npm registry's latest-version record for packages that are officially deprecated
7. **Report Generation**: It presents findings by urgency and ends with ready-to-run commands for your package manager (detected from the lockfile)

Build output and caches (`dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.vercel`, `.netlify`, `.turbo`, `.cache`) are never scanned.

## 🛠️ For Developers

### Project Structure

```
dependency-detective/
├── index.js           # CLI entry point
├── package.json
└── src/
    ├── analyzer.js            # Main analysis logic and result display
    ├── unused-detector.js     # Orchestrates unused dependency detection
    ├── ast-parser.js          # AST-based import extraction (@babel/parser)
    ├── config-scanner.js      # Scans config files for package references
    ├── script-scanner.js      # Matches npm script commands to packages via their bin field
    ├── ignore.js              # Saved ignore list and * wildcard matching
    ├── missing-detector.js    # Imported-but-undeclared packages, production vs dev use
    ├── alias-resolver.js      # tsconfig/jsconfig paths, baseUrl and framework aliases
    ├── package-manager.js     # Detects npm/pnpm/yarn/bun from the lockfile
    ├── fix-commands.js        # Builds the suggested commands
    ├── security-checker.js    # Checks vulnerabilities via OSV.dev (no token)
    ├── alternative-suggester.js # Flags officially-deprecated packages
    └── util/
        └── concurrency.js     # Concurrency-capped async map helper
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/Marvinkwame/dependency-detective.git
cd dependency-detective

# Install dependencies
npm install

# Link for local testing
npm link

# Run tests
npm test
```

## ⚠️ Limitations

- Dynamically computed imports (`require(variable)`) cannot be statically detected — use `--ignore` to exempt these packages
- Vulnerability checks read the installed version from `node_modules`; uninstalled packages are skipped
- Vulnerability data comes from OSV.dev, whose coverage and severity ratings may differ from commercial databases
- Vue/Svelte/Astro single-file components are not yet scanned for imports
- Path aliases inherited through a tsconfig `extends` that points at a package (e.g. `"extends": "@tsconfig/node20"`) aren't followed; imports through them may show as unresolved warnings
- Missing-dependency detection relies on packages being installed at the top of `node_modules` (npm, yarn classic, bun); pnpm's strict layout already prevents most of these at runtime

## 📝 Roadmap

- [x] Improve detection accuracy with AST parsing
- [x] Scan config files for build-tool package references
- [x] Token-free vulnerability checks via OSV.dev
- [x] Missing-dependency detection and suggested fix commands
- [ ] `--fix`: run the suggested commands after confirmation
- [ ] Add support for monorepos and workspaces
- [x] `--json` output and CI mode with exit codes
- [ ] Maintenance/abandonment signals for dependencies

## 📄 License

MIT

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgements

- Thanks to all the open-source package maintainers
- Inspired by similar tools like depcheck and npm-check