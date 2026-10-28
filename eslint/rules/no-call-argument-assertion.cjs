const { isKeyNamed, isMemberNamed } = require('./process-env.cjs');

const CALL_ARGUMENT_MATCHERS = [
  'toHaveBeenCalledWith',
  'toHaveBeenNthCalledWith',
  'toHaveBeenLastCalledWith',
  'toHaveBeenCalledExactlyOnceWith',
  'toBeCalledWith',
  'nthCalledWith',
  'lastCalledWith',
];
const MOCK_CALL_RECORDS = ['calls', 'lastCall'];

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      callArguments: 'Integration tests assert real stored reads, never mock call arguments (`{{name}}`); read the persisted state instead. See skill `vitest-testing`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const matcher = CALL_ARGUMENT_MATCHERS.find(name => isMemberNamed(node.callee, name));
        if (matcher !== undefined) {
          context.report({ node, messageId: 'callArguments', data: { name: matcher } });
        }
      },
      MemberExpression(node) {
        const record = MOCK_CALL_RECORDS.find(name => isMemberNamed(node, name));
        if (record !== undefined && isMemberNamed(node.object, 'mock')) {
          context.report({ node, messageId: 'callArguments', data: { name: `mock.${record}` } });
        }
      },
      VariableDeclarator(node) {
        const record = node.id.type === 'ObjectPattern' && isMemberNamed(node.init, 'mock')
          ? MOCK_CALL_RECORDS.find(name => node.id.properties.some(property => isKeyNamed(property, name)))
          : undefined;
        if (record !== undefined) {
          context.report({ node, messageId: 'callArguments', data: { name: `mock.${record}` } });
        }
      },
    };
  },
};
