import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const strictRules = new Set(['no-restricted-syntax', 'no-console', 'ts/no-explicit-any', 'ts/no-non-null-assertion']);
const SKILL = /See skill `typescript-strict`\.$/;
const userType = 'type User = { id: string };\n\n';

async function lintAll(file, code, options = {}) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, 'src', file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, options = {}) {
  return (await lintAll(file, code, options)).filter(message => strictRules.has(message.ruleId));
}

const rejected = [
  ['a.ts', `${userType}export const user = ({ id: 'x' as const }) as User;\n`, /type assertions/, 1],
  ['a.ts', `${userType}export const user = (['x'] as const) as unknown as User;\n`, /type assertions/, 2],
  ['a.ts', 'export const point = ({ x: 1 } as const) as unknown;\n', /type assertions/, 1],
  ['a.ts', 'export function one(): number {\n  return 1;\n}\n', /return types/, 1],
  ['a.ts', 'export const one = (): number => 1;\n', /return types/, 1],
  ['a.ts', 'export const one = function (): number {\n  return 1;\n};\n', /return types/, 1],
  ['a.ts', 'export function one(): number {\n  return 1;\n}\n', /return types/, 1, { inferredReturnTypes: true }],
  ['a.ts', 'export function run() {\n  console.log(\'x\');\n}\n', /^Do not call `console` in production code/, 1],
  ['a.ts', 'export function run() {\n  console.warn(\'x\');\n}\n', /`console`/, 1],
  ['a.ts', 'export function run() {\n  console.error(\'x\');\n}\n', /`console`/, 1],
  ['a.tsx', 'export function run() {\n  console.info(\'x\');\n}\n', /`console`/, 1],
  ['a.ts', 'export function identity(value: any) {\n  return value;\n}\n', /^Do not use `any`/, 1],
  ['a.test.ts', 'export function identity(value: any) {\n  return value;\n}\n', /`any`/, 1],
  ['a.ts', 'export function first(values: Map<string, number>) {\n  return values.get(\'a\')!;\n}\n', /non-null assertions/, 1],
  ['a.test.ts', 'export function first(values: Map<string, number>) {\n  return values.get(\'a\')!;\n}\n', /non-null assertions/, 1],
  ['a.test.ts', `${userType}export const user: User = { id: '1' };\n`, /^Use `satisfies T` for fixtures\. See skill `typescript-strict`\.$/, 1],
  ['a.test.ts', `${userType}export const users: User[] = [{ id: '1' }];\n`, /satisfies T/, 1],
  ['a.spec.tsx', `${userType}export const user: User = { id: '1' };\n`, /satisfies T/, 1],
  ['a.test.ts', 'export const total = JSON.parse(\'1\') as number;\n', /type assertions/, 1],
];

for (const [file, code, message, count, options] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    const messages = await lint(file, code, options);
    assert.equal(messages.length, count, JSON.stringify(messages));
    for (const entry of messages) {
      assert.equal(entry.ruleId, 'no-restricted-syntax');
      assert.match(entry.message, message);
      assert.match(entry.message, SKILL);
    }
  });
}

const accepted = [
  ['a.ts', 'export const keys = [\'a\'] as const;\n'],
  ['a.ts', 'export const point = { x: 1, tags: [\'a\'] as const } as const;\n'],
  ['a.ts', 'export function isText(value: unknown): value is string {\n  return typeof value === \'string\';\n}\n'],
  ['a.ts', 'export const isText = (value: unknown): value is string => typeof value === \'string\';\n'],
  ['a.ts', 'export function assertText(value: unknown): asserts value is string {\n  if (typeof value !== \'string\') {\n    throw new TypeError(\'x\');\n  }\n}\n'],
  ['a.ts', 'export function assertDefined(value: unknown): asserts value {\n  if (value == null) {\n    throw new TypeError(\'x\');\n  }\n}\n'],
  ['a.ts', 'export function one(): number {\n  return 1;\n}\n', { inferredReturnTypes: false }],
  ['a.service.ts', 'export function one(): number {\n  return 1;\n}\n', { inferredReturnTypes: false, layeredBackend: true }],
  ['a.test.ts', 'export function run() {\n  console.error(\'x\');\n}\n'],
  ['a.test.ts', 'export const ids: string[] = [];\n'],
  ['a.test.ts', 'export const labels: Record<string, string> = {};\n'],
  ['a.test.ts', `${userType}export const user = { id: '1' } satisfies User;\n`],
  ['a.test.ts', `${userType}export function build(user: User) {\n  const next: User = user;\n  return next;\n}\n`],
  ['a.ts', `${userType}export const user: User = { id: '1' };\n`],
];

for (const [file, code, options] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    assert.deepEqual(await lint(file, code, options), []);
  });
}

test('console.log in test files keeps the antfu no-console rule', async () => {
  const messages = await lint('a.test.ts', 'export function run() {\n  console.log(\'x\');\n}\n');
  assert.deepEqual(messages.map(message => message.ruleId), ['no-console']);
});

test('console.log in JavaScript files keeps the antfu no-console rule', async () => {
  const messages = await lint('a.js', 'export function run() {\n  console.log(\'x\');\n}\n');
  assert.deepEqual(messages.map(message => message.ruleId), ['no-console']);
});

test('the replaced third-party rules are off in TypeScript files', async () => {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr() });
  const production = new Map(Object.entries((await eslint.calculateConfigForFile(join(app, 'src/a.ts'))).rules));
  for (const rule of ['no-console', 'ts/no-explicit-any', 'ts/no-non-null-assertion']) {
    assert.equal(production.get(rule)?.[0] ?? 0, 0, rule);
  }
});

test('base selectors still fire inside layer and test files', async () => {
  const code = 'export function run(value: any) {\n  console.error(value);\n  return value!;\n}\n';
  for (const file of ['a.service.ts', 'a.repository.ts', 'a.router.ts', 'a.schema.ts']) {
    const messages = (await lint(file, code, { layeredBackend: true })).map(message => message.message);
    assert.ok(messages.some(message => message.startsWith('Do not use `any`')), file);
    assert.ok(messages.some(message => message.startsWith('Do not call `console`')), file);
    assert.ok(messages.some(message => message.includes('non-null')), file);
  }
  const testMessages = (await lint('a.test.ts', code, { layeredBackend: true })).map(message => message.message);
  assert.ok(testMessages.some(message => message.startsWith('Do not use `any`')));
  assert.equal(testMessages.some(message => message.includes('`console`')), false);
});

test('extra restricted syntax still fires inside test files', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const messages = await lint('a.test.ts', 'export const forbiddenName = 1;\n', { restrictedSyntax });
  assert.deepEqual(messages.map(message => message.message), ['Project-specific restriction.']);
});

async function packageSelectors(options) {
  return (await zoroskr(options))
    .filter(config => config.name?.startsWith('zoroskr/'))
    .flatMap(config => config.rules?.['no-restricted-syntax']?.slice(1) ?? []);
}

test('the return-type selector is gone with inferredReturnTypes false', async () => {
  const returnTypes = entry => entry.message.includes('return types');
  assert.ok((await packageSelectors({ layeredBackend: true })).some(returnTypes));
  const selectors = await packageSelectors({ inferredReturnTypes: false, layeredBackend: true });
  assert.ok(selectors.length > 0);
  assert.equal(selectors.some(returnTypes), false);
});

test('unused disable directives are errors', async () => {
  const messages = await lintAll('a.ts', '// eslint-disable-next-line no-console\nexport const value = 1;\n');
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].ruleId, null);
  assert.match(messages[0].message, /Unused eslint-disable directive/);
});
