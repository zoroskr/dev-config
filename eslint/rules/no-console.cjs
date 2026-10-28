const { isGlobalIdentifier, isKeyNamed, isMemberNamed } = require('./process-env.cjs');

const destructuredSource = node => (node.parent.type === 'VariableDeclarator' && node.parent.id === node ? node.parent.init : null);

const CONSOLE_MODULES = new Set(['console', 'node:console']);

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      console: 'Do not use `console` in production code; log through the project\'s error reporter. See skill `typescript-strict`.',
    },
  },
  create(context) {
    const report = node => context.report({ node, messageId: 'console' });

    return {
      ImportDeclaration(node) {
        if (CONSOLE_MODULES.has(node.source.value)) {
          context.sourceCode.getDeclaredVariables(node).flatMap(variable => variable.references).forEach(({ identifier }) => report(identifier));
        }
      },
      'Program:exit'(program) {
        const scope = context.sourceCode.getScope(program);
        const variable = scope.set.get('console');
        const references = variable === undefined || variable.defs.length === 0 ? variable?.references ?? [] : [];
        [...references, ...scope.through.filter(reference => reference.identifier.name === 'console')]
          .forEach(({ identifier }) => report(identifier));
      },
      MemberExpression(node) {
        if (isMemberNamed(node, 'console') && isGlobalIdentifier(context.sourceCode.getScope(node), node.object, 'globalThis')) {
          report(node);
        }
      },
      ObjectPattern(node) {
        if (isGlobalIdentifier(context.sourceCode.getScope(node), destructuredSource(node), 'globalThis')) {
          node.properties.filter(property => isKeyNamed(property, 'console')).forEach(report);
        }
      },
    };
  },
};
