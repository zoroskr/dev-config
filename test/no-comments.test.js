import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint, Linter } from 'eslint';
import zoroskr from '../eslint/index.js';
import rule from '../eslint/rules/no-comments.cjs';

const config = {
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  linterOptions: { noInlineConfig: true },
  plugins: { local: { rules: { 'no-comments': rule } } },
  rules: { 'local/no-comments': 'error' },
};

for (const code of [
  'const url = "https://example.com/*path*/";',
  'const text = `first\n// text\n/* text */\nlast`;',
  'const expression = /https?:\\/\\//;',
  'const element = <div title="// text">/* text */</div>;',
  '#!/usr/bin/env node\nconst value = 1;',
  '// eslint-disable-next-line no-console\nconsole.log(1);',
  'console.log(1); // eslint-disable-line no-console -- intentional output',
  '/* eslint-disable no-console, @typescript-eslint/no-explicit-any */',
  '/* eslint-enable no-console */',
  '// @ts-expect-error: intentional invalid input\nconst value = 1;',
  '// @ts-expect-error intentional invalid input\nconst value = 1;',
  '// @ts-ignore\nconst value = 1;',
  '// @ts-check',
  '// @ts-nocheck',
  '/* eslint-disable-next-line ts/no-explicit-any */',
  '// eslint-disable-next-line no-restricted-syntax -- legacy cast',
  'const value = 1; // eslint-disable-line ts/no-unsafe-assignment',
  '/* eslint-enable no-restricted-syntax */',
  '/* eslint-disable no-console, ts/no-unsafe */',
  '/// <reference types="vitest/globals" />',
  '/// <reference path=\'./types.d.ts\' />',
  '/// <reference lib="esnext" />',
  '/// <reference no-default-lib="true" />',
]) {
  test(`accepts ${JSON.stringify(code)}`, () => {
    const messages = new Linter().verify(code, config);
    assert.deepEqual(messages.filter(message => message.ruleId === 'local/no-comments' || message.fatal), []);
  });
}

for (const code of [
  '// explanation',
  '/* explanation */',
  '/** exported contract */\nexport const value = 1;',
  'const element = <div>{/* explanation */}</div>;',
  '/* first\nsecond\nthird */',
  '//',
  '/**/',
  '/// ordinary text',
  '// organize-imports-ignore',
  '// organize-imports-ignore because this is prose',
  '// @ts-expect-errorish',
  '// @ts-check explains something',
  '/* @ts-expect-error */',
  '/** @ts-expect-error */',
  '// eslint-disable-next-lineage no-console',
  '// eslint-disable-next-line this is prose',
  '/* eslint-disable no-console\nunrelated prose */',
  '/* eslint-disable no-console, */',
  '// eslint-disable-next-line no-console --',
  '// eslint-disable no-console',
  '/// <reference types="vitest" /> prose',
  '/// <reference nonsense="value" />',
  '// <reference types="vitest" />',
  `const text = \`\${1 /* actual comment */}\`;`,
]) {
  test(`rejects ${JSON.stringify(code)}`, () => {
    const messages = new Linter().verify(code, config);
    assert.equal(messages.some(message => message.fatal), false);
    const reported = messages.filter(message => message.ruleId === 'local/no-comments' && message.severity === 2);
    assert.equal(reported.length, 1);
    assert.match(reported[0].message, /^Comments are forbidden/);
  });
}

for (const code of [
  '/* eslint-disable no-restricted-syntax */',
  '/* eslint-disable ts/no-explicit-any */',
  '/* eslint-disable ts/no-unsafe-assignment, ts/no-unsafe-member-access */',
  '/* eslint-disable no-console, ts/no-unsafe-call -- legacy module */',
  '/*eslint-disable no-restricted-syntax*/',
]) {
  test(`rejects the block-form disable ${JSON.stringify(code)}`, () => {
    const messages = new Linter().verify(code, config);
    assert.equal(messages.some(message => message.fatal), false);
    const reported = messages.filter(message => message.ruleId === 'local/no-comments' && message.severity === 2);
    assert.equal(reported.length, 1);
    assert.equal(reported[0].message, 'Do not disable `no-restricted-syntax`, `ts/no-explicit-any` or `ts/no-unsafe-*` for a whole block or file; use a line-scoped `eslint-disable-next-line` with a reason, or fix the code. See skill `typescript-strict`.');
  });
}

const inlineConfig = { ...config, linterOptions: { reportUnusedDisableDirectives: 'off' } };
const SELF_DISABLE = /^Do not disable `local\/no-comments` or every rule with a bare `eslint-disable` directive \(line \d+\); name the rules to disable\. See skill `code-hygiene`\.$/;

for (const [code, line] of [
  ['/* eslint-disable local/no-comments */\n// prose\n', 1],
  ['/* eslint-disable local/no-comments, no-restricted-syntax */\nconst value = 1;\n', 1],
  ['const value = 1;\n/* eslint-disable no-restricted-syntax, local/no-comments -- legacy */\n', 2],
  ['/* eslint-disable */\n// prose\n', 1],
  ['/* eslint-disable -- legacy module */\n// prose\n', 1],
  ['// eslint-disable-next-line local/no-comments\n/* eslint-disable no-restricted-syntax */\n', 1],
  ['const value = 1; // eslint-disable-line local/no-comments\n', 1],
  ['// eslint-disable-next-line\n/* eslint-disable no-restricted-syntax */\n', 1],
  ['/* eslint-disable-next-line local/no-comments */\n// prose\n', 1],
]) {
  test(`self-disabling ${JSON.stringify(code)} is reported where no directive reaches`, () => {
    const messages = new Linter().verify(code, inlineConfig);
    assert.equal(messages.some(message => message.fatal), false);
    const reported = messages.filter(message => message.ruleId === 'local/no-comments' && message.severity === 2);
    assert.equal(reported.length, 1, JSON.stringify(messages));
    assert.match(reported[0].message, SELF_DISABLE);
    assert.ok(reported[0].message.includes(`(line ${line})`));
    assert.equal(reported[0].line, 0);
  });
}

for (const code of [
  '// eslint-disable-next-line no-console\nconsole.log(1);\n',
  '/* eslint-disable no-console */\nconsole.log(1);\n',
]) {
  test(`named directives keep working with inline config ${JSON.stringify(code)}`, () => {
    assert.deepEqual(new Linter().verify(code, inlineConfig).filter(message => message.ruleId === 'local/no-comments'), []);
  });
}

test('the package config cannot switch the comment guard off from inside a file', async () => {
  const app = join(dirname(dirname(fileURLToPath(import.meta.url))), 'test/fixtures/app');
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr() });
  const code = '/* eslint-disable local/no-comments, no-restricted-syntax */\n// prose\nexport const total = JSON.parse(\'1\') as number;\n';
  const [result] = await eslint.lintText(code, { filePath: join(app, 'src/a.ts') });
  const reported = result.messages.filter(message => message.ruleId === 'local/no-comments');
  assert.equal(reported.length, 1, JSON.stringify(result.messages));
  assert.match(reported[0].message, SELF_DISABLE);
});
