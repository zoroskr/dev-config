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

| Option                | Default  | Effect                                                                                                               |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `tsconfigPath`        | none     | Enables type-aware rules (`strict-boolean-expressions`, `no-unnecessary-condition`, `no-deprecated`, ...)            |
| `react`               | `true`   | React rules and `jsx-a11y`                                                                                           |
| `query`               | `false`  | TanStack Query rules and data-container rules; pass `{ containers, providers, errorComponent }` to override defaults |
| `tailwind`            | `false`  | Tailwind rules; pass an object to set `settings.tailwindcss`                                                         |
| `i18n`                | `false`  | Warns on literal strings in JSX and UI objects                                                                       |
| `localRules`          | `{}`     | Extra rules registered in the `local` plugin, next to `local/no-comments`; enable them in a later config             |
| `restrictedSyntax`    | `[]`     | Extra `no-restricted-syntax` entries for TypeScript files, appended to the package selectors                         |
| `inferredReturnTypes` | `true`   | Bans function return annotations (type predicates and `asserts` pass); `false` removes the ban                       |
| `envFiles`            | `env.ts` | Regex sources exempt from `local/no-process-env` (the validated env module); replace the default `(?:^\|/)env\.ts$`  |
| `layeredBackend`      | `false`  | tRPC layer rules per file suffix; pass `{ services, repositories, routers, schemas }` to override globs              |
| `isomorphic`          | `false`  | Client/server boundary for shared code; pass `{ files, schemaFiles, ignores, forbiddenImports }`                     |

The i18n rule set is also exported as `i18nRules`, for standalone audit configs:

```js
import { i18nRules } from '@zoroskr/config/eslint';
import formatjs from 'eslint-plugin-formatjs';

export default [{ files: ['**/*.tsx'], plugins: { formatjs }, rules: i18nRules }];
```

What it enforces:

- No comments, JSDoc included. Only tooling directives pass (`eslint-disable`, `@ts-expect-error`, `/// <reference>`). A block-form `/* eslint-disable … */` naming `no-restricted-syntax`, `ts/no-explicit-any` or a `ts/no-unsafe-*` rule is rejected; disable those line by line (`eslint-disable-next-line` / `eslint-disable-line`).
- A disable directive in any form that names `local/no-comments` or no rule at all (`/* eslint-disable */`, `// eslint-disable-next-line`) is rejected. ESLint drops a problem when a disable directive sits at or before its position, so the rule reports it at `0:0`, before every directive, where no inline comment can suppress it; the message names the directive's line. Directives spanning several lines are read with their whitespace collapsed, so `/* eslint-disable\n  local/no-comments\n*/` is caught too. Inline config comments (`/* eslint no-console: off */`) are rejected while the rule runs. `/* eslint local/no-comments: off */` switches the rule itself off for the file, so no rule can report it: block it with a repository-level check (lint-staged and CI) that rejects inline `/* eslint … */` config comments and any directive naming `local/no-comments`; Legix ships one. Otherwise only a config (`'local/no-comments': 'off'`) can turn the guard off.
- Unused disable directives are errors (`linterOptions.reportUnusedDisableDirectives: 'error'`).
- No type assertions except `as const`; the check reads each assertion's own type, so `({ a: 'x' as const }) as User` is rejected.
- No annotated function return types, unless `inferredReturnTypes: false`. Type predicates (`value is T`, `asserts value is T`, `asserts value`) always pass.
- No `any` and no non-null `!` (restricted-syntax selectors replace `ts/no-explicit-any` and `ts/no-non-null-assertion`, which are off), `type` over `interface`, type-only imports.
- Production TypeScript is every `.ts`/`.tsx` file except test files (`*.test`, `*.spec`, `*.stories`) and `scripts/**`. There:
  - No reference to the global `console` (`local/no-console`, which replaces `no-console`): calls, `console.log` passed or assigned (`export const log = console.log`), `const { log } = console`, the same through `globalThis` (`globalThis.console.error()`, `const { console } = globalThis`), and every binding imported from `console` or `node:console` (default, namespace or named, e.g. `import { error } from 'node:console'`). A local binding named `console`, or one imported from another module, passes. Tests and JavaScript keep antfu's `no-console`; antfu turns it off in `scripts/**`.
  - No `import()` unless it is the body of an arrow function (alone or followed by one `.then(…)`) that is passed to `dynamic`, `lazy` or `<x>.lazy` (`dynamic(() => import('./C').then(m => m.C))`, `React.lazy(() => import('./C'))`) or is the init of a `const` (`const load = () => import('./b')`). `await import('./b')`, a stored `import('./b')`, `promise.then(() => import('./b'))`, an arrow passed to any other call and a `let` loader are rejected; use a static import and mock the boundary module in the test.
- In test files and fixture modules (`**/__fixtures__/**`, `*.fixture.ts(x)`, `*.fixtures.ts(x)`): no `const fixture: T = { … }` or `[ … ]` with a non-empty literal, also wrapped in `as const`, `satisfies T` or `as const satisfies T` while the declaration keeps its annotation; drop the annotation and use `satisfies T`. Empty literals (`const ids: string[] = []`) and `let` declarations (`let user: User | null = { … }`) pass. Fixture modules keep the production selectors.
- With `query` (`local/query-hook-destructuring`): a `use(Mutation|Query|InfiniteQuery|SuspenseQuery|SuspenseInfiniteQuery)` call assigned to a plain identifier is rejected; destructure it. Method calls match on any object (`const mutation = api.post.create.useMutation()`); bare calls match only when the hook is imported from `@tanstack/react-query`, renamed imports included (`const posts = useQuery(options)`). A call wrapped in `satisfies`, `as` or `!` (`const posts = useQuery(options) satisfies Posts`) is unwrapped first. A local function with the same name and `useForm` are not covered.
- No `process.env` (`local/no-process-env`) in TypeScript files: dotted, computed and destructured reads (`const { X } = process.env`, `const { env } = process`), also through `globalThis.process`, `globalThis`, a `process` imported from `process` or `node:process` (default, namespace, the namespace's `default` as in `runtime.default.env`, or `default as`), the named `import { env } from 'node:process'` and the re-export `export { env } from 'node:process'`. A parameter or local named `process` or `env` passes. Test files, `**/*.config.*`, `scripts/**` and the `envFiles` patterns are exempt, so the validated env module can read it:

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
- No plural `use*Filters` hook declarations (`function useFilters`, `function useItemFilters`, `const useItemFilters = () => …`, an object method or function-valued property such as `{ useFilters() { … } }` or `{ 'useItemFilters': () => … }`, also wrapped in `satisfies`, `as` or `!`) and no `use*` overloads (`TSDeclareFunction`); single-purpose hooks such as `useSearchFilter` pass.
- No `z.infer|input|output<typeof schema>` (any `zod` import: namespace, default, renamed `z`, `ns.z` of a namespace or default import, or named `infer`/`input`/`output`) outside a type alias of a module-level `const` schema of the same file (`local/no-inline-zod-infer`). In schema files a local schema may be derived anywhere, an imported one never. Schema files match the rule option `schemaFiles`, regex sources that replace the default `['\\.schema\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$']`:

```js
export default zoroskr({}, {
  files: ['**/*.{ts,tsx}'],
  rules: { 'local/no-inline-zod-infer': ['error', { schemaFiles: ['\\.schema(?:-adapter)?\\.ts$', '/schemas/'] }] },
});
```

With `query` (skill `react-data-containers`), these rules join `local/query-hook-destructuring`. Query hooks are `useQuery`, `useInfiniteQuery`, `useSuspenseQuery` and `useSuspenseInfiniteQuery` imported from `@tanstack/react-query` (renamed imports included) or called as a method on any object (`api.items.list.useQuery()`); a local function or another module's `useQuery` passes. Test files and `scripts/**` are exempt from the placement and container rules.

| Key              | Default                 | Rule                                                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers`     | `['**/*Container.tsx']` | `local/query-placement`: query hooks only in containers and providers, never inside a function named `use[A-Z]…` (also in those files), at most one per container file. `local/query-container-states`, `local/no-inline-object-props` and the container selectors run on these files |
| `providers`      | `['**/*Provider.tsx']`  | Files where `local/query-placement` accepts any number of queries                                                                                                                                                                                                                     |
| `errorComponent` | `'Error'`               | JSX element the container `isError` branch must return                                                                                                                                                                                                                                |

Globs are matched against the path relative to the ESLint working directory (`**/`, `*`, `?` and `{a,b}`).

- `local/no-query-is-loading` (all TypeScript files): `isLoading` destructured from, or read on, a query or `useMutation` result; use `isPending`.
- `local/query-container-states`: in a container function that destructures `useQuery` or `useInfiniteQuery`, the function body has `if (isPending) return <XSkeleton />` before `if (isError) return <Error … />`. It reports a missing pending or error branch, an error branch before the pending one, a pending branch that does not return a `*Skeleton` element, an error branch that does not return `errorComponent`, and any `||` that combines the query's `isPending` with another check as the test of an `if` or of a ternary returning JSX (`if (isPending || data == null)`, `return isPending || x ? <ItemsSkeleton /> : …`), also wrapped in `satisfies`, `as`, `!` or `<T>` (`if ((isPending || data == null) satisfies boolean)`); a value such as `const busy = isPending || isRefetching` passes. Suspense queries need no branches.
- The function name `local/query-placement` checks comes from the variable whose initializer is the function (also wrapped in `satisfies`, `as`, `!` or `<T>`) or the object property or method holding it (`const hooks = { useItems() { … } }`); that name wins over a function expression's own name, so `const useItems = function readItems() { … }` is a wrapper. Otherwise the declaration's name is used.
- `local/no-inline-object-props`: an inline object literal passed to a component prop (`<Items filters={{ status }} />`, `<UI.Table config={{ … }} />`), also wrapped in `satisfies`/`as const`, in a conditional or logical branch (`x ? { a } : { b }`, `x && { a }`), as the last expression of a sequence (`{(track(), { a })}`) or as a prop of a spread object (`{...{ config: { … } }}`); `style` and intrinsic elements pass.
- Container selectors: `totalPages`, `startItem` or `endItem` declared as a variable, destructured binding or function.
- `local/no-mutation-in-effect` (all TypeScript files): a call to `mutate` or `mutateAsync` destructured from a mutation result (renamed included: `const { mutate: save } = api.x.useMutation()`), or `mutation.mutate()` on one, made directly in a `useEffect`/`useLayoutEffect` callback imported from `react` (`React.useEffect` included), inline or passed by name when the name is a same-file `const` arrow or function expression or a function declaration (`const onMount = () => { save(); }; useEffect(onMount, [save]);`). Mutation results come from `useMutation` imported from `@tanstack/react-query` or `<x>.useMutation()`. Calls inside functions nested in the effect (listeners, timers, promise callbacks) and `mutate` from other sources (SWR) pass; call it from an event handler.

The container block repeats the package, production (`import()`) and `restrictedSyntax` selectors, like the layer blocks.

With `layeredBackend` (skill `trpc-layered-backend`), default globs `**/*.{service,repository,router,schema}.ts`:

| Layer          | Rejects                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services`     | `throw new Error`, `z.*` schemas, non-function exports (inline, local list or default, resolved by `local/service-exports-functions`), re-exports, classes, `Record<string, unknown>` anywhere, module-scope policy constants |
| `repositories` | `z.*` schemas, `Record<string, unknown>` anywhere, `console`, imports of `@trpc/server` or services                                                                                                                           |
| `routers`      | `try`, `throw`, and procedures without `.output()` (`local/require-procedure-output`)                                                                                                                                         |
| `schemas`      | `{ success: z.literal(...) }` outputs, `Record<string, unknown>` and unknown index signatures                                                                                                                                 |

`Record<string, unknown>` means a `string` key; `Record<'a' | 'b', unknown>` passes. Layer blocks repeat the package, production (`import()`) and `restrictedSyntax` selectors, since flat config replaces `no-restricted-syntax` per block; the test-file block repeats the package and `restrictedSyntax` selectors too.

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
