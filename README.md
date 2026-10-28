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

| Option                | Default  | Effect                                                                                                              |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `tsconfigPath`        | none     | Enables type-aware rules (`strict-boolean-expressions`, `no-unnecessary-condition`, `no-deprecated`, ...)           |
| `react`               | `true`   | React rules and `jsx-a11y`                                                                                          |
| `query`               | `false`  | TanStack Query rules, and hook returns destructured at the call site                                                |
| `tailwind`            | `false`  | Tailwind rules; pass an object to set `settings.tailwindcss`                                                        |
| `i18n`                | `false`  | Warns on literal strings in JSX and UI objects                                                                      |
| `localRules`          | `{}`     | Extra rules registered in the `local` plugin, next to `local/no-comments`; enable them in a later config            |
| `restrictedSyntax`    | `[]`     | Extra `no-restricted-syntax` entries for TypeScript files, appended to the package selectors                        |
| `inferredReturnTypes` | `true`   | Bans function return annotations (type predicates and `asserts` pass); `false` removes the ban                      |
| `envFiles`            | `env.ts` | Regex sources exempt from `local/no-process-env` (the validated env module); replace the default `(?:^\|/)env\.ts$` |
| `layeredBackend`      | `false`  | tRPC layer rules per file suffix; pass `{ services, repositories, routers, schemas }` to override globs             |
| `isomorphic`          | `false`  | Client/server boundary for shared code; pass `{ files, schemaFiles, ignores, forbiddenImports }`                    |

The i18n rule set is also exported as `i18nRules`, for standalone audit configs:

```js
import { i18nRules } from '@zoroskr/config/eslint';
import formatjs from 'eslint-plugin-formatjs';

export default [{ files: ['**/*.tsx'], plugins: { formatjs }, rules: i18nRules }];
```

What it enforces:

- No comments, JSDoc included. Only tooling directives pass (`eslint-disable`, `@ts-expect-error`, `/// <reference>`). A block-form `/* eslint-disable … */` naming `no-restricted-syntax`, `ts/no-explicit-any` or a `ts/no-unsafe-*` rule is rejected; disable those line by line (`eslint-disable-next-line` / `eslint-disable-line`).
- Unused disable directives are errors (`linterOptions.reportUnusedDisableDirectives: 'error'`).
- No type assertions except `as const`; the check reads each assertion's own type, so `({ a: 'x' as const }) as User` is rejected.
- No annotated function return types, unless `inferredReturnTypes: false`. Type predicates (`value is T`, `asserts value is T`, `asserts value`) always pass.
- No `any` and no non-null `!` (restricted-syntax selectors replace `ts/no-explicit-any` and `ts/no-non-null-assertion`, which are off), `type` over `interface`, type-only imports.
- Outside test files (`*.test`, `*.spec`, `*.stories`): no `console.*` calls (the selector replaces `no-console`, which is off for production TypeScript; tests and JavaScript keep antfu's `no-console`) and no lazy `await import()`; use a static import and mock the boundary module in the test.
- In test files: no `const fixture: T = { … }` or `[ … ]` with a non-empty literal; use `satisfies T`. Empty literals (`const ids: string[] = []`) pass.
- With `query`: a `use(Mutation|Query|InfiniteQuery|SuspenseQuery|SuspenseInfiniteQuery)` method call assigned to a plain identifier (`const mutation = api.post.create.useMutation()`) is rejected; destructure it. Bare `useQuery()` calls and `useForm` are not covered.
- No `process.env` (`local/no-process-env`) in TypeScript files: dotted, computed and destructured reads (`const { X } = process.env`, `const { env } = process`), also through `globalThis.process` or `globalThis`. Test files, `**/*.config.*`, `scripts/**` and the `envFiles` patterns are exempt, so the validated env module can read it:

```js
export default zoroskr({ envFiles: ['/src/env\\.ts$', '/src/server/env-adapter\\.ts$'] });
```

- Strict boolean expressions without nullable or string/number shortcuts.
- Security and secret-detection rules as warnings.
- `import 'server-only';`, never the bare `'server-only';` no-op directive.
- With `tsconfigPath`, deprecated APIs are errors (`ts/no-deprecated`), e.g. Zod 4's `z.string().email()`.
- No TS `enum` (use an `as const` array or `z.enum`) and no `inferRouterOutputs` / `inferRouterInputs`, imported, renamed, qualified or through `import('@trpc/server')` (import the type exported beside its schema).
- No Zod 4 `message` param (`local/no-zod-message-param`): an object argument with a `message` key in a call chain rooted at a `zod` import, e.g. `z.string().min(1, { message })`; pass `{ error: '…' }`. Shapes and data (`z.object({ message })`, also through a renamed import such as `object as obj`; `.parse()`, `z.parse(schema, data)`, `.default()`, `.meta()`) and `ctx.addIssue({ message })` pass. The rule only sees chains rooted at the `zod` import: a schema derived and held in a variable (`userSchema.omit({ id: true }).refine(fn, { message })`) is out of reach without type information, so the skill rule still applies there.
- No `types.ts` or `*.types.ts` files (`local/no-types-file`; `.d.ts` passes).
- No `z.infer|input|output<typeof schema>` (any `zod` import: namespace, default, renamed `z`, `ns.z` of a namespace or default import, or named `infer`/`input`/`output`) outside a type alias of a module-level `const` schema of the same file (`local/no-inline-zod-infer`). In schema files a local schema may be derived anywhere, an imported one never. Schema files match the rule option `schemaFiles`, regex sources that replace the default `['\\.schema\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$']`:

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

`Record<string, unknown>` means a `string` key; `Record<'a' | 'b', unknown>` passes. Layer blocks repeat the package, production (`console`, `await import()`) and `restrictedSyntax` selectors, since flat config replaces `no-restricted-syntax` per block; the test-file block repeats the package and `restrictedSyntax` selectors too.

With `isomorphic` (skill `zod-schemas`), two local rules guard code shared by client and server. Both are local rules, so a consumer's own `no-restricted-imports` block or the layer selectors never replace them.

| Key                | Default                                                        | Rule                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`            | `['**/shared/**/*.{ts,tsx}']`                                  | `local/isomorphic-boundary`: rejects imports, re-exports and literal `import()` of Node builtins (`node:*`, `fs`, `path`, ...), `server-only` and `forbiddenImports`; `process.env`, `globalThis.process.env` and `const { env } = process` (also from `globalThis.process` or `globalThis`); JSX |
| `schemaFiles`      | `['**/shared/**/*.schema.ts', '**/shared/**/schemas/**/*.ts']` | `local/no-schema-default`: rejects `.default()` and `.prefault()` unless inside a top-level const named `*InputSchema`                                                                                                                                                                            |
| `ignores`          | `['**/*.test.{ts,tsx}']`                                       | Excluded from both rules                                                                                                                                                                                                                                                                          |
| `forbiddenImports` | `[]`                                                           | Extra module patterns for `local/isomorphic-boundary`; `*` matches any characters, e.g. `['firebase-admin', 'firebase-admin/*']`                                                                                                                                                                  |

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
