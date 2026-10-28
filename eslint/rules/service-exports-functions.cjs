const FUNCTION_INITS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const FUNCTION_DECLARATIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

const isFunctionBinding = (variable) => {
  if (variable === null || variable === undefined || variable.defs.length === 0) {
    return false;
  }
  return variable.defs.every((definition) => {
    if (definition.type === 'FunctionName') {
      return true;
    }
    return definition.type === 'Variable' && FUNCTION_INITS.has(definition.node.init?.type);
  });
};

const findVariable = (scope, name) => {
  let current = scope;
  while (current !== null) {
    const variable = current.set.get(name);
    if (variable !== undefined) {
      return variable;
    }
    current = current.upper;
  }
  return null;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      nonFunction: 'A service module exports only functions: no types, constants, classes or re-exports; import types from the schema file. See skill `trpc-layered-backend`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration !== null || node.source !== null) {
          return;
        }
        const scope = sourceCode.getScope(node);
        for (const specifier of node.specifiers) {
          const exportedType = node.exportKind === 'type' || specifier.exportKind === 'type';
          if (exportedType || !isFunctionBinding(findVariable(scope, specifier.local.name))) {
            context.report({ node: specifier, messageId: 'nonFunction' });
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const { declaration } = node;
        if (FUNCTION_DECLARATIONS.has(declaration.type)) {
          return;
        }
        if (declaration.type === 'Identifier' && isFunctionBinding(findVariable(sourceCode.getScope(node), declaration.name))) {
          return;
        }
        context.report({ node, messageId: 'nonFunction' });
      },
    };
  },
};
