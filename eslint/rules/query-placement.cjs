const { QUERY_FAMILY, isHookCall, matchesGlobs } = require('./query-hooks.cjs');

const HOOK_NAME = /^use[A-Z]/u;
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

const functionName = (node) => {
  if (node.id) {
    return node.id.name;
  }
  return node.parent.type === 'VariableDeclarator' && node.parent.id.type === 'Identifier' ? node.parent.id.name : null;
};

const insideHook = (sourceCode, node) => sourceCode.getAncestors(node)
  .some(ancestor => FUNCTIONS.has(ancestor.type) && HOOK_NAME.test(functionName(ancestor) ?? ''));

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: {
        containers: { type: 'array', items: { type: 'string' } },
        providers: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
    messages: {
      placement: 'Call query hooks only in a `*Container.tsx` or a Context Provider; move this query into a Container. See skill `react-data-containers`.',
      wrapper: 'Never wrap a query in a custom `use*` hook; call it in the Container that renders the data. See skill `react-data-containers`.',
      multiple: 'One query per Container; move each extra resource into a sibling Container. See skill `react-data-containers`.',
    },
  },
  create(context) {
    const { containers = ['**/*Container.tsx'], providers = ['**/*Provider.tsx'] } = context.options[0] ?? {};
    const isContainer = matchesGlobs(context, containers);
    const isProvider = !isContainer && matchesGlobs(context, providers);
    let containerQueries = 0;
    return {
      CallExpression(node) {
        const { sourceCode } = context;
        if (!isHookCall(sourceCode, node, QUERY_FAMILY)) {
          return;
        }
        if (insideHook(sourceCode, node)) {
          context.report({ node, messageId: 'wrapper' });
        } else if (isContainer) {
          containerQueries += 1;
          if (containerQueries > 1) {
            context.report({ node, messageId: 'multiple' });
          }
        } else if (!isProvider) {
          context.report({ node, messageId: 'placement' });
        }
      },
    };
  },
};
