# dependency-detective 🕵️‍♂️

A Node.js tool that analyzes your project's dependencies: it identifies unused packages, checks for known security vulnerabilities (via the free OSV.dev database — no token required), and flags packages whose latest version has been officially deprecated.


## 🔍 Overview

**dependency-detective** addresses a common pain point that virtually every Node.js developer faces - dependency management gets messy as projects grow, and it's hard to know which packages are actually being used, which ones pose security risks, and which ones could be replaced with better alternatives.

## ✨ Features

- **Unused Dependencies Detection**: Identifies truly unused packages that can be safely removed
- **Security Vulnerabilities Check**: Highlights packages with known security issues, using the free OSV.dev database
- **Deprecated Package Detection**: Flags dependencies whose latest version has been officially deprecated by its maintainer
- **Detailed Reporting**: Get comprehensive information about your dependency health in an easy-to-read format

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
```

## 📊 Example Output

```
📦 DEPENDENCY DETECTIVE REPORT

🗑️  Unused Dependencies:
  jquery v3.6.0
  moment v2.29.4

  Removing these could free approximately ~3.2MB on disk

🔒 Security Vulnerabilities:
  lodash (1 issues)

⚠️  Deprecated Packages:
  request

📋 Next Steps:
  1. Run with --verbose flag for more detailed information
  2. Consider removing unused dependencies with: npm uninstall [package-names]
  3. Address security vulnerabilities by updating affected packages
  4. Replace deprecated packages with maintained alternatives
```

## 🔧 Options

| Option | Description |
|--------|-------------|
| `-d, --directory <path>` | Project directory to analyze (default: current directory) |
| `-v, --verbose` | Show detailed output including reasons and statistics |
| `--no-suggestions` | Skip the deprecated-package check |
| `--ignore <packages>` | Comma-separated list of package names to exclude from all checks |
| `--help` | Display help information |
| `--version` | Display version number |

Use `--ignore` for packages that are intentionally hard to detect — build tools, PostCSS plugins, ESLint configs, and similar packages that are referenced in config files rather than imported in source code.

## 🧩 How It Works

1. **AST-Based Source Scanning**: The tool parses your JS/TS/JSX/TSX files using `@babel/parser` to accurately detect `import`, `require`, `export ... from`, and dynamic `import()` statements — no regex guessing
2. **Config File Scanning**: It also checks common config files (`tailwind.config.js`, `.eslintrc`, `postcss.config.js`, `vite.config.js`, `tsconfig.json`, and more) for packages referenced outside of source code. ESLint configs are understood in both flat (`eslint.config.*`) and legacy (`.eslintrc*`, including YAML and the `eslintConfig` field in `package.json`) form, including short names such as `react` for `eslint-plugin-react` and `airbnb` for `eslint-config-airbnb`
3. **Script Scanning**: It checks your `package.json` scripts for each package's commands, read from its `bin` field — so `tsc` counts as using `typescript` and `run-p` as using `npm-run-all`
4. **Dependency Analysis**: It cross-references all found references with your `package.json`
5. **Security Checking**: It queries the free OSV.dev vulnerability database for the installed version of each package (no token required)
6. **Deprecation Analysis**: It checks the npm registry for packages whose latest version is officially deprecated
7. **Report Generation**: It presents findings in a clear, actionable format

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
    ├── security-checker.js    # Checks vulnerabilities via OSV.dev (no token)
    ├── alternative-suggester.js # Flags officially-deprecated packages
    └── util/
        └── concurrency.js     # Concurrency-capped async map helper
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/dependency-detective.git
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

## 📝 Roadmap

- [x] Improve detection accuracy with AST parsing
- [x] Scan config files for build-tool package references
- [x] Token-free vulnerability checks via OSV.dev
- [ ] `--fix` / interactive removal of unused dependencies
- [ ] Add support for monorepos and workspaces
- [ ] `--json` output and CI mode with exit codes
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