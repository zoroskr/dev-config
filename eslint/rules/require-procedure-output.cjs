const procedureKinds = new Set(['query', 'mutation', 'subscription']);

function propertyName(member) {
  return !member.computed && member.property.type === 'Identifier' ? member.property.name : undefined;
}

function chainHasOutput(node) {
  let current = node;
  while (current.type === 'CallExpression' || current.type === 'MemberExpression') {
    if (current.type === 'CallExpression') {
      current = current.callee;
      continue;
    }
    if (propertyName(current) === 'output') {
      return true;
    }
    current = current.object;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { missingOutput: 'Every tRPC procedure declares .output(); see skill `trpc-layered-backend`.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || !procedureKinds.has(propertyName(node.callee))) {
          return;
        }
        if (!chainHasOutput(node.callee.object)) {
          context.report({ node: node.callee.property, messageId: 'missingOutput' });
        }
      },
    };
  },
};
