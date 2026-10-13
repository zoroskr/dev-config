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

| Option         | Default | Effect                                                                                   |
| -------------- | ------- | ---------------------------------------------------------------------------------------- |
| `tsconfigPath` | none    | Enables type-aware rules (`strict-boolean-expressions`, `no-unnecessary-condition`, ...) |
| `react`        | `true`  | React rules and `jsx-a11y`                                                               |
| `query`        | `false` | TanStack Query rules                                                                     |
| `tailwind`     | `false` | Tailwind rules; pass an object to set `settings.tailwindcss`                             |
| `i18n`         | `false` | Warns on literal strings in JSX and UI objects                                           |

What it enforces:

- No comments, JSDoc included. Only tooling directives pass (`eslint-disable`, `@ts-expect-error`, `/// <reference>`, `organize-imports-ignore`).
- No type assertions except `as const`, and no annotated function return types.
- No `any`, no non-null `!`, `type` over `interface`, type-only imports.
- Strict boolean expressions without nullable or string/number shortcuts.
- Security and secret-detection rules as warnings.

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
