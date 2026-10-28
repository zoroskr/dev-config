import antfu from '@antfu/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noSecrets from 'eslint-plugin-no-secrets';
import security from 'eslint-plugin-security';
import noComments from './rules/no-comments.cjs';
import requireProcedureOutput from './rules/require-procedure-output.cjs';
import serviceExportsFunctions from './rules/service-exports-functions.cjs';

const sourceFiles = '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
const typeScriptFiles = ['**/*.ts', '**/*.tsx'];
const testFiles = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.stories.{ts,tsx}'];

const securityWarnings = Object.fromEntries(
  Object.keys(security.configs.recommended.rules).map(rule => [rule, 'warn']),
);

const restrictedSyntax = [
  {
    selector: 'TSAsExpression:not(:has(TSTypeReference[typeName.name=\'const\']))',
    message: 'Do not use type assertions (`as`). Prefer narrowing, schema parsing, `satisfies` or derived types; `as const` is allowed. See skill `typescript-strict`.',
  },
  {
    selector: 'TSTypeAssertion',
    message: 'Do not use `<Type>value` assertions. Prefer narrowing, schema parsing, `satisfies` or derived types. See skill `typescript-strict`.',
  },
  {
    selector: ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > TSTypeAnnotation',
    message: 'Do not annotate function return types; let TypeScript infer them. See skill `typescript-strict`.',
  },
  {
    selector: 'ExpressionStatement[directive=\'server-only\']',
    message: 'Use `import \'server-only\';` — a bare \'server-only\' string is a no-op directive. See skill `trpc-layered-backend`.',
  },
];

const zodConstruction = {
  selector: 'CallExpression[callee.object.name=\'z\']',
  message: 'Do not build Zod schemas in services or repositories; import them from a schema file. See skill `trpc-layered-backend`.',
};

const unknownValue = `[typeArguments.params.1.type='${'TSUnknown'}Keyword']`;
const unknownRecord = `TSTypeReference[typeName.name='Record']${unknownValue}`;
const unknownIndexSignature = `TSIndexSignature > TSTypeAnnotation > ${'TSUnknown'}Keyword`;

const recordPatches = [
  unknownRecord,
  unknownIndexSignature,
].map(selector => ({
  selector,
  message: 'Type patches from the canonical schema, never `Record<string, unknown>`. See skill `trpc-layered-backend`.',
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
      'no-console': ['error', {}],
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
    }],
    rules: {},
  },
];

function layeredBackendConfigs(layeredBackend, baseRestrictedSyntax) {
  if (!layeredBackend) {
    return [];
  }
  const globs = new Map(typeof layeredBackend === 'object' ? Object.entries(layeredBackend) : []);
  return layeredBackendLayers.map(({ layer, files, selectors, rules }) => ({
    name: `zoroskr/layered-backend/${layer}`,
    files: [globs.get(layer) ?? files].flat(),
    rules: { ...rules, 'no-restricted-syntax': ['error', ...baseRestrictedSyntax, ...selectors] },
  }));
}

const typeScriptRules = {
  'ts/ban-ts-comment': 'error',
  'ts/consistent-type-definitions': ['error', 'type'],
  'ts/consistent-type-imports': 'error',
  'ts/method-signature-style': 'error',
  'ts/no-dynamic-delete': 'error',
  'ts/no-empty-object-type': 'error',
  'ts/no-explicit-any': 'error',
  'ts/no-extraneous-class': 'error',
  'ts/no-import-type-side-effects': 'error',
  'ts/no-invalid-void-type': 'error',
  'ts/no-namespace': 'error',
  'ts/no-non-null-asserted-nullish-coalescing': 'error',
  'ts/no-non-null-asserted-optional-chain': 'error',
  'ts/no-non-null-assertion': 'error',
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
    typescript = {},
    ...antfuOptions
  } = options;
  const typeAware = tsconfigPath !== undefined;

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
      plugins: { local: { rules: { ...localRules, 'no-comments': noComments, 'require-procedure-output': requireProcedureOutput, 'service-exports-functions': serviceExportsFunctions } } },
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
      rules: { ...typeScriptRules, 'no-restricted-syntax': ['error', ...restrictedSyntax, ...extraRestrictedSyntax] },
    },
    ...layeredBackendConfigs(layeredBackend, [...restrictedSyntax, ...extraRestrictedSyntax]),
    ...(typeAware ? [{ name: 'zoroskr/typescript-type-aware', files: typeScriptFiles, rules: typeAwareRules }] : []),
    ...(await optionalConfigs({ query, tailwind, i18n })),
    ...userConfigs,
  );
}
