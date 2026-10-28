import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import zoroskr from '../eslint/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, 'test/fixtures/app');
const formRules = new Set(['local/rhf-form-contract', 'local/no-schema-default']);
const forms = { forms: true };

const INLINE_DEFAULTS = 'Do not write literal `defaultValues` inline in `useForm`; export a `<form>FormDefaults` object from the schema file, `satisfies` its type. See skill `rhf-zod-forms`.';
const DEFAULTS_LOCATION = 'Do not declare a `*FormDefaults` object in a `.tsx` file; export it from the form schema file, `satisfies` its type. See skill `rhf-zod-forms`.';
const DEFAULTS_SATISFIES = 'Type a `*FormDefaults` object with `satisfies` against its form type: `export const xFormDefaults = { … } satisfies XForm;`. See skill `rhf-zod-forms`.';
const RESOLVER = 'Validate `useForm` with `resolver: zodResolver(formSchema)` from `@hookform/resolvers/zod`. See skill `rhf-zod-forms`.';
const REGISTER = 'Use the controlled form components (`Controller`) instead of `register`. See skill `rhf-zod-forms`.';
const SUBMIT_GATE = 'Never gate submit on validity or empty strings; let the resolver show errors; disable only while `isPending`. See skill `rhf-zod-forms`.';
const MUTATE_ASYNC = 'Await `mutateAsync` inside `try`/`catch` and show error feedback. See skill `rhf-zod-forms`.';
const FORM_DEFAULT = 'Form fields never use `.default()` or `.prefault()`; set initial values in the defaults object. See skill `rhf-zod-forms`.';

async function lintWith(file, code, options) {
  const eslint = new ESLint({ cwd: app, overrideConfigFile: true, overrideConfig: await zoroskr(options) });
  const [result] = await eslint.lintText(code, { filePath: join(app, file) });
  assert.equal(result.messages.some(message => message.fatal), false, JSON.stringify(result.messages));
  return result.messages.filter(message => message.severity === 2);
}

async function lint(file, code, options = forms) {
  return (await lintWith(file, code, options)).filter(message => formRules.has(message.ruleId));
}

const formFile = 'src/app/leads/components/LeadForm/LeadForm.tsx';
const schemaFile = 'src/app/leads/schemas/LeadForm/lead-form.schema.ts';
const imports = 'import { zodResolver } from \'@hookform/resolvers/zod\';\nimport { useForm } from \'react-hook-form\';\n\n';
const resolver = 'resolver: zodResolver(leadFormSchema)';
const component = body => `${imports}export function LeadForm() {\n${body}  return null;\n}\n`;
const useFormWith = options => component(`  const form = useForm({ ${options} });\n  void form;\n`);
const mutation = '  const { mutateAsync } = api.leads.create.useMutation();\n';
const roles = body => component(`  const { mutateAsync: updateRole } = api.members.updateRole.useMutation();\n  const onSave = async (changes: Change[]) => {\n${body}  };\n  void onSave;\n`);
const submit = body => component(`${mutation}  const onSubmit = async (values: LeadForm) => {\n${body}  };\n  void onSubmit;\n`);
const zodImport = 'import { z } from \'zod\';\n\n';
const formField = (typeImport, signature, body) => `import type { ${typeImport} } from 'react-hook-form';\n\n${signature}\n${body}}\n`;
const rhfTypes = (names, signature, body) => `import type { ${names} } from 'react-hook-form';\n${signature}\n${body}`;
const formReturn = 'UseFormReturn<LeadForm>';
const constantsFiles = ['src/app/leads/constants/lead-form.ts', 'src/lib/lead.constants.ts'];
const stateImports = `import { zodResolver } from '@hookform/resolvers/zod';\nimport { useForm, useFormState } from 'react-hook-form';\n\nexport function LeadForm() {\n  const { control } = useForm({ ${resolver} });\n`;

const rejected = [
  [formFile, useFormWith(`${resolver}, defaultValues: { name: '' }`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: { count: 0, active: false, note: null, tags: [], meta: {}, title: \`x\` }`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: { name: lead.name, phone: '' }`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: { ...leadFormDefaults, name: '' } satisfies LeadForm`), [INLINE_DEFAULTS]],
  [formFile, `import { useForm as useRhf } from 'react-hook-form';\nimport { zodResolver } from '@hookform/resolvers/zod';\n\nexport function LeadForm() {\n  const form = useRhf({ resolver: zodResolver(s), defaultValues: { name: '' } });\n  return form;\n}\n`, [INLINE_DEFAULTS]],
  [schemaFile, `${zodImport}export const leadFormDefaults = { name: '' };\n`, [DEFAULTS_SATISFIES]],
  [schemaFile, `${zodImport}export const leadFormDefaults: LeadForm = { name: '' };\n`, [DEFAULTS_SATISFIES]],
  [schemaFile, `${zodImport}export const leadFormDefaults = { name: '' } as LeadForm;\n`, [DEFAULTS_SATISFIES]],
  [formFile, useFormWith('defaultValues: leadFormDefaults'), [RESOLVER]],
  [formFile, component('  const form = useForm();\n  void form;\n'), [RESOLVER]],
  [formFile, useFormWith('resolver: yupResolver(schema), defaultValues: leadFormDefaults'), [RESOLVER]],
  [formFile, `import { zodResolver } from './resolvers';\nimport { useForm } from 'react-hook-form';\n\nexport function LeadForm() {\n  return useForm({ resolver: zodResolver(s) });\n}\n`, [RESOLVER]],
  [formFile, `import * as Rhf from 'react-hook-form';\n\nexport function LeadForm() {\n  return Rhf.useForm({ defaultValues: leadFormDefaults });\n}\n`, [RESOLVER]],
  [formFile, component(`  const { register } = useForm({ ${resolver} });\n  void register;\n`), [REGISTER]],
  [formFile, component(`  const { register: field } = useForm({ ${resolver} });\n  void field;\n`), [REGISTER]],
  [formFile, `import { useFormContext } from 'react-hook-form';\n\nexport function NameField() {\n  const { register } = useFormContext();\n  return <input {...register('name')} />;\n}\n`, [REGISTER]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  void form.register('name');\n`), [REGISTER]],
  [formFile, component(`  const { control } = useForm({ ${resolver} });\n  void control.register('name');\n`), [REGISTER]],
  [formFile, component(`  const { control: c } = useForm({ ${resolver} });\n  void c.register('name');\n`), [REGISTER]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  void form.control.register('name');\n`), [REGISTER]],
  [formFile, `import { useFormContext } from 'react-hook-form';\n\nexport function NameField() {\n  const methods = useFormContext();\n  return <input {...methods.register('name')} />;\n}\n`, [REGISTER]],
  [formFile, component(`  const { formState: { isValid } } = useForm({ ${resolver} });\n  void isValid;\n`), [SUBMIT_GATE]],
  [formFile, component(`  const { formState } = useForm({ ${resolver} });\n  void formState.isValid;\n`), [SUBMIT_GATE]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  void form.formState.isValid;\n`), [SUBMIT_GATE]],
  [formFile, component(`  const { formState } = useForm({ ${resolver} });\n  const { isValid: valid } = formState;\n  void valid;\n`), [SUBMIT_GATE]],
  [formFile, useFormWith(`${resolver}, mode: 'onChange'`), [SUBMIT_GATE]],
  [formFile, useFormWith(`${resolver}, mode: 'all'`), [SUBMIT_GATE]],
  [formFile, `${imports}export function Save({ name }: Props) {\n  return <button type="submit" disabled={name === ''} />;\n}\n`, [SUBMIT_GATE]],
  [formFile, `${imports}export function Save({ name, isPending }: Props) {\n  return <button type="submit" disabled={isPending || '' == name.trim()} />;\n}\n`, [SUBMIT_GATE]],
  [formFile, `${imports}export function Save({ name }: Props) {\n  return <button type="submit" disabled={!(name !== '')} />;\n}\n`, [SUBMIT_GATE]],
  [formFile, `${imports}export function Save({ rows }: Props) {\n  return <button type="submit" disabled={rows.some(row => row.name === \`\`)} />;\n}\n`, [SUBMIT_GATE]],
  [schemaFile, `${zodImport}export const leadFormSchema = z.object({ name: z.string().default('') });\n`, [FORM_DEFAULT]],
  [schemaFile, `${zodImport}export const leadFormSchema = z.object({ tags: z.array(z.string()).prefault([]) });\n`, [FORM_DEFAULT]],
  [schemaFile, `${zodImport}export const createLeadInputSchema = z.object({ limit: z.number().default(20) });\n`, [FORM_DEFAULT]],
  ['src/app/leads/lead-form.schema.ts', `${zodImport}export const leadFormSchema = z.object({ name: z.string().default('') });\n`, [FORM_DEFAULT]],
  [formFile, submit('    await mutateAsync(values);\n'), [MUTATE_ASYNC]],
  [formFile, component('  const { mutateAsync: create } = api.leads.create.useMutation();\n  const onSubmit = async () => {\n    await create();\n  };\n  void onSubmit;\n'), [MUTATE_ASYNC]],
  [formFile, component('  const create = api.leads.create.useMutation();\n  async function onSubmit() {\n    await create.mutateAsync();\n  }\n  void onSubmit;\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      notify();\n    } catch {\n      fail();\n    }\n    await mutateAsync(values);\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      await mutateAsync(values);\n    } finally {\n      done();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      notify();\n    } catch {\n      await mutateAsync(values);\n    }\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      run(async () => {\n        await mutateAsync(values);\n      });\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, `${imports}import { useMutation as useSave } from '@tanstack/react-query';\n\nexport function LeadForm() {\n  const { mutateAsync: save } = useSave(options);\n  const onSubmit = async () => {\n    await save();\n  };\n  return onSubmit;\n}\n`, [MUTATE_ASYNC]],
  [formFile, useFormWith(`${resolver}, defaultValues: { tags: ['default'] }`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: { ranges: [[0, 10]], name: lead.name }`), [INLINE_DEFAULTS]],
  [formFile, component(`  const defaults = { name: '' };\n  const form = useForm({ ${resolver}, defaultValues: defaults });\n  void form;\n`), [INLINE_DEFAULTS]],
  [formFile, `${imports}export const leadFormDefaults = { name: lead.name } satisfies LeadForm;\n`, [DEFAULTS_LOCATION]],
  [formFile, `${imports}const leadFormDefaults = { name: '' };\n\nexport function LeadForm() {\n  return useForm({ ${resolver}, defaultValues: leadFormDefaults });\n}\n`, [DEFAULTS_LOCATION, INLINE_DEFAULTS]],
  [formFile, component('  const options = { defaultValues: leadFormDefaults };\n  const form = useForm(options);\n  void form;\n'), [RESOLVER]],
  [formFile, component('  const options = { resolver: yupResolver(schema) } as const;\n  const form = useForm(options);\n  void form;\n'), [RESOLVER]],
  [formFile, component('  const options = { resolver: zodResolver(schema), mode: \'onChange\' };\n  const form = useForm(options);\n  void form;\n'), [SUBMIT_GATE]],
  [formFile, component('  const resolver = yupResolver(schema);\n  const form = useForm({ resolver });\n  void form;\n'), [RESOLVER]],
  [formFile, component('  let resolver = zodResolver(schema);\n  const form = useForm({ resolver });\n  void form;\n'), [RESOLVER]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const control = form.control;\n  void control.register('name');\n`), [REGISTER]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const { control } = form;\n  void control.register('name');\n`), [REGISTER]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const field = form.register;\n  void field;\n`), [REGISTER]],
  [formFile, formField('UseFormReturn', 'export function NameField({ form }: { form: UseFormReturn<LeadForm> }) {', '  return <input {...form.register(\'name\')} />;\n'), [REGISTER]],
  [formFile, formField('UseFormReturn', 'export function NameField(form: UseFormReturn<LeadForm>) {', '  return <input {...form.control.register(\'name\')} />;\n'), [REGISTER]],
  [formFile, formField('UseFormRegister', 'type Props = { register: UseFormRegister<LeadForm> };\n\nexport function NameField({ register: field }: Props) {', '  return <input {...field(\'name\')} />;\n'), [REGISTER]],
  [formFile, formField('UseFormReturn as Methods', 'interface Props {\n  form: Methods<LeadForm>;\n}\n\nexport function NameField({ form }: Props) {', '  const { register } = form;\n  return <input {...register(\'name\')} />;\n'), [REGISTER]],
  [formFile, formField('UseFormReturn', 'export function NameField({ register }: UseFormReturn<LeadForm>) {', '  return <input {...register(\'name\')} />;\n'), [REGISTER]],
  [formFile, 'import type * as Rhf from \'react-hook-form\';\n\nexport function NameField({ form }: { form: Rhf.UseFormReturn<LeadForm> }) {\n  return <input {...form.register(\'name\')} />;\n}\n', [REGISTER]],
  [formFile, `${stateImports}  const { isValid } = useFormState({ control });\n  return isValid;\n}\n`, [SUBMIT_GATE]],
  [formFile, `${stateImports}  const state = useFormState({ control });\n  return state.isValid;\n}\n`, [SUBMIT_GATE]],
  [formFile, `${stateImports}  return useFormState({ control }).isValid;\n}\n`, [SUBMIT_GATE]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const formState = form.formState;\n  void formState.isValid;\n`), [SUBMIT_GATE]],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const formState = form.formState;\n  const { isValid } = formState;\n  void isValid;\n`), [SUBMIT_GATE]],
  [formFile, submit('    return mutateAsync(values);\n'), [MUTATE_ASYNC]],
  [formFile, submit('    return mutateAsync(values).then(reset);\n'), [MUTATE_ASYNC]],
  [formFile, component(`${mutation}  const onSubmit = (values: LeadForm) => mutateAsync(values);\n  void onSubmit;\n`), [MUTATE_ASYNC]],
  [formFile, component('  const create = api.leads.create.useMutation();\n  const onSubmit = async (values: LeadForm) => create.mutateAsync(values);\n  void onSubmit;\n'), [MUTATE_ASYNC]],
  [formFile, submit('    await mutateAsync(values).then(reset);\n'), [MUTATE_ASYNC]],
  [formFile, submit('    await mutateAsync(values).catch(fail).then(reset);\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      notify();\n    } catch {\n      fail();\n    }\n    return mutateAsync(values);\n'), [MUTATE_ASYNC]],
  [formFile, roles('    await Promise.all(changes.map(async change => updateRole(change)));\n'), [MUTATE_ASYNC]],
  [formFile, roles('    await Promise.all(changes.map(change => {\n      return updateRole(change);\n    }));\n'), [MUTATE_ASYNC]],
  [formFile, roles('    try {\n      Promise.all(changes.map(change => updateRole(change)));\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, roles('    try {\n      await Promise.all(changes.map(async (change) => {\n        await updateRole(change);\n      }));\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, roles('    try {\n      notify();\n    } catch {\n      fail();\n    }\n    await run(() => updateRole(changes[0]));\n'), [MUTATE_ASYNC]],
  [formFile, component(`  const base = { name: '' };\n  const defaults = base;\n  const form = useForm({ ${resolver}, defaultValues: defaults });\n  void form;\n`), [INLINE_DEFAULTS]],
  [formFile, component(`  const a = { name: '' };\n  const b = a;\n  const c = b;\n  const options = { ${resolver}, defaultValues: c };\n  const form = useForm(options);\n  void form;\n`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: () => ({ name: '' })`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: function () {\n    return { name: '' };\n  }`), [INLINE_DEFAULTS]],
  [formFile, useFormWith(`${resolver}, defaultValues: async () => {\n    if (lead) {\n      return { name: lead.name };\n    }\n    return { name: '' };\n  }`), [INLINE_DEFAULTS]],
  [formFile, component(`  const makeDefaults = () => ({ tags: ['x'] });\n  const form = useForm({ ${resolver}, defaultValues: makeDefaults });\n  void form;\n`), [INLINE_DEFAULTS]],
  [constantsFiles[0], 'export const leadFormDefaults = { name: \'\' };\n', [DEFAULTS_SATISFIES]],
  [constantsFiles[1], 'export const leadFormDefaults: LeadForm = { name: \'\' };\n', [DEFAULTS_SATISFIES]],
  [formFile, component('  const base = { mode: \'onSubmit\' as const };\n  const form = useForm({ ...base, defaultValues: leadFormDefaults });\n  void form;\n'), [RESOLVER]],
  [formFile, component('  const base = { resolver: yupResolver(schema) };\n  const form = useForm({ ...base });\n  void form;\n'), [RESOLVER]],
  [formFile, component('  const inner = { shouldUnregister: true };\n  const base = { ...inner };\n  const options = { ...base, defaultValues: leadFormDefaults };\n  const form = useForm(options);\n  void form;\n'), [RESOLVER]],
  [formFile, rhfTypes('UseFormReturn', 'export function NameField(props: { form: UseFormReturn<LeadForm> }) {', '  return <input {...props.form.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormRegister', 'export function NameField(props: { register: UseFormRegister<LeadForm> }) {', '  return <input {...props.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'type Props = { form: UseFormReturn<LeadForm> };\n\nexport function NameField(props: Props) {', '  const { register } = props.form;\n  return <input {...register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'interface Base {\n  form: UseFormReturn<LeadForm>;\n}\n\ninterface Props extends Base {\n  label: string;\n}\n\nexport function NameField({ form }: Props) {', '  return <input {...form.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'interface Props extends UseFormReturn<LeadForm> {\n  label: string;\n}\n\nexport function NameField(props: Props) {', '  return <input {...props.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormRegister', 'type Base = { register: UseFormRegister<LeadForm> };\n\ninterface Props extends Base {}\n\nexport function NameField({ register }: Props) {', '  return <input {...register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'type Props = { label: string } & { form: UseFormReturn<LeadForm> };\n\nexport function NameField(props: Props) {', '  return <input {...props.form.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, `import type { FC } from 'react';\n${rhfTypes('UseFormRegister', 'export const NameField: FC<{ register: UseFormRegister<LeadForm> }> = ({ register }) => {', '  return <input {...register(\'name\')} />;\n};\n')}`, [REGISTER]],
  [formFile, `import * as React from 'react';\n${rhfTypes('UseFormReturn', 'type Props = { form: UseFormReturn<LeadForm> };\n\nexport const NameField: React.FC<Props> = props => <input {...props.form.register(\'name\')} />;', '')}`, [REGISTER]],
  [formFile, `import type { FunctionComponent } from 'react';\n${rhfTypes('UseFormReturn', 'export const NameField: FunctionComponent<{ form: UseFormReturn<LeadForm> }> = function NameField(props) {', '  return <input {...props.form.register(\'name\')} />;\n};\n')}`, [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', `type Props = Pick<${formReturn}, 'register' | 'control'>;\n\nexport function NameField({ register }: Props) {`, '  return <input {...register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'export function NameField(props: Omit<UseFormReturn<LeadForm>, \'watch\'>) {', '  return <input {...props.register(\'name\')} />;\n}\n'), [REGISTER]],
  [formFile, rhfTypes('UseFormReturn', 'export function Save({ formState: { isValid } }: UseFormReturn<LeadForm>) {', '  return <button type="submit" disabled={!isValid} />;\n}\n'), [SUBMIT_GATE]],
  [formFile, rhfTypes('UseFormReturn', 'type Props = { form: UseFormReturn<LeadForm> };\n\nexport function Save({ form: { formState: { isValid: valid } } }: Props) {', '  return <button type="submit" disabled={!valid} />;\n}\n'), [SUBMIT_GATE]],
  [formFile, rhfTypes('UseFormReturn', 'export function Save(props: { form: UseFormReturn<LeadForm> }) {', '  return <button type="submit" disabled={!props.form.formState.isValid} />;\n}\n'), [SUBMIT_GATE]],
  [formFile, rhfTypes('FormState', 'interface Props {\n  formState: FormState<LeadForm>;\n}\n\nexport function Save(props: Props) {', '  return <button type="submit" disabled={!props.formState.isValid} />;\n}\n'), [SUBMIT_GATE]],
  [formFile, roles('    try {\n      await changes.map(change => updateRole(change));\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, roles('    try {\n      await changes.map(async change => updateRole(change));\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, roles('    try {\n      await changes.forEach(change => updateRole(change));\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, roles('    await changes.map(change => updateRole(change)).catch(fail);\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      return mutateAsync(values);\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, submit('    try {\n      return mutateAsync(values).then(reset);\n    } catch {\n      fail();\n    }\n'), [MUTATE_ASYNC]],
  [formFile, component('  const create = api.leads.create.useMutation();\n  const onSubmit = async (values: LeadForm) => {\n    try {\n      return create.mutateAsync(values);\n    } catch {\n      fail();\n    }\n  };\n  void onSubmit;\n'), [MUTATE_ASYNC]],
];

for (const [file, code, messages, options] of rejected) {
  test(`${file} rejects ${JSON.stringify(code)}`, async () => {
    const reported = await lint(file, code, options);
    assert.deepEqual(reported.map(message => message.message), messages, JSON.stringify(reported));
  });
}

const accepted = [
  [formFile, useFormWith(`${resolver}, defaultValues: leadFormDefaults`)],
  [formFile, useFormWith(`${resolver}, defaultValues: { name: lead.name, phone: lead.phone ?? undefined, tags: lead.tags.map(String), ...leadFormDefaults }`)],
  [formFile, useFormWith(`${resolver}, defaultValues: { ...leadFormDefaults, ...remote }`)],
  [formFile, component('  const form = useForm(formOptions);\n  void form;\n')],
  [formFile, component('  const form = useForm({ ...formOptions });\n  void form;\n')],
  [formFile, `import { zodResolver as zr } from '@hookform/resolvers/zod';\nimport { useForm } from 'react-hook-form';\n\nexport function LeadForm() {\n  return useForm({ resolver: zr(leadFormSchema), defaultValues: leadFormDefaults });\n}\n`],
  [formFile, useFormWith(`${resolver}, mode: 'onSubmit'`)],
  [formFile, useFormWith(`${resolver}, shouldUnregister: true`)],
  [formFile, 'import { useForm } from \'./forms\';\n\nexport function LeadForm() {\n  const { register } = useForm({ defaultValues: { name: \'\' }, mode: \'onChange\' });\n  return register;\n}\n'],
  ['src/app/leads/lead.schema.ts', 'import * as z from \'zod\';\n\nexport const leadSchema = z.object({ name: z.string() }).register(z.globalRegistry, { id: \'lead\' });\n'],
  [formFile, 'export function Worker() {\n  return navigator.serviceWorker.register(\'/sw.js\');\n}\n'],
  [formFile, component(`  const { control, handleSubmit } = useForm({ ${resolver} });\n  return <Controller control={control} name="name" render={() => handleSubmit} />;\n`).replace('  return null;\n', '')],
  [formFile, component(`  const { formState: { errors, isSubmitting } } = useForm({ ${resolver} });\n  void errors;\n  void isSubmitting;\n`)],
  [formFile, 'export function Save({ isPending }: Props) {\n  return <button type="submit" disabled={isPending}>Save</button>;\n}\n'],
  ['src/app/chat/components/SendBox/SendBox.tsx', 'export function SendBox({ text }: Props) {\n  return <button type="button" disabled={text.trim() === \'\'} />;\n}\n'],
  ['src/app/chat/components/AssistantDock/AssistantDock.tsx', 'export function AssistantDock() {\n  const { mutateAsync: ask } = api.ai.ask.useMutation();\n  const send = async () => {\n    await ask();\n  };\n  return send;\n}\n'],
  [formFile, 'export function Save({ count }: Props) {\n  return <button type="submit" disabled={count === 0} />;\n}\n'],
  [formFile, 'export function Save({ status }: Props) {\n  return <button type="submit" className={status === \'\' ? \'a\' : \'b\'} />;\n}\n'],
  [formFile, 'export function Save({ state }: Props) {\n  return <button type="submit" disabled={state.isValid} />;\n}\n'],
  ['src/shared/leads/schemas/lead.schema.ts', `${zodImport}export const listLeadsInputSchema = z.object({ limit: z.number().default(20) });\n`, { forms: true, isomorphic: true }],
  [schemaFile, `${zodImport}export const leadFormSchema = z.object({ name: z.string().min(1) });\n\nexport const leadFormDefaults = { name: '' } satisfies LeadForm;\n`],
  [schemaFile, `${zodImport}export const leadFormDefaults = { name: '' } as const satisfies LeadForm;\n`],
  [schemaFile, `${zodImport}export const leadDefaults = { name: '' };\n`],
  [formFile, submit('    try {\n      await mutateAsync(values);\n      reset();\n    } catch (error) {\n      notify(error instanceof Error ? error.message : t(\'unknownError\'));\n    }\n')],
  [formFile, submit('    try {\n      if (values.ok) {\n        await mutateAsync(values);\n      }\n    } catch {\n      fail();\n    } finally {\n      done();\n    }\n')],
  [formFile, component('  const { mutate } = api.leads.create.useMutation();\n  const onSubmit = (values: LeadForm) => {\n    mutate(values);\n  };\n  void onSubmit;\n')],
  [formFile, component('  const { mutateAsync } = useSWRMutation(key);\n  const onSubmit = async () => {\n    await mutateAsync();\n  };\n  void onSubmit;\n')],
  [formFile.replace('.tsx', '.test.tsx'), `${submit('    await mutateAsync(values);\n')}`],
  ['src/app/leads/schemas/LeadForm/lead-form.schema.test.ts', `${zodImport}export const leadFormSchema = z.object({ name: z.string().default('') });\n`],
  [formFile, useFormWith(`${resolver}, defaultValues: { tags: [lead.tag, 'x'], ids: lead.ids.map(String) }`)],
  [formFile, component(`  const defaults = { name: lead.name, ...leadFormDefaults };\n  const form = useForm({ ${resolver}, defaultValues: defaults });\n  void form;\n`)],
  [formFile, component(`  const form = useForm({ ${resolver}, defaultValues: toLeadForm(lead) });\n  void form;\n`)],
  [formFile, `${imports}const leadDefaults = { name: lead.name };\n\nexport function LeadForm() {\n  return useForm({ ${resolver}, defaultValues: leadDefaults });\n}\n`],
  [formFile, component('  const resolver = zodResolver(leadFormSchema);\n  const form = useForm({ resolver, defaultValues: leadFormDefaults });\n  void form;\n')],
  [formFile, component('  const validate = zodResolver(leadFormSchema);\n  const form = useForm({ resolver: validate });\n  void form;\n')],
  [formFile, component('  const options = { resolver: zodResolver(leadFormSchema), defaultValues: leadFormDefaults } as const;\n  const form = useForm(options);\n  void form;\n')],
  [formFile, component(`  const form = useForm({ ${resolver} });\n  const control = form.control;\n  return <Controller control={control} name="name" render={() => null} />;\n`).replace('  return null;\n', '')],
  [formFile, 'export function Worker({ worker }: { worker: ServiceWorkerContainer }) {\n  return worker.register(\'/sw.js\');\n}\n'],
  [formFile, 'import type { UseFormReturn } from \'./forms\';\n\nexport function NameField({ form }: { form: UseFormReturn<LeadForm> }) {\n  return <input {...form.register(\'name\')} />;\n}\n'],
  [formFile, formField('UseFormReturn', 'export function NameField({ form, register }: { form: UseFormReturn<LeadForm>; register: Registry }) {', '  register.add(form.control);\n  return null;\n')],
  [formFile, `${stateImports}  const { errors, isSubmitting } = useFormState({ control });\n  return [errors, isSubmitting];\n}\n`],
  [formFile, `${imports}import { useFormState } from './forms';\n\nexport function LeadForm() {\n  const { control } = useForm({ ${resolver} });\n  const { isValid } = useFormState({ control });\n  return isValid;\n}\n`],
  [formFile, submit('    await mutateAsync(values).catch(fail);\n')],
  [formFile, submit('    await mutateAsync(values).then(reset).catch(fail);\n')],
  [formFile, submit('    try {\n      return await mutateAsync(values);\n    } catch {\n      fail();\n    }\n')],
  [formFile, submit('    try {\n      return await mutateAsync(values).then(reset);\n    } catch {\n      fail();\n    }\n')],
  [formFile, component('  const { mutate } = api.leads.create.useMutation();\n  const onSubmit = (values: LeadForm) => mutate(values);\n  void onSubmit;\n')],
  ['src/app/chat/components/AssistantDock/AssistantDock.tsx', 'export function AssistantDock() {\n  const { mutateAsync: ask } = api.ai.ask.useMutation();\n  return () => ask();\n}\n'],
  [formFile, roles('    try {\n      await Promise.all(changes.map(async change => updateRole(change)));\n    } catch {\n      fail();\n    }\n')],
  [formFile, roles('    try {\n      await Promise.all(\n        changes.map(async change =>\n          updateRole({ memberId: change.memberId, role: change.role }),\n        ),\n      );\n      notify();\n    } catch (err) {\n      fail(err);\n    }\n')],
  [formFile, roles('    try {\n      await Promise.allSettled(changes.map(function save(change) {\n        return updateRole(change);\n      }));\n    } catch {\n      fail();\n    }\n')],
  [formFile, roles('    try {\n      await Promise.race([run(() => updateRole(changes[0])), timeout()]);\n    } catch {\n      fail();\n    }\n')],
  [formFile, roles('    try {\n      await run(() => updateRole(changes[0]));\n    } catch {\n      fail();\n    }\n')],
  [formFile, roles('    await Promise.any(changes.map(change => updateRole(change))).catch(fail);\n')],
  [formFile, component(`  const a = b;\n  const b = a;\n  const form = useForm({ ${resolver}, defaultValues: a });\n  void form;\n`)],
  [formFile, component(`  const base = { name: lead.name };\n  const defaults = base;\n  const form = useForm({ ${resolver}, defaultValues: defaults });\n  void form;\n`)],
  [formFile, useFormWith(`${resolver}, defaultValues: () => ({ name: lead.name, ...leadFormDefaults })`)],
  [formFile, useFormWith(`${resolver}, defaultValues: async () => toLeadForm(await fetchLead())`)],
  [constantsFiles[0], 'export const leadFormDefaults = { name: \'\' } satisfies LeadForm;\n'],
  [constantsFiles[1], 'export const leadDefaults = { name: \'\' };\n'],
  [constantsFiles[0], 'import { useForm } from \'react-hook-form\';\n\nexport const useLeadForm = () => useForm({ defaultValues: { name: \'\' }, mode: \'onChange\' });\n'],
  [formFile, component('  const base = { resolver: zodResolver(leadFormSchema) };\n  const form = useForm({ ...base, defaultValues: leadFormDefaults });\n  void form;\n')],
  [formFile, component('  const inner = { resolver: zodResolver(leadFormSchema) };\n  const base = { ...inner };\n  const form = useForm({ ...base });\n  void form;\n')],
  [formFile, component('  const base = { mode: \'onSubmit\' as const };\n  const form = useForm({ ...base, ...formOptions });\n  void form;\n')],
  [formFile, component('  const form = useForm({ ...getOptions(), defaultValues: leadFormDefaults });\n  void form;\n')],
  [formFile, `${imports}export function LeadForm(options: Options) {\n  return useForm({ ...options });\n}\n`],
  [formFile, rhfTypes('UseFormReturn', 'export function NameField(props: { form: Registry; label: UseFormReturn<LeadForm> }) {', '  return <input {...props.form.register(\'name\')} />;\n}\n')],
  [formFile, rhfTypes('UseFormReturn', `export function NameField(props: Pick<${formReturn}, 'control'>) {`, '  return <Controller control={props.control} name="name" render={() => null} />;\n}\n')],
  [formFile, rhfTypes('UseFormReturn', 'export function Save({ formState: { errors, isSubmitting } }: UseFormReturn<LeadForm>) {', '  return <button type="submit" disabled={isSubmitting}>{String(errors)}</button>;\n}\n')],
  [formFile, 'export function Save(props: { isValid: boolean; form: { formState: { isValid: boolean } } }) {\n  return <button type="submit" disabled={!props.isValid || !props.form.formState.isValid} />;\n}\n'],
  [formFile, 'import type { FC } from \'./components\';\n\nexport const Worker: FC<{ worker: ServiceWorkerContainer }> = ({ worker }) => worker.register(\'/sw.js\');\n'],
  [formFile, roles('    try {\n      await Promise.all(changes.map(change => updateRole(change)));\n    } catch {\n      fail();\n    }\n')],
  [formFile, component('  const create = api.leads.create.useMutation();\n  const onSubmit = async (values: LeadForm) => {\n    try {\n      return await create.mutateAsync(values);\n    } catch {\n      fail();\n    }\n  };\n  void onSubmit;\n')],
];

for (const [file, code, options] of accepted) {
  test(`${file} accepts ${JSON.stringify(code)}${options ? ` with ${JSON.stringify(options)}` : ''}`, async () => {
    assert.deepEqual(await lint(file, code, options), []);
  });
}

test('forms is off by default', async () => {
  const names = (await zoroskr()).map(config => config.name ?? '');
  assert.equal(names.some(name => name.startsWith('zoroskr/forms')), false);
  for (const [file, code] of rejected) {
    assert.deepEqual(await lint(file, code, {}), [], code);
  }
});

test('forms accepts glob overrides and keeps the other defaults', async () => {
  const options = { forms: { files: ['**/*Form.tsx'] } };
  const code = useFormWith('defaultValues: leadFormDefaults');
  assert.equal((await lint(formFile, code, options)).length, 1);
  assert.deepEqual(await lint('src/app/leads/components/Lead/Lead.tsx', code, options), []);
  assert.equal((await lint(schemaFile, `${zodImport}export const leadFormSchema = z.string().default('');\n`, options)).length, 1);
});

test('the isomorphic rule keeps the input-schema exemption beside forms', async () => {
  const code = `${zodImport}export const listLeadsInputSchema = z.object({ limit: z.number().default(20) });\n`;
  const options = { forms: { schemaFiles: ['**/schemas/**/*.ts'] }, isomorphic: true };
  assert.equal((await lint('src/app/leads/schemas/LeadForm/lead-form.schema.ts', code, options)).length, 1);
  assert.deepEqual(await lint('src/shared/leads/lead.schema.ts', code, options), []);
});

test('the forms rules join the package selectors', async () => {
  const code = useFormWith('defaultValues: leadFormDefaults as LeadForm');
  const rules = (await lintWith(formFile, code, forms)).map(message => message.ruleId);
  assert.ok(rules.includes('local/rhf-form-contract'), JSON.stringify(rules));
  assert.ok(rules.includes('no-restricted-syntax'), JSON.stringify(rules));
});
