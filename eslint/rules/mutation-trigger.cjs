const { findVariable, isKeyNamed, isMemberNamed } = require('./process-env.cjs');
const { isHookCall, unwrap } = require('./query-hooks.cjs');

const MUTATION = /^useMutation$/u;

const definitionOf = (sourceCode, node) => {
  const [definition] = findVariable(sourceCode.getScope(node), node.name)?.defs ?? [];
  return definition;
};

const bindingOf = (pattern, identifier) => pattern.properties.find((property) => {
  const value = property.value?.type === 'AssignmentPattern' ? property.value.left : property.value;
  return value === identifier;
});

const isMutationResult = (sourceCode, node) => isHookCall(sourceCode, unwrap(node), MUTATION);

const isTriggerBinding = (sourceCode, identifier, triggers) => {
  const definition = definitionOf(sourceCode, identifier);
  if (definition?.type !== 'Variable' || definition.node.id.type !== 'ObjectPattern' || !isMutationResult(sourceCode, definition.node.init)) {
    return false;
  }
  const property = bindingOf(definition.node.id, definition.name);
  return property !== undefined && triggers.some(name => isKeyNamed(property, name));
};

const isMutationObject = (sourceCode, node) => {
  if (node.type !== 'Identifier') {
    return isMutationResult(sourceCode, node);
  }
  const definition = definitionOf(sourceCode, node);
  return definition?.type === 'Variable' && definition.node.id.type === 'Identifier' && isMutationResult(sourceCode, definition.node.init);
};

const isMutationTrigger = (sourceCode, callee, triggers) => {
  if (callee.type === 'Identifier') {
    return isTriggerBinding(sourceCode, callee, triggers);
  }
  return triggers.some(name => isMemberNamed(callee, name)) && isMutationObject(sourceCode, unwrap(callee.object));
};

module.exports = { bindingOf, definitionOf, isMutationTrigger };
