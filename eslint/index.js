import antfu from '@antfu/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noSecrets from 'eslint-plugin-no-secrets';
import security from 'eslint-plugin-security';
import isomorphicBoundary from './rules/isomorphic-boundary.cjs';
import noComments from './rules/no-comments.cjs';
import noConsole from './rules/no-console.cjs';
import noInlineZodInfer from './rules/no-inline-zod-infer.cjs';
import noProcessEnv from './rules/no-process-env.cjs';
import noQueryIsLoading from './rules/no-query-is-loading.cjs';
import noSchemaDefault from './rules/no-schema-default.cjs';
import noTypesFile from './rules/no-types-file.cjs';
import noZodMessageParam from './rules/no-zod-message-param.cjs';
import queryContainerStates from './rules/query-container-states.cjs';
import queryHookDestructuring from './rules/query-hook-destructuring.cjs';
import queryPlacement from './rules/query-placement.cjs';
import requireProcedureOutput from './rules/require-procedure-output.cjs';
import serviceExportsFunctions from './rules/service-exports-functions.cjs';

const sourceFiles = '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
const typeScriptFiles = ['**/*.ts', '**/*.tsx'];
const testFiles = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.stories.{ts,tsx}'];
const fixtureFiles = ['**/__fixtures__/**/*.{ts,tsx}', '**/*.fixture.{ts,tsx}', '**/*.fixtures.{ts,tsx}'];
const productionIgnores = [...testFiles, 'scripts/**'];
const processEnvIgnores = [...productionIgnores, '**/*.config.*'];

const securityWarnings = Object.fromEntries(
  Object.keys(security.configs.recommended.rules).map(rule => [rule, 'warn']),
);

const filtersHook = '[id.name=/^use[A-Z]\\w*Filters$/]';

const restrictedSyntax = [
  {
    selector: 'TSAsExpression:not([typeAnnotation.type=\'TSTypeReference\'][typeAnnotation.typeName.name=\'const\'])',
    message: 'Do not use type assertions (`as`). Prefer narrowing, schema parsing, `satisfies` or derived types; `as const` is allowed. See skill `typescript-strict`.',
  },
  {
    selector: 'TSTypeAssertion',
    message: 'Do not use `<Type>value` assertions. Prefer narrowing, schema parsing, `satisfies` or derived types. See skill `typescript-strict`.',
  },
  {
    selector: 'TSAnyKeyword',
    message: 'Do not use `any`; use `unknown` and narrow, parse the value, or type it. See skill `typescript-strict`.',
  },
  {
    selector: 'TSNonNullExpression',
    message: 'Do not use non-null assertions (`!`); narrow with a guard or handle the missing value. See skill `typescript-strict`.',
  },
  {
    selector: 'ExpressionStatement[directive=\'server-only\']',
    message: 'Use `import \'server-only\';` — a bare \'server-only\' string is a no-op directive. See skill `trpc-layered-backend`.',
  },
  ...[
    'TSTypeReference[typeName.name',
    'ImportSpecifier[imported.name',
    'TSQualifiedName[right.name',
    'TSImportType[qualifier.name',
  ].map(attribute => ({
    selector: `${attribute}=/^inferRouter(Outputs|Inputs)$/]`,
    message: 'Import the output/input type exported beside its schema instead of `inferRouterOutputs`/`inferRouterInputs`. See skill `zod-schemas`.',
  })),
  {
    selector: 'TSEnumDeclaration',
    message: 'Use an `as const` array or `z.enum`, not a TS enum; derive the type with `(typeof VALUES)[number]`. See skill `zod-schemas`.',
  },
  ...[
    `FunctionDeclaration${filtersHook}`,
    `VariableDeclarator${filtersHook}:matches([init.type='ArrowFunctionExpression'], [init.type='FunctionExpression'])`,
  ].map(selector => ({
    selector,
    message: 'Do not declare a plural `use*Filters` hook; compose the single-purpose URL filter hooks in the Container. See skill `react-data-containers`.',
  })),
  {
    selector: 'TSDeclareFunction[id.name=/^use[A-Z]/]',
    message: 'Do not overload `use*` hooks; create a dedicated hook. See skill `react-data-containers`.',
  },
];

const inferredReturnTypeSyntax = [{
  selector: ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > TSTypeAnnotation:not([typeAnnotation.type=\'TSTypePredicate\'])',
  message: 'Do not annotate function return types; let TypeScript infer them. See skill `typescript-strict`.',
}];

const lazyLoaders = [
  'CallExpression:matches([callee.name=\'dynamic\'], [callee.name=\'lazy\'], [callee.property.name=\'lazy\']) > ArrowFunctionExpression.arguments',
  'VariableDeclaration[kind=\'const\'] > VariableDeclarator > ArrowFunctionExpression.init',
];
const lazyImports = lazyLoaders.flatMap(loader => [
  `${loader} > ImportExpression.body`,
  `${loader} > CallExpression.body > MemberExpression.callee[property.name='then'] > ImportExpression.object`,
]);

const productionSyntax = [{
  selector: `ImportExpression${lazyImports.map(selector => `:not(${selector})`).join('')}`,
  message: 'Do not use `import()` outside a lazy loader (`dynamic(() => import(\'./C\'))`, `lazy(() => import(\'./C\'))`); use a static import and mock the boundary module in the test. See skill `code-hygiene`.',
}];

const nonEmptyLiterals = path => [
  `[${path}.type='ObjectExpression'][${path}.properties.length>0]`,
  `[${path}.type='ArrayExpression'][${path}.elements.length>0]`,
];
const constAssertion = '[init.type=\'TSAsExpression\'][init.typeAnnotation.typeName.name=\'const\']';
const satisfiesInit = '[init.type=\'TSSatisfiesExpression\']';
const constSatisfiesInit = `${satisfiesInit}[init.expression.type='TSAsExpression'][init.expression.typeAnnotation.typeName.name='const']`;
const fixtureInits = [
  ...nonEmptyLiterals('init'),
  ...nonEmptyLiterals('init.expression').map(literal => `${constAssertion}${literal}`),
  ...nonEmptyLiterals('init.expression').map(literal => `${satisfiesInit}${literal}`),
  ...nonEmptyLiterals('init.expression.expression').map(literal => `${constSatisfiesInit}${literal}`),
];

const testFileSyntax = [{
  selector: `VariableDeclaration[kind='const'] > VariableDeclarator[id.typeAnnotation]:matches(${fixtureInits.join(', ')})`,
  message: 'Use `satisfies T` for fixtures. See skill `typescript-strict`.',
}];

const zodConstruction = {
  selector: 'CallExpression[callee.object.name=\'z\']',
  message: 'Do not build Zod schemas in services or repositories; import them from a schema file. See skill `trpc-layered-backend`.',
};

const unknownValue = `[typeArguments.params.0.type='${'TSString'}Keyword'][typeArguments.params.1.type='${'TSUnknown'}Keyword']`;
const unknownRecord = `TSTypeReference[typeName.name='Record']${unknownValue}`;
const unknownIndexSignature = `TSIndexSignature > TSTypeAnnotation > ${'TSUnknown'}Keyword`;

const recordPatches = [
  unknownRecord,
  unknownIndexSignature,
].map(selector => ({
  selector,
  message: 'Type patches from the canonical schema, never `Record<string, unknown>`. See skill `trpc-layered-backend`.',
}));

const schemaRecords = [
  unknownRecord,
  unknownIndexSignature,
].map(selector => ({
  selector,
  message: 'Do not erase known shapes with `Record<string, unknown>` or an unknown index signature; model the fields in the schema. See skill `zod-schemas`.',
}));

const serviceExportsOnlyFunctions = [
  'ExportNamedDeclaration > TSTypeAliasDeclaration',
  'ExportNamedDeclaration > TSInterfaceDeclaration',
  'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([init.type=/^(ArrowFunctionExpression|FunctionExpression)$/])',
  'ExportNamedDeclaration[source]',
  'ExportAllDeclaration',
  'ClassDeclaration',
].map(selector => ({
  selector,
  message: 'A service module exports only functions: no types, constants, classes or re-exports; import types from the schema file. See skill `trpc-layered-backend`.',
}));

const policyConstantSuffixes = ['_TTL', '_LIFETIME', '_WINDOW', '_CHUNK_SIZE', '_EXPIRATION'].join('|');

const serviceSyntax = [
  {
    selector: 'ThrowStatement > NewExpression[callee.name=\'Error\']',
    message: 'Only `TRPCError` leaves a service; `new Error` becomes a generic INTERNAL_SERVER_ERROR. See skill `trpc-layered-backend`.',
  },
  zodConstruction,
  ...serviceExportsOnlyFunctions,
  ...recordPatches,
  {
    selector: `Program > VariableDeclaration > VariableDeclarator[id.name=/(${policyConstantSuffixes})(_|$)|^MAX_|_MAX_/]`,
    message: 'Policy constants (TTL, window, limit, chunk size) live in a constants file, not at service module scope. See skill `trpc-layered-backend`.',
  },
];

const repositoryImportMessage = 'Repositories never import tRPC or services; they return `null`/`false` and the service translates. See skill `trpc-layered-backend`.';

const layeredBackendLayers = [
  { layer: 'services', files: '**/*.service.ts', selectors: serviceSyntax, rules: { 'local/service-exports-functions': 'error' } },
  {
    layer: 'repositories',
    files: '**/*.repository.ts',
    selectors: [zodConstruction, ...recordPatches],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '@trpc/server', message: repositoryImportMessage }],
        patterns: [{ group: ['**/*.service', '**/services/**'], message: repositoryImportMessage }],
      }],
    },
  },
  {
    layer: 'routers',
    files: '**/*.router.ts',
    selectors: ['TryStatement', 'ThrowStatement'].map(selector => ({
      selector,
      message: 'Routers are thin: no try/catch or throw; the service owns errors and translates them to `TRPCError`. See skill `trpc-layered-backend`.',
    })),
    rules: { 'local/require-procedure-output': 'error' },
  },
  {
    layer: 'schemas',
    files: '**/*.schema.ts',
    selectors: [{
      selector: 'Property[key.name=\'success\'] > CallExpression[callee.property.name=\'literal\']',
      message: 'Mutation outputs are `z.void()` unless the caller needs data, never `{ success: literal }`. See skill `trpc-layered-backend`.',
    }, ...schemaRecords],
    rules: {},
  },
];

function layeredBackendConfigs(layeredBackend, productionRestrictedSyntax) {
  if (!layeredBackend) {
    return [];
  }
  const globs = new Map(typeof layeredBackend === 'object' ? Object.entries(layeredBackend) : []);
  return layeredBackendLayers.map(({ layer, files, selectors, rules }) => ({
    name: `zoroskr/layered-backend/${layer}`,
    files: [globs.get(layer) ?? files].flat(),
    rules: { ...rules, 'no-restricted-syntax': ['error', ...productionRestrictedSyntax, ...selectors] },
  }));
}

const mutateCall = ':matches([callee.name=/^mutate(Async)?$/], [callee.property.name=/^mutate(Async)?$/])';

const querySyntax = [{
  selector: `CallExpression:matches([callee.name='useEffect'], [callee.property.name='useEffect']) > :function CallExpression${mutateCall}`,
  message: 'Do not call `mutate`/`mutateAsync` inside `useEffect`; fire the mutation from an event handler. See skill `react-data-containers`.',
}];

const paginationName = '[name=/^(totalPages|startItem|endItem)$/]';

const containerSyntax = [
  {
    selector: ':matches(JSXOpeningElement[name.name=/^[A-Z]/], JSXOpeningElement[name.type=\'JSXMemberExpression\']) > JSXAttribute[name.name!=\'style\'] > JSXExpressionContainer > ObjectExpression',
    message: 'Do not pass an inline object literal to a component prop; build `const props` first. See skill `react-data-containers`.',
  },
  ...[
    `VariableDeclarator > Identifier.id${paginationName}`,
    `VariableDeclarator ObjectPattern > Property > Identifier.value${paginationName}`,
    `VariableDeclarator ArrayPattern > Identifier${paginationName}`,
    `VariableDeclarator :matches(ObjectPattern > Property, ArrayPattern) > AssignmentPattern > Identifier.left${paginationName}`,
    `FunctionDeclaration > Identifier.id${paginationName}`,
  ].map(selector => ({
    selector,
    message: 'Do not declare `totalPages`, `startItem` or `endItem` in a Container; take `page` and `pageSize` from the pagination hook and let the pagination components derive the rest. See skill `react-data-containers`.',
  })),
];

const queryDefaults = {
  containers: ['**/*Container.tsx'],
  providers: ['**/*Provider.tsx'],
  errorComponent: 'Error',
};

function queryConfigs(query, productionRestrictedSyntax) {
  if (!query) {
    return [];
  }
  const { containers, providers, errorComponent } = { ...queryDefaults, ...(typeof query === 'object' ? query : {}) };
  return [
    {
      name: 'zoroskr/query/placement',
      files: typeScriptFiles,
      ignores: productionIgnores,
      rules: { 'local/query-placement': ['error', { containers, providers }] },
    },
    {
      name: 'zoroskr/query/containers',
      files: containers,
      ignores: productionIgnores,
      rules: {
        'local/query-container-states': ['error', { errorComponent }],
        'no-restricted-syntax': ['error', ...productionRestrictedSyntax, ...containerSyntax],
      },
    },
  ];
}

const isomorphicDefaults = {
  files: ['**/shared/**/*.{ts,tsx}'],
  schemaFiles: ['**/shared/**/*.schema.ts', '**/shared/**/schemas/**/*.ts'],
  ignores: ['**/*.test.{ts,tsx}'],
  forbiddenImports: [],
};

function isomorphicConfigs(isomorphic) {
  if (!isomorphic) {
    return [];
  }
  const { files, schemaFiles, ignores, forbiddenImports } = { ...isomorphicDefaults, ...(typeof isomorphic === 'object' ? isomorphic : {}) };
  return [
    {
      name: 'zoroskr/isomorphic/boundary',
      files,
      ignores,
      rules: { 'local/isomorphic-boundary': ['error', { forbiddenImports }] },
    },
    {
      name: 'zoroskr/isomorphic/schemas',
      files: schemaFiles,
      ignores,
      rules: { 'local/no-schema-default': 'error' },
    },
  ];
}

const typeScriptRules = {
  'ts/ban-ts-comment': 'error',
  'ts/consistent-type-definitions': ['error', 'type'],
  'ts/consistent-type-imports': 'error',
  'ts/method-signature-style': 'error',
  'ts/no-dynamic-delete': 'error',
  'ts/no-empty-object-type': 'error',
  'ts/no-explicit-any': 'off',
  'ts/no-extraneous-class': 'error',
  'ts/no-import-type-side-effects': 'error',
  'ts/no-invalid-void-type': 'error',
  'ts/no-namespace': 'error',
  'ts/no-non-null-asserted-nullish-coalescing': 'error',
  'ts/no-non-null-asserted-optional-chain': 'error',
  'ts/no-non-null-assertion': 'off',
  'ts/no-require-imports': 'error',
  'ts/no-unsafe-function-type': 'error',
  'ts/no-unused-expressions': 'error',
  'ts/no-use-before-define': 'error',
  'ts/no-useless-constructor': 'error',
  'ts/no-wrapper-object-types': 'error',
  'ts/prefer-literal-enum-member': 'error',
  'ts/triple-slash-reference': 'error',
  'ts/unified-signatures': 'error',
};

const typeAwareRules = {
  'ts/no-deprecated': 'error',
  'ts/no-unnecessary-condition': 'error',
  'ts/no-unnecessary-boolean-literal-compare': 'error',
  'ts/prefer-nullish-coalescing': 'error',
  'ts/prefer-optional-chain': 'error',
  'ts/strict-boolean-expressions': ['error', {
    allowString: false,
    allowNumber: false,
    allowNullableObject: false,
    allowNullableBoolean: false,
    allowNullableString: false,
    allowNullableNumber: false,
    allowAny: false,
  }],
};

export const i18nRules = {
  'formatjs/no-literal-string-in-jsx': ['warn', {
    props: {
      include: [
        ['*', 'aria-{label,description,details,errormessage}'],
        ['[a-z]*([a-z0-9])', '(placeholder|title)'],
        ['img', 'alt'],
        ['*', 'label'],
      ],
      exclude: [],
    },
  }],
  'formatjs/no-literal-string-in-object': ['warn', {
    include: ['label', 'title', 'text', 'html', 'confirmButtonText', 'cancelButtonText', 'footer'],
  }],
};

async function interopDefault(modulePromise) {
  const loaded = await modulePromise;
  return loaded.default ?? loaded;
}

async function optionalConfigs({ query, tailwind, i18n }) {
  const configs = [];
  if (query) {
    const plugin = await interopDefault(import('@tanstack/eslint-plugin-query'));
    configs.push(...plugin.configs['flat/recommended'], {
      name: 'zoroskr/query',
      rules: {
        '@tanstack/query/exhaustive-deps': 'error',
        '@tanstack/query/no-rest-destructuring': 'warn',
        '@tanstack/query/stable-query-client': 'error',
      },
    });
  }
  if (tailwind) {
    const plugin = await interopDefault(import('eslint-plugin-tailwindcss'));
    configs.push(...plugin.configs['flat/recommended']);
    if (typeof tailwind === 'object') {
      configs.push({ name: 'zoroskr/tailwind-settings', settings: { tailwindcss: tailwind } });
    }
  }
  if (i18n) {
    const plugin = await interopDefault(import('eslint-plugin-formatjs'));
    configs.push({
      name: 'zoroskr/i18n',
      files: ['**/*.{jsx,tsx}'],
      ignores: testFiles,
      plugins: { formatjs: plugin },
      rules: i18nRules,
    });
  }
  return configs;
}

export default async function zoroskr(options = {}, ...userConfigs) {
  const {
    tsconfigPath,
    react = true,
    query = false,
    tailwind = false,
    i18n = false,
    localRules = {},
    restrictedSyntax: extraRestrictedSyntax = [],
    layeredBackend = false,
    isomorphic = false,
    inferredReturnTypes = true,
    envFiles,
    typescript = {},
    ...antfuOptions
  } = options;
  const typeAware = tsconfigPath !== undefined;
  const baseRestrictedSyntax = [
    ...restrictedSyntax,
    ...(query ? querySyntax : []),
    ...(inferredReturnTypes ? inferredReturnTypeSyntax : []),
    ...extraRestrictedSyntax,
  ];
  const productionRestrictedSyntax = [...baseRestrictedSyntax, ...productionSyntax];

  return antfu(
    {
      react,
      lessOpinionated: true,
      formatters: true,
      stylistic: { quotes: 'single', semi: true },
      typescript: typeAware ? { ...typescript, tsconfigPath } : typescript,
      ...antfuOptions,
    },
    ...(react ? [{ ...jsxA11y.flatConfigs.recommended, name: 'zoroskr/jsx-a11y' }] : []),
    { ...security.configs.recommended, name: 'zoroskr/security' },
    { name: 'zoroskr/no-secrets', plugins: { 'no-secrets': noSecrets }, rules: { 'no-secrets/no-secrets': 'warn' } },
    {
      name: 'zoroskr/base',
      files: [sourceFiles],
      plugins: {
        local: {
          rules: {
            ...localRules,
            'isomorphic-boundary': isomorphicBoundary,
            'no-comments': noComments,
            'no-console': noConsole,
            'no-inline-zod-infer': noInlineZodInfer,
            'no-process-env': noProcessEnv,
            'no-query-is-loading': noQueryIsLoading,
            'no-schema-default': noSchemaDefault,
            'no-types-file': noTypesFile,
            'no-zod-message-param': noZodMessageParam,
            'query-container-states': queryContainerStates,
            'query-hook-destructuring': queryHookDestructuring,
            'query-placement': queryPlacement,
            'require-procedure-output': requireProcedureOutput,
            'service-exports-functions': serviceExportsFunctions,
          },
        },
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        ...securityWarnings,
        'local/no-comments': 'error',
        'antfu/no-top-level-await': 'off',
        'eqeqeq': ['error', 'always', { null: 'ignore' }],
        'no-unneeded-ternary': 'error',
        'no-useless-concat': 'error',
        'no-useless-rename': 'error',
        'no-var': 'error',
        'object-shorthand': ['error', 'always'],
        'prefer-const': 'error',
        'prefer-exponentiation-operator': 'error',
        'prefer-object-spread': 'error',
        'prefer-template': 'error',
        'style/brace-style': ['error', '1tbs'],
        'node/prefer-global/process': 'off',
        'test/padding-around-all': 'error',
        'test/prefer-lowercase-title': 'off',
        'no-unused-vars': 'off',
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': ['error', {
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          vars: 'all',
          varsIgnorePattern: '^_',
        }],
        ...(react ? { 'react/prefer-destructuring-assignment': 'off' } : {}),
      },
    },
    {
      name: 'zoroskr/typescript',
      files: typeScriptFiles,
      rules: {
        ...typeScriptRules,
        'local/no-inline-zod-infer': 'error',
        'local/no-types-file': 'error',
        'local/no-zod-message-param': 'error',
        ...(query ? { 'local/query-hook-destructuring': 'error', 'local/no-query-is-loading': 'error' } : {}),
        'no-restricted-syntax': ['error', ...baseRestrictedSyntax],
      },
    },
    {
      name: 'zoroskr/typescript-production',
      files: typeScriptFiles,
      ignores: productionIgnores,
      rules: {
        'no-console': 'off',
        'local/no-console': 'error',
        'no-restricted-syntax': ['error', ...productionRestrictedSyntax],
      },
    },
    {
      name: 'zoroskr/typescript-tests',
      files: testFiles,
      rules: { 'no-restricted-syntax': ['error', ...baseRestrictedSyntax, ...testFileSyntax] },
    },
    {
      name: 'zoroskr/typescript-fixtures',
      files: fixtureFiles,
      ignores: productionIgnores,
      rules: { 'no-restricted-syntax': ['error', ...productionRestrictedSyntax, ...testFileSyntax] },
    },
    {
      name: 'zoroskr/no-process-env',
      files: typeScriptFiles,
      ignores: processEnvIgnores,
      rules: { 'local/no-process-env': ['error', ...(envFiles === undefined ? [] : [{ envFiles }])] },
    },
    ...layeredBackendConfigs(layeredBackend, productionRestrictedSyntax),
    ...isomorphicConfigs(isomorphic),
    ...queryConfigs(query, productionRestrictedSyntax),
    ...(typeAware ? [{ name: 'zoroskr/typescript-type-aware', files: typeScriptFiles, rules: typeAwareRules }] : []),
    ...(await optionalConfigs({ query, tailwind, i18n })),
    ...userConfigs,
  );
}
