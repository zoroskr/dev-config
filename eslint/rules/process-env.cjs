const isMemberNamed = (node, name) => node?.type === 'MemberExpression'
  && (node.computed
    ? node.property.type === 'Literal' && node.property.value === name
    : node.property.name === name);

const isKeyNamed = ({ type, computed, key }, name) => type === 'Property'
  && ((key.type === 'Identifier' && !computed && key.name === name)
    || (key.type === 'Literal' && key.value === name));

const isEnvKey = property => isKeyNamed(property, 'env');

const destructuredSource = (node) => {
  if (node.parent.type === 'VariableDeclarator' && node.parent.id === node) {
    return node.parent.init;
  }
  return node.parent.type === 'AssignmentExpression' && node.parent.left === node ? node.parent.right : null;
};

const isGlobalBinding = (scope, name) => {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable.defs.length === 0;
    }
  }
  return true;
};

const isGlobalIdentifier = (scope, node, name) => node?.type === 'Identifier'
  && node.name === name
  && isGlobalBinding(scope, name);

const isProcessObject = (scope, node) => isGlobalIdentifier(scope, node, 'process')
  || (isMemberNamed(node, 'process') && isGlobalIdentifier(scope, node.object, 'globalThis'));

const processEnvVisitors = (context, report) => {
  const reportEnvKeys = (pattern) => {
    pattern.properties.filter(isEnvKey).forEach(report);
  };

  const checkProcessAlias = (declarator, identifier) => {
    const variable = context.sourceCode.getDeclaredVariables(declarator).find(declared => declared.identifiers.includes(identifier));
    for (const { identifier: use } of variable?.references ?? []) {
      if (use.parent.type === 'MemberExpression' && use.parent.object === use && isMemberNamed(use.parent, 'env')) {
        report(use.parent);
      }
    }
  };

  const checkGlobalThisPattern = (node) => {
    for (const property of node.properties.filter(candidate => isKeyNamed(candidate, 'process'))) {
      if (property.value.type === 'ObjectPattern') {
        reportEnvKeys(property.value);
      } else if (property.value.type === 'Identifier' && node.parent.type === 'VariableDeclarator') {
        checkProcessAlias(node.parent, property.value);
      }
    }
  };

  return {
    MemberExpression(node) {
      if (isMemberNamed(node, 'env') && isProcessObject(context.sourceCode.getScope(node), node.object)) {
        report(node);
      }
    },
    ObjectPattern(node) {
      const scope = context.sourceCode.getScope(node);
      const source = destructuredSource(node);
      if (isProcessObject(scope, source)) {
        reportEnvKeys(node);
      } else if (isGlobalIdentifier(scope, source, 'globalThis')) {
        checkGlobalThisPattern(node);
      }
    },
  };
};

module.exports = { processEnvVisitors };
