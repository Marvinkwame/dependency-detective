# dependency-detective 🕵️‍♂️

A powerful Node.js tool that analyzes your project's dependencies, identifies unused packages, forecasts potential security risks, and suggests better alternatives based on community engagement and update frequency.


## 🔍 Overview

**dependency-detective** addresses a common pain point that virtually every Node.js developer faces - dependency management gets messy as projects grow, and it's hard to know which packages are actually being used, which ones pose security risks, and which ones could be replaced with better alternatives.

## ✨ Features

- **Unused Dependencies Detection**: Identifies truly unused packages that can be safely removed
- **Security Vulnerabilities Check**: Highlights packages with known security issues
- **Alternative Package Suggestions**: Recommends better alternatives based on community adoption, performance metrics, and update frequency
- **Detailed Reporting**: Get comprehensive information about your dependency health in an easy-to-read format

## 📋 Installation

```bash
# Install globally
npm install -g dependency-detective

# Or use with npx
npx dependency-detective
```

## ⚙️ Configuration

### Snyk API Token (optional)

Vulnerability checking requires a free Snyk account. Without a token the tool still reports unused dependencies and alternative suggestions — the vulnerability section is skipped with a clear message.

1. Sign up at [https://snyk.io](https://snyk.io) and copy your API token from Account Settings.
2. Create a `.env` file in your project root (or export in your shell profile):

```
SNYK_API_TOKEN=your-token-here
```

The tool loads `.env` automatically via dotenv.

## 🚀 Usage

```bash
# Run in your project directory
dependency-detective

# Or specify a different project directory
dependency-detective --directory /path/to/your/project

# Show more detailed information
dependency-detective --verbose

# Skip alternative package suggestions
dependency-detective --no-suggestions
```

## 📊 Example Output

```
📦 DEPENDENCY DETECTIVE REPORT

🗑️  Unused Dependencies:
  jquery v3.6.0
  moment v2.29.4

  Removing these could save approximately ~10MB of disk space

🔒 Security Vulnerabilities:
  lodash (1 issues)

💡 Recommended Alternatives:
  moment → date-fns
  jquery → No dependency needed
  express → fastify

📋 Next Steps:
  1. Run with --verbose flag for more detailed information
  2. Consider removing unused dependencies with: npm uninstall [package-names]
  3. Address security vulnerabilities by updating affected packages
  4. Evaluate suggested alternatives for potential improvements
```

## 🔧 Options

| Option | Description |
|--------|-------------|
| `-d, --directory <path>` | Project directory to analyze (default: current directory) |
| `-v, --verbose` | Show detailed output including reasons and statistics |
| `--no-suggestions` | Skip suggesting alternative packages |
| `--ignore <packages>` | Comma-separated list of package names to exclude from all checks |
| `--help` | Display help information |
| `--version` | Display version number |

Use `--ignore` for packages that are intentionally hard to detect — build tools, PostCSS plugins, ESLint configs, and similar packages that are referenced in config files rather than imported in source code.

## 🧩 How It Works

1. **AST-Based Source Scanning**: The tool parses your JS/TS/JSX/TSX files using `@babel/parser` to accurately detect `import`, `require`, `export ... from`, and dynamic `import()` statements — no regex guessing
2. **Config File Scanning**: It also checks common config files (`tailwind.config.js`, `.eslintrc`, `postcss.config.js`, `vite.config.js`, `tsconfig.json`, and more) for packages referenced outside of source code
3. **Dependency Analysis**: It cross-references all found references with your `package.json`
4. **Security Checking**: It queries the Snyk API for known vulnerabilities (requires `SNYK_API_TOKEN`)
5. **Alternative Analysis**: It evaluates potential alternative packages based on multiple metrics
6. **Report Generation**: It presents findings in a clear, actionable format

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
    ├── security-checker.js    # Checks for vulnerabilities via Snyk API
    └── alternative-suggester.js # Suggests better alternatives
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
- Security vulnerability detection requires a Snyk API token and relies on Snyk's database, which may not cover every package
- Alternative suggestions are based on general community metrics and might not be ideal for every specific use case

## 📝 Roadmap

- [x] Improve detection accuracy with AST parsing
- [x] Scan config files for build-tool package references
- [ ] Add support for monorepos and workspaces
- [ ] Visual reporting with charts and graphs
- [ ] Interactive mode for bulk actions on dependencies
- [ ] Customizable rules and thresholds
- [ ] GitHub Actions integration

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