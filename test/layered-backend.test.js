import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const layeredRules = new Set(['no-restricted-syntax', 'no-restricted-imports', 'no-console', 'local/require-procedure-output', 'local/service-exports-functions']);

async function lint(file, code, options = { layeredBackend: true }) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, 'src', file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2 && layeredRules.has(message.ruleId));
}

const rejected = [
  ['a.service.ts', 'export function run() {\n  throw new Error(\'x\');\n}\n', 'no-restricted-syntax', /TRPCError/],
  ['a.service.ts', 'import { z } from \'zod\';\n\nexport const parse = (value: unknown) => z.string().parse(value);\n', 'no-restricted-syntax', /Zod schema/],
  ['a.service.ts', 'export type Item = { id: string };\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export interface Item {\n  id: string;\n}\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export const limit = 5;\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export { read } from \'./read\';\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export type { Item } from \'./item.schema\';\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export * from \'./read\';\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'class Service {\n  run() {\n    return 1;\n  }\n}\n\nexport const run = () => new Service().run();\n', 'no-restricted-syntax', /only functions/],
  ['a.service.ts', 'export function update() {\n  const patch: Record<string, unknown> = {};\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.service.ts', 'export function update(patch: Record<string, unknown>) {\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.service.ts', 'export const update = (patch: Record<string, unknown>) => patch;\n', 'no-restricted-syntax', /canonical schema/],
  ['a.service.ts', 'const TOKEN_TTL_MS = 1000;\n\nexport const ttl = () => TOKEN_TTL_MS;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const SESSION_LIFETIME = 1000;\n\nexport const lifetime = () => SESSION_LIFETIME;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const RATE_WINDOW = 60;\n\nexport const window = () => RATE_WINDOW;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const BATCH_CHUNK_SIZE = 400;\n\nexport const size = () => BATCH_CHUNK_SIZE;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const LINK_EXPIRATION_MS = 400;\n\nexport const expiration = () => LINK_EXPIRATION_MS;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const MAX_RETRIES = 3;\n\nexport const retries = () => MAX_RETRIES;\n', 'no-restricted-syntax', /constants file/],
  ['a.service.ts', 'const UPLOAD_MAX_BYTES = 3;\n\nexport const bytes = () => UPLOAD_MAX_BYTES;\n', 'no-restricted-syntax', /constants file/],
  ['a.repository.ts', 'import { z } from \'zod\';\n\nexport const parse = (value: unknown) => z.string().parse(value);\n', 'no-restricted-syntax', /Zod schema/],
  ['a.repository.ts', 'export function update(patch: Record<string, unknown>) {\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.service.ts', 'export function update(params: { id: string; payload: Record<string, unknown> }) {\n  return params;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.repository.ts', 'type Patch = Record<string, unknown>;\n\nexport function update(patch: Patch) {\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.service.ts', 'const value = 1;\n\nexport { value };\n', 'local/service-exports-functions', /exports only functions/],
  ['a.service.ts', 'export default { value: 1 };\n', 'local/service-exports-functions', /exports only functions/],
  ['a.service.ts', 'type Item = { id: string };\n\nexport type { Item };\n', 'local/service-exports-functions', /exports only functions/],
  ['a.service.ts', 'import { read } from \'./a.repository\';\n\nexport { read };\n', 'local/service-exports-functions', /exports only functions/],
  ['a.service.ts', 'const limit = 10;\n\nexport default limit;\n', 'local/service-exports-functions', /exports only functions/],
  ['a.service.ts', 'export function update(patch: { [key: string]: unknown }) {\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.repository.ts', 'type Patch = { [field: string]: unknown };\n\nexport function update(patch: Patch) {\n  return patch;\n}\n', 'no-restricted-syntax', /canonical schema/],
  ['a.repository.ts', 'export function find() {\n  console.error(\'x\');\n}\n', 'no-console', /console/],
  ['a.repository.ts', 'import { TRPCError } from \'@trpc/server\';\n\nexport const error = () => new TRPCError({ code: \'NOT_FOUND\' });\n', 'no-restricted-imports', /trpc-layered-backend/],
  ['a.repository.ts', 'import { run } from \'./run.service\';\n\nexport const find = () => run();\n', 'no-restricted-imports', /trpc-layered-backend/],
  ['a.repository.ts', 'import { run } from \'../services/run\';\n\nexport const find = () => run();\n', 'no-restricted-imports', /trpc-layered-backend/],
  ['a.router.ts', 'export async function get() {\n  try {\n    return await read();\n  } catch {\n    return null;\n  }\n}\n', 'no-restricted-syntax', /thin/],
  ['a.router.ts', 'export function get() {\n  throw new TRPCError({ code: \'NOT_FOUND\' });\n}\n', 'no-restricted-syntax', /thin/],
  ['a.router.ts', 'export const itemRouter = router({ get: procedure.input(input).query(get) });\n', 'local/require-procedure-output', /^Every tRPC procedure declares \.output\(\)\. See skill `trpc-layered-backend`\.$/],
  ['a.router.ts', 'export const itemRouter = router({ save: procedure.use(auth).input(input).mutation(save) });\n', 'local/require-procedure-output', /\.output\(\)/],
  ['a.router.ts', 'export const itemRouter = router({ watch: procedure.subscription(watch) });\n', 'local/require-procedure-output', /\.output\(\)/],
  ['a.schema.ts', 'import { z } from \'zod\';\n\nexport const resultSchema = z.object({ success: z.literal(true) });\n', 'no-restricted-syntax', /z\.void\(\)/],
  ['a.ts', '\'server-only\';\n\nexport const value = 1;\n', 'no-restricted-syntax', /^Use `import 'server-only';` — a bare 'server-only' string is a no-op directive\. See skill `trpc-layered-backend`\.$/],
];

for (const [file, code, ruleId, message] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)} with ${ruleId}`, async () => {
    const messages = await lint(file, code);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, ruleId);
    assert.match(messages[0].message, message);
    if (ruleId !== 'no-console') {
      assert.match(messages[0].message, /trpc-layered-backend/);
    }
  });
}

const accepted = [
  ['a.service.ts', 'function read() {\n  return 1;\n}\n\nexport { read };\n'],
  ['a.service.ts', 'const read = () => 1;\n\nexport { read };\n'],
  ['a.service.ts', 'export default function read() {\n  return 1;\n}\n'],
  ['a.service.ts', 'export function route(status: Status) {\n  const handlers: Record<Status, number> = { on: 1 };\n  return handlers[status];\n}\n'],
  ['a.service.ts', 'import { TRPCError } from \'@trpc/server\';\n\nexport function run() {\n  throw new TRPCError({ code: \'NOT_FOUND\' });\n}\n'],
  ['a.util.ts', 'export function run() {\n  throw new Error(\'x\');\n}\n'],
  ['a.service.ts', 'import { itemSchema } from \'./item.schema\';\n\nexport const parse = (value: unknown) => itemSchema.parse(value);\n'],
  ['a.service.ts', 'type Item = { id: string };\n\nexport function read(item: Item) {\n  return item.id;\n}\n'],
  ['a.service.ts', 'export const read = () => 1;\n\nexport const write = function () {\n  return 2;\n};\n'],
  ['a.service.ts', 'import type { ItemPatch } from \'./item.schema\';\n\nexport function update(patch: ItemPatch) {\n  const next: ItemPatch = patch;\n  return next;\n}\n'],
  ['a.service.ts', 'const pageTitle = \'Items\';\n\nexport function retries() {\n  const MAX_RETRIES = 3;\n  return pageTitle.repeat(MAX_RETRIES);\n}\n'],
  ['a.repository.ts', 'import { db } from \'./db\';\n\nexport const find = (id: string) => db.collection(\'items\').doc(id).get();\n'],
  ['a.router.ts', 'export const itemRouter = router({ get: procedure.input(input).output(output).query(get) });\n'],
  ['a.router.ts', 'export const itemRouter = router({ save: procedure.output(output).use(auth).input(input).mutation(save) });\n'],
  ['a.schema.ts', 'import { z } from \'zod\';\n\nexport const resultSchema = z.object({ id: z.string(), status: z.literal(\'open\') });\n'],
  ['a.ts', 'import \'server-only\';\n\nexport const value = 1;\n'],
];

for (const [file, code] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code), []);
  });
}

test('layeredBackend is off by default and emits no layer blocks', async () => {
  const names = (await zoroskr()).map(config => config.name ?? '');
  assert.equal(names.some(name => name.startsWith('zoroskr/layered-backend')), false);
  for (const [file, code, ruleId] of rejected.filter(([file]) => file !== 'a.ts')) {
    assert.deepEqual((await lint(file, code, {})).filter(message => message.ruleId === ruleId && message.message.includes('trpc-layered-backend')), [], code);
  }
});

test('layeredBackend true emits one named block per layer', async () => {
  const names = (await zoroskr({ layeredBackend: true })).map(config => config.name ?? '');
  for (const layer of ['services', 'repositories', 'routers', 'schemas']) {
    assert.ok(names.includes(`zoroskr/layered-backend/${layer}`), layer);
  }
});

test('the server-only directive is rejected with layeredBackend off', async () => {
  const messages = await lint('a.ts', '\'server-only\';\n\nexport const value = 1;\n', {});
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /import 'server-only'/);
});

test('base and extra restricted syntax still fire inside layer files', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const code = 'export function read(value: unknown) {\n  const forbiddenName = value as string;\n  return forbiddenName;\n}\n';
  for (const file of ['a.service.ts', 'a.repository.ts', 'a.router.ts', 'a.schema.ts']) {
    const messages = (await lint(file, code, { layeredBackend: true, restrictedSyntax })).map(message => message.message);
    assert.ok(messages.some(message => message.includes('typescript-strict')), file);
    assert.ok(messages.includes('Project-specific restriction.'), file);
  }
});

test('layeredBackend accepts glob overrides and keeps the other defaults', async () => {
  const options = { layeredBackend: { services: '**/services/*.ts' } };
  const code = 'export function run() {\n  throw new Error(\'x\');\n}\n';
  assert.equal((await lint('services/a.ts', code, options)).length, 1);
  assert.deepEqual(await lint('a.service.ts', code, options), []);
  assert.equal((await lint('a.repository.ts', 'export function find() {\n  console.log(\'x\');\n}\n', options)).length, 1);
});

test('later user configs still override layer rules', async () => {
  const eslint = new ESLint({
    cwd: app,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ layeredBackend: true }, { files: ['**/*.router.ts'], rules: { 'local/require-procedure-output': 'off' } }),
  });
  const [result] = await eslint.lintText('export const itemRouter = router({ get: procedure.query(get) });\n', { filePath: join(app, 'src/a.router.ts') });
  assert.equal(result.messages.some(message => message.ruleId === 'local/require-procedure-output'), false);
});
