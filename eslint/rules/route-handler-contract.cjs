const { memberName } = require('./app-router.cjs');
const { findVariable, isGlobalIdentifier } = require('./process-env.cjs');
const { isZodConstructor } = require('./zod-binding.cjs');

const THROWING_PARSE = new Set(['parse', 'parseAsync']);
const ALLOWED_PARSERS = ['Date', 'JSON', 'URL'];
const PARSER_MODULES = new Set(['qs', 'querystring', 'node:querystring']);

const isParserModule = (scope, node) => {
  const [definition] = (node.type === 'Identifier' ? findVariable(scope, node.name)?.defs : null) ?? [];
  return definition?.type === 'ImportBinding'
    && definition.node.type !== 'ImportSpecifier'
    && PARSER_MODULES.has(definition.parent.source.value);
};

const isAllowedParser = (scope, node) => ALLOWED_PARSERS.some(name => isGlobalIdentifier(scope, node, name)) || isParserModule(scope, node);

const isThrowingParse = (scope, { callee }) => callee.type === 'MemberExpression'
  && THROWING_PARSE.has(memberName(callee))
  && !isAllowedParser(scope, callee.object);

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      zodInRoute: 'Do not build Zod schemas in a route handler; import the payload schema from a schema file. See skill `webhook-receivers`.',
      throwingParse: 'Do not call a throwing `.parse()`/`.parseAsync()` in a route handler; use `safeParse` and map the failure to the route response. See skill `webhook-receivers`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      'CallExpression:exit'(node) {
        const scope = sourceCode.getScope(node);
        if (isZodConstructor(scope, node)) {
          context.report({ node, messageId: 'zodInRoute' });
        } else if (isThrowingParse(scope, node)) {
          context.report({ node, messageId: 'throwingParse' });
        }
      },
    };
  },
};
