const { defaultExportFunction, hasDirective, staticString } = require('./app-router.cjs');
const { findVariable } = require('./process-env.cjs');
const { matchesGlobs, relativeFilename, unwrap } = require('./query-hooks.cjs');
const { importedName, zodImportSpecifier } = require('./zod-binding.cjs');

const PAGE_FILE = /(?:^|\/)page\.tsx?$/u;
const SERVER_ROUTE_FILE = /(?:^|\/)(?:page|layout|loading|template|default)\.tsx$/u;
const REDIRECTS = new Set(['permanentRedirect', 'redirect']);
const NAVIGATION_MODULE = 'next/navigation';
const MODE_KEY = '/^(isEditing|isEditMode)$/';
const CALLER_NAMES = new Set(['createCaller', 'createCallerFactory']);
const ZOD_CONSTRUCTORS = new Set([
  'any',
  'array',
  'base64',
  'base64url',
  'bigint',
  'boolean',
  'catch',
  'cidrv4',
  'cidrv6',
  'cuid',
  'cuid2',
  'custom',
  'date',
  'discriminatedUnion',
  'e164',
  'email',
  'emoji',
  'enum',
  'file',
  'float32',
  'float64',
  'function',
  'guid',
  'hash',
  'hex',
  'hostname',
  'instanceof',
  'int',
  'int32',
  'int64',
  'intersection',
  'ipv4',
  'ipv6',
  'json',
  'jwt',
  'keyof',
  'lazy',
  'literal',
  'looseObject',
  'map',
  'nan',
  'nanoid',
  'nativeEnum',
  'never',
  'nonoptional',
  'null',
  'nullable',
  'nullish',
  'number',
  'object',
  'optional',
  'partialRecord',
  'pipe',
  'preprocess',
  'promise',
  'readonly',
  'record',
  'set',
  'strictObject',
  'string',
  'stringbool',
  'symbol',
  'templateLiteral',
  'transform',
  'tuple',
  'uint32',
  'uint64',
  'ulid',
  'undefined',
  'union',
  'unknown',
  'url',
  'uuid',
  'uuidv4',
  'uuidv6',
  'uuidv7',
  'void',
]);
const ZOD_FACTORIES = new Set(['coerce', 'iso']);

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

const keyName = (key, computed) => (!computed && key.type === 'Identifier' ? key.name : staticString(key));

const memberName = member => keyName(member.property, member.computed);

const destructuredKey = (identifier) => {
  const target = identifier.parent.type === 'AssignmentPattern' && identifier.parent.left === identifier ? identifier.parent : identifier;
  const property = target.parent;
  return property.type === 'Property' && property.value === target && property.parent.type === 'ObjectPattern'
    ? keyName(property.key, property.computed)
    : null;
};

const importedFrom = (scope, name, source) => {
  const [definition] = findVariable(scope, name)?.defs ?? [];
  return definition?.type === 'ImportBinding'
    && definition.node.type === 'ImportSpecifier'
    && (source === null || definition.parent.source.value === source)
    ? importedName(definition.node)
    : null;
};

const staticRedirect = (sourceCode, fn) => {
  const call = unwrap(onlyExpression(fn));
  if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier' || !isStaticPath(call.arguments[0])) {
    return null;
  }
  const { name } = call.callee;
  return REDIRECTS.has(importedFrom(sourceCode.getScope(call), name, NAVIGATION_MODULE) ?? name) ? call : null;
};

const zodRoot = (scope, name) => {
  const specifier = zodImportSpecifier(scope, name);
  if (specifier === null) {
    return name === 'z' ? [] : null;
  }
  return specifier.type === 'ImportSpecifier' && importedName(specifier) !== 'z' ? [importedName(specifier)] : [];
};

const zodPath = (scope, node) => {
  if (node.type === 'Identifier') {
    return zodRoot(scope, node.name);
  }
  const parent = node.type === 'MemberExpression' ? zodPath(scope, node.object) : null;
  const name = parent === null ? null : memberName(node);
  return name === null ? null : [...parent, name];
};

const isZodConstructor = (scope, { callee }) => {
  const path = zodPath(scope, callee) ?? [];
  const [kind, member, ...rest] = path[0] === 'z' ? path.slice(1) : path;
  if (rest.length > 0) {
    return false;
  }
  return member === undefined ? ZOD_CONSTRUCTORS.has(kind) : ZOD_FACTORIES.has(kind);
};

const callerName = (scope, { callee }) => {
  if (callee.type === 'MemberExpression') {
    return memberName(callee);
  }
  if (callee.type !== 'Identifier') {
    return null;
  }
  const [definition] = findVariable(scope, callee.name)?.defs ?? [];
  const destructured = definition?.type === 'Variable' ? destructuredKey(definition.name) : null;
  return importedFrom(scope, callee.name, null) ?? destructured ?? callee.name;
};

const isImport = (scope, node) => node?.type === 'Identifier' && findVariable(scope, node.name)?.defs[0]?.type === 'ImportBinding';

const isImportedBinding = (scope, node) => {
  const target = unwrap(node);
  if (target?.type !== 'Identifier') {
    return false;
  }
  const [definition] = findVariable(scope, target.name)?.defs ?? [];
  if (definition?.type === 'ImportBinding') {
    return true;
  }
  return definition?.type === 'Variable'
    && definition.parent.kind === 'const'
    && definition.node.id === definition.name
    && isImport(scope, unwrap(definition.node.init));
};

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
        if (isZodConstructor(sourceCode.getScope(node), node)) {
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
        const call = page === null ? null : staticRedirect(sourceCode, page);
        if (call !== null) {
          context.report({ node: call, messageId: 'staticRedirect' });
        }
      }]);
    }
    return Object.fromEntries(visitors);
  },
};
