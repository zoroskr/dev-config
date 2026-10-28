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
const FORM_STATE = 'FormState';
const FORM_MEMBER_TYPES = new Map([['register', FORM_REGISTER], ['control', 'Control'], ['formState', FORM_STATE]]);
const REACT_MODULE = 'react';
const COMPONENT_TYPES = new Set(['FC', 'FunctionComponent']);
const ARRAY_ITERATORS = new Set(['map', 'flatMap', 'forEach', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every']);
const MAX_HOPS = 5;
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

const resolveConst = (sourceCode, value, hops = 0) => {
  const node = unwrap(value);
  const init = hops < MAX_HOPS ? constInit(sourceCode, node) : null;
  return init === null ? node : resolveConst(sourceCode, init, hops + 1);
};

const referenceName = type => type.typeName ?? type.expression;

const importedTypeName = (sourceCode, type, source) => {
  if (type?.type !== 'TSTypeReference' && type?.type !== 'TSInterfaceHeritage') {
    return null;
  }
  const name = referenceName(type);
  switch (name.type) {
    case 'TSQualifiedName':
      return importedName(sourceCode, name.left, source) === NAMESPACE ? name.right.name : null;
    case 'MemberExpression':
      return !name.computed && importedName(sourceCode, name.object, source) === NAMESPACE ? name.property.name : null;
    default:
      return importedName(sourceCode, name, source);
  }
};

const typeName = (sourceCode, type) => importedTypeName(sourceCode, type, FORM_MODULE);

const formName = (sourceCode, type) => (typeof type === 'string' ? type : typeName(sourceCode, type));

const isGlobalReact = (sourceCode, name) => name.type === 'TSQualifiedName' && name.left.type === 'Identifier'
  && name.left.name === 'React' && definitionOf(sourceCode, name.left) === undefined;

const isComponentType = (sourceCode, type) => type?.type === 'TSTypeReference'
  && (COMPONENT_TYPES.has(importedTypeName(sourceCode, type, REACT_MODULE))
    || (isGlobalReact(sourceCode, type.typeName) && COMPONENT_TYPES.has(type.typeName.right.name)));

const utilityName = (sourceCode, type) => {
  const name = referenceName(type);
  return name.type === 'Identifier' && definitionOf(sourceCode, name) === undefined ? name.name : null;
};

const literalKeys = (type) => {
  if (type?.type === 'TSUnionType') {
    const parts = type.types.map(literalKeys);
    return parts.includes(null) ? null : parts.flat();
  }
  return type?.type === 'TSLiteralType' && typeof type.literal.value === 'string' ? [type.literal.value] : null;
};

const ownMemberType = (members, key) => members.find(candidate => candidate.type === 'TSPropertySignature' && !candidate.computed
  && exportedName(candidate.key) === key)?.typeAnnotation?.typeAnnotation ?? null;

const firstType = types => types.find(type => type !== null) ?? null;

const memberType = (sourceCode, type, key, hops = 0) => {
  if (type === null || hops > MAX_HOPS) {
    return null;
  }
  if (typeof type === 'string') {
    return type === FORM_RETURN ? FORM_MEMBER_TYPES.get(key) ?? null : null;
  }
  const name = typeName(sourceCode, type);
  if (name !== null) {
    return memberType(sourceCode, name, key);
  }
  switch (type.type) {
    case 'TSTypeLiteral':
      return ownMemberType(type.members, key);
    case 'TSIntersectionType':
      return firstType(type.types.map(part => memberType(sourceCode, part, key, hops + 1)));
    case 'TSTypeReference':
    case 'TSInterfaceHeritage':
      return referencedMemberType(sourceCode, type, key, hops + 1);
    default:
      return null;
  }
};

function referencedMemberType(sourceCode, type, key, hops) {
  const [base, keys] = type.typeArguments?.params ?? [];
  switch (utilityName(sourceCode, type)) {
    case 'Pick':
      return literalKeys(keys)?.includes(key) ? memberType(sourceCode, base, key, hops) : null;
    case 'Omit':
      return literalKeys(keys)?.includes(key) === false ? memberType(sourceCode, base, key, hops) : null;
    default:
      break;
  }
  const name = referenceName(type);
  const definition = name.type === 'Identifier' ? definitionOf(sourceCode, name) : undefined;
  switch (definition?.node.type) {
    case 'TSInterfaceDeclaration':
      return ownMemberType(definition.node.body.body, key)
        ?? firstType(definition.node.extends.map(heritage => memberType(sourceCode, heritage, key, hops)));
    case 'TSTypeAliasDeclaration':
      return memberType(sourceCode, definition.node.typeAnnotation, key, hops);
    default:
      return null;
  }
}

const componentPropsType = (sourceCode, fn) => {
  const { parent } = fn;
  const type = parent.type === 'VariableDeclarator' && parent.init === fn ? parent.id.typeAnnotation?.typeAnnotation : undefined;
  return isComponentType(sourceCode, type) ? type.typeArguments?.params[0] ?? null : null;
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
  return FUNCTIONS.has(parent.type) && parent.params[0] === pattern ? componentPropsType(sourceCode, parent) : null;
};

const rootPattern = (pattern) => {
  const { parent } = pattern;
  if ((parent.type === 'AssignmentPattern' && parent.left === pattern) || (parent.type === 'Property' && parent.parent.type === 'ObjectPattern')) {
    return rootPattern(parent.type === 'Property' ? parent.parent : parent);
  }
  return pattern;
};

const memberKey = node => (node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name);

const valueType = (sourceCode, value) => {
  const node = unwrap(value);
  if (node?.type === 'MemberExpression') {
    const key = memberKey(node);
    return key === null ? null : memberType(sourceCode, valueType(sourceCode, node.object), key);
  }
  const definition = node?.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
  return definition?.type === 'Parameter' ? patternType(sourceCode, definition.name) : null;
};

const formTypeOf = (sourceCode, node) => formName(sourceCode, valueType(sourceCode, node));

const isFormObject = (sourceCode, value) => {
  const node = unwrap(value);
  if (formTypeOf(sourceCode, node) === FORM_RETURN) {
    return true;
  }
  if (node?.type !== 'Identifier') {
    return isFormHookCall(sourceCode, node, FORM_HOOKS);
  }
  const definition = definitionOf(sourceCode, node);
  return (definition?.type === 'Variable' && definition.node.id.type === 'Identifier' && isFormHookCall(sourceCode, unwrap(definition.node.init), FORM_HOOKS));
};

const isFormMember = (sourceCode, value, key) => {
  const node = unwrap(value);
  if (formTypeOf(sourceCode, node) === FORM_MEMBER_TYPES.get(key)) {
    return true;
  }
  if (node?.type !== 'Identifier') {
    return isMemberNamed(node, key) && isFormObject(sourceCode, node.object);
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

const isAwaited = node => node.parent.type === 'AwaitExpression' && node.parent.argument === node;

const isHandedOver = node => isReturned(node, node) || isAwaited(node);

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

const isArrayIteration = call => call.callee.type === 'MemberExpression' && !call.callee.computed
  && ARRAY_ITERATORS.has(call.callee.property.name);

const receivingCall = (fn) => {
  const argument = outsideArrays(fn);
  const { parent } = argument;
  if (parent.type !== 'CallExpression' || !parent.arguments.includes(argument)) {
    return null;
  }
  const settling = settlingCall(parent);
  return isArrayIteration(parent) && settling === parent ? null : settling;
};

const returnedValues = (fn) => {
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }
  const values = [];
  const visit = (node) => {
    if (node.type === 'ReturnStatement') {
      values.push(node.argument);
      return;
    }
    if (!FUNCTIONS.has(node.type)) {
      Object.entries(node)
        .filter(([key]) => key !== 'parent')
        .flatMap(([, child]) => child)
        .filter(child => typeof child?.type === 'string')
        .forEach(visit);
    }
  };
  fn.body.body.forEach(visit);
  return values;
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
    || (isAwaited(outer) && insideTryCatch(sourceCode, outer));
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
        schemaFiles: { type: 'array', items: { type: 'string' } },
        constantsFiles: { type: 'array', items: { type: 'string' } },
      },
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
    const { files = [], schemaFiles = [], constantsFiles = [] } = context.options[0] ?? {};
    const isSchemaFile = matchesGlobs(context, schemaFiles);
    const isConstantsFile = matchesGlobs(context, constantsFiles);
    const onlyDefaults = isConstantsFile && !isSchemaFile && !matchesGlobs(context, files);
    const isComponentFile = context.filename.endsWith('.tsx');
    const importsForm = sourceCode.ast.body.some(statement => statement.type === 'ImportDeclaration' && statement.source.value === FORM_MODULE);

    const resolved = value => resolveConst(sourceCode, value);

    const defaultsObjects = (value) => {
      const node = resolved(value);
      const definition = node?.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
      const fn = definition?.type === 'FunctionName' ? definition.node : node;
      return FUNCTIONS.has(fn?.type) ? returnedValues(fn).map(resolved) : [node];
    };

    const providesResolver = (object, depth = 0) => object.properties.some((property) => {
      if (property.type !== 'SpreadElement') {
        return false;
      }
      const value = resolved(property.argument);
      if (value?.type !== 'ObjectExpression' || depth === MAX_HOPS) {
        return true;
      }
      const resolver = value.properties.find(candidate => isKeyNamed(candidate, 'resolver'));
      return resolver === undefined ? providesResolver(value, depth + 1) : isZodResolverCall(sourceCode, resolved(resolver.value));
    });

    const checkOptions = (call) => {
      const options = call.arguments.length === 0 ? null : resolved(call.arguments[0]);
      if (options !== null && options.type !== 'ObjectExpression') {
        return;
      }
      const properties = options?.properties ?? [];
      const resolver = properties.find(property => isKeyNamed(property, 'resolver'));
      const zod = resolver === undefined ? options !== null && providesResolver(options) : isZodResolverCall(sourceCode, resolved(resolver.value));
      if (!zod) {
        context.report({ node: resolver ?? call, messageId: 'resolver' });
      }
      const defaults = properties.find(property => isKeyNamed(property, 'defaultValues'));
      const values = defaults === undefined ? [] : defaultsObjects(defaults.value);
      if (values.some(object => object?.type === 'ObjectExpression' && hasLiteralValue(object))) {
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
      const formObject = isFormObject(sourceCode, init);
      const type = valueType(sourceCode, init);
      for (const property of properties) {
        const key = property.computed ? null : exportedName(property.key);
        if ((formObject && isKeyNamed(property, 'register')) || (key !== null && formName(sourceCode, memberType(sourceCode, type, key)) === FORM_REGISTER)) {
          context.report({ node: property, messageId: 'register' });
        }
        if (!formObject) {
          continue;
        }
        if (isKeyNamed(property, 'formState') && property.value.type === 'ObjectPattern') {
          property.value.properties
            .filter(nested => isKeyNamed(nested, 'isValid'))
            .forEach(node => context.report({ node, messageId: 'submitGate' }));
        }
      }
    };

    const checkDefaultsType = (node) => {
      if (node.id.type === 'Identifier' && DEFAULTS_NAME.test(node.id.name) && node.init !== null && node.init.type !== 'TSSatisfiesExpression') {
        context.report({ node, messageId: 'defaultsSatisfies' });
      }
    };

    if (onlyDefaults) {
      return { VariableDeclarator: checkDefaultsType };
    }

    return {
      CallExpression(node) {
        if (isFormHookCall(sourceCode, node, USE_FORM)) {
          checkOptions(node);
        }
        if (unwrap(node.callee).type !== 'MemberExpression' && formTypeOf(sourceCode, node.callee) === FORM_REGISTER) {
          context.report({ node, messageId: 'register' });
        }
        if (importsForm && isMutationTrigger(sourceCode, node.callee, ['mutateAsync'])) {
          const top = chainTop(node);
          if (!isSettledByCatch(node, top) && isHandedOver(top) && !(isAwaited(top) && insideTryCatch(sourceCode, top))
            && !isSettledByCaller(sourceCode, top)) {
            context.report({ node: top, messageId: 'mutateAsync' });
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && node.init !== null) {
          checkPattern(node.id, node.init);
        }
        if (isSchemaFile || isConstantsFile) {
          checkDefaultsType(node);
        }
        if (node.id.type === 'Identifier' && DEFAULTS_NAME.test(node.id.name) && !isSchemaFile && isComponentFile) {
          context.report({ node, messageId: 'defaultsLocation' });
        }
      },
      ObjectPattern(node) {
        if (rootPattern(node).parent.type !== 'VariableDeclarator' && formName(sourceCode, patternType(sourceCode, node)) === FORM_STATE) {
          node.properties.filter(property => isKeyNamed(property, 'isValid')).forEach(property => context.report({ node: property, messageId: 'submitGate' }));
        }
      },
      MemberExpression(node) {
        if (isMemberNamed(node, 'isValid') && isFormState(sourceCode, node.object)) {
          context.report({ node, messageId: 'submitGate' });
        }
        if ((isMemberNamed(node, 'register') && (isFormObject(sourceCode, node.object) || isFormMember(sourceCode, node.object, 'control')))
          || formTypeOf(sourceCode, node) === FORM_REGISTER) {
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
