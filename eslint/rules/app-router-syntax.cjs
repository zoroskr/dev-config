const { defaultExportFunction, hasDirective } = require('./app-router.cjs');
const { matchesGlobs, relativeFilename, unwrap } = require('./query-hooks.cjs');

const PAGE_FILE = /(?:^|\/)page\.tsx?$/u;
const SERVER_ROUTE_FILE = /(?:^|\/)(?:page|layout|loading|template|default)\.tsx$/u;
const REDIRECTS = new Set(['permanentRedirect', 'redirect']);
const STATIC_PATHS = new Set(['Literal', 'TemplateLiteral']);
const MODE_KEY = '/^(isEditing|isEditMode)$/';
const CALLER_NAME = '/^(createCaller|createCallerFactory)$/';

const onlyExpression = ({ body }) => {
  if (body.type !== 'BlockStatement') {
    return body;
  }
  const [statement] = body.body;
  if (body.body.length !== 1) {
    return null;
  }
  if (statement.type === 'ExpressionStatement') {
    return statement.expression;
  }
  return statement.type === 'ReturnStatement' ? statement.argument : null;
};

const staticRedirect = (fn) => {
  const call = unwrap(onlyExpression(fn));
  return call?.type === 'CallExpression'
    && call.callee.type === 'Identifier'
    && REDIRECTS.has(call.callee.name)
    && STATIC_PATHS.has(call.arguments[0]?.type)
    ? call
    : null;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: {
        app: { type: 'array', items: { type: 'string' } },
        shared: { type: 'array', items: { type: 'string' } },
        serverCallerModules: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    }],
    messages: {
      barrel: 'Do not re-export (`export * from`, `export { x } from`); import the explicit file instead of a barrel or re-export stub. See skill `nextjs-app-router`.',
      zodInTsx: 'Do not build Zod schemas in a `.tsx` file; move the schema to the feature `schemas/` folder. See skill `nextjs-app-router`.',
      schemaInTsx: 'Do not declare a `*Schema` const in a `.tsx` file; move it to the feature `schemas/` folder. See skill `nextjs-app-router`.',
      staticRedirect: 'A page that only calls `redirect()` with a static path belongs in `next.config` `redirects()`; delete the page. See skill `nextjs-app-router`.',
      serverTry: 'Do not `try/catch` in a Server route file; let errors reach `error.tsx`. See skill `nextjs-app-router`.',
      modeProp: 'Do not model a major mode with an `isEditing`/`isEditMode` prop; make it a sub-route (`[id]/edit/page.tsx`). See skill `nextjs-app-router`.',
      serverCaller: 'Create the tRPC server caller only in the shared server caller module (`serverCallerModules`); import it from there. See skill `trpc-layered-backend`.',
    },
  },
  create(context) {
    const { app = [], shared = [], serverCallerModules = [] } = context.options[0] ?? {};
    const { sourceCode } = context;
    const filename = relativeFilename(context);
    const inApp = matchesGlobs(context, app);
    const visitors = [];
    const restrict = (selectors, messageId) => visitors.push(
      ...selectors.map(selector => [selector, node => context.report({ node, messageId })]),
    );
    if (inApp || matchesGlobs(context, shared)) {
      restrict(['ExportAllDeclaration', 'ExportNamedDeclaration[source]'], 'barrel');
    }
    if (inApp && filename.endsWith('.tsx')) {
      restrict(['CallExpression[callee.object.name=\'z\']'], 'zodInTsx');
      restrict(['VariableDeclarator[id.name=/[sS]chema$/]'], 'schemaInTsx');
      restrict([`TSPropertySignature[key.name=${MODE_KEY}]`, `TSMethodSignature[key.name=${MODE_KEY}]`], 'modeProp');
    }
    if (inApp && SERVER_ROUTE_FILE.test(filename) && !hasDirective(sourceCode.ast, 'use client')) {
      restrict(['TryStatement'], 'serverTry');
    }
    if (!matchesGlobs(context, serverCallerModules)) {
      restrict([`CallExpression[callee.name=${CALLER_NAME}]`, `CallExpression[callee.property.name=${CALLER_NAME}]`], 'serverCaller');
    }
    if (inApp && PAGE_FILE.test(filename)) {
      visitors.push(['Program', () => {
        const page = defaultExportFunction(sourceCode);
        const call = page === null ? null : staticRedirect(page);
        if (call !== null) {
          context.report({ node: call, messageId: 'staticRedirect' });
        }
      }]);
    }
    return Object.fromEntries(visitors);
  },
};
