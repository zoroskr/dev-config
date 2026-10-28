const { exportedName, findVariable, isKeyNamed, isMemberNamed } = require('./process-env.cjs');

const VITEST_NAMES = new Set(['vi', 'vitest']);
const MOCK_METHODS = ['mock', 'doMock'];

const isVitestNamespace = (scope, node) => {
  const [definition] = node?.type === 'Identifier' ? findVariable(scope, node.name)?.defs ?? [] : [];
  return definition?.type === 'ImportBinding'
    && definition.parent.source.value === 'vitest'
    && definition.node.type !== 'ImportSpecifier';
};

const isVitestObject = (scope, node) => {
  if (node?.type === 'MemberExpression') {
    return [...VITEST_NAMES].some(name => isMemberNamed(node, name)) && isVitestNamespace(scope, node.object);
  }
  if (node?.type !== 'Identifier') {
    return false;
  }
  const [definition] = findVariable(scope, node.name)?.defs ?? [];
  if (definition === undefined) {
    return VITEST_NAMES.has(node.name);
  }
  return definition.type === 'ImportBinding'
    && definition.parent.source.value === 'vitest'
    && definition.node.type === 'ImportSpecifier'
    && VITEST_NAMES.has(exportedName(definition.node.imported));
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      productionMock: 'Do not call `vi.mock`/`vi.doMock` outside test files; mock inline at the top of the test file, or globally in a setup file listed in `testSetupFiles`. See skill `vitest-testing`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (MOCK_METHODS.some(method => isMemberNamed(callee, method)) && isVitestObject(context.sourceCode.getScope(node), callee.object)) {
          context.report({ node, messageId: 'productionMock' });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern'
          && node.id.properties.some(property => MOCK_METHODS.some(method => isKeyNamed(property, method)))
          && isVitestObject(context.sourceCode.getScope(node), node.init)) {
          context.report({ node, messageId: 'productionMock' });
        }
      },
    };
  },
};
