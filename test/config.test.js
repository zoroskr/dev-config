import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const tsc = join(root, 'node_modules/.bin/tsc');

async function lint(file, options = {}) {
  const eslint = new ESLint({
    cwd: app,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ tsconfigPath: join(app, 'tsconfig.json'), ...options }),
  });
  const [result] = await eslint.lintFiles([join(app, 'src', file)]);
  return result.messages;
}

async function rulesFor(file, options = {}) {
  const eslint = new ESLint({
    cwd: app,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ tsconfigPath: join(app, 'tsconfig.json'), ...options }),
  });
  const config = await eslint.calculateConfigForFile(join(app, 'src', file));
  return config.rules;
}

function errorRules(messages) {
  return messages.filter(message => message.severity === 2).map(message => message.ruleId);
}

test('clean code produces no messages', async () => {
  assert.deepEqual(await lint('clean.ts'), []);
});

for (const [file, ruleId] of [
  ['assertion.ts', 'no-restricted-syntax'],
  ['return-type.ts', 'no-restricted-syntax'],
  ['comment.ts', 'local/no-comments'],
  ['explicit-any.ts', 'ts/no-explicit-any'],
  ['boolean-string.ts', 'ts/strict-boolean-expressions'],
  ['non-null.ts', 'ts/no-non-null-assertion'],
  ['missing-alt.tsx', 'jsx-a11y/alt-text'],
]) {
  test(`${file} reports ${ruleId} as an error`, async () => {
    assert.ok(errorRules(await lint(file)).includes(ruleId));
  });
}

test('assertion message points to the global typescript-strict skill', async () => {
  const messages = await lint('assertion.ts');
  const message = messages.find(entry => entry.ruleId === 'no-restricted-syntax');
  assert.match(message?.message ?? '', /typescript-strict/);
});

test('type-aware rules are skipped without tsconfigPath', async () => {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr() });
  const [result] = await eslint.lintFiles([join(app, 'src/boolean-string.ts')]);
  assert.equal(result.messages.some(message => message.fatal), false);
  assert.equal(errorRules(result.messages).includes('ts/strict-boolean-expressions'), false);
});

test('i18n is off by default and warns on JSX literals when enabled', async () => {
  assert.equal((await lint('literal-text.tsx')).some(message => message.ruleId?.startsWith('formatjs/')), false);
  const enabled = await lint('literal-text.tsx', { i18n: true });
  assert.ok(enabled.some(message => message.ruleId === 'formatjs/no-literal-string-in-jsx' && message.severity === 1));
});

test('query rules are off by default and errors when enabled', async () => {
  assert.equal((await rulesFor('clean.ts'))['@tanstack/query/exhaustive-deps'], undefined);
  assert.equal((await rulesFor('clean.ts', { query: true }))['@tanstack/query/exhaustive-deps'][0], 2);
});

test('tailwind rules are off by default and on when enabled', async () => {
  assert.equal((await rulesFor('missing-alt.tsx'))['tailwindcss/no-custom-classname'], undefined);
  assert.equal((await rulesFor('missing-alt.tsx', { tailwind: true }))['tailwindcss/no-custom-classname'][0], 1);
});

test('nextjs option is passed through to antfu', async () => {
  assert.equal(Object.keys(await rulesFor('missing-alt.tsx')).some(rule => rule.startsWith('next/')), false);
  assert.ok(Object.keys(await rulesFor('missing-alt.tsx', { nextjs: true })).some(rule => rule.startsWith('next/')));
});

test('extra configs passed after options override package rules', async () => {
  const eslint = new ESLint({
    cwd: app,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ tsconfigPath: join(app, 'tsconfig.json') }, { rules: { 'local/no-comments': 'off' } }),
  });
  const [result] = await eslint.lintFiles([join(app, 'src/comment.ts')]);
  assert.equal(result.messages.some(message => message.ruleId === 'local/no-comments'), false);
});

test('strict tsconfig accepts clean code', () => {
  const run = spawnSync(tsc, ['-p', join(root, 'test/fixtures/types-good/tsconfig.json')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
});

test('strict tsconfig rejects unchecked index access and undefined optional props', () => {
  const run = spawnSync(tsc, ['-p', join(root, 'test/fixtures/types-bad/tsconfig.json')], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stdout, /unchecked-index\.ts.*TS2322/);
  assert.match(run.stdout, /exact-optional\.ts.*TS2375/);
});

test('localRules join the local plugin next to no-comments', async () => {
  const extra = {
    meta: { type: 'problem', schema: [], messages: { found: 'extra rule ran' } },
    create: context => ({ Program: node => context.report({ node, messageId: 'found' }) }),
  };
  const eslint = new ESLint({
    cwd: app,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ tsconfigPath: join(app, 'tsconfig.json'), localRules: { extra } }, { rules: { 'local/extra': 'error' } }),
  });
  const [result] = await eslint.lintFiles([join(app, 'src/comment.ts')]);
  const rules = errorRules(result.messages);
  assert.ok(rules.includes('local/extra'));
  assert.ok(rules.includes('local/no-comments'));
});

test('restrictedSyntax entries are added to the package selectors', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const restricted = await lint('restricted.ts', { restrictedSyntax });
  assert.ok(restricted.some(message => message.ruleId === 'no-restricted-syntax' && message.message === 'Project-specific restriction.'));
  const assertion = await lint('assertion.ts', { restrictedSyntax });
  assert.ok(assertion.some(message => message.ruleId === 'no-restricted-syntax' && message.message.includes('typescript-strict')));
});

test('i18nRules is exported and matches the rules the i18n option applies', async () => {
  const { i18nRules } = await import('../eslint/index.js');
  const rules = new Map(Object.entries(await rulesFor('literal-text.tsx', { i18n: true })));
  for (const [name, entry] of Object.entries(i18nRules)) {
    assert.equal(rules.get(name)?.[0], 1, name);
    assert.deepEqual(rules.get(name)?.slice(1), entry.slice(1), name);
  }
});

test('no-secrets also scans JSON files', async () => {
  const messages = await lint('secrets.json');
  assert.ok(messages.some(message => message.ruleId === 'no-secrets/no-secrets' && message.severity === 1));
});

test('unused imports stay errors inside editors', async () => {
  assert.equal((await rulesFor('clean.ts', { isInEditor: true }))['unused-imports/no-unused-imports'][0], 2);
});

test('triple-slash references are errors', async () => {
  assert.equal((await rulesFor('clean.ts'))['ts/triple-slash-reference'][0], 2);
});

test('core no-unused-vars is off and unused-imports owns unused variables', async () => {
  const rules = await rulesFor('script.js');
  assert.equal(rules['no-unused-vars']?.[0] ?? 0, 0);
  assert.equal(rules['unused-imports/no-unused-vars'][0], 2);
});
