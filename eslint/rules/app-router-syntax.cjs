const { defaultExportFunction, hasDirective, staticString } = require('./app-router.cjs');
const { findVariable } = require('./process-env.cjs');
const { matchesGlobs, relativeFilename, unwrap } = require('./query-hooks.cjs');
const { importedName, zodImportSpecifier } = require('./zod-binding.cjs');

const PAGE_FILE = /(?:^|\/)page\.tsx?$/u;
const SERVER_ROUTE_FILE = /(?:^|\/)(?:page|layout|loading|template|default)\.tsx$/u;
const REDIRECTS = new Set(['permanentRedirect', 'redirect']);
const MODE_KEY = '/^(isEditing|isEditMode)$/';
const CALLER_NAMES = new Set(['createCaller', 'createCallerFactory']);

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

const isStaticPath = node => node?.type === 'Literal' || (node?.type === 'TemplateLiteral' && node.expressions.length === 0);

const staticRedirect = (fn) => {
  const call = unwrap(onlyExpression(fn));
  return call?.type === 'CallExpression'
    && call.callee.type === 'Identifier'
    && REDIRECTS.has(call.callee.name)
    && isStaticPath(call.arguments[0])
    ? call
    : null;
};

const isZodBinding = (scope, node) => node.type === 'Identifier' && (node.name === 'z' || zodImportSpecifier(scope, node.name) !== null);

const isZodCall = (scope, { callee }) => isZodBinding(scope, callee.type === 'MemberExpression' ? callee.object : callee);

const memberName = (member) => {
  if (member.computed) {
    return staticString(member.property);
  }
  return member.property.type === 'Identifier' ? member.property.name : null;
};

const callerName = (scope, { callee }) => {
  if (callee.type === 'MemberExpression') {
    return memberName(callee);
  }
  if (callee.type !== 'Identifier') {
    return null;
  }
  const [definition] = findVariable(scope, callee.name)?.defs ?? [];
  return definition?.type === 'ImportBinding' && definition.node.type === 'ImportSpecifier' ? importedName(definition.node) : callee.name;
};

const isImportedBinding = (scope, node) => node.type === 'Identifier' && findVariable(scope, node.name)?.defs[0]?.type === 'ImportBinding';

const moduleExports = (sourceCode, node) => {
  if (node.type === 'ExportDefaultDeclaration') {
    return [{ node, reexport: isImportedBinding(sourceCode.getScope(node), node.declaration), sourced: false }];
  }
  if (node.type !== 'ExportNamedDeclaration') {
    return [];
  }
  if (node.declaration !== null) {
    return [{ node, reexport: false, sourced: false }];
  }
  const scope = sourceCode.getScope(node);
  const sourced = node.source !== null;
  return node.specifiers.map(specifier => ({ node: specifier, reexport: sourced || isImportedBinding(scope, specifier.local), sourced }));
};

const reexportStubs = (sourceCode) => {
  const exports = sourceCode.ast.body.flatMap(node => moduleExports(sourceCode, node));
  return exports.length > 0 && exports.every(({ reexport }) => reexport)
    ? exports.filter(({ sourced }) => !sourced).map(({ node }) => node)
    : [];
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
      visitors.push(['Program:exit', () => reexportStubs(sourceCode).forEach(node => context.report({ node, messageId: 'barrel' }))]);
    }
    if (inApp && filename.endsWith('.tsx')) {
      visitors.push(['CallExpression:exit', (node) => {
        if (isZodCall(sourceCode.getScope(node), node)) {
          context.report({ node, messageId: 'zodInTsx' });
        }
      }]);
      restrict(['VariableDeclarator[id.name=/[sS]chema$/]'], 'schemaInTsx');
      restrict(['key.name', 'key.value'].flatMap(key => [`TSPropertySignature[${key}=${MODE_KEY}]`, `TSMethodSignature[${key}=${MODE_KEY}]`]), 'modeProp');
    }
    if (inApp && SERVER_ROUTE_FILE.test(filename) && !hasDirective(sourceCode.ast, 'use client')) {
      restrict(['TryStatement'], 'serverTry');
    }
    if (!matchesGlobs(context, serverCallerModules)) {
      visitors.push(['CallExpression', (node) => {
        if (CALLER_NAMES.has(callerName(sourceCode.getScope(node), node))) {
          context.report({ node, messageId: 'serverCaller' });
        }
      }]);
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
