import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const scratch = mkdtempSync(join(tmpdir(), 'zoroskr-app-router-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const APP_RULES = new Set([
  'local/app-file-placement',
  'local/app-router-syntax',
  'local/route-colocation',
  'local/route-global-scope',
  'local/route-loading',
  'local/route-segment-config',
]);
const SKILL = 'See skill `nextjs-app-router`.';

const INDEX = `Do not create \`index.ts\` barrels; import the explicit file (\`NavTabs/NavTabs\`). ${SKILL}`;
const BARREL = `Do not re-export (\`export * from\`, \`export { x } from\`); import the explicit file instead of a barrel or re-export stub. ${SKILL}`;
const SCHEMA_FOLDER = `A \`*.schema.ts\` file lives below a \`schemas/\` folder (\`schemas/LeadForm/lead-form.schema.ts\`). ${SKILL}`;
const UTIL_FOLDER = `A \`*.util.ts\` file lives below a \`utils/\` folder (\`utils/NormalizeEmail/normalize-email.util.ts\`). ${SKILL}`;
const CONSTANTS_FOLDER = `A \`*.constants.ts\` file lives below a \`constants/\` folder (\`constants/LeadStatus/lead-status.constants.ts\`). ${SKILL}`;
const HOOK_FOLDER = `A hook file (\`use*.ts\`, \`*.hook.ts\`) lives below a \`hooks/\` folder (\`hooks/UseLeadForm/useLeadForm.ts\`). ${SKILL}`;
const componentsOnly = name => `Only component files (\`.tsx\` and their tests) go below \`components/\`; move \`${name}\` to the feature \`schemas/\`, \`utils/\`, \`constants/\` or \`hooks/\` folder. ${SKILL}`;
const nestedUnit = name => `Put \`${name}\` in a unit folder directly inside its category folder; a child component gets a sibling folder in \`components/\`, never a folder inside its parent. ${SKILL}`;
const unitFolder = (name, unit) => `Put \`${name}\` in its own \`${unit}/\` folder inside its category folder (\`components/Foo/Foo.tsx\`, \`utils/NormalizeEmail/normalize-email.util.ts\`). ${SKILL}`;
const routeSegment = name => `Do not put \`${name}\` in a route segment; route segments hold only route files, so move it into a unit folder of the feature \`components/\`, \`utils/\`, \`schemas/\`, \`constants/\` or \`hooks/\` folder. ${SKILL}`;
const pluralSuffix = name => `Use the singular kind suffix in \`${name}\` (\`.schema.ts\`, \`.util.ts\`, \`.hook.ts\`). ${SKILL}`;
const hookName = name => `Name the hook file \`${name}\` in camelCase starting with \`use\` (\`useOrders.ts\`, \`useOrders.hook.ts\`). ${SKILL}`;
const kebabName = name => `Name \`${name}\` in kebab-case before its kind suffix (\`normalize-email.util.ts\`). ${SKILL}`;
const genericName = name => `Do not use the generic file name \`${name}\`; name the unit by its concern (\`utils/NormalizeEmail/normalize-email.util.ts\`). ${SKILL}`;
const ZOD_TSX = `Do not build Zod schemas in a \`.tsx\` file; move the schema to the feature \`schemas/\` folder. ${SKILL}`;
const SCHEMA_TSX = `Do not declare a \`*Schema\` const in a \`.tsx\` file; move it to the feature \`schemas/\` folder. ${SKILL}`;
const STATIC_REDIRECT = `A page that only calls \`redirect()\` with a static path belongs in \`next.config\` \`redirects()\`; delete the page. ${SKILL}`;
const SERVER_TRY = `Do not \`try/catch\` in a Server route file; let errors reach \`error.tsx\`. ${SKILL}`;
const MODE_PROP = `Do not model a major mode with an \`isEditing\`/\`isEditMode\` prop; make it a sub-route (\`[id]/edit/page.tsx\`). ${SKILL}`;
const SERVER_CALLER = 'Create the tRPC server caller only in the shared server caller module (`serverCallerModules`); import it from there. See skill `trpc-layered-backend`.';
const globalScope = (source, scope) => `Do not import \`${source}\` here: a \`(global)/\` folder is private to \`${scope}/\`; move the file up one scope. ${SKILL}`;
const repeatedDynamic = (value, layout) => `Do not repeat \`export const dynamic = '${value}'\`; the ancestor \`${layout}\` already sets it and descendants inherit it. ${SKILL}`;
const missingLoading = callee => `A page that awaits \`${callee}()\` needs a sibling \`loading.tsx\` rendering the feature \`*Skeleton\`. ${SKILL}`;
const LOADING_SKELETON = `A \`loading.tsx\` renders the feature's \`*Skeleton\` element. ${SKILL}`;
const floatingComponents = dir => `Do not keep a \`components/\` folder beside the sub-routes of \`${dir}/\`; move its files to \`(index)/\`, \`(global)/\` or the one sub-route that uses them. ${SKILL}`;
const indexPage = dir => `\`${dir}/\` has sub-routes, so its root page lives in \`${dir}/(index)/page.tsx\`. ${SKILL}`;

const configs = new Map();

async function config(options) {
  const key = JSON.stringify(options);
  if (!configs.has(key)) {
    configs.set(key, await zoroskr(options));
  }
  return configs.get(key);
}

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

async function lintMessages(file, code, { tree = {}, options = { appRouter: true } } = {}) {
  const cwd = writeTree(tree);
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: await config(options) });
  const [result] = await eslint.lintText(code, { filePath: join(cwd, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, settings) {
  return (await lintMessages(file, code, settings))
    .filter(message => APP_RULES.has(message.ruleId))
    .map(message => message.message)
    .sort();
}

const value = 'export const value = 1;\n';
const returnsA = 'export default function Page() {\n  return a;\n}\n';
const component = name => `export function ${name}() {\n  return <span />;\n}\n`;
const page = body => `export default async function Page() {\n${body}}\n`;
const tsconfig = JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } });
const gate = { appRouter: { gateCallees: ['requirePermission'] } };
const gatedPage = page('  await requirePermission({ resource: \'orders\', action: \'read\' });\n  return <OrdersContainer />;\n');
const leadsPage = { 'src/app/leads/page.tsx': '' };
const leadsIndexTree = { 'src/app/leads/(index)/page.tsx': '', 'src/app/leads/[id]/page.tsx': '' };
const ordersTree = {
  'src/app/orders/page.tsx': page('  return null;\n'),
  'src/app/orders/details/page.tsx': page('  return null;\n'),
  'src/app/orders/components/Foo/Foo.tsx': component('Foo'),
};

const rejected = [
  ['F2', 'src/app/orders/orders.ts', 'export * from \'./orders.repository\';\n', [BARREL]],
  ['F2', 'src/app/orders/orders.ts', 'export { default } from \'./OrdersPage\';\n', [BARREL]],
  ['F2', 'src/app/orders/orders.ts', 'export type { Order } from \'./order.schema\';\n', [BARREL]],
  ['F2', 'src/components/Button/Button.tsx', 'export { Button } from \'./ButtonBase\';\n', [BARREL]],
  ['F2', 'src/app/orders/index.ts', value, [INDEX]],
  ['F2', 'src/shared/index.tsx', value, [INDEX]],
  ['F2', 'src/shared/index.ts', 'export * from \'./a\';\n', [BARREL, INDEX]],
  ['F3', 'src/app/orders/lead-form.schema.ts', value, [SCHEMA_FOLDER]],
  ['F3', 'src/app/orders/normalize-email.util.ts', value, [UTIL_FOLDER]],
  ['F3', 'src/app/orders/lead-status.constants.ts', value, [CONSTANTS_FOLDER]],
  ['F3', 'src/app/orders/lead-status.constant.ts', value, [CONSTANTS_FOLDER]],
  ['F3', 'src/app/orders/useOrders.ts', value, [HOOK_FOLDER]],
  ['F3', 'src/app/orders/useOrders.tsx', value, [HOOK_FOLDER]],
  ['F3', 'src/app/orders/orders.hook.ts', value, [HOOK_FOLDER, hookName('orders.hook.ts')]],
  ['F3', 'src/app/orders/useOrders.test.ts', value, [HOOK_FOLDER]],
  ['F3', 'src/app/orders/components/Foo/foo.schema.ts', value, [SCHEMA_FOLDER, componentsOnly('foo.schema.ts')]],
  ['F3', 'src/app/orders/components/Foo/schemas/LeadForm/lead-form.schema.ts', value, [componentsOnly('lead-form.schema.ts')]],
  ['F3', 'src/app/orders/components/Foo/hooks/UseFoo/useFoo.ts', value, [componentsOnly('useFoo.ts')]],
  ['F3', 'src/app/orders/components/Foo/format.ts', value, [componentsOnly('format.ts'), unitFolder('format.ts', 'Format')]],
  ['F3', 'src/app/orders/components/Foo.tsx', component('Foo'), [unitFolder('Foo.tsx', 'Foo')]],
  ['F3', 'src/app/orders/components/Foo/Bar.tsx', component('Bar'), [unitFolder('Bar.tsx', 'Bar')]],
  ['F3', 'src/app/orders/components/Foo/Bar/Bar.tsx', component('Bar'), [nestedUnit('Bar.tsx')]],
  ['F3', 'src/app/orders/components/DataTable/DataTable/DataTable.tsx', component('DataTable'), [nestedUnit('DataTable.tsx')]],
  ['F3', 'src/app/orders/components/Foo/Bar/Bar.test.tsx', value, [nestedUnit('Bar.test.tsx')]],
  ['F3', 'src/app/orders/utils/Group/NormalizeEmail/normalize-email.util.ts', value, [nestedUnit('normalize-email.util.ts')]],
  ['F3', 'src/app/orders/schemas/lead-form.schema.ts', value, [unitFolder('lead-form.schema.ts', 'LeadForm')]],
  ['F3', 'src/app/orders/schemas/Lead/lead-form.schema.ts', value, [unitFolder('lead-form.schema.ts', 'LeadForm')]],
  ['F3', 'src/app/orders/utils/NormalizeEmail/normalize.util.ts', value, [unitFolder('normalize.util.ts', 'Normalize')]],
  ['F3', 'src/app/orders/hooks/useOrders.ts', value, [unitFolder('useOrders.ts', 'UseOrders')]],
  ['F3', 'src/app/orders/helpers.ts', value, [genericName('helpers.ts')]],
  ['F3', 'src/app/orders/schema.ts', value, [genericName('schema.ts')]],
  ['F3', 'src/app/orders/options.tsx', value, [genericName('options.tsx')]],
  ['F3', 'src/app/orders/utils.ts', value, [genericName('utils.ts')]],
  ['F3', 'src/app/orders/constants.ts', value, [genericName('constants.ts')]],
  ['F3', 'src/app/orders/utils/helpers.ts', value, [genericName('helpers.ts'), unitFolder('helpers.ts', 'Helpers')]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { z } from \'zod\';\n\nexport const LeadForm = () => z.string().parse(1);\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'const formSchema = leadSchema.extend({});\n\nexport const LeadForm = () => formSchema;\n', [SCHEMA_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'const schema = leadSchema;\n\nexport const LeadForm = () => schema;\n', [SCHEMA_TSX]],
  ['F5', 'src/app/orders/page.tsx', `import { a } from '../users/(global)/utils/A/a.util';\n\n${returnsA}`, [globalScope('../users/(global)/utils/A/a.util', 'src/app/users')], { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/app/orders/page.tsx', `import { a } from '@/app/users/(global)/utils/A/a.util';\n\n${returnsA}`, [globalScope('@/app/users/(global)/utils/A/a.util', 'src/app/users')], { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/app/orders/page.tsx', 'import type { A } from \'@/app/users/(global)/a\';\n\nexport default function Page(props: A) {\n  return props;\n}\n', [globalScope('@/app/users/(global)/a', 'src/app/users')], { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/app/orders/page.tsx', `import { a } from '@app/users/(global)/a';\n\n${returnsA}`, [globalScope('@app/users/(global)/a', 'src/app/users')], {
    tree: {
      'tsconfig.base.json': '{\n  // shared\n  "compilerOptions": { "paths": { "@app/*": ["./src/app/*"] } },\n}\n',
      'tsconfig.strict.json': JSON.stringify({ extends: './tsconfig.base.json' }),
    },
  }],
  ['F5', 'src/app/orders/details/page.tsx', `import { a } from '../../users/details/(global)/a';\n\n${returnsA}`, [globalScope('../../users/details/(global)/a', 'src/app/users/details')]],
  ['F2', 'src/app/orders/orders.ts', 'import { Orders } from \'./orders.repository\';\n\nexport { Orders };\n', [BARREL]],
  ['F2', 'src/app/orders/page.tsx', 'import OrdersPage from \'./OrdersPage\';\n\nexport default OrdersPage;\n', [BARREL]],
  ['F2', 'src/components/Button/Button.tsx', 'import { ButtonBase } from \'./ButtonBase\';\n\nexport { ButtonBase as default };\n', [BARREL]],
  ['F2', 'src/app/orders/orders.ts', 'import type { Order } from \'./order.schema\';\nimport { load } from \'./load\';\n\nexport type { Order };\nexport { load };\n', [BARREL, BARREL]],
  ['F3', 'src/app/orders/components/Parent/components/Child/Child.tsx', component('Child'), [nestedUnit('Child.tsx')]],
  ['F3', 'src/app/orders/utils/Parent/utils/Child/child.util.ts', value, [nestedUnit('child.util.ts')]],
  ['F3', 'src/app/leads/LeadTable.tsx', component('LeadTable'), [routeSegment('LeadTable.tsx')], { tree: leadsPage }],
  ['F3', 'src/app/leads/LeadRow/LeadRow.tsx', component('LeadRow'), [routeSegment('LeadRow.tsx')], { tree: leadsPage }],
  ['F3', 'src/app/leads/leads.ts', value, [routeSegment('leads.ts')], { tree: { 'src/app/leads/layout.tsx': '' } }],
  ['F3', 'src/app/leads/(index)/LeadTable.tsx', component('LeadTable'), [routeSegment('LeadTable.tsx')], { tree: { 'src/app/leads/(index)/page.tsx': '' } }],
  ['F3', 'src/app/api/leads/handler.ts', value, [routeSegment('handler.ts')], { tree: { 'src/app/api/leads/route.ts': '' } }],
  ['F3', 'src/app/leads/[id]/LeadRow/LeadRow.test.tsx', value, [routeSegment('LeadRow.test.tsx')], { tree: { 'src/app/leads/[id]/not-found.tsx': '' } }],
  ['F3', 'src/app/orders/schemas/Lead/lead.schemas.ts', value, [pluralSuffix('lead.schemas.ts')]],
  ['F3', 'src/app/orders/utils/Format/format.utils.ts', value, [pluralSuffix('format.utils.ts')]],
  ['F3', 'src/app/orders/hooks/Orders/orders.hooks.ts', value, [pluralSuffix('orders.hooks.ts')]],
  ['F3', 'src/app/orders/utils/NormalizeEmail/normalizeEmail.util.ts', value, [kebabName('normalizeEmail.util.ts')]],
  ['F3', 'src/app/orders/schemas/LeadForm/LeadForm.schema.ts', value, [kebabName('LeadForm.schema.ts')]],
  ['F3', 'src/app/orders/schemas/LeadForm/LeadForm.schema.test.ts', value, [kebabName('LeadForm.schema.test.ts')]],
  ['F3', 'src/app/orders/constants/LeadStatus/leadStatus.constants.ts', value, [kebabName('leadStatus.constants.ts')]],
  ['F3', 'src/app/orders/hooks/Orders/Orders.hook.ts', value, [hookName('Orders.hook.ts')]],
  ['F3', 'src/app/orders/hooks/Orders/orders.hook.ts', value, [hookName('orders.hook.ts')]],
  ['F3', 'src/app/orders/hooks/UseOrders/use-orders.hook.ts', value, [hookName('use-orders.hook.ts')]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { z as zod } from \'zod\';\n\nexport const LeadForm = () => zod.string();\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import * as zod from \'zod\';\n\nexport const LeadForm = () => zod[\'object\']({});\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import zod from \'zod\';\n\nexport const LeadForm = () => zod.number().parse(1);\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { object, string } from \'zod/v4\';\n\nexport const LeadForm = () => object({ name: string() });\n', [ZOD_TSX, ZOD_TSX]],
  ['F5', 'src/shared/orders/orders.util.ts', 'import { a } from \'@/app/users/(global)/a\';\n\nexport const b = a;\n', [globalScope('@/app/users/(global)/a', 'src/app/users')], { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/components/Nav/Nav.tsx', 'import { a } from \'../../app/orders/(global)/a\';\n\nexport const Nav = () => a;\n', [globalScope('../../app/orders/(global)/a', 'src/app/orders')]],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nexport default function Page() {\n  redirect(\'/new\');\n}\n', [STATIC_REDIRECT]],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nexport default async function Page() {\n  return redirect(\'/new\');\n}\n', [STATIC_REDIRECT]],
  ['F6', 'src/app/old/page.ts', 'import { permanentRedirect } from \'next/navigation\';\n\nconst Page = () => permanentRedirect(`/new`);\n\nexport default Page;\n', [STATIC_REDIRECT]],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nfunction Page() {\n  redirect(\'/new\');\n}\n\nexport default Page;\n', [STATIC_REDIRECT]],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nconst Page = async () => {\n  redirect(\'/new\');\n};\n\nexport default Page;\n', [STATIC_REDIRECT]],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n\nexport default function Page() {\n  return null;\n}\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic = \'force-dynamic\';\n' } }],
  ['F7', 'src/app/dashboard/page.tsx', 'export const dynamic = \'force-dynamic\';\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic = "force-dynamic";\n' } }],
  ['F7', 'src/app/dashboard/orders/layout.tsx', 'export const dynamic = \'force-dynamic\';\n', [repeatedDynamic('force-dynamic', 'src/app/layout.ts')], { tree: { 'src/app/layout.ts': 'export const dynamic = \'force-dynamic\';\n' } }],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic: \'force-dynamic\' = \'force-dynamic\';\n' } }],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\' as const;\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic: Dynamic = \'force-dynamic\' satisfies Dynamic;\n' } }],
  ['F7', 'src/app/dashboard/orders/layout.tsx', 'export const dynamic: Dynamic = \'force-dynamic\' satisfies Dynamic;\n', [repeatedDynamic('force-dynamic', 'src/app/layout.tsx')], { tree: { 'src/app/layout.tsx': 'export const dynamic = \'force-dynamic\' as const;\n' } }],
  ['F8', 'src/app/orders/page.tsx', page('  try {\n    await load();\n  } catch {\n    return null;\n  }\n  return null;\n'), [SERVER_TRY]],
  ['F8', 'src/app/orders/layout.tsx', page('  try {\n    await load();\n  } finally {\n    done();\n  }\n  return null;\n'), [SERVER_TRY]],
  ['F8', 'src/app/orders/default.tsx', 'export default function Default() {\n  try {\n    return read();\n  } catch {\n    return null;\n  }\n}\n', [SERVER_TRY]],
  ['F9', 'src/app/orders/page.tsx', gatedPage, [missingLoading('requirePermission')], { options: gate }],
  ['F9', 'src/app/orders/page.tsx', page('  await auth.requirePermission();\n  return null;\n'), [missingLoading('requirePermission')], { options: gate }],
  ['F9', 'src/app/orders/page.tsx', gatedPage, [missingLoading('requirePermission')], { options: gate, tree: { 'src/app/orders/details/loading.tsx': '' } }],
  ['F9', 'src/app/orders/loading.tsx', 'export default function Loading() {\n  return <div />;\n}\n', [LOADING_SKELETON]],
  ['F9', 'src/app/orders/loading.tsx', 'export default function Loading() {\n  return <SkeletonRow />;\n}\n', [LOADING_SKELETON]],
  ['F10', 'src/server/caller.ts', 'export const caller = appRouter.createCaller({});\n', [SERVER_CALLER]],
  ['F10', 'src/server/caller.ts', 'export const factory = createCallerFactory(appRouter);\n', [SERVER_CALLER]],
  ['F10', 'src/app/orders/caller.ts', 'export const factory = t.createCallerFactory(appRouter);\n', [SERVER_CALLER], { options: { appRouter: { serverCallerModules: ['src/server/caller.ts'] } } }],
  ['F11', 'src/app/orders/components/Foo/Foo.tsx', component('Foo'), [floatingComponents('src/app/orders')], { tree: ordersTree }],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: ordersTree }],
  ['F11', 'src/app/components/Nav/Nav.tsx', component('Nav'), [floatingComponents('src/app')], { tree: { 'src/app/dashboard/page.ts': '' } }],
  ['F11', 'src/app/orders/[id]/components/Foo/Foo.tsx', component('Foo'), [floatingComponents('src/app/orders/[id]')], { tree: { 'src/app/orders/[id]/edit/page.tsx': '' } }],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: { 'src/app/orders/[id]/page.tsx': '' } }],
  ['F9', 'src/app/orders/page.tsx', 'async function Page() {\n  await requirePermission();\n  return null;\n}\n\nexport { Page as default };\n', [missingLoading('requirePermission')], { options: gate }],
  ['F10', 'src/server/caller.ts', 'import { createCallerFactory as makeFactory } from \'@trpc/server\';\n\nexport const factory = makeFactory(appRouter);\n', [SERVER_CALLER]],
  ['F10', 'src/server/caller.ts', 'export const caller = appRouter[\'createCaller\']({});\n', [SERVER_CALLER]],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: { 'src/app/orders/details/(index)/page.tsx': '' } }],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: { 'src/app/orders/details/(a)/(b)/page.tsx': '' } }],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: { 'src/app/orders/(lists)/active/page.tsx': '' } }],
  ['F11', 'src/app/orders/components/Foo/Foo.tsx', component('Foo'), [floatingComponents('src/app/orders')], { tree: { 'src/app/orders/details/(index)/page.tsx': '' } }],
  ['F11', 'src/app/orders/components/Foo/Foo.tsx', component('Foo'), [floatingComponents('src/app/orders')], { tree: { 'src/app/orders/(lists)/active/page.tsx': '' } }],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { \'isEditing\': boolean };\n\nexport function Foo(props: Props) {\n  return props.isEditing ? <span /> : null;\n}\n', [MODE_PROP]],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { \'isEditMode\'(): boolean };\n\nexport function Foo(props: Props) {\n  return props.isEditMode() ? <span /> : null;\n}\n', [MODE_PROP]],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { isEditing: boolean };\n\nexport function Foo({ isEditing }: Props) {\n  return isEditing ? <span /> : null;\n}\n', [MODE_PROP]],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { isEditMode(): boolean };\n\nexport function Foo({ isEditMode }: Props) {\n  return isEditMode() ? <span /> : null;\n}\n', [MODE_PROP]],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { readonly isEditMode?: boolean };\n\nexport function Foo(props: Props) {\n  return props.isEditMode === true ? <span /> : null;\n}\n', [MODE_PROP]],
  ['F2', 'src/app/orders/page.tsx', 'import OrdersPage from \'./OrdersPage\';\n\nexport default (OrdersPage satisfies Page);\n', [BARREL]],
  ['F2', 'src/app/orders/orders.ts', 'import { Orders } from \'./orders.repository\';\n\nconst Aliased = (Orders as Repository);\n\nexport { Aliased };\n', [BARREL]],
  ['F3', 'src/app/leads/LeadTable.tsx', component('LeadTable'), [routeSegment('LeadTable.tsx')], { tree: leadsIndexTree }],
  ['F3', 'src/app/leads/LeadRow/LeadRow.tsx', component('LeadRow'), [routeSegment('LeadRow.tsx')], { tree: leadsIndexTree }],
  ['F3', 'src/app/faqs/Faq.tsx', component('Faq'), [routeSegment('Faq.tsx')], { tree: { 'src/app/faqs/(index)/page.tsx': '' } }],
  ['F3', 'src/app/leads/LeadTable.tsx', component('LeadTable'), [routeSegment('LeadTable.tsx')], { tree: { 'src/app/leads/[id]/edit/page.tsx': '' } }],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import * as zod from \'zod\';\n\nexport const LeadForm = () => zod.z.object({});\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { z } from \'zod\';\n\nexport const LeadForm = () => z.coerce.number();\n', [ZOD_TSX]],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { iso } from \'zod\';\n\nexport const LeadForm = () => iso.datetime();\n', [ZOD_TSX]],
  ['F5', 'src/app/orders/page.tsx', 'type A = import(\'../users/(global)/a\').A;\n\nexport default function Page(props: A) {\n  return props;\n}\n', [globalScope('../users/(global)/a', 'src/app/users')]],
  ['F5', 'src/app/orders/page.tsx', 'export default async function Page() {\n  return import(`../users/(global)/a`);\n}\n', [globalScope('../users/(global)/a', 'src/app/users')]],
  ['F5', 'src/app/orders/page.tsx', 'export default async function Page() {\n  return import(\'../users/(global)/a\');\n}\n', [globalScope('../users/(global)/a', 'src/app/users')]],
  ['F6', 'src/app/old/page.tsx', 'import { redirect as go } from \'next/navigation\';\n\nexport default function Page() {\n  go(\'/new\');\n}\n', [STATIC_REDIRECT]],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic = (\'force-dynamic\' satisfies Dynamic);\n' } }],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n', [repeatedDynamic('force-dynamic', 'src/app/dashboard/layout.tsx')], { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic = ((\'force-dynamic\') as Dynamic);\n' } }],
  ['F10', 'src/server/caller.ts', 'const { createCallerFactory: make } = t;\n\nexport const factory = make(appRouter);\n', [SERVER_CALLER]],
  ['F10', 'src/server/caller.ts', 'const { createCaller: build = fallback } = appRouter;\n\nexport const caller = build({});\n', [SERVER_CALLER]],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), [indexPage('src/app/orders')], { tree: { 'src/app/orders/settings/billing/page.tsx': '' } }],
  ['F11', 'src/app/orders/components/Foo/Foo.tsx', component('Foo'), [floatingComponents('src/app/orders')], { tree: { 'src/app/orders/[id]/edit/(index)/page.tsx': '' } }],
];

for (const [row, file, code, expected, settings] of rejected) {
  test(`${row} ${file} rejects ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code, settings), [...expected].sort());
  });
}

const accepted = [
  ['F2', 'src/lib/index.ts', 'export * from \'./a\';\n'],
  ['F2', 'src/app/orders/orders.ts', 'import { load } from \'./load\';\n\nexport const orders = load();\n'],
  ['F2', 'src/app/orders/orders.ts', 'import { load } from \'./load\';\n\nfunction orders() {\n  return load();\n}\n\nexport { orders };\nexport default orders;\n'],
  ['F3', 'src/app/leads/page.tsx', page('  return null;\n'), { tree: leadsPage }],
  ['F3', 'src/app/leads/page.test.tsx', value, { tree: leadsPage }],
  ['F3', 'src/app/leads/opengraph-image.tsx', 'export default function Image() {\n  return null;\n}\n', { tree: leadsPage }],
  ['F3', 'src/app/leads/components/LeadRow/LeadRow.tsx', component('LeadRow'), { tree: leadsPage }],
  ['F3', 'src/app/leads/(global)/components/Nav/Nav.tsx', component('Nav'), { tree: leadsPage }],
  ['F3', 'src/app/leads/(global)/providers/server.ts', value, { tree: leadsPage }],
  ['F3', 'src/app/leads/(global)/Nav/Nav.tsx', component('Nav'), { tree: { 'src/app/leads/layout.tsx': '' } }],
  ['F3', 'src/app/leads/LeadRow/LeadRow.tsx', component('LeadRow')],
  ['F3', 'src/app/orders/utils/Base64Url/base64-url.util.ts', value],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { object } from \'./object\';\n\nexport const LeadForm = () => object({});\n'],
  ['F5', 'src/shared/orders/orders.test.ts', 'import { a } from \'../../app/users/(global)/a\';\n\ntest(\'x\', () => a);\n'],
  ['F5', 'src/shared/orders/orders.util.ts', 'import { a } from \'@/shared/(global)/a\';\n\nexport const b = a;\n', { tree: { 'tsconfig.json': tsconfig } }],
  ['F6', 'src/app/old/[id]/page.tsx', `import { redirect } from 'next/navigation';\n\nexport default async function Page({ params }: Props) {\n  redirect(\`/new/\${(await params).id}\`);\n}\n`],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\' as const;\n', { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic: Dynamic = \'force-static\';\n' } }],
  ['F10', 'src/server/caller.ts', 'import { makeFactory } from \'./factory\';\n\nexport const factory = makeFactory(appRouter);\n'],
  ['F11', 'src/app/orders/[id]/page.tsx', page('  return null;\n'), { tree: { 'src/app/orders/[id]/edit/(index)/page.tsx': '' } }],
  ['F11', 'src/app/orders/(index)/page.tsx', page('  return null;\n'), { tree: { 'src/app/orders/(lists)/active/page.tsx': '' } }],
  ['F2', 'src/app/orders/orders.ts', value],
  ['F2', 'src/app/orders/orders.test.ts', 'export * from \'./orders.repository\';\n'],
  ['F3', 'src/app/orders/utils/NormalizeEmail/normalize-email.util.ts', value],
  ['F3', 'src/app/orders/utils/NormalizeEmail/normalize-email.test.ts', value],
  ['F3', 'src/app/orders/schemas/LeadForm/lead-form.schema.ts', value],
  ['F3', 'src/app/orders/schemas/LeadForm/lead-form.schema.test.ts', value],
  ['F3', 'src/app/orders/constants/LeadStatus/lead-status.constants.ts', value],
  ['F3', 'src/app/orders/hooks/UseOrders/useOrders.ts', value],
  ['F3', 'src/app/orders/hooks/UseCurrentUser/useCurrentUser.hook.ts', value],
  ['F3', 'src/app/orders/components/Foo/Foo.tsx', component('Foo')],
  ['F3', 'src/app/orders/components/Foo/Foo.test.tsx', value],
  ['F3', 'src/app/orders/components/Foo/Foo.stories.tsx', value],
  ['F3', 'src/app/orders/page.tsx', page('  return null;\n')],
  ['F3', 'src/app/orders/env.d.ts', 'declare const value: string;\n'],
  ['F3', 'src/components/Foo.tsx', component('Foo')],
  ['F3', 'src/shared/lead.schema.ts', value],
  ['F4', 'src/app/orders/schemas/Lead/lead.schema.ts', 'import { z } from \'zod\';\n\nexport const leadSchema = z.object({});\n'],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.test.tsx', 'const schema = z.object({});\n\ntest(\'x\', () => schema);\n'],
  ['F4', 'src/ui/Form.tsx', 'const formSchema = z.object({});\n\nexport const Form = () => formSchema;\n'],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { leadSchema } from \'../../schemas/Lead/lead.schema\';\n\nexport const LeadForm = () => zodResolver(leadSchema);\n'],
  ['F5', 'src/app/orders/[id]/edit/page.tsx', 'import { a } from \'@/app/(global)/utils/A/a.util\';\nimport { b } from \'../../../(global)/b\';\n\nexport default [a, b];\n', { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/app/orders/details/page.tsx', 'import { a } from \'../(global)/a\';\nimport { b } from \'@/app/orders/(global)/b\';\n\nexport default [a, b];\n', { tree: { 'tsconfig.json': tsconfig } }],
  ['F5', 'src/app/orders/(global)/components/Nav/Nav.tsx', 'import { a } from \'../../a\';\n\nexport const Nav = () => a;\n'],
  ['F5', 'src/app/orders/page.test.tsx', 'import { a } from \'../users/(global)/a\';\n\ntest(\'x\', () => a);\n'],
  ['F5', 'src/app/orders/page.tsx', `import { a } from '@/app/users/(global)/a';\n\n${returnsA}`],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nexport default async function Page() {\n  const user = await getUser();\n  redirect(user.home);\n}\n'],
  ['F6', 'src/app/old/page.tsx', 'import { redirect } from \'next/navigation\';\n\nexport default function Page() {\n  redirect(home);\n}\n'],
  ['F6', 'src/app/old/layout.tsx', 'import { redirect } from \'next/navigation\';\n\nexport default function Layout() {\n  redirect(\'/new\');\n}\n'],
  ['F7', 'src/app/dashboard/layout.tsx', 'export const dynamic = \'force-dynamic\';\n', { tree: { 'src/app/layout.tsx': value } }],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-static\';\n', { tree: { 'src/app/dashboard/layout.tsx': 'export const dynamic = \'force-dynamic\';\n' } }],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n', { tree: { 'src/app/dashboard/orders/details/layout.tsx': 'export const dynamic = \'force-dynamic\';\n', 'src/layout.tsx': 'export const dynamic = \'force-dynamic\';\n' } }],
  ['F8', 'src/app/orders/page.tsx', `'use client';\n\n${page('  try {\n    await load();\n  } catch {\n    return null;\n  }\n  return null;\n')}`],
  ['F8', 'src/app/orders/actions.ts', 'export async function run() {\n  try {\n    await load();\n  } catch {\n    return null;\n  }\n  return 1;\n}\n'],
  ['F8', 'src/app/orders/page.test.tsx', 'test(\'x\', () => {\n  try {\n    run();\n  } catch {\n    fail();\n  }\n});\n'],
  ['F9', 'src/app/orders/page.tsx', gatedPage, { options: gate, tree: { 'src/app/orders/loading.tsx': '' } }],
  ['F9', 'src/app/orders/page.tsx', gatedPage],
  ['F9', 'src/app/orders/page.tsx', page('  await load();\n  return null;\n'), { options: gate }],
  ['F9', 'src/app/orders/page.tsx', page('  const run = async () => {\n    await requirePermission();\n  };\n  return run;\n'), { options: gate }],
  ['F9', 'src/app/orders/loading.tsx', 'export default function Loading() {\n  return <OrdersSkeleton />;\n}\n'],
  ['F9', 'src/app/orders/loading.tsx', 'export default function Loading() {\n  return <UI.TableSkeleton rows={3} />;\n}\n'],
  ['F10', 'src/server/caller.ts', 'export const caller = appRouter.createCaller({});\n', { options: { appRouter: { serverCallerModules: ['src/server/caller.ts'] } } }],
  ['F10', 'src/server/caller.test.ts', 'export const caller = appRouter.createCaller({});\n'],
  ['F10', 'src/server/caller.ts', 'export const caller = appRouter.createCaller({});\n', { options: {} }],
  ['F11', 'src/app/orders/[id]/page.tsx', page('  return null;\n'), { tree: { 'src/app/orders/[id]/edit/page.tsx': '', 'src/app/orders/[id]/details/page.tsx': '' } }],
  ['F11', 'src/app/orders/(index)/page.tsx', page('  return null;\n'), { tree: { 'src/app/orders/details/page.tsx': '' } }],
  ['F11', 'src/app/orders/(index)/components/Foo/Foo.tsx', component('Foo'), { tree: { 'src/app/orders/(index)/page.tsx': '', 'src/app/orders/details/page.tsx': '' } }],
  ['F11', 'src/app/orders/(lists)/components/Foo/Foo.tsx', component('Foo'), { tree: { 'src/app/orders/(lists)/active/page.tsx': '' } }],
  ['F11', 'src/app/users/components/Foo/Foo.tsx', component('Foo'), { tree: { 'src/app/users/page.tsx': '', 'src/app/users/utils/A/a.util.ts': '' } }],
  ['F11', 'src/app/users/page.tsx', page('  return null;\n'), { tree: { 'src/app/users/components/Foo/Foo.tsx': '', 'src/app/users/(global)/page.tsx': '', 'src/app/users/_parts/page.tsx': '', 'src/app/users/@modal/page.tsx': '' } }],
  ['F11', 'src/app/page.tsx', page('  return null;\n'), { tree: { 'src/app/dashboard/page.tsx': '' } }],
  ['F11', 'src/app/orders/components/Foo/Foo.test.tsx', value, { tree: ordersTree }],
  ['F16', 'src/app/orders/components/Foo/Foo.tsx', 'type Props = { isOpen: boolean };\n\nexport function Foo({ isOpen }: Props) {\n  return isOpen ? <span /> : null;\n}\n'],
  ['F16', 'src/app/orders/orders.ts', 'export type Props = { isEditing: boolean };\n'],
  ['F2', 'src/app/orders/orders.ts', 'import { load } from \'./load\';\n\nconst orders = (load() as Orders);\n\nexport { orders };\n'],
  ['F3', 'src/app/leads/LeadTable.tsx', component('LeadTable'), { tree: { 'src/app/leads/(index)/components/Foo/Foo.tsx': '', 'src/app/leads/[id]/components/Bar/Bar.tsx': '' } }],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { z } from \'zod\';\n\nexport const LeadForm = ({ error }: Props) => z.prettifyError(error);\n'],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import { flattenError, prettifyError, treeifyError, ZodError } from \'zod\';\n\nexport const LeadForm = ({ error }: Props) => [prettifyError(error), flattenError(error), treeifyError(error), error instanceof ZodError];\n'],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import * as zod from \'zod\';\n\nexport const LeadForm = ({ error }: Props) => zod.z.flattenError(error);\n'],
  ['F4', 'src/app/orders/components/LeadForm/LeadForm.tsx', 'import type { z } from \'zod\';\n\nexport const LeadForm = (props: z.infer<Schema>) => props;\n'],
  ['F6', 'src/app/old/page.tsx', 'import { go } from \'./go\';\n\nexport default function Page() {\n  go(\'/new\');\n}\n'],
  ['F7', 'src/app/dashboard/orders/page.tsx', 'export const dynamic = \'force-dynamic\';\n', { tree: { 'src/app/dashboard/layout.tsx': '// export const dynamic = \'force-dynamic\';\nexport const revalidate = 0;\n' } }],
  ['F10', 'src/server/caller.ts', 'const { make } = factories;\n\nexport const factory = make(appRouter);\n'],
  ['F11', 'src/app/orders/page.tsx', page('  return null;\n'), { tree: { 'src/app/orders/settings/components/Foo/Foo.tsx': '', 'src/app/orders/settings/_parts/page.tsx': '', 'src/app/orders/settings/(global)/page.tsx': '' } }],
];

for (const [row, file, code, settings] of accepted) {
  test(`${row} ${file} accepts ${JSON.stringify(code)}`, async () => {
    assert.deepEqual(await lint(file, code, settings), []);
  });
}

test('appRouter is off by default and emits no app-router blocks', async () => {
  const names = (await config({})).map(block => block.name ?? '');
  assert.equal(names.some(name => name.startsWith('zoroskr/app-router')), false);
  for (const [, file, code, , settings] of rejected) {
    assert.deepEqual(await lint(file, code, { ...settings, options: {} }), [], `${file} ${code}`);
  }
});

test('appRouter accepts glob overrides and keeps the other defaults', async () => {
  const options = { appRouter: { app: ['src/routes/**/*.{ts,tsx}'] } };
  assert.deepEqual(await lint('src/routes/orders/helpers.ts', value, { options }), [genericName('helpers.ts')]);
  assert.deepEqual(await lint('src/app/orders/helpers.ts', value, { options }), []);
  assert.deepEqual(await lint('src/components/index.ts', value, { options }), [INDEX]);
});

test('base, production, extra and container selectors still fire in app files', async () => {
  const restrictedSyntax = [{ selector: 'Identifier[name=\'forbiddenName\']', message: 'Project-specific restriction.' }];
  const code = 'export { a } from \'./a\';\n\nexport default async function Page(value: unknown) {\n  const forbiddenName = value as string;\n  const totalPages = await import(\'./b\');\n  return [forbiddenName, totalPages];\n}\n';
  for (const file of ['src/app/orders/page.tsx', 'src/app/orders/components/OrdersContainer/OrdersContainer.tsx']) {
    const messages = (await lintMessages(file, code, { options: { appRouter: true, query: true, restrictedSyntax } })).map(message => message.message);
    assert.ok(messages.includes(BARREL), file);
    assert.ok(messages.includes('Project-specific restriction.'), file);
    assert.ok(messages.some(message => message.includes('typescript-strict')), file);
    assert.ok(messages.some(message => message.startsWith('Do not use `import()`')), file);
  }
  const container = (await lintMessages('src/app/orders/components/OrdersContainer/OrdersContainer.tsx', code, { options: { appRouter: true, query: true } })).map(message => message.message);
  assert.ok(container.some(message => message.startsWith('Do not declare `totalPages`')));
});

test('later user configs still override app-router rules', async () => {
  const cwd = writeTree({});
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: await zoroskr({ appRouter: true }, { files: ['**/*.ts'], rules: { 'local/app-file-placement': 'off' } }),
  });
  const [result] = await eslint.lintText(value, { filePath: join(cwd, 'src/app/orders/helpers.ts') });
  assert.equal(result.messages.some(message => message.ruleId === 'local/app-file-placement'), false);
});
