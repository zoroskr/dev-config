const path = require('node:path');
const { hasFile } = require('./app-router.cjs');
const { matchesGlobs, relativeFilename } = require('./query-hooks.cjs');

const CATEGORIES = new Set(['components', 'constants', 'hooks', 'schemas', 'utils']);
const GENERIC_NAMES = new Set(['constants', 'helpers', 'options', 'schema', 'types', 'utils']);
const SOURCE_EXTENSION = /\.tsx?$/u;
const TEST_SUFFIX = /\.(?:test|spec|stories)$/u;
const KIND_SUFFIX = /\.(schema|util|constants?|hook)$/u;
const HOOK_NAME = /^use[A-Z]/u;
const HOOK_STEM = /^use[A-Z][A-Za-z0-9]*$/u;
const PLURAL_SUFFIX = /\.(?:schemas|utils|hooks)$/u;
const KEBAB_PART = /^[a-z0-9]+$/u;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/u;
const ROUTE_FILES = ['page', 'layout', 'loading', 'error', 'not-found', 'template', 'default', 'route']
  .flatMap(route => [`${route}.tsx`, `${route}.ts`]);
const NEXT_FILE = /^(?:page|layout|loading|error|global-error|not-found|forbidden|unauthorized|template|default|route|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)$/u;
const KIND_FOLDERS = new Map([
  ['schema', 'schemas'],
  ['util', 'utils'],
  ['constant', 'constants'],
  ['constants', 'constants'],
  ['hook', 'hooks'],
]);
const FOLDER_MESSAGES = new Map([
  ['schemas', 'schemaFolder'],
  ['utils', 'utilFolder'],
  ['constants', 'constantsFolder'],
  ['hooks', 'hookFolder'],
]);

const pascalCase = name => name
  .split(/[^a-z0-9]+/iu)
  .filter(part => part.length > 0)
  .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
  .join('');

const isRouteSegment = directory => ROUTE_FILES.some(name => hasFile(directory, name));

const looseInRouteSegment = directory => isRouteSegment(directory)
  || (PASCAL_CASE.test(path.posix.basename(directory)) && isRouteSegment(path.posix.dirname(directory)));

const placementProblems = (folders, name, directory) => {
  const withoutExtension = name.replace(SOURCE_EXTENSION, '');
  const isTest = TEST_SUFFIX.test(withoutExtension);
  const stem = withoutExtension.replace(TEST_SUFFIX, '');
  if (PLURAL_SUFFIX.test(stem)) {
    return [{ messageId: 'pluralSuffix', data: { name } }];
  }
  const kind = KIND_SUFFIX.exec(stem)?.[1];
  const unit = stem.replace(KIND_SUFFIX, '');
  const isHook = kind === 'hook' || HOOK_NAME.test(unit);
  const folder = isHook ? 'hooks' : KIND_FOLDERS.get(kind);
  const problems = [];
  if (folder !== undefined && !folders.includes(folder)) {
    problems.push({ messageId: FOLDER_MESSAGES.get(folder) });
  }
  const isComponent = kind === undefined && !isHook && (name.endsWith('.tsx') || isTest);
  if (folders.includes('components') && !isComponent) {
    problems.push({ messageId: 'componentsOnly', data: { name } });
  }
  if (GENERIC_NAMES.has(stem)) {
    problems.push({ messageId: 'genericName', data: { name } });
  }
  const expected = pascalCase(unit);
  const categoryIndex = folders.findIndex(segment => CATEGORIES.has(segment));
  if (categoryIndex !== -1 && categoryIndex < folders.length - 2 && problems.length === 0) {
    problems.push({ messageId: 'nestedUnit', data: { name } });
    return problems;
  }
  if (categoryIndex !== -1 && expected.length > 0 && folders.at(-1) !== expected) {
    problems.push({ messageId: 'unitFolder', data: { name, unit: expected } });
  }
  if (categoryIndex === -1 && problems.length === 0 && !NEXT_FILE.test(stem) && looseInRouteSegment(directory)) {
    problems.push({ messageId: 'routeSegment', data: { name } });
  }
  if (isHook && !HOOK_STEM.test(unit)) {
    problems.push({ messageId: 'hookName', data: { name } });
  } else if (!isHook && kind !== undefined && !unit.split('-').every(part => KEBAB_PART.test(part))) {
    problems.push({ messageId: 'kebabName', data: { name } });
  }
  return problems;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { app: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      index: 'Do not create `index.ts` barrels; import the explicit file (`NavTabs/NavTabs`). See skill `nextjs-app-router`.',
      schemaFolder: 'A `*.schema.ts` file lives below a `schemas/` folder (`schemas/LeadForm/lead-form.schema.ts`). See skill `nextjs-app-router`.',
      utilFolder: 'A `*.util.ts` file lives below a `utils/` folder (`utils/NormalizeEmail/normalize-email.util.ts`). See skill `nextjs-app-router`.',
      constantsFolder: 'A `*.constants.ts` file lives below a `constants/` folder (`constants/LeadStatus/lead-status.constants.ts`). See skill `nextjs-app-router`.',
      hookFolder: 'A hook file (`use*.ts`, `*.hook.ts`) lives below a `hooks/` folder (`hooks/UseLeadForm/useLeadForm.ts`). See skill `nextjs-app-router`.',
      componentsOnly: 'Only component files (`.tsx` and their tests) go below `components/`; move `{{name}}` to the feature `schemas/`, `utils/`, `constants/` or `hooks/` folder. See skill `nextjs-app-router`.',
      nestedUnit: 'Put `{{name}}` in a unit folder directly inside its category folder; a child component gets a sibling folder in `components/`, never a folder inside its parent. See skill `nextjs-app-router`.',
      unitFolder: 'Put `{{name}}` in its own `{{unit}}/` folder inside its category folder (`components/Foo/Foo.tsx`, `utils/NormalizeEmail/normalize-email.util.ts`). See skill `nextjs-app-router`.',
      routeSegment: 'Do not put `{{name}}` in a route segment; route segments hold only route files, so move it into a unit folder of the feature `components/`, `utils/`, `schemas/`, `constants/` or `hooks/` folder. See skill `nextjs-app-router`.',
      pluralSuffix: 'Use the singular kind suffix in `{{name}}` (`.schema.ts`, `.util.ts`, `.hook.ts`). See skill `nextjs-app-router`.',
      hookName: 'Name the hook file `{{name}}` in camelCase starting with `use` (`useOrders.ts`, `useOrders.hook.ts`). See skill `nextjs-app-router`.',
      kebabName: 'Name `{{name}}` in kebab-case before its kind suffix (`normalize-email.util.ts`). See skill `nextjs-app-router`.',
      genericName: 'Do not use the generic file name `{{name}}`; name the unit by its concern (`utils/NormalizeEmail/normalize-email.util.ts`). See skill `nextjs-app-router`.',
    },
  },
  create(context) {
    const directory = path.posix.dirname(context.filename.replaceAll('\\', '/'));
    const segments = relativeFilename(context).split('/');
    const name = segments.at(-1) ?? '';
    if (!SOURCE_EXTENSION.test(name) || name.endsWith('.d.ts')) {
      return {};
    }
    const stem = name.replace(SOURCE_EXTENSION, '').replace(TEST_SUFFIX, '');
    const problems = [
      ...(stem === 'index' ? [{ messageId: 'index' }] : []),
      ...(matchesGlobs(context, context.options[0]?.app ?? []) ? placementProblems(segments.slice(0, -1), name, directory) : []),
    ];
    if (problems.length === 0) {
      return {};
    }
    return {
      Program(node) {
        problems.forEach(problem => context.report({ node, ...problem }));
      },
    };
  },
};
