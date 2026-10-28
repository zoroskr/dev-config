const { exportedName, findVariable } = require('./process-env.cjs');

const QUERY_HOOK = /^use(?:Mutation|Query|InfiniteQuery|SuspenseQuery|SuspenseInfiniteQuery)$/u;
const QUERY_MODULE = '@tanstack/react-query';

const isQueryHookImport = (scope, name) => {
  const [definition] = findVariable(scope, name)?.defs ?? [];
  return definition?.type === 'ImportBinding'
    && definition.parent.source.value === QUERY_MODULE
    && definition.node.type === 'ImportSpecifier'
    && QUERY_HOOK.test(exportedName(definition.node.imported));
};

const TS_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

const unwrap = node => (TS_WRAPPERS.has(node?.type) ? unwrap(node.expression) : node);

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      destructure: 'Destructure hook returns at the call site. See skill `code-hygiene`.',
    },
  },
  create(context) {
    return {
      'VariableDeclarator[id.type=\'Identifier\']'(declarator) {
        const node = unwrap(declarator.init);
        if (node?.type !== 'CallExpression') {
          return;
        }
        const { callee } = node;
        const isHook = callee.type === 'MemberExpression'
          ? !callee.computed && QUERY_HOOK.test(callee.property.name)
          : callee.type === 'Identifier' && isQueryHookImport(context.sourceCode.getScope(node), callee.name);
        if (isHook) {
          context.report({ node, messageId: 'destructure' });
        }
      },
    };
  },
};
