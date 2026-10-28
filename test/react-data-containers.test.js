import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const SKILL = /See skill `react-data-containers`\.$/;
const query = { query: true };

const PLACEMENT = 'Call query hooks only in a `*Container.tsx` or a Context Provider; move this query into a Container. See skill `react-data-containers`.';
const WRAPPER = 'Never wrap a query in a custom `use*` hook; call it in the Container that renders the data. See skill `react-data-containers`.';
const MULTIPLE = 'One query per Container; move each extra resource into a sibling Container. See skill `react-data-containers`.';
const IS_LOADING = 'Use `isPending`, never `isLoading`, from query and mutation results. See skill `react-data-containers`.';
const MISSING_PENDING = 'Render the pending state first: `if (isPending) return <XSkeleton />;`. See skill `react-data-containers`.';
const PENDING_SKELETON = 'The `isPending` branch returns a dedicated `*Skeleton` element. See skill `react-data-containers`.';
const PENDING_OR = 'Never combine `isPending` with other checks in `||`; pending, error and empty each get their own `return`. See skill `react-data-containers`.';
const MISSING_ERROR = 'Render the error state after pending: `if (isError) return <Error … />;`. See skill `react-data-containers`.';
const ERROR_ORDER = 'Check `isPending` before `isError`. See skill `react-data-containers`.';
const errorComponent = name => `The \`isError\` branch returns the shared \`<${name} />\` error component. See skill \`react-data-containers\`.`;
const INLINE_PROPS = 'Do not pass an inline object literal to a component prop; build `const props` first. See skill `react-data-containers`.';
const FILTERS = 'Do not declare a plural `use*Filters` hook; compose the single-purpose URL filter hooks in the Container. See skill `react-data-containers`.';
const OVERLOAD = 'Do not overload `use*` hooks; create a dedicated hook. See skill `react-data-containers`.';
const PAGINATION = 'Do not declare `totalPages`, `startItem` or `endItem` in a Container; take `page` and `pageSize` from the pagination hook and let the pagination components derive the rest. See skill `react-data-containers`.';
const EFFECT_MUTATION = 'Do not call a mutation\'s `mutate`/`mutateAsync` (renamed included) directly in a `useEffect`/`useLayoutEffect` callback; fire it from an event handler. See skill `react-data-containers`.';

async function lint(file, code, options = query) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2 && SKILL.test(message.message));
}

const queryLine = '  const { data, isPending, isError, error, refetch, isRefetching } = api.items.list.useQuery();\n';
const pendingBranch = '  if (isPending) {\n    return <ItemsSkeleton />;\n  }\n';
const errorBranch = '  if (isError) {\n    return <Error error={error.message} onRetry={() => void refetch()} isRefetching={isRefetching} />;\n  }\n';
const render = '  return <Items items={data.items} />;\n';
const container = (...lines) => `export function ItemsContainer() {\n${lines.join('')}}\n`;
const valid = container(queryLine, pendingBranch, errorBranch, render);
const containerFile = 'src/items/ItemsContainer.tsx';
const withProps = jsx => container(queryLine, pendingBranch, errorBranch, `  return ${jsx};\n`);
const reactImport = 'import { useEffect } from \'react\';\n\n';
const effect = (setup, body) => `${reactImport}export function Seen({ id }: { id: string }) {\n${setup}  useEffect(() => {\n${body}  }, [id]);\n  return null;\n}\n`;
const mutationLine = '  const { mutate } = api.items.seen.useMutation();\n';

const rejected = [
  ['src/items/Items.tsx', 'export function Items() {\n  const { data } = api.items.list.useQuery();\n  return data;\n}\n', [PLACEMENT]],
  ['src/items/Items.tsx', 'export function Items() {\n  const { data } = trpc.useSuspenseInfiniteQuery();\n  return data;\n}\n', [PLACEMENT]],
  ['src/items/items.ts', 'export function load() {\n  const { data } = api.items.list.useInfiniteQuery({});\n  return data;\n}\n', [PLACEMENT]],
  ['src/items/Items.tsx', 'import { useQuery } from \'@tanstack/react-query\';\n\nexport function Items() {\n  const { data } = useQuery(options);\n  return data;\n}\n', [PLACEMENT]],
  ['src/items/Items.tsx', 'import { useSuspenseQuery as useData } from \'@tanstack/react-query\';\n\nexport function Items() {\n  const { data } = useData(options);\n  return data;\n}\n', [PLACEMENT]],
  ['src/items/use-items.ts', 'export function useItems() {\n  const { data } = api.items.list.useQuery();\n  return data;\n}\n', [WRAPPER]],
  ['src/items/use-items.ts', 'export const useItems = () => api.items.list.useQuery();\n', [WRAPPER]],
  ['src/items/use-items.ts', 'import { useInfiniteQuery } from \'@tanstack/react-query\';\n\nexport const useItems = function () {\n  const { data } = useInfiniteQuery(options);\n  return data;\n};\n', [WRAPPER]],
  [containerFile, `function useItems() {\n  const { data } = api.items.list.useSuspenseQuery();\n  return data;\n}\n\nexport function ItemsContainer() {\n  const data = useItems();\n  return <Items items={data} />;\n}\n`, [WRAPPER]],
  ['src/auth/AuthProvider.tsx', 'export function useSession() {\n  const { data } = api.auth.session.useSuspenseQuery();\n  return data;\n}\n', [WRAPPER]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const { data: users } = api.users.list.useSuspenseQuery();\n', '  return <Items items={data.items} users={users} />;\n'), [MULTIPLE]],
  [containerFile, valid, [PLACEMENT], { query: { containers: ['**/*.container.tsx'] } }],
  ['src/auth/session.provider.tsx', 'export function SessionProvider() {\n  const { data } = api.auth.session.useSuspenseQuery();\n  return <Context value={data} />;\n}\n', [PLACEMENT]],
  ['src/items/Save.tsx', 'export function Save() {\n  const { mutate, isLoading } = api.items.create.useMutation();\n  return <button disabled={isLoading} onClick={() => mutate()} />;\n}\n', [IS_LOADING]],
  ['src/items/Save.tsx', 'import { useMutation as useSave } from \'@tanstack/react-query\';\n\nexport function Save() {\n  const { mutate, isLoading: saving } = useSave(options);\n  return <button disabled={saving} onClick={() => mutate()} />;\n}\n', [IS_LOADING]],
  ['src/items/save.ts', 'export function saving() {\n  return api.items.create.useMutation().isLoading;\n}\n', [IS_LOADING]],
  [containerFile, container('  const { data, isLoading, isPending, isError, error, refetch, isRefetching } = api.items.list.useQuery();\n', pendingBranch, errorBranch, render), [IS_LOADING]],
  [containerFile, container(queryLine, errorBranch, render), [MISSING_PENDING]],
  [containerFile, container('  const { data } = api.items.list.useQuery();\n', render), [MISSING_PENDING, MISSING_ERROR]],
  [containerFile, container(queryLine, errorBranch, pendingBranch, render), [ERROR_ORDER]],
  [containerFile, container(queryLine, pendingBranch, render), [MISSING_ERROR]],
  [containerFile, container(queryLine, '  if (isPending || data == null) {\n    return <ItemsSkeleton />;\n  }\n', errorBranch, render), [PENDING_OR]],
  [containerFile, container(queryLine, '  if (isPending) {\n    return <div>Loading</div>;\n  }\n', errorBranch, render), [PENDING_SKELETON]],
  [containerFile, container(queryLine, '  if (isPending) {\n    return null;\n  }\n', errorBranch, render), [PENDING_SKELETON]],
  [containerFile, container(queryLine, pendingBranch, '  if (isError) {\n    return <p>{error.message}</p>;\n  }\n', render), [errorComponent('Error')]],
  [containerFile, valid, [errorComponent('ErrorView')], { query: { errorComponent: 'ErrorView' } }],
  [containerFile, container('  const { data, isPending: loading, isError, error, refetch, isRefetching } = api.items.list.useInfiniteQuery({});\n', '  if (isPending) {\n    return <ItemsSkeleton />;\n  }\n', errorBranch, render), [MISSING_PENDING]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  return <Items filters={{ status: data.status }} />;\n'), [INLINE_PROPS]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  return <UI.Table config={{ rows: data.items }} />;\n'), [INLINE_PROPS]],
  ['src/items/use-item-filters.ts', 'export function useItemFilters() {\n  return 1;\n}\n', [FILTERS], {}],
  ['src/items/use-item-filters.ts', 'export const useItemFilters = () => 1;\n', [FILTERS], {}],
  ['src/items/use-item-filters.ts', 'export default function useItemFilters() {\n  return 1;\n}\n', [FILTERS], {}],
  ['src/hooks/use-value.ts', 'export function useValue(value: string): string;\nexport function useValue(value: number): number;\nexport function useValue(value: unknown) {\n  return value;\n}\n', [OVERLOAD, OVERLOAD], {}],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const totalPages = Math.ceil(data.totalItems / 10);\n', '  return <Items items={data.items} totalPages={totalPages} />;\n'), [PAGINATION]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const { startItem, endItem = 0 } = data.range;\n', '  return <Items start={startItem} end={endItem} />;\n'), [PAGINATION, PAGINATION]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const [totalPages] = data.pages;\n', '  return <Items pages={totalPages} />;\n'), [PAGINATION]],
  ['src/items/Seen.tsx', effect(mutationLine, '    mutate({ id });\n'), [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', 'import React from \'react\';\n\nexport function Seen() {\n  const { mutateAsync } = api.items.seen.useMutation();\n  React.useEffect(() => {\n    if (ready) {\n      void mutateAsync();\n    }\n  }, [mutateAsync]);\n  return null;\n}\n', [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', 'import * as React from \'react\';\n\nexport function Seen() {\n  const seen = api.items.seen.useMutation();\n  React.useEffect(() => {\n    void seen.mutateAsync();\n  }, [seen]);\n  return null;\n}\n', [EFFECT_MUTATION]],
  ['src/items/Seen.test.tsx', effect(mutationLine, '    mutate({ id });\n'), [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', effect('  const { mutate: markSeen } = api.items.seen.useMutation();\n', '    markSeen({ id });\n'), [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', effect('  const { mutateAsync: save = noop } = api.items.seen.useMutation();\n', '    void save({ id });\n'), [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', 'import { useMutation as useSave } from \'@tanstack/react-query\';\nimport { useLayoutEffect } from \'react\';\n\nexport function Seen() {\n  const { mutateAsync: save } = useSave(options);\n  useLayoutEffect(() => {\n    void save();\n  }, [save]);\n  return null;\n}\n', [EFFECT_MUTATION]],
  ['src/items/Seen.tsx', 'import { useEffect as useMount } from \'react\';\n\nexport function Seen() {\n  const { mutate } = api.items.seen.useMutation() satisfies Seen;\n  useMount(function () {\n    mutate();\n  }, [mutate]);\n  return null;\n}\n', [EFFECT_MUTATION]],
  ['src/items/use-items.ts', 'export const useItems = (() => api.items.list.useQuery()) satisfies () => unknown;\n', [WRAPPER]],
  ['src/items/use-items.ts', 'export const useItems = (function () {\n  return api.items.list.useQuery();\n}) as Hook;\n', [WRAPPER]],
  ['src/items/use-items.ts', 'export const useItems = (() => api.items.list.useQuery())!;\n', [WRAPPER]],
  ['src/items/use-items.ts', 'export const useItems = <Hook>(() => api.items.list.useQuery());\n', [WRAPPER]],
  ['src/items/hooks.ts', 'export const hooks = {\n  useItems() {\n    return api.items.list.useQuery();\n  },\n};\n', [WRAPPER]],
  ['src/items/hooks.ts', 'export const hooks = {\n  useItems: () => api.items.list.useQuery(),\n};\n', [WRAPPER]],
  ['src/items/hooks.ts', 'export const hooks = {\n  \'useItems\': (() => api.items.list.useQuery()) satisfies Hook,\n};\n', [WRAPPER]],
  [containerFile, withProps('isPending || isRefetching ? <ItemsSkeleton /> : <Items items={data.items} />'), [PENDING_OR]],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  if ((isRefetching || isPending) && data.items.length === 0) {\n    return <ItemsSkeleton />;\n  }\n', render), [PENDING_OR]],
  [containerFile, withProps('<Items filters={{ status: data.status } satisfies Filters} />'), [INLINE_PROPS]],
  [containerFile, withProps('<Items filters={{ status: \'open\' } as const} />'), [INLINE_PROPS]],
  [containerFile, withProps('<Items filters={isRefetching ? { status: \'open\' } : { status: \'closed\' }} />'), [INLINE_PROPS, INLINE_PROPS]],
  [containerFile, withProps('<Items filters={isRefetching && { status: \'open\' }} />'), [INLINE_PROPS]],
  [containerFile, withProps('<Items {...{ config: { rows: data.items } }} />'), [INLINE_PROPS]],
  [containerFile, withProps('<UI.Table {...{ items: data.items, ...{ config: { rows: data.items } } }} />'), [INLINE_PROPS]],
  ['src/hooks/use-filters.ts', 'export const useFilters = () => 1;\n', [FILTERS], {}],
  ['src/hooks/use-filters.ts', 'export function useFilters() {\n  return 1;\n}\n', [FILTERS], {}],
  ['src/items/use-item-filters.ts', 'export const useItemFilters = (() => 1) satisfies () => number;\n', [FILTERS], {}],
  ['src/items/use-item-filters.ts', 'export const useItemFilters = (function () {\n  return 1;\n}) as Hook;\n', [FILTERS], {}],
];

for (const [file, code, messages, options] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    const reported = await lint(file, code, options);
    assert.deepEqual(reported.map(message => message.message), messages, JSON.stringify(reported));
  });
}

const accepted = [
  [containerFile, valid],
  [containerFile, container(queryLine, '  if (isPending) return <ItemsSkeleton />;\n', '  if (isError) return <Error error={error.message} onRetry={() => void refetch()} isRefetching={isRefetching} />;\n', render)],
  [containerFile, container('  const { data, isPending, isError, error, refetch, isRefetching } = api.items.list.useInfiniteQuery({});\n', pendingBranch, errorBranch, '  if (data.pages.length === 0) {\n    return <ItemsEmpty />;\n  }\n', render)],
  [containerFile, container('  const { data } = api.items.list.useSuspenseQuery();\n', render)],
  ['src/items/items.container.tsx', valid, { query: { containers: ['**/*.container.tsx'] } }],
  [containerFile, container(queryLine, pendingBranch, '  if (isError) {\n    return <ErrorView error={error.message} />;\n  }\n', render), { query: { errorComponent: 'ErrorView' } }],
  ['src/auth/AuthProvider.tsx', 'export function AuthProvider({ children }: Props) {\n  const { data } = api.auth.session.useQuery();\n  const { data: roles } = api.auth.roles.useQuery();\n  return <Context value={{ data, roles }}>{children}</Context>;\n}\n'],
  ['src/auth/session.provider.tsx', 'export function SessionProvider() {\n  const { data } = api.auth.session.useSuspenseQuery();\n  return <Context value={data} />;\n}\n', { query: { providers: ['**/*.provider.tsx'] } }],
  ['src/items/Items.tsx', 'function useQuery() {\n  return { data: 1 };\n}\n\nexport function Items() {\n  const { data } = useQuery();\n  return data;\n}\n'],
  ['src/items/Items.tsx', 'import { useQuery } from \'./hooks\';\n\nexport function Items() {\n  const { data } = useQuery();\n  return data;\n}\n'],
  ['src/items/Items.tsx', 'import { useQueryClient } from \'@tanstack/react-query\';\n\nexport function Items() {\n  const client = useQueryClient();\n  return client;\n}\n'],
  ['src/items/Items.tsx', 'export function Items() {\n  const { data } = api.items.list.useQuery();\n  return data;\n}\n', {}],
  ['src/items/Items.test.tsx', 'export function Items() {\n  const { data } = api.items.list.useQuery();\n  return data;\n}\n'],
  ['src/items/Save.tsx', 'export function Save() {\n  const { mutate, isPending } = api.items.create.useMutation();\n  return <button disabled={isPending} onClick={() => mutate()} />;\n}\n'],
  ['src/items/use-save.ts', 'export function useSaveWorkflow() {\n  const { mutateAsync } = api.items.create.useMutation();\n  return mutateAsync;\n}\n'],
  ['src/items/Session.tsx', 'export function Session() {\n  const { isLoading } = useSession();\n  return isLoading;\n}\n'],
  ['src/items/Save.tsx', 'function useMutation() {\n  return { isLoading: false };\n}\n\nexport function Save() {\n  const { isLoading } = useMutation();\n  return isLoading;\n}\n'],
  ['src/items/Save.tsx', 'export function Save() {\n  const { mutate, isLoading } = api.items.create.useMutation();\n  return <button disabled={isLoading} onClick={() => mutate()} />;\n}\n', {}],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  return <div style={{ color: \'red\' }}><Items items={data.items} /></div>;\n')],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  return <Items style={{ color: \'red\' }} items={data.items} />;\n')],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const props: React.ComponentProps<typeof Items> = { items: data.items };\n', '  return <Items {...props} />;\n')],
  ['src/items/Items.tsx', 'export function Items() {\n  return <List filters={{ status: \'open\' }} />;\n}\n'],
  ['src/hooks/use-search-filter.ts', 'export function useSearchFilter() {\n  return 1;\n}\n', {}],
  ['src/hooks/use-enum-filter.ts', 'export const useEnumFilter = () => 1;\n', {}],
  ['src/hooks/use-filters.ts', 'export const useFiltersCount = () => 1;\n', {}],
  ['src/items/filters.ts', 'export const itemFilters = { status: \'open\' };\n', {}],
  ['src/items/parse.ts', 'export function parse(value: string): string;\nexport function parse(value: number): number;\nexport function parse(value: unknown) {\n  return value;\n}\n', {}],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const { page, pageSize, goToPage } = usePagination();\n', '  return <PageButtons currentPage={page} pageSize={pageSize} totalItems={data.totalItems} onPageClick={goToPage} />;\n')],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  return <PageButtons totalPages={data.totalPages} />;\n')],
  ['src/items/Pages.tsx', 'export function Pages({ totalItems }: Props) {\n  const totalPages = Math.ceil(totalItems / 10);\n  return totalPages;\n}\n'],
  ['src/items/Seen.tsx', 'export function Seen({ id }: { id: string }) {\n  const { mutate } = api.items.seen.useMutation();\n  return <button onClick={() => mutate({ id })} />;\n}\n'],
  ['src/items/Seen.tsx', 'export function Seen() {\n  useEffect(() => {\n    track();\n  }, []);\n  return null;\n}\n'],
  ['src/items/Seen.tsx', 'export function Seen() {\n  useEffect(() => {\n    mutate();\n  }, []);\n  return null;\n}\n', {}],
  ['src/items/Seen.tsx', effect(mutationLine, '    const onFocus = () => mutate({ id });\n    window.addEventListener(\'focus\', onFocus);\n    return () => window.removeEventListener(\'focus\', onFocus);\n')],
  ['src/items/Seen.tsx', effect(mutationLine, '    const timer = setTimeout(() => mutate({ id }), 100);\n    return () => clearTimeout(timer);\n')],
  ['src/items/Seen.tsx', effect('  const { mutateAsync: save } = api.items.seen.useMutation();\n', '    void load().then(() => save({ id }));\n')],
  ['src/items/Seen.tsx', effect('  const { mutate } = useSWR(id);\n', '    void mutate();\n')],
  ['src/items/Seen.tsx', `import { mutate } from 'swr';\n${effect('', '    void mutate(id);\n')}`],
  ['src/items/Seen.tsx', effect('  const { reset } = api.items.seen.useMutation();\n', '    reset();\n')],
  ['src/items/Seen.tsx', `import { useEffect } from './effects';\n\nexport function Seen() {\n${mutationLine}  useEffect(() => {\n    mutate();\n  }, [mutate]);\n  return null;\n}\n`],
  ['src/items/Seen.tsx', `import { useMutation } from './mutations';\n${effect('  const { mutate } = useMutation();\n', '    mutate();\n')}`],
  ['src/auth/AuthProvider.tsx', 'export const AuthProvider = (({ children }: Props) => {\n  const { data } = api.auth.session.useQuery();\n  return <Context value={data}>{children}</Context>;\n}) satisfies FC<Props>;\n'],
  ['src/auth/AuthProvider.tsx', 'export const providers = {\n  session: () => api.auth.session.useQuery(),\n};\n'],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const busy = isPending || isRefetching;\n', '  return <Items items={data.items} busy={busy} />;\n')],
  [containerFile, withProps('<Items items={data.items} busy={isPending || isRefetching} />')],
  [containerFile, container(queryLine, pendingBranch, errorBranch, '  const label = isPending || isRefetching ? \'a\' : \'b\';\n', '  return <Items items={data.items} label={label} />;\n')],
  [containerFile, withProps('<Items items={data.items} style={isRefetching ? { opacity: 0.5 } : undefined} />')],
  [containerFile, withProps('<div data-items={{ a: 1 } as const}><Items items={data.items} /></div>')],
  [containerFile, withProps('<Items {...{ items: data.items }} />')],
  [containerFile, withProps('<Items {...{ style: { color: \'red\' } }} items={data.items} />')],
];

for (const [file, code, options] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    assert.deepEqual(await lint(file, code, options), []);
  });
}

async function restrictedSyntaxMessages(file, code, options) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, file) });
  return result.messages.filter(message => message.ruleId === 'no-restricted-syntax').map(message => message.message);
}

test('the container block keeps the package, production and restrictedSyntax selectors', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const code = container(queryLine, pendingBranch, errorBranch, '  const forbiddenName = data as Items;\n', '  void import(\'./b\');\n', '  const totalPages = 1;\n', '  return <Items items={forbiddenName} pages={totalPages} />;\n');
  const messages = await restrictedSyntaxMessages(containerFile, code, { query: true, restrictedSyntax });
  assert.ok(messages.some(message => message.includes('type assertions')), JSON.stringify(messages));
  assert.ok(messages.some(message => message.includes('lazy loader')), JSON.stringify(messages));
  assert.ok(messages.includes('Project-specific restriction.'), JSON.stringify(messages));
  assert.ok(messages.includes(PAGINATION), JSON.stringify(messages));
});

test('the query rules join the layer blocks', async () => {
  const code = `${reactImport}export function run() {\n${mutationLine}  useEffect(() => {\n    mutate();\n  }, [mutate]);\n  throw new Error('x');\n}\n`;
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr({ query: true, layeredBackend: true }) });
  const [result] = await eslint.lintText(code, { filePath: join(app, 'src/a.service.ts') });
  const messages = result.messages.map(message => message.message);
  assert.ok(messages.includes(EFFECT_MUTATION), JSON.stringify(messages));
  assert.ok(messages.some(message => message.includes('TRPCError')), JSON.stringify(messages));
});

test('query-placement reads its globs from the query option', async () => {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr({ query: { containers: ['**/*.container.tsx'], providers: ['**/*.provider.tsx'] } }) });
  const config = await eslint.calculateConfigForFile(join(app, 'src/a.tsx'));
  assert.deepEqual(config.rules['local/query-placement'], [2, { containers: ['**/*.container.tsx'], providers: ['**/*.provider.tsx'] }]);
});
