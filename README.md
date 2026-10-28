# @zoroskr/config

Strict ESLint, TypeScript and commitlint config for Next.js + tRPC + Zod projects. Built on [`@antfu/eslint-config`](https://github.com/antfu/eslint-config).

## Install

```sh
npm install -D @zoroskr/config eslint typescript
```

Optional peers, only when you enable the matching option:

| Option     | Install                                   |
| ---------- | ----------------------------------------- |
| `query`    | `@tanstack/eslint-plugin-query`           |
| `tailwind` | `eslint-plugin-tailwindcss` (Tailwind v3) |
| `i18n`     | `eslint-plugin-formatjs@^8`               |
| commitlint | `@commitlint/cli`                         |

## ESLint

```js
import zoroskr from '@zoroskr/config/eslint';

export default zoroskr(
  { tsconfigPath: './tsconfig.json', nextjs: true, query: true },
  { files: ['src/legacy/**'], rules: { 'local/no-comments': 'off' } },
);
```

The first argument takes these options; any other key is passed to `antfu()` (`nextjs`, `ignores`, `typescript`, ...). Every argument after it is a flat config appended at the end, so it can override package rules.

| Option             | Default | Effect                                                                                                    |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------- |
| `tsconfigPath`     | none    | Enables type-aware rules (`strict-boolean-expressions`, `no-unnecessary-condition`, `no-deprecated`, ...) |
| `react`            | `true`  | React rules and `jsx-a11y`                                                                                |
| `query`            | `false` | TanStack Query rules                                                                                      |
| `tailwind`         | `false` | Tailwind rules; pass an object to set `settings.tailwindcss`                                              |
| `i18n`             | `false` | Warns on literal strings in JSX and UI objects                                                            |
| `localRules`       | `{}`    | Extra rules registered in the `local` plugin, next to `local/no-comments`; enable them in a later config  |
| `restrictedSyntax` | `[]`    | Extra `no-restricted-syntax` entries for TypeScript files, appended to the package selectors              |
| `layeredBackend`   | `false` | tRPC layer rules per file suffix; pass `{ services, repositories, routers, schemas }` to override globs   |
| `isomorphic`       | `false` | Client/server boundary for shared code; pass `{ files, schemaFiles, ignores, forbiddenImports }`          |

The i18n rule set is also exported as `i18nRules`, for standalone audit configs:

```js
import { i18nRules } from '@zoroskr/config/eslint';
import formatjs from 'eslint-plugin-formatjs';

export default [{ files: ['**/*.tsx'], plugins: { formatjs }, rules: i18nRules }];
```

What it enforces:

- No comments, JSDoc included. Only tooling directives pass (`eslint-disable`, `@ts-expect-error`, `/// <reference>`, `organize-imports-ignore`).
- No type assertions except `as const`, and no annotated function return types.
- No `any`, no non-null `!`, `type` over `interface`, type-only imports.
- Strict boolean expressions without nullable or string/number shortcuts.
- Security and secret-detection rules as warnings.
- `import 'server-only';`, never the bare `'server-only';` no-op directive.
- With `tsconfigPath`, deprecated APIs are errors (`ts/no-deprecated`), e.g. Zod 4's `z.string().email()`.
- No TS `enum` (use an `as const` array or `z.enum`) and no `inferRouterOutputs` / `inferRouterInputs`, imported, renamed or qualified (import the type exported beside its schema).
- No Zod 4 `message` param (`local/no-zod-message-param`): an object argument with a `message` key in a call chain rooted at a `zod` import, e.g. `z.string().min(1, { message })`; pass `{ error: '…' }`. Shapes and data (`z.object({ message })`, `.parse()`, `.default()`, `.meta()`) and `ctx.addIssue({ message })` pass. Schemas reached through a variable (`schema.refine(...)`) are not resolved.
- No `types.ts` or `*.types.ts` files (`local/no-types-file`; `.d.ts` passes).
- No `z.infer|input|output<typeof schema>` (any `zod` import: namespace, default, renamed `z`, or named `infer`/`input`/`output`) outside a type alias of a module-level `const` schema of the same file (`local/no-inline-zod-infer`). In schema files a local schema may be derived anywhere, an imported one never. Schema files match the rule option `schemaFiles`, regex sources that replace the default `['\\.schema\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$']`:

```js
export default zoroskr({}, {
  files: ['**/*.{ts,tsx}'],
  rules: { 'local/no-inline-zod-infer': ['error', { schemaFiles: ['\\.schema(?:-adapter)?\\.ts$', '/schemas/'] }] },
});
```

With `layeredBackend` (skill `trpc-layered-backend`), default globs `**/*.{service,repository,router,schema}.ts`:

| Layer          | Rejects                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services`     | `throw new Error`, `z.*` schemas, non-function exports (inline, local list or default, resolved by `local/service-exports-functions`), re-exports, classes, `Record<string, unknown>` anywhere, module-scope policy constants |
| `repositories` | `z.*` schemas, `Record<string, unknown>` anywhere, `console`, imports of `@trpc/server` or services                                                                                                                           |
| `routers`      | `try`, `throw`, and procedures without `.output()` (`local/require-procedure-output`)                                                                                                                                         |
| `schemas`      | `{ success: z.literal(...) }` outputs, `Record<string, unknown>` and unknown index signatures                                                                                                                                 |

`Record<string, unknown>` means a `string` key; `Record<'a' | 'b', unknown>` passes. Layer blocks repeat the package and `restrictedSyntax` selectors, since flat config replaces `no-restricted-syntax` per block.

With `isomorphic` (skill `zod-schemas`), two local rules guard code shared by client and server. Both are local rules, so a consumer's own `no-restricted-imports` block or the layer selectors never replace them.

| Key                | Default                                                        | Rule                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`            | `['**/shared/**/*.{ts,tsx}']`                                  | `local/isomorphic-boundary`: rejects imports, re-exports and literal `import()` of Node builtins (`node:*`, `fs`, `path`, ...), `server-only` and `forbiddenImports`; `process.env` and `const { env } = process`; JSX |
| `schemaFiles`      | `['**/shared/**/*.schema.ts', '**/shared/**/schemas/**/*.ts']` | `local/no-schema-default`: rejects `.default()` and `.prefault()` unless inside a top-level const named `*InputSchema`                                                                                                 |
| `ignores`          | `['**/*.test.{ts,tsx}']`                                       | Excluded from both rules                                                                                                                                                                                               |
| `forbiddenImports` | `[]`                                                           | Extra module patterns for `local/isomorphic-boundary`; `*` matches any characters, e.g. `['firebase-admin', 'firebase-admin/*']`                                                                                       |

Type-only `import type` / `export type` declarations pass the boundary, since they are erased from the bundle.

## TypeScript

```json
{
  "extends": "@zoroskr/config/tsconfig/strict.json",
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

Adds `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax` and the rest of the strict set on top of `strict`. Paths, `include` and framework plugins stay in each project.

## commitlint

```js
export default { extends: ['@zoroskr/config/commitlint'] };
```

Conventional Commits, lowercase subject, no trailing period, header up to 150 characters.

## Development

```sh
npm test
npm run lint
```
