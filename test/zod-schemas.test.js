import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const zodRules = new Set(['no-restricted-syntax', 'local/isomorphic-boundary', 'local/no-schema-default', 'local/no-types-file', 'local/no-inline-zod-infer', 'local/no-zod-message-param']);
const isomorphicRules = new Set(['local/isomorphic-boundary', 'local/no-schema-default']);
const isomorphic = { isomorphic: true };
const forbidFirebase = { isomorphic: { forbiddenImports: ['firebase-admin', 'firebase-admin/*'] } };
const layered = { layeredBackend: true };

async function lintWith(file, code, options, ...userConfigs) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options, ...userConfigs) });
  const [result] = await eslint.lintText(code, { filePath: join(app, 'src', file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, options = isomorphic) {
  return (await lintWith(file, code, options)).filter(message => zodRules.has(message.ruleId));
}

const zodSchema = 'import { z } from \'zod\';\n\n';
const sharedSchema = 'shared/a/schemas/a.schema.ts';

const rejected = [
  ['shared/a/read.ts', 'import fs from \'node:fs\';\n\nexport const read = () => fs.readFileSync(\'a\');\n', 'local/isomorphic-boundary', /Node builtin `node:fs`/],
  ['shared/a/read.ts', 'import { join } from \'path\';\n\nexport const path = () => join(\'a\', \'b\');\n', 'local/isomorphic-boundary', /Node builtin `path`/],
  ['shared/a/read.ts', 'import { readFile } from \'fs/promises\';\n\nexport const read = () => readFile(\'a\');\n', 'local/isomorphic-boundary', /Node builtin `fs\/promises`/],
  ['shared/a/read.ts', 'import { Buffer } from \'node:buffer\';\n\nexport const bytes = () => Buffer.from(\'a\');\n', 'local/isomorphic-boundary', /Node builtin/],
  ['shared/a/read.ts', 'import \'server-only\';\n\nexport const value = 1;\n', 'local/isomorphic-boundary', /`server-only`/],
  ['shared/a/read.ts', 'export { readFile } from \'node:fs/promises\';\n', 'local/isomorphic-boundary', /Node builtin/],
  ['shared/a/read.ts', 'export * from \'node:path\';\n', 'local/isomorphic-boundary', /Node builtin/],
  ['shared/a/read.ts', 'export const load = () => import(\'node:fs\');\n', 'local/isomorphic-boundary', /Node builtin/],
  ['shared/a/read.ts', 'export const key = process.env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'export const key = process.env[\'API_KEY\'];\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'const { env } = process;\n\nexport const key = env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'const { env: variables } = process;\n\nexport const key = variables.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/view.tsx', 'export const View = () => <div><span>a</span></div>;\n', 'local/isomorphic-boundary', /JSX/],
  ['shared/a/view.tsx', 'export const View = () => <></>;\n', 'local/isomorphic-boundary', /JSX/],
  ['shared/a/read.ts', 'import { getFirestore } from \'firebase-admin/firestore\';\n\nexport const db = () => getFirestore();\n', 'local/isomorphic-boundary', /`firebase-admin\/firestore`/, forbidFirebase],
  ['shared/a/read.ts', 'import admin from \'firebase-admin\';\n\nexport const app = () => admin.app();\n', 'local/isomorphic-boundary', /`firebase-admin`/, forbidFirebase],
  ['shared/a/read.ts', 'export const load = () => import(\'firebase-admin/auth\');\n', 'local/isomorphic-boundary', /`firebase-admin\/auth`/, forbidFirebase],
  [sharedSchema, `${zodSchema}export const aSchema = z.object({ name: z.string().default('x') });\n`, 'local/no-schema-default', /\.default\(\)/],
  ['shared/a/a.schema.ts', `${zodSchema}export const aSchema = z.object({ name: z.string().default('x') });\n`, 'local/no-schema-default', /\.default\(\)/],
  ['shared/a/schemas/index.ts', `${zodSchema}export const aSchema = z.string().default('x');\n`, 'local/no-schema-default', /\.default\(\)/],
  [sharedSchema, `${zodSchema}export const listAOutputSchema = z.object({ limit: z.number().default(20) });\n`, 'local/no-schema-default', /\.default\(\)/],
  [sharedSchema, `${zodSchema}export function build() {\n  const aInputSchema = z.string().default('x');\n  return aInputSchema;\n}\n`, 'local/no-schema-default', /\.default\(\)/],
  [sharedSchema, `${zodSchema}export const aSchema = z.object({ name: z.string().prefault('x') });\n`, 'local/no-schema-default', /\.prefault\(\)/],
  [sharedSchema, `${zodSchema}export const listAOutputSchema = z.object({ limit: z.number().prefault(20) });\n`, 'local/no-schema-default', /\.prefault\(\)/],
  ['feature/types.ts', 'export type A = { id: string };\n', 'local/no-types-file', /`types\.ts`/],
  ['feature/user.types.ts', 'export type A = { id: string };\n', 'local/no-types-file', /`types\.ts`/],
  ['feature/types.tsx', 'export type A = { id: string };\n', 'local/no-types-file', /`types\.ts`/],
  ['feature/view.types.tsx', 'export type A = { id: string };\n', 'local/no-types-file', /`types\.ts`/],
  ['feature/a.ts', 'import type { AppRouter } from \'./root\';\n\nexport type Outputs = inferRouterOutputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type { AppRouter } from \'./root\';\n\nexport type Inputs = inferRouterInputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type { inferRouterOutputs as Outputs } from \'@trpc/server\';\nimport type { AppRouter } from \'./root\';\n\nexport type RouterOutputs = Outputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type { inferRouterInputs as Inputs } from \'@trpc/server\';\nimport type { AppRouter } from \'./root\';\n\nexport type RouterInputs = Inputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type * as trpc from \'@trpc/server\';\nimport type { AppRouter } from \'./root\';\n\nexport type Outputs = trpc.inferRouterOutputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type * as trpc from \'@trpc/server\';\nimport type { AppRouter } from \'./root\';\n\nexport type Inputs = trpc.inferRouterInputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', `${zodSchema}export const name = z.string().min(1, { message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', `${zodSchema}export const email = z.email({ message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', `${zodSchema}export const name = z.string({ message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', `${zodSchema}export const name = z.string().refine(value => value.length > 0, { message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ id: z.string() }, { message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', 'import * as zod from \'zod\';\n\nexport const name = zod.string({ \'message\': \'x\' });\n', 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', 'import { string } from \'zod\';\n\nexport const name = string().max(3, { message: \'x\' });\n', 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.tsx', `${zodSchema}export const name = z.string().trim().min(1, { message: 'x' });\n`, 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', 'import { object as obj, string } from \'zod\';\n\nexport const item = obj({ message: string() }, { message: \'x\' });\n', 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', 'import { string as text } from \'zod\';\n\nexport const name = text({ message: \'x\' });\n', 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['feature/a.ts', 'import { parse as object } from \'zod\';\n\nexport const read = (schema: never) => object(schema, { message: \'x\' }, { message: \'y\' });\n', 'local/no-zod-message-param', /\{ error: '…' \}/],
  ['shared/a/read.ts', 'export const key = globalThis.process.env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'export const key = globalThis[\'process\'].env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'const { env } = globalThis.process;\n\nexport const key = env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'const { process: { env } } = globalThis;\n\nexport const key = env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['shared/a/read.ts', 'const { process: runtime } = globalThis;\n\nexport const key = runtime.env.API_KEY;\n', 'local/isomorphic-boundary', /process\.env/],
  ['feature/a.ts', 'import type { AppRouter } from \'./root\';\n\nexport type Outputs = import(\'@trpc/server\').inferRouterOutputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'import type { AppRouter } from \'./root\';\n\nexport type Inputs = import(\'@trpc/server\').inferRouterInputs<AppRouter>;\n', 'no-restricted-syntax', /exported beside its schema/],
  ['feature/a.ts', 'export enum Status {\n  Open = \'open\',\n}\n', 'no-restricted-syntax', /`as const` array or `z\.enum`/],
  ['feature/a.schema.ts', 'export type Meta = Record<string, unknown>;\n', 'no-restricted-syntax', /Record<string, unknown>.*zod-schemas/, layered],
  [sharedSchema, 'import type { z as zod } from \'zod\';\nimport type { importedSchema } from \'./user.schema\';\n\nexport type U = zod.infer<typeof importedSchema>;\n', 'local/no-inline-zod-infer', /importedSchema/],
  [sharedSchema, 'import type { infer as Infer } from \'zod\';\nimport type { importedSchema } from \'./user.schema\';\n\nexport type U = Infer<typeof importedSchema>;\n', 'local/no-inline-zod-infer', /importedSchema/],
  ['feature/a.schema.ts', 'export type Meta = { [key: string]: unknown };\n', 'no-restricted-syntax', /Record<string, unknown>.*zod-schemas/, layered],
  [sharedSchema, 'import type { z } from \'zod\';\nimport type { userSchema } from \'./user.schema\';\n\nexport type User = z.infer<typeof userSchema>;\n', 'local/no-inline-zod-infer', /userSchema/],
  [sharedSchema, `${zodSchema}import { userSchema } from './user.schema';\n\nexport const aSchema = z.object({ id: z.string() });\n\nexport const check: z.output<typeof aSchema> extends z.output<typeof userSchema> ? true : false = true;\n`, 'local/no-inline-zod-infer', /userSchema/],
];

for (const [file, code, ruleId, message, options = isomorphic] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)} with ${ruleId}`, async () => {
    const messages = await lint(file, code, options);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, ruleId);
    assert.match(messages[0].message, message);
    assert.match(messages[0].message, /See skill `zod-schemas`\.$/);
  });
}

const accepted = [
  ['backend/a.ts', 'import fs from \'node:fs\';\n\nexport const read = () => fs.readFileSync(\'a\');\n'],
  ['backend/a.ts', 'export const key = process.env.API_KEY;\n'],
  ['shared/a/read.test.ts', 'import fs from \'node:fs\';\n\nexport const read = () => fs.readFileSync(\'a\');\n'],
  ['shared/a/read.ts', 'import type { Buffer } from \'node:buffer\';\n\nexport const size = (value: Buffer) => value.length;\n'],
  ['shared/a/read.ts', 'import { z } from \'zod\';\n\nexport const name = z.string();\n'],
  ['shared/a/read.ts', 'import { getFirestore } from \'firebase-admin/firestore\';\n\nexport const db = () => getFirestore();\n'],
  ['shared/a/read.ts', 'import { app } from \'./firebase-admin\';\n\nexport const name = () => app.name;\n', forbidFirebase],
  ['shared/a/read.ts', 'export const env = (process: { env: string }) => process.env;\n'],
  ['shared/a/read.ts', 'export const pathName = (url: URL) => url.pathname;\n'],
  [sharedSchema, `${zodSchema}export const listAInputSchema = z.object({ limit: z.number().default(20) });\n`],
  [sharedSchema, `${zodSchema}const listAInputSchema = z.object({ limit: z.number().default(20) });\n\nexport { listAInputSchema };\n`],
  ['backend/a.schema.ts', `${zodSchema}export const aSchema = z.object({ name: z.string().default('x') });\n`],
  ['shared/a/view.tsx', 'export const label = \'a\';\n'],
  ['feature/types.d.ts', 'export type A = { id: string };\n'],
  ['feature/user.types.d.ts', 'export type A = { id: string };\n'],
  ['feature/prototypes.ts', 'export type A = { id: string };\n'],
  ['feature/types-of.ts', 'export type A = { id: string };\n'],
  ['feature/a.ts', 'export const STATUSES = [\'open\', \'closed\'] as const;\n\nexport type Status = (typeof STATUSES)[number];\n'],
  ['feature/a.schema.ts', 'export type Labels = Record<Status, string>;\n', layered],
  ['feature/a.schema.ts', 'export type Labels = Record<\'a\' | \'b\', unknown>;\n', layered],
  ['shared/a/read.ts', 'export const read = (process: { env: string }) => {\n  const { env } = process;\n  return env;\n};\n'],
  ['shared/a/read.ts', 'const { argv } = process;\n\nexport const first = argv[0];\n'],
  [sharedSchema, `${zodSchema}export const listAInputSchema = z.object({ limit: z.number().prefault(20) });\n`],
  ['feature/a.ts', `${zodSchema}export const name = z.string().superRefine((value, ctx) => {\n  ctx.addIssue({ code: 'custom', message: value });\n});\n`],
  ['feature/a.ts', `${zodSchema}export const name = z.string().min(1, { error: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ message: z.string() });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.strictObject({ message: z.string() });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ id: z.string() }).extend({ message: z.string() });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ message: z.string() }).pick({ message: true });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ message: z.string() }).parse({ message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ message: z.string() }).default({ message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.object({ id: z.string() }).meta({ message: 'x' });\n`],
  ['feature/a.ts', 'import { object as obj, string } from \'zod\';\n\nexport const item = obj({ message: string() });\n'],
  ['feature/a.ts', 'import { strictObject as shape, string as text } from \'zod\';\n\nexport const item = shape({ message: text() });\n'],
  ['feature/a.ts', `${zodSchema}export const item = z.parse(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.safeParse(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.parseAsync(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.safeParseAsync(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.decode(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', `${zodSchema}export const item = z.encode(z.object({ message: z.string() }), { message: 'x' });\n`],
  ['feature/a.ts', 'import * as zod from \'zod\';\n\nexport const item = zod.parse(zod.object({ message: zod.string() }), { message: \'x\' });\n'],
  ['feature/a.ts', 'import { object, safeParse as check, string } from \'zod\';\n\nexport const item = check(object({ message: string() }), { message: \'x\' });\n'],
  ['shared/a/read.ts', 'export const read = (globalThis: { process: { env: string } }) => globalThis.process.env;\n'],
  ['shared/a/read.ts', 'export const argv = globalThis.process.argv;\n'],
  ['shared/a/read.ts', 'const { process: runtime } = globalThis;\n\nexport const argv = runtime.argv;\n'],
  ['feature/a.ts', 'export const show = (toast: { error: (value: { message: string }) => void }) => toast.error({ message: \'x\' });\n'],
  ['feature/a.ts', 'const z = { string: (params: { message: string }) => params };\n\nexport const name = z.string({ message: \'x\' });\n'],
  [sharedSchema, 'import type { infer as Infer } from \'zod\';\nimport { z } from \'zod\';\n\nexport const aSchema = z.object({ id: z.string() });\n\nexport type A = Infer<typeof aSchema>;\n'],
  ['feature/a.ts', 'import type { Infer } from \'other\';\nimport type { userSchema } from \'./user.schema\';\n\nexport type User = Infer<typeof userSchema>;\n'],
  [sharedSchema, `${zodSchema}export const aSchema = z.object({ id: z.string() });\n\nexport type A = z.infer<typeof aSchema>;\n`],
  [sharedSchema, `${zodSchema}export const aSchema = z.object({ id: z.string() });\n\nexport function read(value: z.infer<typeof aSchema>) {\n  return value.id;\n}\n`],
  [sharedSchema, `${zodSchema}export const aSchema = z.object({ id: z.string() });\n\nexport type A = { id: string };\n\nexport const check: z.output<typeof aSchema> extends A ? true : false = true;\n`],
  [sharedSchema, `${zodSchema}const aSchema = z.object({ id: z.string() });\n\ntype Check = A extends z.input<typeof aSchema> ? true : never;\n\nexport type A = { id: string };\n\nexport const check: Check = true;\n`],
];

for (const [file, code, options = isomorphic] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code, options), []);
  });
}

test('isomorphic is off by default and emits neither isomorphic rule', async () => {
  const names = (await zoroskr()).map(config => config.name ?? '');
  assert.equal(names.some(name => name.startsWith('zoroskr/isomorphic')), false);
  for (const [file, code, ruleId] of rejected.filter(([, , ruleId]) => isomorphicRules.has(ruleId))) {
    assert.deepEqual((await lint(file, code, {})).filter(message => message.ruleId === ruleId), [], code);
  }
});

test('isomorphic true emits one named block per rule', async () => {
  const names = (await zoroskr(isomorphic)).map(config => config.name ?? '');
  assert.ok(names.includes('zoroskr/isomorphic/boundary'));
  assert.ok(names.includes('zoroskr/isomorphic/schemas'));
});

test('isomorphic accepts glob overrides and keeps the other defaults', async () => {
  const options = { isomorphic: { files: ['**/common/**/*.ts'] } };
  const code = 'import fs from \'node:fs\';\n\nexport const read = () => fs.readFileSync(\'a\');\n';
  assert.equal((await lint('common/read.ts', code, options)).length, 1);
  assert.deepEqual(await lint('shared/a/read.ts', code, options), []);
  assert.deepEqual(await lint('common/read.test.ts', code, options), []);
  assert.equal((await lint(sharedSchema, `${zodSchema}export const aSchema = z.string().default('x');\n`, options)).length, 1);
});

test('a consumer no-restricted-imports block does not replace the isomorphic boundary', async () => {
  const userConfig = { files: ['**/shared/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@backend/*'], message: 'No backend.' }] }] } };
  const code = 'import fs from \'node:fs\';\nimport { run } from \'@backend/run\';\n\nexport const read = () => fs.readFileSync(run());\n';
  const rules = (await lintWith('shared/a/read.ts', code, isomorphic, userConfig)).map(message => message.ruleId);
  assert.ok(rules.includes('no-restricted-imports'));
  assert.ok(rules.includes('local/isomorphic-boundary'));
});

test('layer selectors and no-schema-default both fire in a shared schema file', async () => {
  const code = `${zodSchema}export const aSchema = z.object({ name: z.string().default('x'), meta: z.custom<Record<string, unknown>>() });\n`;
  const rules = (await lint(sharedSchema, code, { isomorphic: true, layeredBackend: true })).map(message => message.ruleId);
  assert.deepEqual(rules.toSorted(), ['local/no-schema-default', 'no-restricted-syntax']);
});

test('an imported inferRouterOutputs is reported at the import and at the use', async () => {
  const code = 'import type { inferRouterOutputs } from \'@trpc/server\';\nimport type { AppRouter } from \'./root\';\n\nexport type Outputs = inferRouterOutputs<AppRouter>;\n';
  const messages = await lint('feature/a.ts', code, {});
  assert.deepEqual(messages.map(message => message.line), [1, 4]);
  assert.ok(messages.every(message => /exported beside its schema.*See skill `zod-schemas`\.$/.test(message.message)));
});

test('no-zod-message-param reports each message key once', async () => {
  const code = `${zodSchema}export const name = z.string({ message: 'a' }).min(1, { message: 'b' });\n`;
  const messages = await lint('feature/a.ts', code, {});
  assert.deepEqual(messages.map(message => [message.ruleId, message.column]), [['local/no-zod-message-param', 32], ['local/no-zod-message-param', 57]]);
});

test('no-types-file and no-inline-zod-infer are on without options', async () => {
  assert.equal((await lint('feature/types.ts', 'export type A = { id: string };\n', {})).length, 1);
  const code = 'import type { z } from \'zod\';\nimport type { userSchema } from \'./user.schema\';\n\nexport type User = z.infer<typeof userSchema>;\n';
  assert.equal((await lint('feature/a.ts', code, {})).length, 1);
});
