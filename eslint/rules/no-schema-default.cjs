const INPUT_SCHEMA = /InputSchema$/u;

const isDefaultCall = ({ callee }) => callee.type === 'MemberExpression'
  && (callee.computed
    ? callee.property.type === 'Literal' && callee.property.value === 'default'
    : callee.property.name === 'default');

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
      schemaDefault: 'Do not use `.default()` in shared data or output schemas; the server sets every value explicitly. Defaults belong only in a top-level `*InputSchema`. See skill `zod-schemas`.',
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
