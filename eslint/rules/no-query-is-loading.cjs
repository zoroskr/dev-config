const { isKeyNamed, isMemberNamed } = require('./process-env.cjs');
const { RESULT_HOOK, isHookCall, unwrap } = require('./query-hooks.cjs');

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      isLoading: 'Use `isPending`, never `isLoading`, from query and mutation results. See skill `react-data-containers`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      'VariableDeclarator[id.type=\'ObjectPattern\']'(declarator) {
        if (!isHookCall(sourceCode, unwrap(declarator.init), RESULT_HOOK)) {
          return;
        }
        for (const property of declarator.id.properties) {
          if (isKeyNamed(property, 'isLoading')) {
            context.report({ node: property, messageId: 'isLoading' });
          }
        }
      },
      MemberExpression(node) {
        if (isMemberNamed(node, 'isLoading') && isHookCall(sourceCode, unwrap(node.object), RESULT_HOOK)) {
          context.report({ node, messageId: 'isLoading' });
        }
      },
    };
  },
};
