import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const scratch = mkdtempSync(join(tmpdir(), 'zoroskr-migrations-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const RULE = 'local/migration-boundary';
const boundary = source => `Do not import \`${source}\` outside a migrations root; a migration is a standalone operator-run module, never wired into app code. See skill \`data-migration-safety\`.`;
const tsconfig = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'], '@backend/*': ['./src/backend/*'] } } });
const roots = { migrations: { roots: ['src/backend/migrations'] } };

const configs = new Map();

async function config(options) {
  const key = JSON.stringify(options);
  if (!configs.has(key)) {
    configs.set(key, await zoroskr(options));
  }
  return configs.get(key);
}

function writeTree() {
  const cwd = mkdtempSync(join(scratch, 'case-'));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture tree inside the test temp directory
  writeFileSync(join(cwd, 'tsconfig.json'), tsconfig);
  return cwd;
}

async function lint(file, code, options = roots) {
  const cwd = writeTree();
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: await config(options) });
  const [result] = await eslint.lintText(code, { filePath: join(cwd, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.ruleId === RULE).map(message => message.message);
}

const router = 'src/backend/routers/admin.router.ts';
const run = 'export const result = run;\n';

const rejected = [
  [router, `import { run } from '@backend/migrations/rename/rename.migration';\n\n${run}`, ['@backend/migrations/rename/rename.migration']],
  [router, `import { run } from '@/backend/migrations/rename/rename.migration';\n\n${run}`, ['@/backend/migrations/rename/rename.migration']],
  [router, `import { run } from '../migrations/rename/rename.migration';\n\n${run}`, ['../migrations/rename/rename.migration']],
  [router, `import { run } from '../migrations';\n\n${run}`, ['../migrations']],
  [router, 'import \'../migrations/rename/rename.migration\';\n', ['../migrations/rename/rename.migration']],
  [router, 'import * as rename from \'../migrations/rename/rename.migration\';\n\nexport const result = rename;\n', ['../migrations/rename/rename.migration']],
  [router, 'export { run } from \'../migrations/rename/rename.migration\';\n', ['../migrations/rename/rename.migration']],
  [router, 'export * from \'@backend/migrations/rename/rename.migration\';\n', ['@backend/migrations/rename/rename.migration']],
  [router, 'export * as rename from \'@backend/migrations/rename/rename.migration\';\n', ['@backend/migrations/rename/rename.migration']],
  [router, 'export const load = () => import(\'@backend/migrations/rename/rename.migration\');\n', ['@backend/migrations/rename/rename.migration']],
  [router, 'export const load = () => import(`../migrations/rename/rename.migration`);\n', ['../migrations/rename/rename.migration']],
  [router, 'export const rename = await import(\'../migrations/rename/rename.migration\');\n', ['../migrations/rename/rename.migration']],
  [router, 'export const rename = require(\'../migrations/rename/rename.migration\');\n', ['../migrations/rename/rename.migration']],
  ['src/app/api/admin/route.ts', `import { run } from '@backend/migrations/rename/rename.migration';\n\n${run}`, ['@backend/migrations/rename/rename.migration']],
  ['scripts/apply.ts', `import { run } from '../src/backend/migrations/rename/rename.migration';\n\n${run}`, ['../src/backend/migrations/rename/rename.migration']],
  ['src/backend/migrations.ts', `import { run } from './migrations/rename/rename.migration';\n\n${run}`, ['./migrations/rename/rename.migration']],
  ['src/backend/routers/admin.router.js', 'const rename = require(\'../migrations/rename/rename.migration\');\n\nexport default rename;\n', ['../migrations/rename/rename.migration']],
];

const accepted = [
  [router, 'import type { Rename } from \'@backend/migrations/rename/rename.migration\';\n\nexport const value = 1 satisfies Rename;\n'],
  [router, 'export type { Rename } from \'../migrations/rename/rename.migration\';\n'],
  [router, 'export type Rename = import(\'../migrations/rename/rename.migration\').Rename;\n'],
  ['src/backend/migrations/rename/rename.migration.ts', `import { run } from '../shared/batch';\n\n${run}`],
  ['src/backend/migrations/rename/rename.migration.ts', `import { run } from '@backend/migrations/shared/batch';\n\n${run}`],
  ['src/backend/migrations/rename/rename.migration.test.ts', `import { run } from './rename.migration';\n\n${run}`],
  ['src/backend/routers/admin.router.test.ts', `import { run } from '../migrations/rename/rename.migration';\n\n${run}`],
  ['src/backend/routers/admin.router.test.tsx', `import { run } from '@backend/migrations/rename/rename.migration';\n\n${run}`],
  [router, `import { run } from '../migrations-helpers/batch';\n\n${run}`],
  [router, `import { run } from '@backend/migration-utils/batch';\n\n${run}`],
  [router, `import { run } from 'migrations';\n\n${run}`],
  [router, `import { run } from '@backend/services/migrations-report.service';\n\n${run}`],
  [router, 'export const load = (name: string) => import(name);\n'],
];

for (const [file, code, sources] of rejected) {
  test(`migration-boundary rejects ${file}: ${code.split('\n')[0]}`, async () => {
    assert.deepEqual(await lint(file, code), sources.map(boundary));
  });
}

for (const [file, code] of accepted) {
  test(`migration-boundary accepts ${file}: ${code.split('\n')[0]}`, async () => {
    assert.deepEqual(await lint(file, code), []);
  });
}

test('migration-boundary is off unless migrations is set', async () => {
  assert.deepEqual(await lint(router, `import { run } from '../migrations/rename/rename.migration';\n\n${run}`, {}), []);
});

test('migrations true guards every migrations folder', async () => {
  const code = `import { run } from '../db/migrations/rename';\n\n${run}`;
  assert.deepEqual(await lint('src/backend/routers/admin.router.ts', code, { migrations: true }), [boundary('../db/migrations/rename')]);
  assert.deepEqual(await lint('src/backend/db/migrations/rename/apply.ts', `import { run } from '../shared';\n\n${run}`, { migrations: true }), []);
});

test('roots take globs and several entries', async () => {
  const options = { migrations: { roots: ['src/*/migrations', 'tools/backfills/'] } };
  assert.deepEqual(await lint(router, `import { run } from '../migrations/rename';\n\n${run}`, options), [boundary('../migrations/rename')]);
  assert.deepEqual(await lint('src/app/page.ts', `import { run } from '../../tools/backfills/users';\n\n${run}`, options), [boundary('../../tools/backfills/users')]);
  assert.deepEqual(await lint('tools/backfills/apply.ts', `import { run } from './users';\n\n${run}`, options), []);
  assert.deepEqual(await lint('src/app/page.ts', `import { run } from '../db/x/migrations/y';\n\n${run}`, options), []);
});

test('later user configs still override migration-boundary', async () => {
  const cwd = writeTree();
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: await zoroskr(roots, { files: ['**/*.ts'], rules: { [RULE]: 'off' } }),
  });
  const [result] = await eslint.lintText(`import { run } from '../migrations/rename';\n\n${run}`, { filePath: join(cwd, router) });
  assert.equal(result.messages.some(message => message.ruleId === RULE), false);
});
