import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const hygieneRules = new Set(['no-restricted-syntax', 'local/no-process-env', 'local/query-hook-destructuring']);
const SKILL = /See skill `code-hygiene`\.$/;
const ENV_MESSAGE = 'Do not read `process.env`; import `env` from the validated env module and read `env.X`. See skill `code-hygiene`.';
const HOOK_MESSAGE = 'Destructure hook returns at the call site. See skill `code-hygiene`.';
const IMPORT_MESSAGE = 'Do not use `import()` outside a lazy loader (`dynamic(() => import(\'./C\'))`, `lazy(() => import(\'./C\'))`); use a static import and mock the boundary module in the test. See skill `code-hygiene`.';
const query = { query: true };
const adapter = { envFiles: ['/server/env-adapter\\.ts$'] };

async function lint(file, code, options = {}) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2 && hygieneRules.has(message.ruleId));
}

const rejected = [
  ['src/server/a.ts', 'export const key = process.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'export const key = process.env[\'API_KEY\'];\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'export const variables = process[\'env\'];\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { API_KEY } = process.env;\n\nexport const key = API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { env } = process;\n\nexport const key = env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { env: variables } = process;\n\nexport const key = variables.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'export const key = globalThis.process.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { env } = globalThis.process;\n\nexport const key = env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { process: { env } } = globalThis;\n\nexport const key = env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'const { process: runtime } = globalThis;\n\nexport const key = runtime.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/view.tsx', 'export const key = process.env.NEXT_PUBLIC_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/env.ts', 'export const key = process.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE, adapter],
  ['src/server/a.ts', 'import process from \'node:process\';\n\nexport const key = process.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import process from \'process\';\n\nexport const key = process.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import runtime from \'node:process\';\n\nexport const key = runtime.env[\'API_KEY\'];\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import * as runtime from \'node:process\';\n\nexport const key = runtime.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import { default as runtime } from \'process\';\n\nexport const key = runtime.env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import runtime from \'node:process\';\n\nconst { env } = runtime;\n\nexport const key = env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import { env } from \'node:process\';\n\nexport const key = env.API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'import { env as variables } from \'process\';\n\nconst { API_KEY } = variables;\n\nexport const key = API_KEY;\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/server/a.ts', 'export { env } from \'node:process\';\n', 'local/no-process-env', ENV_MESSAGE],
  ['src/a.tsx', 'export function Save() {\n  const mutation = api.post.create.useMutation();\n  return mutation.isPending;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'export function List() {\n  const posts = api.post.list.useQuery();\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'export function List() {\n  const posts = api.post.list.useInfiniteQuery({});\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'export function List() {\n  const posts = api.post.list.useSuspenseQuery();\n  return posts;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'export function List() {\n  const posts = api.post.list.useSuspenseInfiniteQuery({});\n  return posts;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.service.ts', 'export function List() {\n  const posts = api.post.list.useQuery();\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, { ...query, layeredBackend: true }],
  ['src/a.tsx', 'import { useQuery } from \'@tanstack/react-query\';\n\nexport function List() {\n  const posts = useQuery({ queryKey: [\'posts\'], queryFn: load });\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'import { useMutation } from \'@tanstack/react-query\';\n\nexport function Save() {\n  const mutation = useMutation({ mutationFn: save });\n  return mutation.isPending;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'import { useInfiniteQuery } from \'@tanstack/react-query\';\n\nexport function List() {\n  const posts = useInfiniteQuery(options);\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'import { useSuspenseQuery as useData } from \'@tanstack/react-query\';\n\nexport function List() {\n  const posts = useData(options);\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.tsx', 'import { useSuspenseInfiniteQuery } from \'@tanstack/react-query\';\n\nexport function List() {\n  const posts = useSuspenseInfiniteQuery(options);\n  return posts.data;\n}\n', 'local/query-hook-destructuring', HOOK_MESSAGE, query],
  ['src/a.ts', 'export async function load() {\n  const module = await import(\'./b\');\n  return module.value;\n}\n', 'no-restricted-syntax', IMPORT_MESSAGE],
  ['src/a.ts', 'export async function load() {\n  const { value } = await import(\'./b\');\n  return value;\n}\n', 'no-restricted-syntax', IMPORT_MESSAGE],
  ['src/a.repository.ts', 'export async function load() {\n  return (await import(\'./b\')).value;\n}\n', 'no-restricted-syntax', IMPORT_MESSAGE, { layeredBackend: true }],
  ['src/a.ts', 'export async function load() {\n  const value = await import(\'./b\').then(module => module.default);\n  return value;\n}\n', 'no-restricted-syntax', IMPORT_MESSAGE],
  ['src/a.ts', 'export const pending = import(\'./b\');\n', 'no-restricted-syntax', IMPORT_MESSAGE],
  ['src/users.fixtures.ts', 'export async function load() {\n  const module = await import(\'./b\');\n  return module.value;\n}\n', 'no-restricted-syntax', IMPORT_MESSAGE],
];

for (const [file, code, ruleId, message, options] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    const messages = await lint(file, code, options);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, ruleId);
    assert.equal(messages[0].message, message);
    assert.match(messages[0].message, SKILL);
  });
}

const accepted = [
  ['src/server/a.ts', 'import { env } from \'./env\';\n\nexport const key = env.API_KEY;\n'],
  ['src/env.ts', 'export const key = process.env.API_KEY;\n'],
  ['src/server/env-adapter.ts', 'export const key = process.env.API_KEY;\n', adapter],
  ['src/server/a.test.ts', 'export const key = process.env.API_KEY;\n'],
  ['src/server/a.spec.tsx', 'export const key = process.env.API_KEY;\n'],
  ['vitest.config.ts', 'export const key = process.env.API_KEY;\n'],
  ['src/next.config.ts', 'export const key = process.env.API_KEY;\n'],
  ['scripts/seed.ts', 'export const key = process.env.API_KEY;\n'],
  ['src/server/a.js', 'export const key = process.env.API_KEY;\n'],
  ['src/server/a.ts', 'export const read = (process: { env: string }) => process.env;\n'],
  ['src/server/a.ts', 'export const platform = process.platform;\n'],
  ['src/server/a.ts', 'import { platform } from \'node:process\';\n\nexport const os = platform;\n'],
  ['src/server/a.ts', 'import runtime from \'node:process\';\n\nexport const os = runtime.platform;\n'],
  ['src/server/a.ts', 'import process from \'node:process\';\n\nexport const os = process.platform;\nexport const read = (process: { env: string }) => process.env;\n'],
  ['src/server/a.ts', 'import { env } from \'./env\';\n\nexport const read = (env: { KEY: string }) => env.KEY;\n'],
  ['src/server/env.ts', 'import { env } from \'node:process\';\n\nexport const key = env.API_KEY;\n'],
  ['scripts/seed.ts', 'import { env } from \'node:process\';\n\nexport const key = env.API_KEY;\n'],
  ['src/a.tsx', 'export function Save() {\n  const { mutate, isPending } = api.post.create.useMutation();\n  return isPending ? null : mutate;\n}\n', query],
  ['src/a.tsx', 'export function Edit() {\n  const form = useForm();\n  return form;\n}\n', query],
  ['src/a.tsx', 'export function Edit() {\n  const utils = api.useUtils();\n  return utils;\n}\n', query],
  ['src/a.tsx', 'export function Save() {\n  const mutation = api.post.create.useMutation();\n  return mutation.isPending;\n}\n'],
  ['src/a.tsx', 'import { useQuery } from \'@tanstack/react-query\';\n\nexport function List() {\n  const { data } = useQuery({ queryKey: [\'posts\'], queryFn: load });\n  return data;\n}\n', query],
  ['src/a.tsx', 'function useQuery() {\n  return 1;\n}\n\nexport function List() {\n  const value = useQuery();\n  return value;\n}\n', query],
  ['src/a.tsx', 'import { useQuery } from \'./hooks\';\n\nexport function List() {\n  const value = useQuery();\n  return value;\n}\n', query],
  ['src/a.tsx', 'import { useQueryClient } from \'@tanstack/react-query\';\n\nexport function List() {\n  const client = useQueryClient();\n  return client;\n}\n', query],
  ['src/a.tsx', 'import { useQuery } from \'@tanstack/react-query\';\n\nexport function List() {\n  const posts = useQuery({ queryKey: [\'posts\'], queryFn: load });\n  return posts.data;\n}\n'],
  ['src/a.ts', 'export const load = () => import(\'./b\');\n'],
  ['src/a.ts', 'export const load = () => import(\'./b\').then(module => module.default);\n'],
  ['src/a.tsx', 'export const Chart = dynamic(() => import(\'./chart\'));\n'],
  ['src/a.tsx', 'export const Chart = dynamic(() => import(\'./chart\').then(module => module.Chart));\n'],
  ['src/a.tsx', 'export const Chart = lazy(() => import(\'./chart\'));\n'],
  ['scripts/seed.ts', 'export async function load() {\n  const module = await import(\'./b\');\n  return module.value;\n}\n'],
  ['src/a.test.ts', 'export async function load() {\n  const module = await import(\'./b\');\n  return module.value;\n}\n'],
];

for (const [file, code, options] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    assert.deepEqual(await lint(file, code, options), []);
  });
}

test('no-process-env also fires in isomorphic shared files', async () => {
  const messages = await lint('src/shared/a/read.ts', 'export const key = process.env.API_KEY;\n', { isomorphic: true });
  assert.deepEqual(messages.map(message => message.ruleId), ['local/no-process-env']);
});
