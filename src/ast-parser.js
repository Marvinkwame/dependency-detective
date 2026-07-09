import fs from 'fs';
import { parse } from '@babel/parser';

const BABEL_PLUGINS = ['jsx', 'typescript', 'dynamicImport', 'importMeta'];

export function extractPackageName(source) {
  if (source.startsWith('.')) return source;
  if (source.startsWith('@')) {
    return source.split('/').slice(0, 2).join('/');
  }
  return source.split('/')[0];
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  if (!node.type) return;
  if (visitor[node.type]) visitor[node.type](node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) walk(item, visitor);
      }
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, visitor);
    }
  }
}

export async function parseFileImports(filePath) {
  const referenced = new Set();
  const warnings = [];

  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return { referenced, warnings };
  }

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: BABEL_PLUGINS,
      errorRecovery: true,
    });
  } catch (err) {
    warnings.push(`Could not parse ${filePath}: ${err.message}`);
    return { referenced, warnings };
  }

  walk(ast, {
    ImportDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    ExportNamedDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    ExportAllDeclaration(node) {
      if (node.source?.value) referenced.add(extractPackageName(node.source.value));
    },
    CallExpression(node) {
      // require('pkg')  — CommonJS
      const isRequire =
        node.callee?.type === 'Identifier' && node.callee.name === 'require';
      // import('pkg')  — @babel/parser emits a CallExpression with an Import callee
      const isDynamicImport = node.callee?.type === 'Import';
      if (
        (isRequire || isDynamicImport) &&
        node.arguments?.[0]?.type === 'StringLiteral'
      ) {
        referenced.add(extractPackageName(node.arguments[0].value));
      }
    },
    // ESTree-shaped dynamic import (only if a future estree plugin is enabled)
    ImportExpression(node) {
      if (node.source?.type === 'StringLiteral') {
        referenced.add(extractPackageName(node.source.value));
      }
    },
  });

  return { referenced, warnings };
}
