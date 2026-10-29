import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const webhookRules = new Set(['local/route-handler-contract', 'local/webhook-receiver-contract']);
const webhooks = { webhooks: true };

const ZOD = 'Do not build Zod schemas in a route handler; import the payload schema from a schema file. See skill `webhook-receivers`.';
const PARSE = 'Do not call a throwing `.parse()`/`.parseAsync()` in a route handler; use `safeParse` and map the failure to the route response. See skill `webhook-receivers`.';
const COMPARE = 'Do not compare a header value or a secret with `===`/`!==`; compare `Buffer`s with `timingSafeEqual` behind a length guard (hash a shared secret first). See skill `webhook-receivers`.';
const JSON_BODY = 'Neutralise `req.json()` with `.catch(() => null)` so a malformed body reaches `safeParse` instead of escaping as a 500. See skill `webhook-receivers`.';
const LOOP = 'Do not iterate in a webhook route (`for`, `while`, `.forEach`); payload iteration belongs in the service. See skill `webhook-receivers`.';

async function lintWith(file, code, options) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, options = webhooks) {
  return (await lintWith(file, code, options)).filter(message => webhookRules.has(message.ruleId)).map(message => message.message);
}

const route = 'src/app/api/leads/route.ts';
const webhook = 'src/app/api/webhooks/twilio/route.ts';
const handler = body => `import { env } from '@/env';\n\nexport async function POST(req: Request) {\n${body}  return new Response(null, { status: 200 });\n}\n`;
const zodImport = 'import { z } from \'zod\';\n\n';

const routeRows = [
  [`${zodImport}export const bodySchema = z.object({ name: z.string() });\n`, [ZOD, ZOD]],
  ['import { z as zod } from \'zod/v4\';\n\nexport const name = zod.string();\n', [ZOD]],
  ['import * as zod from \'zod\';\n\nexport const body = zod.z.object({});\n', [ZOD]],
  [`${zodImport}export const count = z.coerce.number();\n`, [ZOD]],
  [handler('  const body = leadSchema.parse(await req.text());\n  void body;\n'), [PARSE]],
  [handler('  const body = await leadSchema.parseAsync(await req.text());\n  void body;\n'), [PARSE]],
  [handler('  const body = leadSchema[\'parse\'](await req.text());\n  void body;\n'), [PARSE]],
  [handler('  const qs = leadSchema;\n  const body = qs.parse(await req.text());\n  void body;\n'), [PARSE]],
];

const webhookRows = [
  [handler('  if (req.headers.get(\'x-secret\') !== env.WEBHOOK_SECRET) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const signature = req.headers.get(\'x-signature\');\n  if (signature === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler(`  if (auth === \`Bearer \${env.CRON_SECRET}\`) {\n    return accept();\n  }\n`), [COMPARE]],
  [handler(`  const expected = \`Bearer \${env.CRON_SECRET}\`;\n  if (auth !== expected) {\n    return reject();\n  }\n`), [COMPARE]],
  [handler('  if (process.env.API_KEY === key) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  const { WEBHOOK_SECRET } = env;\n  if (provided == WEBHOOK_SECRET) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'x-hub-verify\') !== env.WHATSAPP_VERIFY) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'x-hub-verify\') !== env.provider.verify) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const token = env.provider.apiToken;\n  if (token != provided) {\n    return reject();\n  }\n'), [COMPARE]],
  [`import { headers } from 'next/headers';\n\n${handler('  if ((await headers()).get(\'x-signature\') === digest) {\n    return accept();\n  }\n')}`, [COMPARE]],
  [handler('  if ((req.headers.get(\'x-signature\') ?? \'\') === digest) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  const hs = req.headers;\n  if (hs.get(\'x\') === s) {\n    return accept();\n  }\n'), [COMPARE]],
  [`import { headers } from 'next/headers';\n\n${handler('  const list = await headers();\n  if (list.get(\'x-sig\') !== expected) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [handler('  if (req.headers.get(\'x-signature\')?.slice(7) === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'authorization\')?.substring(7) !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'x-signature\')?.trim() === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'authorization\')?.replace(\'Bearer \', \'\') === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'x-signature\')?.toLowerCase() === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'authorization\')?.split(\' \')[1] === expected) {\n    return accept();\n  }\n'), [COMPARE]],
  [handler('  const token = req.headers.get(\'authorization\')?.split(\' \')[1];\n  if (token !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  switch (req.headers.get(\'authorization\')) {\n    case expected:\n      return accept();\n  }\n'), [COMPARE]],
  [handler('  switch (env.WEBHOOK_SECRET) {\n    case \'\':\n      return reject();\n    case provided:\n      return accept();\n  }\n'), [COMPARE]],
  [`import { WEBHOOK_SECRET } from './constants';\n\n${handler('  if (req.headers.get(\'x-secret\') !== WEBHOOK_SECRET) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import { expectedSignature } from './constants';\n\n${handler('  if (req.headers.get(\'x-signature\') !== expectedSignature) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import { webhookSecret } from './constants';\n\n${handler('  if (req.headers.get(\'x-secret\') !== webhookSecret) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import { WEBHOOK_SECRET as hook } from './constants';\n\n${handler('  if (req.headers.get(\'x-secret\') !== hook) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import { SECRETS } from './constants';\n\n${handler('  if (req.headers.get(\'x-secret\') !== SECRETS.WEBHOOK) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import { EVENTS } from './constants';\n\n${handler('  if (req.headers.get(\'x-token\') !== EVENTS.API_TOKEN) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`import * as config from './config';\n\n${handler('  if (req.headers.get(\'x-key\') !== config.provider.signingKey) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`enum Keys {\n  WEBHOOK_SECRET = 'abc',\n}\n\n${handler('  if (req.headers.get(\'x-secret\') !== Keys.WEBHOOK_SECRET) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`const API_TOKEN = 'abc';\n\n${handler('  if (req.headers.get(\'x-token\') !== API_TOKEN) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`const EXPECTED = digest();\n\n${handler('  if (req.headers.get(\'x-signature\') !== EXPECTED) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [`let EVENT = 'message.created';\n\n${handler('  if (req.headers.get(\'x-event\') !== EVENT) {\n    return reject();\n  }\n')}`, [COMPARE]],
  [handler('  const apiKey = \'abc\';\n  if (req.headers.get(\'x-key\') !== apiKey) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const TOKEN = \'abc\' as const;\n  if (req.headers.get(\'x-token\') !== TOKEN) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const { headers: h } = req;\n  if (h.get(\'x-sig\') !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const { headers: list = new Headers() } = req;\n  if (list.get(\'x-sig\') !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  if (req.headers.get(\'x\')?.split(\'=\').at(1) !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  if (String(req.headers.get(\'x-sig\')) !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler(`  const header = req.headers.get('x-sig');\n  if (\`\${header}\` !== expected) {\n    return reject();\n  }\n`), [COMPARE]],
  [handler('  if (req.headers.get(\'x-sig\')?.toString() !== expected) {\n    return reject();\n  }\n'), [COMPARE]],
  [handler('  const body: unknown = await req.json();\n  void body;\n'), [JSON_BODY]],
  ['export async function POST(request: Request) {\n  const body = await request.json();\n  return Response.json(body);\n}\n', [JSON_BODY]],
  [handler('  void req.json().then(capture);\n'), [JSON_BODY]],
  [handler('  const body: unknown = await req.clone().json();\n  void body;\n'), [JSON_BODY]],
  [handler('  const copy = req.clone();\n  const body: unknown = await copy.json();\n  void body;\n'), [JSON_BODY]],
  [handler('  for (const item of payload.items) {\n    void item;\n  }\n'), [LOOP]],
  [handler('  for (let index = 0; index < payload.items.length; index += 1) {\n    void index;\n  }\n'), [LOOP]],
  [handler('  for (const key in payload) {\n    void key;\n  }\n'), [LOOP]],
  [handler('  while (payload.next) {\n    payload = payload.next;\n  }\n'), [LOOP]],
  [handler('  do {\n    payload = payload.next;\n  } while (payload);\n'), [LOOP]],
  [handler('  payload.items.forEach(capture);\n'), [LOOP]],
];

const rejected = [
  ...routeRows.flatMap(([code, messages]) => [[route, code, messages], [webhook, code, messages]]),
  ...webhookRows.map(([code, messages]) => [webhook, code, messages]),
];

const routeAccepted = [
  'import type { z } from \'zod\';\nimport { z as zod } from \'zod\';\n\nexport type Lead = z.infer<typeof leadSchema>;\nexport const message = (error: zod.ZodError) => zod.prettifyError(error);\n',
  handler('  const parsed = leadSchema.safeParse(JSON.parse(await req.text()));\n  void parsed;\n'),
  handler('  const parsed = await leadSchema.safeParseAsync(await req.text());\n  void parsed;\n'),
  handler('  const sentAt = Date.parse(when);\n  const params = new URLSearchParams(await req.text());\n  void [sentAt, params.get(\'From\')];\n'),
  handler('  const body: unknown = await req.json().catch(() => null);\n  void body;\n'),
  handler('  const target = URL.parse(await req.text());\n  void target;\n'),
  `import qs from 'qs';\n\n${handler('  const query = qs.parse(await req.text());\n  void query;\n')}`,
  `import querystring from 'node:querystring';\n\n${handler('  const query = querystring.parse(await req.text());\n  void query;\n')}`,
  `import * as querystring from 'querystring';\n\n${handler('  const query = querystring.parse(await req.text());\n  void query;\n')}`,
];

const webhookAccepted = [
  handler('  const secret = env.WEBHOOK_SECRET;\n  if (secret === undefined || secret === \'\' || secret == null) {\n    return reject();\n  }\n'),
  handler('  if (typeof env.WEBHOOK_SECRET !== \'string\') {\n    return reject();\n  }\n'),
  handler('  const response = await fetch(url);\n  if (response.status === 200) {\n    return accept();\n  }\n'),
  handler('  const provided = Buffer.from(req.headers.get(\'x-signature\') ?? \'\');\n  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {\n    return reject();\n  }\n'),
  handler('  const secret = env.WEBHOOK_SECRET;\n  if (secret.length === 0) {\n    return reject();\n  }\n'),
  handler('  if (req.headers.get(\'x-event\') === \'message.created\') {\n    return accept();\n  }\n'),
  `const EVENT = 'message.created';\n\n${handler('  if (req.headers.get(\'x-event\') === EVENT) {\n    return accept();\n  }\n')}`,
  `import { EVENT_CREATED } from './constants';\n\n${handler('  if (req.headers.get(\'x-event\') !== EVENT_CREATED) {\n    return reject();\n  }\n')}`,
  `const EVENT = 'message.created';\n\n${handler('  switch (req.headers.get(\'x-event\')) {\n    case \'message.updated\':\n    case EVENT:\n      return accept();\n    default:\n      return reject();\n  }\n')}`,
  handler('  if (req.headers.get(\'authorization\')?.slice(0, 7) === \'Bearer \') {\n    return accept();\n  }\n'),
  handler('  const EVENT = \'message.created\';\n  if (req.headers.get(\'x-event\') !== EVENT) {\n    return reject();\n  }\n'),
  handler('  const EVENT = \'message.created\' as const;\n  if (req.headers.get(\'x-event\') !== EVENT) {\n    return reject();\n  }\n'),
  `import { expectedEvent } from './constants';\n\n${handler('  if (req.headers.get(\'x-event\') !== expectedEvent) {\n    return reject();\n  }\n')}`,
  `import { EVENTS } from './constants';\n\n${handler('  if (req.headers.get(\'x-event\') !== EVENTS.MESSAGE) {\n    return reject();\n  }\n')}`,
  `import * as E from './events';\n\n${handler('  if (req.headers.get(\'x-event\') !== E.A) {\n    return reject();\n  }\n')}`,
  `enum Event {\n  Created = 'message.created',\n}\n\n${handler('  if (req.headers.get(\'x-event\') !== Event.Created) {\n    return reject();\n  }\n')}`,
  handler('  const copy = req.clone();\n  const body: unknown = await copy.json().catch(() => null);\n  void body;\n'),
  handler('  const body: unknown = await req.clone().json().catch(() => null);\n  void body;\n'),
  handler('  const names = payload.items.map(item => item.name);\n  void names;\n'),
];

const accepted = [
  ...routeAccepted.flatMap(code => [[route, code], [webhook, code]]),
  ...webhookAccepted.map(code => [webhook, code]),
  [route, webhookRows[0][0]],
  [route, handler('  const body: unknown = await req.json();\n  void body;\n')],
  [route, handler('  for (const item of payload.items) {\n    void item;\n  }\n')],
];

test('webhooks rejects route and webhook receiver violations', async () => {
  for (const [file, code, messages] of rejected) {
    assert.deepEqual(await lint(file, code), messages, `${file}\n${code}`);
  }
});

test('webhooks accepts thin routes, guards and timing-safe comparisons', async () => {
  for (const [file, code] of accepted) {
    assert.deepEqual(await lint(file, code), [], `${file}\n${code}`);
  }
});

test('webhooks is off by default', async () => {
  for (const [file, code] of rejected) {
    assert.deepEqual(await lint(file, code, {}), [], `${file}\n${code}`);
  }
});

test('webhooks accepts glob overrides and keeps the other default', async () => {
  const code = handler('  const body = await req.json();\n  const parsed = leadSchema.parse(body);\n  void parsed;\n');
  const options = { webhooks: { webhooks: ['src/app/api/providers/**/route.ts'] } };
  assert.deepEqual(await lint('src/app/api/providers/twilio/route.ts', code, options), [JSON_BODY, PARSE]);
  assert.deepEqual(await lint(webhook, code, options), [PARSE]);
  assert.deepEqual(await lint('src/routes/api/leads/route.ts', code, { webhooks: { routes: ['src/routes/**/route.ts'] } }), [PARSE]);
  assert.deepEqual(await lint(route, code, { webhooks: { routes: ['src/routes/**/route.ts'] } }), []);
});

test('route test files are exempt', async () => {
  const code = `${zodImport}export const bodySchema = z.object({});\n`;
  assert.deepEqual(await lint('src/app/api/webhooks/twilio/route.test.ts', code, { webhooks: { routes: ['**/route*.ts'], webhooks: ['**/route*.ts'] } }), []);
});

test('package and restrictedSyntax selectors still fire in webhook routes', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const code = handler('  const forbiddenName = (await req.json()) as string;\n  void forbiddenName;\n');
  const messages = (await lintWith(webhook, code, { webhooks: true, restrictedSyntax })).map(message => message.message);
  assert.ok(messages.includes('Project-specific restriction.'));
  assert.ok(messages.some(message => message.includes('typescript-strict')));
  assert.ok(messages.includes(JSON_BODY));
});
