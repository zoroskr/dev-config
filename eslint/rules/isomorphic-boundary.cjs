const { builtinModules } = require('node:module');

const NODE_BUILTINS = new Set(builtinModules);
const JSX_NODES = new Set(['JSXElement', 'JSXFragment']);

const escapeRegExp = value => value.replace(/[.+?^${}()|[\]\\]/gu, '\\$&');

const globPattern = (glob) => {
  const source = `^${glob.split('*').map(escapeRegExp).join('.*')}$`;
  // eslint-disable-next-line security/detect-non-literal-regexp -- escaped consumer glob
  return new RegExp(source, 'u');
};

const literalSource = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
};

const isProcessEnv = node => node.object.type === 'Identifier'
  && node.object.name === 'process'
  && (node.computed
    ? node.property.type === 'Literal' && node.property.value === 'env'
    : node.property.name === 'env');

const isGlobalBinding = (scope, name) => {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable.defs.length === 0;
    }
  }
  return true;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { forbiddenImports: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      nodeBuiltin: 'Shared code runs on client and server; do not import the Node builtin `{{source}}`. See skill `zod-schemas`.',
      serverOnly: 'Shared code runs on client and server; do not import `server-only`. See skill `zod-schemas`.',
      forbiddenImport: 'Shared code runs on client and server; do not import the server-only module `{{source}}`. See skill `zod-schemas`.',
      processEnv: 'Do not read `process.env` in shared code; it leaks secrets into the client bundle. See skill `zod-schemas`.',
      jsx: 'Do not render JSX in shared code; components belong to the client layer. See skill `zod-schemas`.',
    },
  },
  create(context) {
    const forbidden = (context.options[0]?.forbiddenImports ?? []).map(globPattern);

    const checkSource = (node, sourceNode) => {
      const source = literalSource(sourceNode);
      if (source === null) {
        return;
      }
      if (source.startsWith('node:') || NODE_BUILTINS.has(source)) {
        context.report({ node, messageId: 'nodeBuiltin', data: { source } });
      } else if (source === 'server-only') {
        context.report({ node, messageId: 'serverOnly' });
      } else if (forbidden.some(pattern => pattern.test(source))) {
        context.report({ node, messageId: 'forbiddenImport', data: { source } });
      }
    };

    const checkDeclaration = (node) => {
      if (node.source !== null && node.importKind !== 'type' && node.exportKind !== 'type') {
        checkSource(node, node.source);
      }
    };

    const checkJsx = (node) => {
      if (!context.sourceCode.getAncestors(node).some(ancestor => JSX_NODES.has(ancestor.type))) {
        context.report({ node, messageId: 'jsx' });
      }
    };

    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node) {
        checkSource(node, node.source);
      },
      MemberExpression(node) {
        if (isProcessEnv(node) && isGlobalBinding(context.sourceCode.getScope(node), 'process')) {
          context.report({ node, messageId: 'processEnv' });
        }
      },
      JSXElement: checkJsx,
      JSXFragment: checkJsx,
    };
  },
};
