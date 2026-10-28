const { exportedName, findVariable, isKeyNamed, isMemberNamed } = require('./process-env.cjs');
const { TS_WRAPPERS, isHookCall, unwrap } = require('./query-hooks.cjs');

const REACT_MODULE = 'react';
const EFFECT = /^use(?:Layout)?Effect$/u;
const MUTATION = /^useMutation$/u;
const TRIGGERS = ['mutate', 'mutateAsync'];
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

const wrapperParent = node => (TS_WRAPPERS.has(node.parent.type) ? wrapperParent(node.parent) : node.parent);

const definitionOf = (sourceCode, node) => {
  const [definition] = findVariable(sourceCode.getScope(node), node.name)?.defs ?? [];
  return definition;
};

const reactImport = (sourceCode, node) => {
  const definition = node.type === 'Identifier' ? definitionOf(sourceCode, node) : undefined;
  return definition?.type === 'ImportBinding' && definition.parent.source.value === REACT_MODULE ? definition.node : null;
};

const isEffectCallee = (sourceCode, callee) => {
  if (callee.type === 'MemberExpression') {
    const namespace = reactImport(sourceCode, callee.object);
    return namespace !== null && namespace.type !== 'ImportSpecifier'
      && !callee.computed && EFFECT.test(callee.property.name);
  }
  const specifier = reactImport(sourceCode, callee);
  return specifier?.type === 'ImportSpecifier' && EFFECT.test(exportedName(specifier.imported));
};

const isMutationResult = (sourceCode, node) => isHookCall(sourceCode, unwrap(node), MUTATION);

const bindingOf = (pattern, identifier) => pattern.properties.find((property) => {
  const value = property.value?.type === 'AssignmentPattern' ? property.value.left : property.value;
  return value === identifier;
});

const isTriggerBinding = (sourceCode, identifier) => {
  const definition = definitionOf(sourceCode, identifier);
  if (definition?.type !== 'Variable' || definition.node.id.type !== 'ObjectPattern' || !isMutationResult(sourceCode, definition.node.init)) {
    return false;
  }
  const property = bindingOf(definition.node.id, definition.name);
  return property !== undefined && TRIGGERS.some(name => isKeyNamed(property, name));
};

const isMutationObject = (sourceCode, node) => {
  if (node.type !== 'Identifier') {
    return isMutationResult(sourceCode, node);
  }
  const definition = definitionOf(sourceCode, node);
  return definition?.type === 'Variable' && definition.node.id.type === 'Identifier' && isMutationResult(sourceCode, definition.node.init);
};

const isTrigger = (sourceCode, callee) => {
  if (callee.type === 'Identifier') {
    return isTriggerBinding(sourceCode, callee);
  }
  return TRIGGERS.some(name => isMemberNamed(callee, name)) && isMutationObject(sourceCode, unwrap(callee.object));
};

const isEffectArgument = (sourceCode, node) => {
  const effect = wrapperParent(node);
  return effect.type === 'CallExpression' && unwrap(effect.arguments[0]) === node && isEffectCallee(sourceCode, effect.callee);
};

const callbackVariable = (sourceCode, owner) => {
  if (owner.type === 'FunctionDeclaration') {
    return owner.id === null ? undefined : sourceCode.getDeclaredVariables(owner).find(variable => variable.name === owner.id.name);
  }
  const declarator = wrapperParent(owner);
  if (declarator.type !== 'VariableDeclarator' || declarator.parent.kind !== 'const' || declarator.id.type !== 'Identifier') {
    return undefined;
  }
  return sourceCode.getDeclaredVariables(declarator)[0];
};

const isEffectCallback = (sourceCode, owner) => isEffectArgument(sourceCode, owner)
  || (callbackVariable(sourceCode, owner)?.references ?? []).some(reference => isEffectArgument(sourceCode, reference.identifier));

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      effect: 'Do not call a mutation\'s `mutate`/`mutateAsync` (renamed included) directly in a `useEffect`/`useLayoutEffect` callback; fire it from an event handler. See skill `react-data-containers`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        if (!isTrigger(sourceCode, node.callee)) {
          return;
        }
        const owner = sourceCode.getAncestors(node).findLast(ancestor => FUNCTIONS.has(ancestor.type));
        if (owner !== undefined && isEffectCallback(sourceCode, owner)) {
          context.report({ node, messageId: 'effect' });
        }
      },
    };
  },
};
