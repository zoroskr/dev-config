import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Linter } from 'eslint';
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
  '/* eslint-disable */',
  '// @ts-expect-error: intentional invalid input\nconst value = 1;',
  '// @ts-expect-error intentional invalid input\nconst value = 1;',
  '// @ts-ignore\nconst value = 1;',
  '// @ts-check',
  '// @ts-nocheck',
  '// organize-imports-ignore',
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
    assert.equal(messages.filter(message => message.ruleId === 'local/no-comments' && message.severity === 2).length, 1);
  });
}
