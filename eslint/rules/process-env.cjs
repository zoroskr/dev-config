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

const PROCESS_MODULES = new Set(['process', 'node:process']);

const findVariable = (scope, name) => {
  for (let current = scope; current !== null; current = current.upper) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return null;
};

const isGlobalBinding = (scope, name) => (findVariable(scope, name)?.defs.length ?? 0) === 0;

const isGlobalIdentifier = (scope, node, name) => node?.type === 'Identifier'
  && node.name === name
  && isGlobalBinding(scope, name);

const exportedName = node => (node.type === 'Identifier' ? node.name : node.value);

const isProcessModule = declaration => declaration.source !== null && PROCESS_MODULES.has(declaration.source.value);

const isProcessImport = (definition) => {
  if (definition?.type !== 'ImportBinding' || !isProcessModule(definition.parent)) {
    return false;
  }
  return definition.node.type !== 'ImportSpecifier' || exportedName(definition.node.imported) === 'default';
};

const isImportedProcess = (scope, node) => {
  if (node?.type !== 'Identifier') {
    return false;
  }
  const definitions = findVariable(scope, node.name)?.defs ?? [];
  return definitions.length === 0 ? node.name === 'process' : isProcessImport(definitions[0]);
};

const isProcessNamespace = (scope, node) => {
  if (node?.type !== 'Identifier') {
    return false;
  }
  const [definition] = findVariable(scope, node.name)?.defs ?? [];
  return definition?.type === 'ImportBinding' && isProcessModule(definition.parent) && definition.node.type === 'ImportNamespaceSpecifier';
};

const isProcessObject = (scope, node) => isImportedProcess(scope, node)
  || (isMemberNamed(node, 'process') && isGlobalIdentifier(scope, node.object, 'globalThis'))
  || (isMemberNamed(node, 'default') && isProcessNamespace(scope, node.object));

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
    ImportSpecifier(node) {
      if (isProcessModule(node.parent) && exportedName(node.imported) === 'env') {
        context.sourceCode.getDeclaredVariables(node).flatMap(variable => variable.references).forEach(({ identifier }) => report(identifier));
      }
    },
    ExportSpecifier(node) {
      if (isProcessModule(node.parent) && exportedName(node.local) === 'env') {
        report(node);
      }
    },
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

module.exports = { exportedName, findVariable, isGlobalIdentifier, isKeyNamed, isMemberNamed, processEnvVisitors };
