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
| `--help` | Display help information |
| `--version` | Display version number |

## 🧩 How It Works

1. **Scanning Source Code**: The tool scans your project files looking for import/require statements
2. **Dependency Analysis**: It cross-references found imports with your package.json
3. **Security Checking**: It queries security databases for known vulnerabilities
4. **Alternative Analysis**: It evaluates potential alternative packages based on multiple metrics
5. **Report Generation**: It presents findings in a clear, actionable format

## 🛠️ For Developers

### Project Structure

```
dependency-detective/
├── index.js           # CLI entry point
├── package.json
└── src/
    ├── analyzer.js            # Main analysis logic
    ├── unused-detector.js     # Detects unused dependencies
    ├── security-checker.js    # Checks for vulnerabilities
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

- The tool may not detect dependencies used in dynamically generated requires or imports
- Security vulnerability detection relies on external databases which may not be 100% complete
- Alternative suggestions are based on general community metrics and might not be ideal for every specific use case

## 📝 Roadmap

- [ ] Improve detection accuracy with AST parsing
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