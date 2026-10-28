const { RESULT_HOOK, isHookCall, unwrap } = require('./query-hooks.cjs');

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
        if (isHookCall(context.sourceCode, node, RESULT_HOOK)) {
          context.report({ node, messageId: 'destructure' });
        }
      },
    };
  },
};
