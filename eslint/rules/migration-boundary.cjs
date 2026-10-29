const { displayPath, resolveImport, staticString } = require('./app-router.cjs');
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
      const target = source === null ? null : resolveImport(filename, source);
      if (target !== null && insideRoot(patterns, displayPath(context, target), true)) {
        context.report({ node, messageId: 'boundary', data: { source } });
      }
    };

    const checkDeclaration = (node) => {
      if (node.source !== null && node.importKind !== 'type' && node.exportKind !== 'type') {
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
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length > 0) {
          check(node, node.arguments[0]);
        }
      },
    };
  },
};
