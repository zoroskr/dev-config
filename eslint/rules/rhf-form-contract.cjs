const { bindingOf, definitionOf, isMutationTrigger } = require('./mutation-trigger.cjs');
const { exportedName, isKeyNamed, isMemberNamed } = require('./process-env.cjs');
const { matchesGlobs, unwrap } = require('./query-hooks.cjs');

const FORM_MODULE = 'react-hook-form';
const RESOLVER_MODULE = '@hookform/resolvers/zod';
const USE_FORM = new Set(['useForm']);
const FORM_HOOKS = new Set(['useForm', 'useFormContext']);
const DEFAULTS_NAME = /FormDefaults$/u;
const DEFAULT_MODE = 'onSubmit';
const DISABLED_COMPARISON = 'JSXAttribute[name.name=\'disabled\'] > JSXExpressionContainer BinaryExpression[operator=/^[!=]==?$/]';
const SIGNS = new Set(['-', '+']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const NAMESPACE = '*';

const importedName = (sourceCode, node, source) => {
  const definition = node.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
  if (definition?.type !== 'ImportBinding' || definition.parent.source.value !== source) {
    return null;
  }
  return definition.node.type === 'ImportSpecifier' ? exportedName(definition.node.imported) : NAMESPACE;
};

const calleeName = (sourceCode, callee, source) => {
  if (callee.type === 'MemberExpression') {
    return !callee.computed && importedName(sourceCode, callee.object, source) === NAMESPACE ? callee.property.name : null;
  }
  return importedName(sourceCode, callee, source);
};

const isFormHookCall = (sourceCode, node, names) => node?.type === 'CallExpression'
  && names.has(calleeName(sourceCode, node.callee, FORM_MODULE));

const isFormObject = (sourceCode, value) => {
  const node = unwrap(value);
  if (node?.type !== 'Identifier') {
    return isFormHookCall(sourceCode, node, FORM_HOOKS);
  }
  const definition = definitionOf(sourceCode, node);
  return definition?.type === 'Variable' && definition.node.id.type === 'Identifier' && isFormHookCall(sourceCode, unwrap(definition.node.init), FORM_HOOKS);
};

const isFormMember = (sourceCode, value, key) => {
  const node = unwrap(value);
  if (node?.type !== 'Identifier') {
    return isMemberNamed(node, key) && isFormObject(sourceCode, node.object);
  }
  const definition = definitionOf(sourceCode, node);
  if (definition?.type !== 'Variable' || definition.node.id.type !== 'ObjectPattern' || !isFormObject(sourceCode, definition.node.init)) {
    return false;
  }
  const property = bindingOf(definition.node.id, definition.name);
  return property !== undefined && isKeyNamed(property, key);
};

const isZodResolverCall = (sourceCode, value) => {
  const node = unwrap(value);
  return node.type === 'CallExpression' && calleeName(sourceCode, node.callee, RESOLVER_MODULE) === 'zodResolver';
};

const isLiteralValue = (value) => {
  const node = unwrap(value);
  switch (node.type) {
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'ArrayExpression':
      return node.elements.length === 0;
    case 'ObjectExpression':
      return node.properties.length === 0 || hasLiteralValue(node);
    case 'UnaryExpression':
      return SIGNS.has(node.operator) && node.argument.type === 'Literal';
    default:
      return false;
  }
};

function hasLiteralValue(object) {
  return object.properties.some(property => property.type === 'Property' && isLiteralValue(property.value));
}

const isEmptyString = node => (node.type === 'Literal' && node.value === '')
  || (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis[0].value.cooked === '');

const insideTryCatch = (sourceCode, node) => {
  let child = node;
  for (const ancestor of sourceCode.getAncestors(node).toReversed()) {
    if (FUNCTIONS.has(ancestor.type)) {
      return false;
    }
    if (ancestor.type === 'TryStatement' && ancestor.block === child && ancestor.handler !== null) {
      return true;
    }
    child = ancestor;
  }
  return false;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { schemaFiles: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      inlineDefaults: 'Do not write literal `defaultValues` inline in `useForm`; export a `<form>FormDefaults` object from the schema file, `satisfies` its type. See skill `rhf-zod-forms`.',
      defaultsSatisfies: 'Type a `*FormDefaults` object with `satisfies` against its form type: `export const xFormDefaults = { … } satisfies XForm;`. See skill `rhf-zod-forms`.',
      resolver: 'Validate `useForm` with `resolver: zodResolver(formSchema)` from `@hookform/resolvers/zod`. See skill `rhf-zod-forms`.',
      register: 'Use the controlled form components (`Controller`) instead of `register`. See skill `rhf-zod-forms`.',
      submitGate: 'Never gate submit on validity or empty strings; let the resolver show errors; disable only while `isPending`. See skill `rhf-zod-forms`.',
      mutateAsync: 'Await `mutateAsync` inside `try`/`catch` and show error feedback. See skill `rhf-zod-forms`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const { schemaFiles = [] } = context.options[0] ?? {};
    const isSchemaFile = matchesGlobs(context, schemaFiles);
    const importsForm = sourceCode.ast.body.some(statement => statement.type === 'ImportDeclaration' && statement.source.value === FORM_MODULE);

    const checkOptions = (call) => {
      const options = call.arguments.length === 0 ? null : unwrap(call.arguments[0]);
      if (options !== null && options.type !== 'ObjectExpression') {
        return;
      }
      const properties = options?.properties ?? [];
      const resolver = properties.find(property => isKeyNamed(property, 'resolver'));
      const spread = properties.some(property => property.type === 'SpreadElement');
      if (resolver === undefined ? !spread : !isZodResolverCall(sourceCode, resolver.value)) {
        context.report({ node: resolver ?? call, messageId: 'resolver' });
      }
      const defaults = properties.find(property => isKeyNamed(property, 'defaultValues'));
      const values = defaults === undefined ? null : unwrap(defaults.value);
      if (values?.type === 'ObjectExpression' && hasLiteralValue(values)) {
        context.report({ node: defaults, messageId: 'inlineDefaults' });
      }
      const mode = properties.find(property => isKeyNamed(property, 'mode'));
      const modeValue = mode === undefined ? null : unwrap(mode.value);
      if (mode !== undefined && !(modeValue.type === 'Literal' && modeValue.value === DEFAULT_MODE)) {
        context.report({ node: mode, messageId: 'submitGate' });
      }
    };

    const checkPattern = (pattern, init) => {
      const properties = pattern.properties.filter(property => property.type === 'Property');
      if (isFormMember(sourceCode, init, 'formState')) {
        properties.filter(property => isKeyNamed(property, 'isValid')).forEach(node => context.report({ node, messageId: 'submitGate' }));
      }
      if (!isFormObject(sourceCode, init)) {
        return;
      }
      for (const property of properties) {
        if (isKeyNamed(property, 'register')) {
          context.report({ node: property, messageId: 'register' });
        }
        if (isKeyNamed(property, 'formState') && property.value.type === 'ObjectPattern') {
          property.value.properties
            .filter(nested => isKeyNamed(nested, 'isValid'))
            .forEach(node => context.report({ node, messageId: 'submitGate' }));
        }
      }
    };

    return {
      CallExpression(node) {
        if (isFormHookCall(sourceCode, node, USE_FORM)) {
          checkOptions(node);
        }
        if (isMemberNamed(node.callee, 'register')
          && (isFormObject(sourceCode, node.callee.object) || isFormMember(sourceCode, node.callee.object, 'control'))) {
          context.report({ node, messageId: 'register' });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && node.init !== null) {
          checkPattern(node.id, node.init);
        }
        if (isSchemaFile && node.id.type === 'Identifier' && DEFAULTS_NAME.test(node.id.name)
          && node.init !== null && node.init.type !== 'TSSatisfiesExpression') {
          context.report({ node, messageId: 'defaultsSatisfies' });
        }
      },
      MemberExpression(node) {
        if (isMemberNamed(node, 'isValid') && isFormMember(sourceCode, node.object, 'formState')) {
          context.report({ node, messageId: 'submitGate' });
        }
      },
      [DISABLED_COMPARISON](node) {
        if (importsForm && (isEmptyString(node.left) || isEmptyString(node.right))) {
          context.report({ node, messageId: 'submitGate' });
        }
      },
      AwaitExpression(node) {
        const call = unwrap(node.argument);
        if (importsForm && call.type === 'CallExpression' && isMutationTrigger(sourceCode, call.callee, ['mutateAsync']) && !insideTryCatch(sourceCode, node)) {
          context.report({ node, messageId: 'mutateAsync' });
        }
      },
    };
  },
};
