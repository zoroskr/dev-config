const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const ts = require('typescript');
const { exportedName, findVariable } = require('./process-env.cjs');
const { relativeFilename, unwrap } = require('./query-hooks.cjs');

const CACHE_TTL_MS = 2000;
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const TSCONFIG_NAMES = ['tsconfig.json', 'tsconfig.strict.json'];
const LAYOUT_NAMES = ['layout.tsx', 'layout.ts'];
const PAGE_NAMES = ['page.tsx', 'page.ts'];
const DYNAMIC_EXPORT = /export\s+const\s+dynamic\b[^=]*=\s*(['"`])([^'"`]*)\1/u;

const cache = new Map();
let cacheStart = 0;

const cached = (key, read) => {
  const now = Date.now();
  if (now - cacheStart > CACHE_TTL_MS) {
    cache.clear();
    cacheStart = now;
  }
  if (!cache.has(key)) {
    cache.set(key, read());
  }
  return cache.get(key);
};

const toPosix = value => value.replaceAll('\\', '/');

const directoryEntries = directory => cached(`dir:${directory}`, () => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory of the linted file
    return new Map(fs.readdirSync(directory, { withFileTypes: true }).map(entry => [entry.name, entry.isDirectory()]));
  } catch {
    return new Map();
  }
});

const hasFile = (directory, name) => directoryEntries(directory).get(name) === false;

const childDirectories = directory => [...directoryEntries(directory)]
  .filter(([, isDirectory]) => isDirectory)
  .map(([name]) => name);

const hasPage = directory => PAGE_NAMES.some(name => hasFile(directory, name));

const readText = file => cached(`file:${file}`, () => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- config or layout beside the linted file
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
});

const cwdPrefix = context => `${toPosix(context.cwd).replace(/\/$/u, '')}/`;

const displayPath = (context, absolute) => {
  const prefix = cwdPrefix(context);
  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
};

const routeLocation = (context) => {
  const filename = toPosix(context.filename);
  const relative = relativeFilename(context);
  const segments = relative.split('/');
  const appIndex = segments.indexOf('app');
  if (appIndex === -1 || appIndex === segments.length - 1) {
    return null;
  }
  const prefix = filename.slice(0, filename.length - relative.length);
  return { filename, appRoot: `${prefix}${segments.slice(0, appIndex + 1).join('/')}` };
};

const readConfig = file => cached(`json:${file}`, () => {
  const text = readText(file);
  return text === null ? null : (ts.parseConfigFileTextToJson(file, text).config ?? null);
});

const resolveExtends = (file, target) => {
  if (target.startsWith('.') || path.isAbsolute(target)) {
    const resolved = path.resolve(path.dirname(file), target);
    return resolved.endsWith('.json') ? resolved : `${resolved}.json`;
  }
  try {
    return createRequire(file).resolve(target);
  } catch {
    return null;
  }
};

const configPaths = (file, seen) => {
  const config = seen.has(file) ? null : readConfig(file);
  seen.add(file);
  if (config === null || typeof config !== 'object') {
    return {};
  }
  const inherited = [config.extends ?? []]
    .flat()
    .filter(parent => typeof parent === 'string')
    .map(parent => resolveExtends(file, parent))
    .filter(parent => parent !== null)
    .reduce((current, parent) => ({ ...current, ...configPaths(parent, seen) }), {});
  const directory = path.dirname(file);
  const { baseUrl, paths } = config.compilerOptions ?? {};
  return {
    ...inherited,
    ...(paths !== undefined && paths !== null && typeof paths === 'object' ? { paths, pathsBase: directory } : {}),
    ...(typeof baseUrl === 'string' ? { baseUrl: path.resolve(directory, baseUrl) } : {}),
  };
};

const pathMappings = directory => cached(`paths:${directory}`, () => {
  const configs = TSCONFIG_NAMES.filter(name => hasFile(directory, name));
  if (configs.length === 0) {
    const parent = path.dirname(directory);
    return parent === directory ? [] : pathMappings(parent);
  }
  return configs.flatMap((name) => {
    const { paths = {}, pathsBase, baseUrl } = configPaths(path.join(directory, name), new Set());
    const base = baseUrl ?? pathsBase ?? directory;
    return Object.entries(paths)
      .filter(([, targets]) => Array.isArray(targets) && typeof targets[0] === 'string')
      .map(([pattern, [target]]) => ({ pattern, target, base }));
  });
});

const matchPattern = (pattern, source) => {
  const star = pattern.indexOf('*');
  if (star === -1) {
    return pattern === source ? '' : null;
  }
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return source.startsWith(prefix) && source.endsWith(suffix) && source.length >= prefix.length + suffix.length
    ? source.slice(prefix.length, source.length - suffix.length)
    : null;
};

const specificity = (pattern) => {
  const star = pattern.indexOf('*');
  return star === -1 ? pattern.length + 1 : star;
};

const resolveImport = (filename, source) => {
  const directory = path.dirname(filename);
  if (source.startsWith('.')) {
    return toPosix(path.resolve(directory, source));
  }
  const [match] = pathMappings(directory)
    .map(mapping => ({ ...mapping, wildcard: matchPattern(mapping.pattern, source) }))
    .filter(({ wildcard }) => wildcard !== null)
    .sort((a, b) => specificity(b.pattern) - specificity(a.pattern));
  return match === undefined ? null : toPosix(path.resolve(match.base, match.target.replace('*', match.wildcard)));
};

const privateGlobalScope = (filename, target) => {
  const segments = target.split('/');
  return segments
    .map((segment, index) => (segment === '(global)' ? segments.slice(0, index).join('/') : null))
    .find(scope => scope !== null && !filename.startsWith(`${scope}/`)) ?? null;
};

const nearestDynamicLayout = (directory, appRoot) => {
  for (let current = directory; current.length >= appRoot.length; current = path.posix.dirname(current)) {
    for (const name of LAYOUT_NAMES.filter(layout => hasFile(current, layout))) {
      const file = `${current}/${name}`;
      const value = DYNAMIC_EXPORT.exec(readText(file) ?? '')?.[2];
      if (value !== undefined) {
        return { file, value };
      }
    }
    if (current === appRoot) {
      break;
    }
  }
  return null;
};

const resolveFunction = (sourceCode, node) => {
  const target = unwrap(node);
  if (FUNCTIONS.has(target?.type)) {
    return target;
  }
  if (target?.type !== 'Identifier') {
    return null;
  }
  const [definition] = findVariable(sourceCode.getScope(target), target.name)?.defs ?? [];
  if (definition?.type === 'FunctionName') {
    return definition.node;
  }
  const init = definition?.type === 'Variable' ? unwrap(definition.node.init) : null;
  return FUNCTIONS.has(init?.type) ? init : null;
};

const defaultExportTarget = (program) => {
  const declaration = program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration;
  if (declaration !== undefined) {
    return declaration;
  }
  return program.body
    .filter(node => node.type === 'ExportNamedDeclaration' && node.source === null)
    .flatMap(node => node.specifiers)
    .find(specifier => exportedName(specifier.exported) === 'default')
    ?.local;
};

const defaultExportFunction = (sourceCode) => {
  const target = defaultExportTarget(sourceCode.ast);
  return target === undefined ? null : resolveFunction(sourceCode, target);
};

const staticString = (node) => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
};

const enclosingFunction = (sourceCode, node) => sourceCode.getAncestors(node).findLast(ancestor => FUNCTIONS.has(ancestor.type)) ?? null;

const hasDirective = (program, value) => program.body.some(node => node.type === 'ExpressionStatement' && node.directive === value);

const calleeName = (call) => {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : null;
};

const isGroup = name => /^\(.+\)$/u.test(name);

module.exports = {
  calleeName,
  childDirectories,
  defaultExportFunction,
  displayPath,
  enclosingFunction,
  hasDirective,
  hasFile,
  hasPage,
  isGroup,
  nearestDynamicLayout,
  privateGlobalScope,
  resolveImport,
  routeLocation,
  staticString,
};
