import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const RULE_ID = 'local/no-inline-zod-infer';
const adapterOption = { rules: { [RULE_ID]: ['error', { schemaFiles: ['\\.schema(?:-adapter)?\\.[cm]?tsx?$', '/schemas/.+\\.[cm]?tsx?$'] }] } };

async function ruleMessages(code, filename = 'src/backend/modules/example/example.service.ts', ...userConfigs) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr({}, ...userConfigs) });
  const [result] = await eslint.lintText(code, { filePath: join(app, filename) });
  return result.messages.filter(message => message.ruleId === RULE_ID || message.fatal);
}

const importedSchema = 'import type { z } from \'zod\';\nimport type { userSchemaRaw } from \'@shared/usuarios/schemas/user.schema-adapter\';\n';
const localSchema = 'import { z } from \'zod\';\nconst formSchema = z.object({ name: z.string() });\n';

for (const [name, code] of [
  ['an imported named type', 'import type { UserRaw } from \'@shared/usuarios/schemas/user.schema-adapter\';\nexport function f(user: UserRaw) { return user.id; }'],
  ['an alias of a schema declared in the same file', `${localSchema}type FormValues = z.infer<typeof formSchema>;`],
  ['an exported alias of a schema declared in the same file', `${localSchema}export type FormValues = z.infer<typeof formSchema>;`],
  ['z.input of a local schema', `${localSchema}type FormInput = z.input<typeof formSchema>;`],
  ['z.output of a local schema', `${localSchema}type FormOutput = z.output<typeof formSchema>;`],
  ['a non-zod qualified generic', 'import type { Prisma } from \'p\';\ntype Row = Prisma.infer<typeof x>;\nconst x = 1;'],
]) {
  test(`accepts ${name}`, async () => {
    assert.deepEqual(await ruleMessages(code), []);
  });
}

const schemaFiles = [
  'src/shared/usuarios/schemas/user.schema-adapter.ts',
  'src/shared/usuarios/schemas/change-user-email.schema.ts',
  'src/backend/modules/usuarios/two-factor/password-2fa.schema.ts',
  'src/app/dashboard/foo/components/Bar/schemas/bar.schema.ts',
  'src/app/dashboard/foo/components/Bar/schemas/index.ts',
  'src/backend/modules/foo/schemas/FooSchema/foo.ts',
];

for (const filename of schemaFiles) {
  test(`accepts a local schema in any position in schema file ${filename}`, async () => {
    const code = `${localSchema}export function f(values: z.infer<typeof formSchema>) { return values; }\ntype Many = Array<z.output<typeof formSchema>>;\nexport type Check = Many extends z.input<typeof formSchema>[] ? true : false;`;
    assert.deepEqual(await ruleMessages(code, filename), []);
  });

  test(`reports an imported schema in schema file ${filename}`, async () => {
    const messages = await ruleMessages(`${importedSchema}export function f(user: z.infer<typeof userSchemaRaw>) { return user; }`, filename);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.match(messages[0].message, /userSchemaRaw/);
  });
}

for (const [name, code] of [
  ['an alias of an imported schema', `${importedSchema}export type User = z.infer<typeof userSchemaRaw>;`],
  ['a conditional over an imported schema', `${localSchema}import type { userSchemaRaw } from './user.schema';\nexport type Check = z.output<typeof formSchema> extends z.output<typeof userSchemaRaw> ? true : false;`],
  ['a parameter shadowing a local schema', `${localSchema}import type { imported } from './source';\nexport function f(formSchema: typeof imported) {\n  type FormValues = z.infer<typeof formSchema>;\n  return formSchema;\n}`],
  ['a mutable let schema', 'import { z } from \'zod\';\nlet formSchema = z.object({});\nexport type FormValues = z.infer<typeof formSchema>;'],
  ['a qualified schema reference', 'import { z } from \'zod\';\nimport * as schemas from \'./other.schema\';\nexport type User = z.infer<typeof schemas.userSchema>;'],
]) {
  test(`reports ${name} inside a schema file`, async () => {
    const messages = await ruleMessages(code, 'src/shared/usuarios/schemas/user.schema.ts');
    assert.equal(messages.length, 1, JSON.stringify(messages));
  });
}

test('a .schema-adapter.ts file outside schemas/ is not a schema file by default', async () => {
  const code = `${localSchema}export function f(values: z.infer<typeof formSchema>) { return values; }`;
  assert.equal((await ruleMessages(code, 'src/shared/usuarios/user.schema-adapter.ts')).length, 1);
  assert.deepEqual(await ruleMessages(code, 'src/shared/usuarios/user.schema-adapter.ts', adapterOption), []);
});

test('schemaFiles keeps imported schemas reported in added schema files', async () => {
  const messages = await ruleMessages(`${importedSchema}export type User = z.infer<typeof userSchemaRaw>;`, 'src/shared/usuarios/user.schema-adapter.ts', adapterOption);
  assert.equal(messages.length, 1);
});

for (const [name, code] of [
  ['a parameter typed with z.infer of an imported schema', `${importedSchema}export function f(user: z.infer<typeof userSchemaRaw>) { return user.id; }`],
  ['an arrow parameter typed with z.infer', `${importedSchema}export const f = (user: z.infer<typeof userSchemaRaw>) => user.id;`],
  ['an alias of an imported schema', `${importedSchema}type Editor = z.infer<typeof userSchemaRaw>;`],
  ['z.input of an imported schema', `${importedSchema}type Editor = z.input<typeof userSchemaRaw>;`],
  ['z.output of an imported schema', `${importedSchema}type Editor = z.output<typeof userSchemaRaw>;`],
  ['a generic argument', `${importedSchema}const users: Array<z.infer<typeof userSchemaRaw>> = [];`],
  ['a property type', `${importedSchema}type Props = { user: z.infer<typeof userSchemaRaw> };`],
  ['a local schema used inline in a parameter', `${localSchema}export function f(values: z.infer<typeof formSchema>) { return values; }`],
  ['a local schema wrapped in another type', `${localSchema}type Many = Array<z.infer<typeof formSchema>>;`],
  ['an inline z.infer in a test file', `${importedSchema}const user: z.infer<typeof userSchemaRaw> = makeUser();`],
  ['an alias of a mutable let schema', 'import { z } from \'zod\';\nlet formSchema = z.object({});\ntype FormValues = z.infer<typeof formSchema>;'],
  ['an alias of a var schema', 'import { z } from \'zod\';\nvar formSchema = z.object({});\ntype FormValues = z.infer<typeof formSchema>;'],
  ['a parameter shadowing a local schema', `${localSchema}import type { imported } from './source';\nexport function f(formSchema: typeof imported) {\n  type FormValues = z.infer<typeof formSchema>;\n  return formSchema;\n}`],
  ['a union body of a local schema', `${localSchema}type FormValues = z.infer<typeof formSchema> | null;`],
  ['a namespace import alias of an imported schema', 'import type * as z from \'zod\';\nimport type { userSchemaRaw } from \'./user\';\ntype Editor = z.infer<typeof userSchemaRaw>;'],
]) {
  test(`reports ${name}`, async () => {
    const messages = await ruleMessages(code);
    assert.equal(messages.length, 1, JSON.stringify(messages));
    assert.equal(messages[0].ruleId, RULE_ID);
    assert.match(messages[0].message, /Import the type exported next to the schema/);
  });
}

test('reports in a test file path too', async () => {
  const messages = await ruleMessages(`${importedSchema}const user: z.infer<typeof userSchemaRaw> = makeUser();`, 'src/backend/modules/usuarios/usuarios.service.test.ts');
  assert.equal(messages.length, 1);
});

test('names the schema in the message and points to zod-schemas', async () => {
  const [message] = await ruleMessages(`${importedSchema}type Editor = z.infer<typeof userSchemaRaw>;`);
  assert.match(message.message, /userSchemaRaw/);
  assert.match(message.message, /See skill `zod-schemas`\.$/);
});
