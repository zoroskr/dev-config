const { bindingOf, definitionOf, isMutationTrigger } = require('./mutation-trigger.cjs');
const { exportedName, isKeyNamed, isMemberNamed } = require('./process-env.cjs');
const { TS_WRAPPERS, matchesGlobs, unwrap } = require('./query-hooks.cjs');

const FORM_MODULE = 'react-hook-form';
const RESOLVER_MODULE = '@hookform/resolvers/zod';
const USE_FORM = new Set(['useForm']);
const FORM_HOOKS = new Set(['useForm', 'useFormContext']);
const FORM_STATE_HOOKS = new Set(['useFormState']);
const FORM_RETURN = 'UseFormReturn';
const FORM_REGISTER = 'UseFormRegister';
const FORM_MEMBER_TYPES = new Map([['register', FORM_REGISTER], ['control', 'Control'], ['formState', 'FormState']]);
const DEFAULTS_NAME = /FormDefaults$/u;
const DEFAULT_MODE = 'onSubmit';
const DISABLED_COMPARISON = 'JSXAttribute[name.name=\'disabled\'] > JSXExpressionContainer BinaryExpression[operator=/^[!=]==?$/]';
const SIGNS = new Set(['-', '+']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const NAMESPACE = '*';
const PROMISE_COMBINATORS = new Set(['all', 'allSettled', 'race', 'any']);

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

const constInit = (sourceCode, node) => {
  const definition = node?.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
  return definition?.type === 'Variable' && definition.parent.kind === 'const' && definition.node.id === definition.name
    ? unwrap(definition.node.init)
    : null;
};

const typeName = (sourceCode, type) => {
  if (type?.type !== 'TSTypeReference') {
    return null;
  }
  const { typeName: name } = type;
  if (name.type === 'TSQualifiedName') {
    return importedName(sourceCode, name.left, FORM_MODULE) === NAMESPACE ? name.right.name : null;
  }
  return importedName(sourceCode, name, FORM_MODULE);
};

const typeMembers = (sourceCode, type) => {
  if (type.type === 'TSTypeLiteral') {
    return type.members;
  }
  if (type.type === 'TSIntersectionType') {
    return type.types.flatMap(part => typeMembers(sourceCode, part));
  }
  const definition = type.type === 'TSTypeReference' && type.typeName.type === 'Identifier' ? definitionOf(sourceCode, type.typeName) : undefined;
  switch (definition?.node.type) {
    case 'TSInterfaceDeclaration':
      return definition.node.body.body;
    case 'TSTypeAliasDeclaration':
      return typeMembers(sourceCode, definition.node.typeAnnotation);
    default:
      return [];
  }
};

const memberType = (sourceCode, type, key) => {
  if (type === null || typeof type === 'string') {
    return type === FORM_RETURN ? FORM_MEMBER_TYPES.get(key) ?? null : null;
  }
  const name = typeName(sourceCode, type);
  if (name !== null) {
    return memberType(sourceCode, name, key);
  }
  const member = typeMembers(sourceCode, type).find(candidate => candidate.type === 'TSPropertySignature' && !candidate.computed
    && exportedName(candidate.key) === key);
  return member?.typeAnnotation?.typeAnnotation ?? null;
};

const patternType = (sourceCode, pattern) => {
  if (pattern.typeAnnotation !== undefined) {
    return pattern.typeAnnotation.typeAnnotation;
  }
  const { parent } = pattern;
  if (parent.type === 'AssignmentPattern' && parent.left === pattern) {
    return patternType(sourceCode, parent);
  }
  if (parent.type === 'Property' && parent.value === pattern && parent.parent.type === 'ObjectPattern' && !parent.computed) {
    return memberType(sourceCode, patternType(sourceCode, parent.parent), exportedName(parent.key));
  }
  return null;
};

const formTypeOf = (sourceCode, node) => {
  const definition = node.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
  if (definition?.type !== 'Parameter') {
    return null;
  }
  const type = patternType(sourceCode, definition.name);
  return typeof type === 'string' ? type : typeName(sourceCode, type);
};

const isFormObject = (sourceCode, value) => {
  const node = unwrap(value);
  if (node?.type !== 'Identifier') {
    return isFormHookCall(sourceCode, node, FORM_HOOKS);
  }
  const definition = definitionOf(sourceCode, node);
  return formTypeOf(sourceCode, node) === FORM_RETURN
    || (definition?.type === 'Variable' && definition.node.id.type === 'Identifier' && isFormHookCall(sourceCode, unwrap(definition.node.init), FORM_HOOKS));
};

const isFormMember = (sourceCode, value, key) => {
  const node = unwrap(value);
  if (node?.type !== 'Identifier') {
    return isMemberNamed(node, key) && isFormObject(sourceCode, node.object);
  }
  if (formTypeOf(sourceCode, node) === FORM_MEMBER_TYPES.get(key)) {
    return true;
  }
  const definition = definitionOf(sourceCode, node);
  if (definition?.type !== 'Variable' || definition.node.init === null) {
    return false;
  }
  const init = unwrap(definition.node.init);
  if (definition.node.id.type === 'Identifier') {
    return isMemberNamed(init, key) && isFormObject(sourceCode, init.object);
  }
  if (definition.node.id.type !== 'ObjectPattern' || !isFormObject(sourceCode, init)) {
    return false;
  }
  const property = bindingOf(definition.node.id, definition.name);
  return property !== undefined && isKeyNamed(property, key);
};

const isFormState = (sourceCode, value) => {
  const node = unwrap(value);
  return isFormHookCall(sourceCode, node, FORM_STATE_HOOKS)
    || isFormHookCall(sourceCode, constInit(sourceCode, node), FORM_STATE_HOOKS)
    || isFormMember(sourceCode, node, 'formState');
};

const isZodResolverCall = (sourceCode, value) => {
  const node = unwrap(value);
  return node?.type === 'CallExpression' && calleeName(sourceCode, node.callee, RESOLVER_MODULE) === 'zodResolver';
};

const isLiteralValue = (value) => {
  const node = unwrap(value);
  switch (node.type) {
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'ArrayExpression':
      return node.elements.every(element => element !== null && element.type !== 'SpreadElement' && isLiteralValue(element));
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

const chainTop = (node) => {
  const { parent } = node;
  if (TS_WRAPPERS.has(parent.type)) {
    return chainTop(parent);
  }
  const call = parent.parent;
  return parent.type === 'MemberExpression' && parent.object === node && call.type === 'CallExpression' && call.callee === parent
    ? chainTop(call)
    : node;
};

const isSettledByCatch = (call, top) => {
  const node = unwrap(top);
  return node !== call && node.type === 'CallExpression' && isMemberNamed(node.callee, 'catch');
};

const isReturned = ({ parent }, node) => (parent.type === 'ReturnStatement' && parent.argument === node)
  || (parent.type === 'ArrowFunctionExpression' && parent.body === node);

const isHandedOver = node => isReturned(node, node) || (node.parent.type === 'AwaitExpression' && node.parent.argument === node);

const isPromiseCombinator = callee => callee.type === 'MemberExpression' && !callee.computed
  && callee.object.type === 'Identifier' && callee.object.name === 'Promise' && PROMISE_COMBINATORS.has(callee.property.name);

const outsideArrays = node => (node.parent.type === 'ArrayExpression' ? outsideArrays(node.parent) : node);

const settlingCall = (node) => {
  const argument = outsideArrays(node);
  const { parent } = argument;
  return parent.type === 'CallExpression' && parent.arguments.includes(argument) && isPromiseCombinator(parent.callee)
    ? settlingCall(parent)
    : node;
};

const receivingCall = (fn) => {
  const argument = outsideArrays(fn);
  const { parent } = argument;
  return parent.type === 'CallExpression' && parent.arguments.includes(argument) ? settlingCall(parent) : null;
};

const enclosingFunction = (sourceCode, node) => sourceCode.getAncestors(node).findLast(ancestor => FUNCTIONS.has(ancestor.type));

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

const isSettledByCaller = (sourceCode, top) => {
  const fn = isReturned(top, top) ? enclosingFunction(sourceCode, top) : undefined;
  const call = fn === undefined ? null : receivingCall(fn);
  if (call === null) {
    return false;
  }
  const outer = chainTop(call);
  return isSettledByCatch(call, outer)
    || (outer.parent.type === 'AwaitExpression' && outer.parent.argument === outer && insideTryCatch(sourceCode, outer));
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
      defaultsLocation: 'Do not declare a `*FormDefaults` object in a `.tsx` file; export it from the form schema file, `satisfies` its type. See skill `rhf-zod-forms`.',
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
    const isComponentFile = context.filename.endsWith('.tsx');
    const importsForm = sourceCode.ast.body.some(statement => statement.type === 'ImportDeclaration' && statement.source.value === FORM_MODULE);

    const resolved = (value) => {
      const node = unwrap(value);
      return constInit(sourceCode, node) ?? node;
    };

    const checkOptions = (call) => {
      const options = call.arguments.length === 0 ? null : resolved(call.arguments[0]);
      if (options !== null && options.type !== 'ObjectExpression') {
        return;
      }
      const properties = options?.properties ?? [];
      const resolver = properties.find(property => isKeyNamed(property, 'resolver'));
      const spread = properties.some(property => property.type === 'SpreadElement');
      if (resolver === undefined ? !spread : !isZodResolverCall(sourceCode, resolved(resolver.value))) {
        context.report({ node: resolver ?? call, messageId: 'resolver' });
      }
      const defaults = properties.find(property => isKeyNamed(property, 'defaultValues'));
      const values = defaults === undefined ? null : resolved(defaults.value);
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
      if (isFormState(sourceCode, init)) {
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
        if (formTypeOf(sourceCode, node.callee) === FORM_REGISTER) {
          context.report({ node, messageId: 'register' });
        }
        if (importsForm && isMutationTrigger(sourceCode, node.callee, ['mutateAsync'])) {
          const top = chainTop(node);
          if (!isSettledByCatch(node, top) && isHandedOver(top) && !insideTryCatch(sourceCode, top)
            && !isSettledByCaller(sourceCode, top)) {
            context.report({ node: top, messageId: 'mutateAsync' });
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && node.init !== null) {
          checkPattern(node.id, node.init);
        }
        if (node.id.type !== 'Identifier' || !DEFAULTS_NAME.test(node.id.name)) {
          return;
        }
        if (isSchemaFile && node.init !== null && node.init.type !== 'TSSatisfiesExpression') {
          context.report({ node, messageId: 'defaultsSatisfies' });
        }
        if (!isSchemaFile && isComponentFile) {
          context.report({ node, messageId: 'defaultsLocation' });
        }
      },
      MemberExpression(node) {
        if (isMemberNamed(node, 'isValid') && isFormState(sourceCode, node.object)) {
          context.report({ node, messageId: 'submitGate' });
        }
        if (isMemberNamed(node, 'register') && (isFormObject(sourceCode, node.object) || isFormMember(sourceCode, node.object, 'control'))) {
          context.report({ node, messageId: 'register' });
        }
      },
      [DISABLED_COMPARISON](node) {
        if (importsForm && (isEmptyString(node.left) || isEmptyString(node.right))) {
          context.report({ node, messageId: 'submitGate' });
        }
      },
    };
  },
};
