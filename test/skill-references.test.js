import assert from 'node:assert/strict';
import { test } from 'node:test';
import zoroskr from '../eslint/index.js';

const SKILL_REFERENCE = /See skill `([a-z0-9-]+)`\.$/u;
const GLOBAL_SKILLS = new Set([
  'code-hygiene',
  'correction-retrospective',
  'data-migration-safety',
  'dependency-bumps',
  'nextjs-app-router',
  'react-data-containers',
  'rhf-zod-forms',
  'sentry',
  'trpc-layered-backend',
  'typescript-strict',
  'vitest-testing',
  'webhook-receivers',
  'zod-schemas',
]);
const CUSTOM_MESSAGE_RULES = /(?:^|\/)no-restricted-(?:syntax|imports)$/u;

function collectMessages(value, messages) {
  if (Array.isArray(value)) {
    value.forEach(item => collectMessages(item, messages));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === 'message' && typeof item === 'string') {
      messages.add(item);
    } else {
      collectMessages(item, messages);
    }
  }
}

async function customMessages(options) {
  const messages = new Set();
  for (const block of await zoroskr(options)) {
    for (const [name, value] of Object.entries(block.rules ?? {})) {
      if (CUSTOM_MESSAGE_RULES.test(name)) {
        collectMessages(value, messages);
      }
    }
    for (const rule of Object.values(block.plugins?.local?.rules ?? {})) {
      Object.values(rule?.meta?.messages ?? {}).forEach(message => messages.add(message));
    }
  }
  return messages;
}

const messages = await customMessages({ typescript: true, layeredBackend: true, isomorphic: true });

test('every package lint message points agents to an existing global skill', () => {
  assert.ok(messages.size > 0);
  for (const message of messages) {
    const reference = SKILL_REFERENCE.exec(message);
    assert.ok(reference, `append "See skill \`<name>\`." to: ${message}`);
    assert.ok(GLOBAL_SKILLS.has(reference[1]), `unknown global skill \`${reference[1]}\` in: ${message}`);
  }
});
