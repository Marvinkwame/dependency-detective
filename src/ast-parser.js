import fs from 'fs';
import { parse } from '@babel/parser';

const BABEL_PLUGINS = ['jsx', 'typescript', 'dynamicImport', 'importMeta'];

function extractPackageName(source) {
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

  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return referenced;
  }

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: BABEL_PLUGINS,
      errorRecovery: true,
    });
  } catch (err) {
    console.warn(`Warning: could not parse ${filePath}: ${err.message}`);
    return referenced;
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
      if (
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments?.[0]?.type === 'StringLiteral'
      ) {
        referenced.add(extractPackageName(node.arguments[0].value));
      }
    },
    ImportExpression(node) {
      if (node.source?.type === 'StringLiteral') {
        referenced.add(extractPackageName(node.source.value));
      }
    },
  });

  return referenced;
}
