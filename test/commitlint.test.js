import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, 'node_modules/.bin/commitlint');
const config = join(root, 'test/fixtures/commitlint/commitlint.config.js');

function lintMessage(message) {
  return spawnSync(cli, ['--config', config], { cwd: root, input: message, encoding: 'utf8' });
}

test('accepts a conventional commit', () => {
  const run = lintMessage('feat: add strict eslint factory');
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

for (const [message, rule] of [
  ['added stuff', 'type-empty'],
  ['feature: add stuff', 'type-enum'],
  ['feat: Add Stuff', 'subject-case'],
  ['feat: add stuff.', 'subject-full-stop'],
  [`feat: ${'a'.repeat(151)}`, 'header-max-length'],
]) {
  test(`rejects "${message.slice(0, 30)}" with ${rule}`, () => {
    const run = lintMessage(message);
    assert.equal(run.status, 1);
    assert.ok(run.stdout.includes(`[${rule}]`), run.stdout);
  });
}

test('allows headers up to 150 characters', () => {
  const run = lintMessage(`feat: ${'a'.repeat(144)}`);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
