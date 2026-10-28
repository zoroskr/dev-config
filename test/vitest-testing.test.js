import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const scratch = mkdtempSync(join(tmpdir(), 'zoroskr-vitest-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const TEST_RULES = new Set([
  'no-restricted-syntax',
  'no-restricted-imports',
  'test/hoisted-apis-on-top',
  'test/no-restricted-matchers',
  'local/no-console',
  'local/no-http-mock',
  'local/no-production-mock',
  'local/no-call-argument-assertion',
]);
const COLOCATION_RULES = new Set(['local/test-colocation']);
const SKILL = 'See skill `vitest-testing`.';

const CONSOLE = `Do not call \`console\` in tests; assert on behavior, or spy with \`vi.spyOn(console, …)\` when the log is the behavior. ${SKILL}`;
const PRODUCTION_CONSOLE = 'Do not use `console` in production code; log through the project\'s error reporter. See skill `typescript-strict`.';
const HOISTED = 'Hoisted API is used in a runtime location in this file, but it is actually executed before this file is loaded.';
const PRODUCTION_MOCK = `Do not call \`vi.mock\`/\`vi.doMock\` outside test files; mock inline at the top of the test file, or globally in a setup file listed in \`testSetupFiles\`. ${SKILL}`;
const httpMock = source => `Do not import \`${source}\` in a unit test; mock the nearest boundary module with \`vi.mock\` (HTTP mocks belong to E2E). ${SKILL}`;
const callArgs = matcher => `Integration tests assert real stored reads, never mock call arguments (\`${matcher}\`); read the persisted state instead. ${SKILL}`;
const testsFolder = folder => `Do not put tests in a \`${folder}/\` folder; co-locate the test beside its source with a mirrored name (\`Foo.tsx\` → \`Foo.test.tsx\`). ${SKILL}`;
const missingSource = (name, stem) => `\`${name}\` has no sibling \`${stem}.ts\` or \`${stem}.tsx\`; co-locate the test beside its source with a mirrored name (a behavior split such as \`foo.router.read.test.ts\` beside \`foo.router.ts\` is fine). ${SKILL}`;
const ASSERTION = 'Do not use type assertions (`as`). Prefer narrowing, schema parsing, `satisfies` or derived types; `as const` is allowed. See skill `typescript-strict`.';
const FIXTURE = 'Use `satisfies T` for fixtures. See skill `typescript-strict`.';
const EXTRA = 'Project-specific restriction. See skill `vitest-testing`.';
const BACKEND = 'Import backend code through its public module. See skill `trpc-layered-backend`.';
const BACKEND_IMPORT = `'@backend/db' import is restricted from being used by a pattern. ${BACKEND}`;
const REPOSITORY = '\'@trpc/server\' import is restricted from being used. Repositories never import tRPC or services; they return `null`/`false` and the service translates. See skill `trpc-layered-backend`.';

const extraSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: EXTRA }];
const backendBan = { files: ['**/*.test.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@backend/*'], message: BACKEND }] }] } };

function writeTree(tree) {
  const cwd = mkdtempSync(join(scratch, 'case-'));
  for (const [path, content] of Object.entries(tree)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture tree inside the test temp directory
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture tree inside the test temp directory
    writeFileSync(join(cwd, path), content);
  }
  return cwd;
}

async function lintMessages(file, code, { tree = {}, options = {}, userConfigs = [] } = {}) {
  const cwd = writeTree(tree);
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: await zoroskr(options, ...userConfigs) });
  const [result] = await eslint.lintText(code, { filePath: join(cwd, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, settings, rules = TEST_RULES) {
  return (await lintMessages(file, code, settings))
    .filter(message => rules.has(message.ruleId))
    .map(message => message.message)
    .sort();
}

const vitest = 'import { describe, expect, it, vi } from \'vitest\';\n\n';
const unitTest = 'src/orders/order.test.ts';
const integrationTest = 'src/orders/order.integration.test.ts';
const expectCall = body => `${vitest}it('saves', () => {\n  ${body}\n});\n`;
const setupFiles = { testSetupFiles: ['src/testing/setup.ts'] };

const rejected = [
  ['F1', unitTest, 'console.log(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'console.error(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'console[\'warn\'](\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'console?.info(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'globalThis.console.debug(\'x\');\n', [CONSOLE]],
  ['F1', 'src/orders/order.integration.test.tsx', `${vitest}it('logs', () => {\n  console.table([]);\n});\n`, [CONSOLE]],
  ['F1', 'e2e/orders.spec.ts', 'console.log(\'x\');\n', [CONSOLE]],
  ['F1', 'src/orders/Order.stories.tsx', 'console.log(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'type User = { id: string };\nexport const user: User = JSON.parse(\'{}\') as User;\nconsole.log(user);\n', [ASSERTION, CONSOLE]],
  ['F1', unitTest, 'type User = { id: string };\nexport const user: User = { id: \'1\' };\n', [FIXTURE]],
  ['F1', unitTest, 'export const forbiddenName = 1;\nconsole.log(1);\n', [CONSOLE, EXTRA], { options: { restrictedSyntax: extraSyntax } }],
  ['F1', 'src/orders/order.ts', 'console.log(\'x\');\n', [PRODUCTION_CONSOLE]],
  ['F1', unitTest, 'const { log } = console;\nlog(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'const { error: report } = globalThis.console;\nreport(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'const out = console;\nout.info(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'import { log } from \'node:console\';\n\nlog(\'x\');\n', [CONSOLE]],
  ['F1', unitTest, 'import { Console } from \'console\';\n\nexport const logger = new Console(process.stdout);\n', [CONSOLE]],
  ['F2', unitTest, `${vitest}describe('orders', () => {\n  vi.mock('./order');\n});\n`, [HOISTED]],
  ['F2', unitTest, `${vitest}it('mocks', () => {\n  vi.mock('./order');\n});\n`, [HOISTED]],
  ['F2', 'src/orders/order.ts', 'vi.mock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'vi.doMock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'vi[\'mock\'](\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'vitest.mock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.tsx', 'import { vi as mocker } from \'vitest\';\n\nmocker.mock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'import { vi } from \'vitest\';\n\nexport function mockDb() {\n  vi.doMock(\'./db\');\n}\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/__fixtures__/order.ts', 'vi.mock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'import * as v from \'vitest\';\n\nv.vi.doMock(\'./db\');\n', [PRODUCTION_MOCK]],
  ['F2', 'src/orders/order.ts', 'import * as v from \'vitest\';\n\nv.vi.mock(\'./db\');\nv.vitest.mock(\'./auth\');\n', [PRODUCTION_MOCK, PRODUCTION_MOCK]],
  ['F2', 'src/testing/other-setup.ts', 'vi.mock(\'./db\');\n', [PRODUCTION_MOCK], { options: setupFiles }],
  ['F3', unitTest, 'import { http } from \'msw\';\n\nexport const handler = http;\n', [httpMock('msw')]],
  ['F3', unitTest, 'import { setupServer } from \'msw/node\';\n\nexport const server = setupServer();\n', [httpMock('msw/node')]],
  ['F3', 'src/orders/Order.test.tsx', 'import nock from \'nock\';\n\nexport const scope = nock;\n', [httpMock('nock')]],
  ['F3', unitTest, 'import type { HttpHandler } from \'msw\';\n\nexport const handlers: HttpHandler[] = [];\n', [httpMock('msw')]],
  ['F3', unitTest, 'export { http } from \'msw\';\n', [httpMock('msw')]],
  ['F3', unitTest, 'export * from \'msw/browser\';\n', [httpMock('msw/browser')]],
  ['F3', unitTest, 'export const load = () => import(\'msw\');\n', [httpMock('msw')]],
  ['F3', integrationTest, 'import \'nock\';\n', [httpMock('nock')]],
  ['F3', unitTest, 'import { http } from \'msw\';\nimport { db } from \'@backend/db\';\n\nexport const handler = [http, db];\n', [BACKEND_IMPORT, httpMock('msw')], { userConfigs: [backendBan] }],
  ['F3', 'src/orders/order.repository.ts', 'import { TRPCError } from \'@trpc/server\';\n\nexport const error = TRPCError;\n', [REPOSITORY], { options: { layeredBackend: true } }],
  ['F4', integrationTest, expectCall('expect(vi.fn()).toHaveBeenCalledWith(1);'), [callArgs('toHaveBeenCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).not.toHaveBeenCalledWith(1);'), [callArgs('toHaveBeenCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).toHaveBeenNthCalledWith(1, 2);'), [callArgs('toHaveBeenNthCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).not.toHaveBeenNthCalledWith(1, 2);'), [callArgs('toHaveBeenNthCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).toHaveBeenLastCalledWith(1);'), [callArgs('toHaveBeenLastCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).not.toHaveBeenLastCalledWith(1);'), [callArgs('toHaveBeenLastCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).toBeCalledWith(1);'), [callArgs('toBeCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).lastCalledWith(1);'), [callArgs('lastCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).nthCalledWith(1, 2);'), [callArgs('nthCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).toHaveBeenCalledExactlyOnceWith(1);'), [callArgs('toHaveBeenCalledExactlyOnceWith')]],
  ['F4', integrationTest, expectCall('expect(Promise.resolve(vi.fn())).resolves.toHaveBeenCalledWith(1);'), [callArgs('toHaveBeenCalledWith')]],
  ['F4', integrationTest, expectCall('expect(vi.fn()).not[\'toHaveBeenCalledWith\'](1);'), [callArgs('toHaveBeenCalledWith')]],
  ['F4', integrationTest, expectCall('const fn = vi.fn();\n  expect(fn.mock.calls[0]).toEqual([1]);'), [callArgs('mock.calls')]],
  ['F4', integrationTest, expectCall('const fn = vi.fn();\n  expect(fn.mock.lastCall).toEqual([1]);'), [callArgs('mock.lastCall')]],
  ['F4', 'src/orders/Order.integration.test.tsx', expectCall('expect(vi.fn()).toHaveBeenCalledWith(1);'), [callArgs('toHaveBeenCalledWith')]],
];

const accepted = [
  ['F1', unitTest, `${vitest}it('logs', () => {\n  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);\n  expect(log).not.toHaveBeenCalled();\n});\n`],
  ['F1', unitTest, `${vitest}const logger = { log: vi.fn() };\nlogger.log('x');\n`],
  ['F2', unitTest, `${vitest}vi.mock('./order');\n\ndescribe('orders', () => {\n  it('mocks', () => {\n    vi.mocked(Date.now).mockReturnValue(1);\n  });\n});\n`],
  ['F2', integrationTest, `${vitest}vi.mock('./db', () => ({ db: {} }));\n\nit('reads', async () => {\n  const { db } = await import('./db');\n  expect(db).toBeDefined();\n});\n`],
  ['F2', 'src/testing/setup.ts', 'vi.mock(\'./db\');\nvi.doMock(\'./auth\');\n', { options: setupFiles }],
  ['F2', 'src/orders/order.ts', 'import { vi } from \'vitest\';\n\nexport const save = vi.fn();\nexport const spy = vi.spyOn(Date, \'now\');\n'],
  ['F2', 'src/orders/order.ts', 'const vi = { mock: (path: string) => path };\n\nexport const mocked = vi.mock(\'./db\');\n'],
  ['F2', 'src/orders/order.ts', 'import { mock } from \'./mock\';\n\nexport const mocked = mock(\'./db\');\n'],
  ['F2', 'scripts/seed.ts', 'vi.mock(\'./db\');\n'],
  ['F2', 'src/orders/order.ts', 'const tools = { vi: { mock: (path: string) => path } };\n\nexport const mocked = tools.vi.mock(\'./db\');\n'],
  ['F3', 'e2e/orders.spec.ts', 'import { http } from \'msw\';\n\nexport const handler = http;\n'],
  ['F3', 'src/orders/Order.stories.tsx', 'import { http } from \'msw\';\n\nexport const handler = http;\n'],
  ['F3', unitTest, 'import { msw } from \'mswjs-helpers\';\nimport nockLike from \'nock-utils\';\n\nexport const tools = [msw, nockLike];\n'],
  ['F4', integrationTest, expectCall('const fn = vi.fn();\n  expect(fn).toHaveBeenCalled();\n  expect(fn).toHaveBeenCalledTimes(1);\n  expect(fn).not.toHaveBeenCalled();')],
  ['F4', unitTest, expectCall('expect(vi.fn()).toHaveBeenCalledWith(1);')],
  ['F4', unitTest, expectCall('const fn = vi.fn();\n  expect(fn.mock.calls).toHaveLength(0);')],
  ['F4', integrationTest, expectCall('const fn = vi.fn();\n  expect(fn.mock.results).toHaveLength(0);')],
];

for (const [row, file, code, expected, settings] of rejected) {
  test(`${row} ${file} rejects ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code, settings), [...expected].sort());
  });
}

for (const [row, file, code, settings] of accepted) {
  test(`${row} ${file} accepts ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code, settings), []);
  });
}

const source = 'export const value = 1;\n';
const unit = 'export const value = 2;\n';
const colocationIgnores = { files: ['**/*.test.{ts,tsx}'], rules: { 'local/test-colocation': ['error', { ignores: ['src/legacy/**', 'src/app/**/__tests__/api/**'] }] } };

const colocationRejected = [
  ['src/orders/__tests__/order.test.ts', { 'src/orders/__tests__/order.ts': source }, [testsFolder('__tests__')]],
  ['tests/order.test.ts', { 'tests/order.ts': source }, [testsFolder('tests')]],
  ['src/tests/orders/order.test.tsx', {}, [testsFolder('tests')]],
  ['src/orders/order.test.ts', {}, [missingSource('order.test.ts', 'order')]],
  ['src/orders/order.router.read.test.ts', { 'src/orders/order.service.ts': source }, [missingSource('order.router.read.test.ts', 'order.router.read')]],
  ['src/orders/order.test.ts', { 'src/orders/order.js': source, 'src/orders/order.schema.ts': source }, [missingSource('order.test.ts', 'order')]],
  ['src/orders/Order.test.tsx', { 'src/orders/OrderRow.tsx': source }, [missingSource('Order.test.tsx', 'Order')]],
  ['src/orders/order.integration.test.ts', { 'src/orders/order.integration.ts': source }, [missingSource('order.integration.test.ts', 'order')]],
  ['src/orders/order.test.ts', { 'src/orders/order/order.ts': source }, [missingSource('order.test.ts', 'order')]],
  ['src/app/orders/__tests__/order.test.ts', {}, [testsFolder('__tests__')], [colocationIgnores]],
];

const colocationAccepted = [
  ['src/orders/order.test.ts', { 'src/orders/order.ts': source }],
  ['src/orders/order.test.tsx', { 'src/orders/order.ts': source }],
  ['src/orders/Order.test.tsx', { 'src/orders/Order.tsx': unit }],
  ['src/orders/Order.test.ts', { 'src/orders/Order.tsx': unit }],
  ['src/orders/order.util.test.ts', { 'src/orders/order.util.ts': source }],
  ['src/orders/order.integration.test.ts', { 'src/orders/order.ts': source }],
  ['src/orders/order.integration.test.tsx', { 'src/orders/order.tsx': unit }],
  ['src/contests/order.test.ts', { 'src/contests/order.ts': source }],
  ['e2e/orders.spec.ts', {}],
  ['src/orders/Order.stories.tsx', {}],
  ['src/legacy/__tests__/order.test.ts', {}, [colocationIgnores]],
  ['src/orders/order.router.read.test.ts', { 'src/orders/order.router.ts': source }],
  ['src/orders/order.service.flow.test.ts', { 'src/orders/order.service.ts': source }],
  ['src/app/orders/__tests__/api/route.test.ts', {}, [colocationIgnores]],
];

for (const [file, tree, expected, userConfigs] of colocationRejected) {
  test(`F5 ${file} rejects with ${JSON.stringify(Object.keys(tree))}`, async () => {
    assert.deepEqual(await lint(file, source, { tree, userConfigs }, COLOCATION_RULES), expected);
  });
}

for (const [file, tree, userConfigs] of colocationAccepted) {
  test(`F5 ${file} accepts with ${JSON.stringify(Object.keys(tree))}`, async () => {
    assert.deepEqual(await lint(file, source, { tree, userConfigs }, COLOCATION_RULES), []);
  });
}

test('the tests block keeps the package, restrictedSyntax and fixture selectors with the console selectors', async () => {
  const blocks = await zoroskr({ restrictedSyntax: extraSyntax });
  const tests = blocks.find(block => block.name === 'zoroskr/typescript-tests');
  const messages = tests.rules['no-restricted-syntax'].slice(1).map(entry => entry.message);
  for (const message of [ASSERTION, FIXTURE, EXTRA, CONSOLE]) {
    assert.ok(messages.includes(message), message);
  }
  assert.equal(tests.rules['test/hoisted-apis-on-top'], 'error');
});
