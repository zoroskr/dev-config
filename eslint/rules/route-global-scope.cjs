const { displayPath, privateGlobalScope, resolveImport, staticString } = require('./app-router.cjs');

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      privateGlobal: 'Do not import `{{source}}` here: a `(global)/` folder is private to `{{scope}}/`; move the file up one scope. See skill `nextjs-app-router`.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const check = (node) => {
      const source = staticString(node.source ?? node.argument?.literal);
      const target = source === null ? null : resolveImport(filename, source);
      const scope = target === null ? null : privateGlobalScope(filename, target);
      if (scope !== null) {
        context.report({ node, messageId: 'privateGlobal', data: { source, scope: displayPath(context, scope) } });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
      TSImportType: check,
    };
  },
};
