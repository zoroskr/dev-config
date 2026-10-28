const INPUT_SCHEMA = /InputSchema$/u;
const DEFAULT_METHODS = new Set(['default', 'prefault']);

const isDefaultCall = ({ callee }) => callee.type === 'MemberExpression'
  && DEFAULT_METHODS.has(callee.computed
    ? callee.property.type === 'Literal' && callee.property.value
    : callee.property.name);

const isTopLevelDeclarator = (node) => {
  const declaration = node.parent;
  return declaration.parent.type === 'Program'
    || (declaration.parent.type === 'ExportNamedDeclaration' && declaration.parent.parent.type === 'Program');
};

const insideInputSchema = ancestors => ancestors.some(ancestor => ancestor.type === 'VariableDeclarator'
  && isTopLevelDeclarator(ancestor)
  && ancestor.id.type === 'Identifier'
  && INPUT_SCHEMA.test(ancestor.id.name));

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      schemaDefault: 'Do not use `.default()` or `.prefault()` in shared data or output schemas; the server sets every value explicitly. Defaults belong only in a top-level `*InputSchema`. See skill `zod-schemas`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isDefaultCall(node) && !insideInputSchema(context.sourceCode.getAncestors(node))) {
          context.report({ node: node.callee.property, messageId: 'schemaDefault' });
        }
      },
    };
  },
};
