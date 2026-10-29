const { calleeName, displayPath, memberName, resolveBaseUrlImport, resolveImport, staticString } = require('./app-router.cjs');
const { globSource, relativeFilename } = require('./query-hooks.cjs');

const normalizeRoot = root => root.replace(/^\.\//u, '').replace(/\/+$/u, '');

const rootPatterns = roots => roots.map((root) => {
  // eslint-disable-next-line security/detect-non-literal-regexp -- escaped consumer glob
  return new RegExp(`^${globSource(normalizeRoot(root))}$`, 'u');
});

const insideRoot = (patterns, relative, includeSelf) => {
  const segments = relative.split('/');
  const depth = includeSelf ? segments.length : segments.length - 1;
  return Array.from({ length: depth }, (_, index) => segments.slice(0, index + 1).join('/'))
    .some(prefix => patterns.some(pattern => pattern.test(prefix)));
};

const typeOnly = node => node.importKind === 'type'
  || node.exportKind === 'type'
  || (node.specifiers?.length > 0 && node.specifiers.every(specifier => specifier.importKind === 'type' || specifier.exportKind === 'type'));

const isRequire = ({ callee }) => {
  if (callee.type === 'Identifier') {
    return callee.name === 'require';
  }
  if (callee.type === 'MemberExpression') {
    return callee.object.type === 'Identifier' && callee.object.name === 'module' && memberName(callee) === 'require';
  }
  return callee.type === 'CallExpression' && calleeName(callee) === 'createRequire';
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { roots: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      boundary: 'Do not import `{{source}}` outside a migrations root; a migration is a standalone operator-run module, never wired into app code. See skill `data-migration-safety`.',
    },
  },
  create(context) {
    const patterns = rootPatterns(context.options[0]?.roots ?? ['**/migrations']);
    if (insideRoot(patterns, relativeFilename(context), false)) {
      return {};
    }
    const filename = context.filename.replaceAll('\\', '/');

    const check = (node, sourceNode) => {
      const source = staticString(sourceNode);
      const target = source === null ? null : (resolveImport(filename, source) ?? resolveBaseUrlImport(filename, source));
      if (target !== null && insideRoot(patterns, displayPath(context, target), true)) {
        context.report({ node, messageId: 'boundary', data: { source } });
      }
    };

    const checkDeclaration = (node) => {
      if (node.source !== null && !typeOnly(node)) {
        check(node, node.source);
      }
    };

    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node) {
        check(node, node.source);
      },
      CallExpression(node) {
        if (node.arguments.length > 0 && isRequire(node)) {
          check(node, node.arguments[0]);
        }
      },
    };
  },
};
