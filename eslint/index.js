import antfu from '@antfu/eslint-config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noSecrets from 'eslint-plugin-no-secrets';
import security from 'eslint-plugin-security';
import noComments from './rules/no-comments.cjs';

const sourceFiles = '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
const typeScriptFiles = ['**/*.ts', '**/*.tsx'];
const testFiles = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.stories.{ts,tsx}'];

const securityWarnings = Object.fromEntries(
  Object.keys(security.configs.recommended.rules).map(rule => [rule, 'warn']),
);

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
  'ts/unified-signatures': 'error',
  'no-restricted-syntax': [
    'error',
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
  ],
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

const i18nRules = {
  'formatjs/no-literal-string-in-jsx': ['warn', {
    props: {
      include: [
        ['*', 'aria-{label,description,details,errormessage}'],
        ['[a-z]*([a-z0-9])', '(placeholder|title)'],
        ['img', 'alt'],
        ['*', 'label'],
      ],
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
    {
      name: 'zoroskr/base',
      files: [sourceFiles],
      plugins: { 'local': { rules: { 'no-comments': noComments } }, 'no-secrets': noSecrets },
      rules: {
        ...securityWarnings,
        'local/no-comments': 'error',
        'no-secrets/no-secrets': 'warn',
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
    { name: 'zoroskr/typescript', files: typeScriptFiles, rules: typeScriptRules },
    ...(typeAware ? [{ name: 'zoroskr/typescript-type-aware', files: typeScriptFiles, rules: typeAwareRules }] : []),
    ...(await optionalConfigs({ query, tailwind, i18n })),
    ...userConfigs,
  );
}
