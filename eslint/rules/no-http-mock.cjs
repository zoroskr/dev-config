const { staticString } = require('./app-router.cjs');

const HTTP_MOCK_MODULES = new Set(['msw', 'nock']);

const isHttpMock = source => HTTP_MOCK_MODULES.has(source) || source.startsWith('msw/');

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      httpMock: 'Do not import `{{source}}` in a unit test; mock the nearest boundary module with `vi.mock` (HTTP mocks belong to E2E). See skill `vitest-testing`.',
    },
  },
  create(context) {
    const check = (node) => {
      const source = staticString(node.source);
      if (source !== null && isHttpMock(source)) {
        context.report({ node, messageId: 'httpMock', data: { source } });
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
