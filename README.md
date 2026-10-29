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
| `appRouter`           | `false`  | Next.js App Router structure rules; pass `{ app, shared, gateCallees, serverCallerModules }`                         |
| `forms`               | `false`  | React Hook Form + Zod form rules; pass `{ files, schemaFiles, constantsFiles }`                                      |
| `webhooks`            | `false`  | Route handler and signed webhook receiver rules; pass `{ routes, webhooks }`                                         |
| `migrations`          | `false`  | Import boundary around migration modules; pass `{ roots }` to override the default `['**/migrations']`               |
| `testSetupFiles`      | `[]`     | Test setup files (globs) allowed to call `vi.mock`/`vi.doMock` outside test files                                    |

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

### With `appRouter`

Skill `nextjs-app-router`. Pass `true` for the defaults or an object to override any key:

```js
export default zoroskr({
  appRouter: {
    gateCallees: ['requirePermission'],
    serverCallerModules: ['src/server/trpc.ts', 'src/app/(global)/providers/server.ts'],
  },
});
```

| Key                   | Default                                                      | Use                                                                     |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `app`                 | `['**/app/**/*.{ts,tsx}']`                                   | Route tree files                                                        |
| `shared`              | `['**/components/**/*.{ts,tsx}', '**/shared/**/*.{ts,tsx}']` | Shared files where barrels are also banned                              |
| `gateCallees`         | `[]`                                                         | Function names whose `await` in a page requires a sibling `loading.tsx` |
| `serverCallerModules` | `[]`                                                         | The only files allowed to call `createCaller`/`createCallerFactory`     |

Test files (`*.test`, `*.spec`, `*.stories`) and `scripts/**` are exempt, except from `local/app-file-placement`.

- `local/app-file-placement` (`app` and `shared`, filename only): no `index.ts(x)`. In `app` also:
  - `*.schema.ts` only below `schemas/`, `*.util.ts` below `utils/`, `*.constants.ts`/`*.constant.ts` below `constants/`, hooks (`use*.ts(x)`, `*.hook.ts`) below `hooks/`.
  - Below `components/`, at any depth, only `.tsx` component files and their tests.
  - A file below a category folder (`components`, `utils`, `schemas`, `constants`, `hooks`) sits in a folder named like its unit: the PascalCase of the file name without extension, `.test`/`.spec`/`.stories` and the `.schema`/`.util`/`.constants`/`.constant`/`.hook` suffix (`components/Foo/Foo.tsx`, `utils/NormalizeEmail/normalize-email.util.ts`, `hooks/UseOrders/useOrders.ts`).
  - The unit folder is the folder right after the first category segment of the path: a child component gets a sibling folder in `components/`, never a folder inside its parent (`components/Foo/Bar/Bar.tsx`, `components/Parent/components/Child/Child.tsx` and `components/DataTable/DataTable/DataTable.tsx` are rejected).
  - The name before a `.schema`/`.util`/`.constants`/`.constant` suffix is kebab-case (`normalize-email.util.ts`, not `normalizeEmail.util.ts`); hooks are camelCase starting with `use` (`useOrders.ts`, `useOrders.hook.ts`); components stay PascalCase. The plural suffixes `.schemas`, `.utils` and `.hooks` are rejected.
  - Outside category folders, a non-route file may not sit in a route segment (a folder holding `page`, `layout`, `loading`, `error`, `not-found`, `template`, `default` or `route` `.ts(x)`, or a `(group)` other than `(global)` or a `[param]` child with a page at any depth below it, as in `faqs/(index)/page.tsx` or `leads/[id]/page.tsx`), nor in a PascalCase folder directly inside one (`leads/LeadTable.tsx`, `leads/LeadRow/LeadRow.tsx`). Next route and metadata files (`page`, `global-error`, `opengraph-image`, `sitemap`, ...) and their tests pass; `(global)/<category>/` files follow the category rules and other `(global)/<folder>/` files are left alone.
  - No generic names: `helpers`, `utils`, `constants`, `options`, `schema`, `types`.
- `local/app-router-syntax` (production TypeScript):
  - `app` and `shared`: no `export * from` or `export { x } from` (type re-exports included), and no re-export stub: a module whose every export is an imported binding (`import { X } from './x'; export { X };`, `export default X`, `export { X as default }`), also through `as`/`satisfies`/`!` wrappers (`export default (X satisfies Page)`) or a `const` alias (`const Y = X as T; export { Y }`).
  - `app` `.tsx`: no schema-constructing Zod call (`z.object()`, `z.string()`, `z.coerce.number()`, `z.iso.datetime()`, `z.email()`, ...) through any default, namespace or named import from `zod`/`zod/*`, renamed or not (`zod.string()`, `zod.z.object()`, `object({})`); `z.prettifyError`, `flattenError`, `treeifyError`, `ZodError` and types pass. No `*Schema`/`schema` variable, no `isEditing`/`isEditMode` property or method signature (quoted keys included).
  - `page.ts(x)`: a default-exported function (declaration, arrow, a local binding or `export { Page as default }`) whose whole body is one `redirect()`/`permanentRedirect()` call (also renamed on import from `next/navigation`) with a string literal or a template literal without expressions; use `next.config` `redirects()`.
  - `page|layout|loading|template|default.tsx` without `'use client'`: no `try`.
  - Every file: `createCaller` and `createCallerFactory` calls (bare, through a renamed import or destructuring (`const { createCallerFactory: make } = t`), as a method or a computed string member like `router['createCaller']`) outside `serverCallerModules`.
- `local/route-global-scope` (`app` and `shared`): an import, re-export, `import()` with a string or expression-free template literal, or `import('...')` type whose target has a `(global)` segment is rejected unless the folder holding `(global)` is an ancestor of the importing file, so `app/(global)` is app-wide and `app/orders/(global)` is private to `app/orders`. Relative paths and the `paths` of the nearest `tsconfig.json`/`tsconfig.strict.json` (with `extends` and `baseUrl`) are resolved; other bare imports pass.
- `local/route-segment-config` (`app` `page`/`layout`): `export const dynamic = 'x'` when the nearest ancestor `layout.ts(x)` that exports `dynamic`, up to the `app` folder, exports the same value. A page's own folder layout counts as its ancestor. Type annotations, parentheses, `as const` and `satisfies` are read on both sides; the layout is parsed, so a commented-out export does not count.
- `local/route-loading` (`app`): a `page.tsx` whose default export (including `export { Page as default }`) awaits a call to a `gateCallees` name (`await requirePermission()` or `await auth.requirePermission()`) needs a sibling `loading.tsx`; a `loading.tsx` renders a JSX element whose name ends with `Skeleton`.
- `local/route-colocation` (`app`): `<dir>` has a child route when a direct child route folder (not a group, private folder, slot or category folder) holds a page at any depth through segments, groups and `[param]` folders (`details/(index)/page.tsx`, `settings/billing/page.tsx`), or a direct `(group)` child other than `(index)` and `(global)` holds a page at any depth (`(lists)/active/page.tsx`). Rejected: a file below `<dir>/components/` when `<dir>` is not a route group and has a direct child folder with a `page.ts(x)` or a child route; a `<dir>/page.ts(x)` when `<dir>` is a static segment (not `[param]`, `(group)`, `_private` or `@slot`) with a child route; move it to `<dir>/(index)/page.tsx`. `[param]/page.tsx` stays.

The filesystem rules cache directory and file reads for two seconds, so one lint run reads each folder once. The rules are local rules, not `no-restricted-syntax` blocks, so the package, production, `restrictedSyntax`, layer and container selectors keep firing on app files.

### With `forms`

Skill `rhf-zod-forms`. Pass `true` for the defaults or an object to override any key:

```js
export default zoroskr({ forms: { files: ['**/*Form.tsx', '**/FormSections/**/*.tsx'] } });
```

| Key              | Default                                                  | Use                                                                    |
| ---------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `files`          | `['**/*.tsx']`                                           | Files checked by `local/rhf-form-contract`                             |
| `schemaFiles`    | `['**/app/**/schemas/**/*.ts', '**/app/**/*.schema.ts']` | Form schema files: `*FormDefaults` and `.default()` checks             |
| `constantsFiles` | `['**/constants/**/*.ts', '**/*.constants.ts']`          | Constants files: only the `*FormDefaults` `satisfies` check runs there |

Test files (`*.test`, `*.spec`, `*.stories`) and `scripts/**` are exempt. `useForm`/`useFormContext` come from `react-hook-form` (renamed or through a namespace import) and `zodResolver` from `@hookform/resolvers/zod` (renamed included); a local or other module's `useForm` passes. The empty-string `disabled` gate and the `mutateAsync` try/catch checks run only in files that import `react-hook-form`, so non-form buttons and helpers pass.

- `local/rhf-form-contract` (`files` and `schemaFiles`):
  - `useForm` options with a `defaultValues` object holding a literal value (string, number, boolean, `null`, template without expressions, an array made only of literals such as `['default']` or `[]`, an object holding one, also nested), inline, through a chain of same-file `const` bindings (up to five hops, cycles stop), or returned by a function value (`defaultValues: () => ({ … })`, `function () { return { … }; }`, async included, any `return` in its body, also through a same-file `const` or function declaration): export a `<form>FormDefaults` object from the schema file. Remote mappings (`name: lead.name`, `[lead.tag, 'x']`), calls, imports and spreads pass.
  - In `schemaFiles` and `constantsFiles`, a `*FormDefaults` const whose init is not `satisfies` (`as X` and `const x: X = …` included); a constants file outside `files` and `schemaFiles` gets only this check. In other `.tsx` files, any `*FormDefaults` declaration: it belongs in the schema file.
  - `useForm` without `resolver: zodResolver(…)`, `useForm()` included. Options from a same-file `const` object are checked like inline options; options from a parameter, import or call pass. With a spread and no `resolver` key, each spread is resolved to a same-file `const` object (nested spreads and `const` chains followed): it passes when one of them provides `resolver: zodResolver(…)` or a spread cannot be resolved (import, call, parameter), and is reported when every spread resolves and none provides it (`const base = { mode: 'onSubmit' }; useForm({ ...base })`). The `resolver` value may be a same-file `const` initialized with `zodResolver(…)` (`const resolver = zodResolver(s); useForm({ resolver })`).
  - `register` destructured (renamed included) from `useForm()`/`useFormContext()` or from a binding holding one, and `<x>.register` (called or not) on such a binding or on its `control` (`form.control`, `const { control } = form`, `const control = form.control`). Function parameters typed with `react-hook-form` types count, destructured or reached as members (`props.form.register`, `props.register(…)`, `const { register } = props.form`): `form: UseFormReturn<…>`, `register: UseFormRegister<…>`, `control: Control<…>`, with the type given inline, through a same-file `type`/`interface` (`interface Props extends Base`, where `Base` is a same-file interface or type or a `react-hook-form` type, and intersections included), through `Pick<UseFormReturn<…>, 'register' | …>`/`Omit<…, 'watch'>` with literal keys, or through `FC<P>`/`FunctionComponent<P>` from `react` (or a global `React.FC<P>`) on the `const` holding the arrow or function. Other `.register()` calls (`z.globalRegistry`, service workers) and types from other modules pass.
  - Submit gates: `isValid` destructured or read from `formState` (`const { formState: { isValid } } = useForm()`, `const { isValid } = formState`, `form.formState.isValid`, `const formState = form.formState`) or from `useFormState(…)` (`react-hook-form`, destructured, held in a `const` or read directly), and from a typed parameter as above (`({ formState: { isValid } }: UseFormReturn<V>)`, `props.form.formState.isValid`, `formState: FormState<V>`); a `mode` option other than `'onSubmit'`; a `disabled` JSX attribute whose expression compares with `''` (`===`, `!==`, `==`, `!=`, nested callbacks included).
  - A `mutateAsync(…)` call (destructured from a mutation result, renamed included, or `mutation.mutateAsync(…)`) that is awaited, returned or the body of an expression-bodied arrow, directly or at the head of a `.then`/`.finally` chain, and not awaited inside the `try` block of a `try`/`catch` in the same function; `try`/`finally` alone, the `catch` block and nested callbacks do not count, and a call returned without `await` inside the `try` block is reported because its rejection escapes the `catch` (`try { return mutateAsync(v); } catch { … }`; `return await mutateAsync(v)` passes). A chain whose last call is `.catch(…)` passes. A call returned (or the expression body) of a callback passes when the callback is handed, directly or through `.map`, array literals and `Promise.all`/`allSettled`/`race`/`any` arguments, to a call that is awaited inside the `try` block of a `try`/`catch` or whose chain ends in `.catch(…)`: `try { await Promise.all(changes.map(change => updateRole(change))); } catch { … }`. An array iteration (`.map`, `.flatMap`, `.forEach`, `.filter`, `.find`, `.some`, `.every` and the like) only counts inside a `Promise` combinator: `await changes.map(…)` or an awaited array literal does not settle its promises and is reported. Without that outer `try`/`catch`, or with an `await` inside the callback, it is reported. `mutate` and other sources' `mutateAsync` (SWR) pass. Mutation results are detected as in `local/no-mutation-in-effect`.
- `local/no-schema-default` with `{ form: true }` (`schemaFiles`): every `.default()`/`.prefault()`, with no `*InputSchema` exemption; set initial values in the defaults object. The `isomorphic` schema block keeps its exemption.

### With `webhooks`

Skill `webhook-receivers`. Pass `true` for the defaults or an object to override any key:

```js
export default zoroskr({ webhooks: { webhooks: ['**/app/api/webhooks/**/route.ts', '**/app/api/cron/**/route.ts'] } });
```

| Key        | Default                               | Use                                                      |
| ---------- | ------------------------------------- | -------------------------------------------------------- |
| `routes`   | `['**/app/api/**/route.ts']`          | Route handlers checked by `local/route-handler-contract` |
| `webhooks` | `['**/app/api/webhooks/**/route.ts']` | Signed receivers, checked by both rules                  |

Test files (`*.test`, `*.spec`, `*.stories`) and `scripts/**` are exempt.

- `local/route-handler-contract` (`routes` and `webhooks`): schema-constructing Zod calls, detected like the app-router `.tsx` check (any default, namespace or named import from `zod`/`zod/*`, renamed or not); `.parse()`/`.parseAsync()` on any receiver except the global `JSON`, `Date` and `URL` and a default or namespace import of `qs`, `querystring` or `node:querystring` (computed `['parse']` included). `safeParse`, `safeParseAsync`, `JSON.parse`, `URL.parse`, `qs.parse` and `new URLSearchParams(await req.text())` pass.
- `local/webhook-receiver-contract` (`webhooks`):
  - `===`, `!==`, `==` and `!=` when a side is a header read (`req.headers.get(…)`, `headers().get(…)`, `(await headers()).get(…)`, also through a `const` alias such as `const hs = req.headers`, `const { headers: h } = req` or `const list = await headers()`, behind `??`/`||`, `+`, a template literal, `String(…)`, `toString`/`slice`/`substring`/`substr`/`trim`/`trimStart`/`trimEnd`/`replace`/`replaceAll`/`toLowerCase`/`toUpperCase` or an index into `.split(…)` (`[n]` or `.at(n)`)) or an `env` member whose name contains `secret`, `token`, `key`, `signature`, `digest`, `hmac` or `password` (`env.WEBHOOK_SECRET`, `process.env.API_KEY`, `env.provider.apiToken`), directly or through a `const` initialised from one (up to five hops, destructuring from `env` included). A `switch` on such a value (or with such a `case`) is reported per non-constant `case`. A comparison against a non-secret constant passes: a literal, `undefined`, an expression-free template, a `const` initialised with a string literal at any scope (`const EVENT = 'message.created'`, `as const` included), an imported binding (`EVENT_CREATED`, `expectedEvent`), or a member of an imported object, namespace or a TS `enum` declared in the file (`EVENTS.MESSAGE`, `E.A`, `Event.Created`). It is still reported when the binding, the imported name or any member name matches that list (`webhookSecret`, `expectedSignature`, `SECRETS.WEBHOOK`, `EVENTS.API_TOKEN`), and `env` members never count as constants (`env.WHATSAPP_VERIFY`). So `secret === undefined`, `secret === ''`, `typeof secret !== 'string'`, `status === 200`, `provided.length !== expected.length` and `req.headers.get('x-event') === 'message.created'` stay accepted.
  - A `.json()` call on a function parameter, its `.clone()` or a `const` holding either (`await req.json()`, `await req.clone().json()`, `const copy = req.clone(); await copy.json()`) whose call chain has no `.catch(…)`; `await req.json().catch(() => null)` passes.
  - `for`, `for…of`, `for…in`, `while`, `do…while` and `.forEach(…)`; `.map`/`.reduce` pass.

Known limits: both rules read one file. A header or secret passed to a helper is not followed into that helper's parameters, and a named callback in `.then(handler)` is not followed into its declaration, so review those by hand. Imported bindings are trusted by name only, so a non-secret-named import that holds a secret passes.

Both are local rules, so the package, production and `restrictedSyntax` selectors keep firing on route files.

### With `migrations`

Skill `data-migration-safety`. Pass `true` for the default or an object to override `roots`:

```js
export default zoroskr({ migrations: { roots: ['src/backend/migrations'] } });
```

| Key     | Default             | Use                                                                                                   |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `roots` | `['**/migrations']` | Migration folders, as folders or globs relative to the ESLint working directory (`**/`, `*`, `{a,b}`) |

- `local/migration-boundary` (every source file outside a root, minus `*.test.*`): an import (side-effect and namespace included), `export { x } from`, `export *` (also `export * as ns`), `import()`, `require()`, `module.require()` or `createRequire(…)(…)` with a string or expression-free template literal whose target lies inside a root, or is the root itself (`import { run } from '../migrations'`). Relative paths and the `paths` of the nearest `tsconfig.json`/`tsconfig.strict.json` (with `extends` and `baseUrl`) are resolved, so `@backend/migrations/x` counts when `@backend/*` maps into a root. A bare specifier no `paths` entry matches is resolved against `baseUrl` when a file or folder exists there (`src/backend/migrations/x` with `baseUrl: "."`); other bare imports pass. `import type`, `export type`, specifier lists where every specifier is type-only (`import { type X } from`, `export { type X, type Y } from`) and `import('…')` types pass, since they are erased; one value specifier (`import { type X, run }`) or a default import is reported. Files inside a root import each other freely.

### Testing

Skill `vitest-testing`. Always on; `testSetupFiles` lists the setup files that may hold global mocks:

```js
export default zoroskr(
  { testSetupFiles: ['src/testing/setup.ts', 'src/testing/integration-setup.ts'] },
  { files: ['**/*.test.{ts,tsx}'], rules: { 'local/test-colocation': ['error', { ignores: ['src/legacy/**'] }] } },
);
```

| Files                                         | Rule                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test files (`*.test`, `*.spec`, `*.stories`)  | `no-restricted-syntax`: `console.*()` and `globalThis.console.*()` calls, binding `console` or one of its methods (`const { log } = console`, `const error = console.error`) and named imports from `console`/`node:console` (a default or namespace import stays spyable); `vi.spyOn(console, 'error')` passes. `test/hoisted-apis-on-top`: `vi.mock` inside a block or function             |
| `**/*.test.{ts,tsx}`                          | `local/no-http-mock`: imports, re-exports and literal `import()` of `msw`, `msw/*` and `nock` (type-only included); E2E `*.spec` files pass                                                                                                                                                                                                                                                   |
| `**/*.test.{ts,tsx}`                          | `local/test-colocation`: a `tests` or `__tests__` folder anywhere in the path, or no sibling `<stem>.ts`/`<stem>.tsx` (`foo.test.ts` and `foo.integration.test.ts` → `foo.ts`)                                                                                                                                                                                                                |
| `**/*.integration.test.{ts,tsx}`              | `local/no-call-argument-assertion`: `toHaveBeenCalledWith`, `toHaveBeenNthCalledWith`, `toHaveBeenLastCalledWith`, `toHaveBeenCalledExactlyOnceWith` and the aliases `toBeCalledWith`, `nthCalledWith`, `lastCalledWith` in any chain (`not.`, `resolves.`, computed), plus `mock.calls`/`mock.lastCall` reads, destructured ones included; `toHaveBeenCalled(Times)` and `mock.results` pass |
| Production TypeScript, minus `testSetupFiles` | `local/no-production-mock`: `vi.mock`/`vi.doMock` on the global `vi`/`vitest` or on `vi`/`vitest` imported from `vitest` (renamed included), reached through a `vitest` namespace import (`v.vi.mock`), or destructured (`const { doMock } = vi`); a local `vi` passes                                                                                                                        |

The console selectors sit in the test-file `no-restricted-syntax` block next to the package, `restrictedSyntax` and fixture selectors. The HTTP-mock ban is a local rule, so a consumer's own `no-restricted-imports` block on test files never replaces it. `local/test-colocation` takes `ignores`, globs matched against the path relative to the ESLint working directory; it reads each folder through the shared two-second filesystem cache.

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

## zoroskr-check-deps

Skill `dependency-bumps`. A bin for CI or a pre-commit hook in an npm project that installs `@zoroskr/config`. `--no` keeps npm from downloading a package when the bin is not installed:

```sh
npm exec --no -- zoroskr-check-deps --base origin/main
npm exec --no -- zoroskr-check-deps --base origin/main --prefix functions
```

It reads `<prefix>/package.json` and `<prefix>/package-lock.json` (`--prefix` defaults to `.`, relative to the working directory) from the working tree and `<prefix>/package.json` at `--base` (`git show`), then reports:

- Every dependency in `dependencies`, `devDependencies` or `optionalDependencies` whose name is in none of those sections at base, unless its spec is an exact version (`1.2.3`, `1.2.3-beta.1`); ranges (`^`, `~`, `>`, `<`, `*`, `x`, `||`, `-`, partial versions such as `1.2`), `=1.2.3` and tags such as `latest` are rejected. A dependency moved between sections or kept from base keeps its range. When the manifest does not exist at base, every dependency is new and must be an exact version.
- Every dependency in those sections whose `packages[""]` entry in the lockfile, in the same section, differs from the manifest spec or is missing; every entry in those sections of `packages[""]` that the manifest lacks in the same section (a removed dependency left in the lock); and a missing lockfile.

Each problem is one line ending with ``See skill `dependency-bumps`.`` on stdout, with exit code 1; no problem exits 0. A missing `--base`, an unknown option or argument, an unknown ref or a missing `package.json` exits 2 with the reason on stderr.

## Development

```sh
npm test
npm run lint
```
