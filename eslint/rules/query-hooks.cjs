const { exportedName, findVariable } = require('./process-env.cjs');

const QUERY_MODULE = '@tanstack/react-query';
const QUERY_FAMILY = /^use(?:Suspense)?(?:Infinite)?Query$/u;
const STATE_QUERY = /^use(?:Infinite)?Query$/u;
const RESULT_HOOK = /^use(?:Mutation|Query|InfiniteQuery|SuspenseQuery|SuspenseInfiniteQuery)$/u;

const TS_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

const unwrap = node => (TS_WRAPPERS.has(node?.type) ? unwrap(node.expression) : node);

const importedHookName = (scope, name) => {
  const [definition] = findVariable(scope, name)?.defs ?? [];
  if (definition?.type !== 'ImportBinding'
    || definition.parent.source.value !== QUERY_MODULE
    || definition.node.type !== 'ImportSpecifier') {
    return null;
  }
  return exportedName(definition.node.imported);
};

const hookName = (sourceCode, node) => {
  if (node?.type !== 'CallExpression') {
    return null;
  }
  const { callee } = node;
  if (callee.type === 'MemberExpression') {
    return !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : null;
  }
  return callee.type === 'Identifier' ? importedHookName(sourceCode.getScope(node), callee.name) : null;
};

const isHookCall = (sourceCode, node, pattern) => pattern.test(hookName(sourceCode, node) ?? '');

const escapeRegExp = value => value.replace(/[.+?^$()|[\]\\]/gu, '\\$&');

const globSource = glob => glob
  .split(/(\*\*\/|\*\*|\*|\?|\{[^}]*\})/u)
  .map((part) => {
    if (part === '**/') {
      return '(?:.*/)?';
    }
    if (part === '**') {
      return '.*';
    }
    if (part === '*') {
      return '[^/]*';
    }
    if (part === '?') {
      return '[^/]';
    }
    if (part.startsWith('{') && part.endsWith('}')) {
      return `(?:${part.slice(1, -1).split(',').map(escapeRegExp).join('|')})`;
    }
    return escapeRegExp(part);
  })
  .join('');

const relativeFilename = (context) => {
  const cwd = `${context.cwd.replaceAll('\\', '/').replace(/\/$/u, '')}/`;
  const filename = context.filename.replaceAll('\\', '/');
  return filename.startsWith(cwd) ? filename.slice(cwd.length) : filename;
};

const matchesGlobs = (context, globs) => {
  const relative = relativeFilename(context);
  return globs.some((glob) => {
    // eslint-disable-next-line security/detect-non-literal-regexp -- escaped consumer glob
    return new RegExp(`^${globSource(glob)}$`, 'u').test(relative);
  });
};

module.exports = { QUERY_FAMILY, QUERY_MODULE, RESULT_HOOK, STATE_QUERY, TS_WRAPPERS, globSource, isHookCall, matchesGlobs, relativeFilename, unwrap };
