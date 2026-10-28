const { findVariable, isKeyNamed } = require('./process-env.cjs');
const { STATE_QUERY, isHookCall, unwrap } = require('./query-hooks.cjs');

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const SKELETON = /Skeleton$/u;

const localName = (pattern, key) => {
  const property = pattern.properties.find(entry => isKeyNamed(entry, key));
  const value = property?.value.type === 'AssignmentPattern' ? property.value.left : property?.value;
  return value?.type === 'Identifier' ? value.name : null;
};

const leaves = node => (node.type === 'LogicalExpression' ? [...leaves(node.left), ...leaves(node.right)] : [node]);

const isNamed = (node, name) => name !== null && node.type === 'Identifier' && node.name === name;

const returnedElement = (statement) => {
  const returned = statement.type === 'BlockStatement' ? statement.body.at(-1) : statement;
  const argument = returned?.type === 'ReturnStatement' ? returned.argument : null;
  if (argument?.type !== 'JSXElement') {
    return null;
  }
  const { name } = argument.openingElement;
  return name.type === 'JSXMemberExpression' ? name.property.name : name.name;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { errorComponent: { type: 'string' } },
      additionalProperties: false,
    }],
    messages: {
      missingPending: 'Render the pending state first: `if (isPending) return <XSkeleton />;`. See skill `react-data-containers`.',
      pendingSkeleton: 'The `isPending` branch returns a dedicated `*Skeleton` element. See skill `react-data-containers`.',
      pendingOr: 'Never combine `isPending` with other checks in `||`; pending, error and empty each get their own `return`. See skill `react-data-containers`.',
      missingError: 'Render the error state after pending: `if (isError) return <{{component}} … />;`. See skill `react-data-containers`.',
      errorOrder: 'Check `isPending` before `isError`. See skill `react-data-containers`.',
      errorComponent: 'The `isError` branch returns the shared `<{{component}} />` error component. See skill `react-data-containers`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const component = context.options[0]?.errorComponent ?? 'Error';
    const isStateQuery = declarator => declarator?.id.type === 'ObjectPattern'
      && isHookCall(sourceCode, unwrap(declarator.init), STATE_QUERY);

    const isPendingFlag = (node) => {
      if (node.type !== 'Identifier') {
        return false;
      }
      const [definition] = findVariable(sourceCode.getScope(node), node.name)?.defs ?? [];
      return definition?.type === 'Variable'
        && isStateQuery(definition.node)
        && localName(definition.node.id, 'isPending') === node.name;
    };

    return {
      'LogicalExpression[operator=\'||\']'(node) {
        if (node.parent.type !== 'LogicalExpression' && leaves(node).some(isPendingFlag)) {
          context.report({ node, messageId: 'pendingOr' });
        }
      },
      VariableDeclarator(declarator) {
        if (!isStateQuery(declarator)) {
          return;
        }
        const owner = sourceCode.getAncestors(declarator).findLast(ancestor => FUNCTIONS.has(ancestor.type));
        if (owner?.body.type !== 'BlockStatement') {
          return;
        }
        const pending = localName(declarator.id, 'isPending');
        const error = localName(declarator.id, 'isError');
        const branches = owner.body.body.filter(statement => statement.type === 'IfStatement');
        const pendingIf = branches.find(({ test }) => leaves(test).some(leaf => isNamed(leaf, pending))
          && (test.type !== 'LogicalExpression' || test.operator === '||'));
        const errorIf = branches.find(({ test }) => isNamed(test, error));
        if (pendingIf === undefined) {
          context.report({ node: declarator, messageId: 'missingPending' });
        } else if (!SKELETON.test(returnedElement(pendingIf.consequent) ?? '')) {
          context.report({ node: pendingIf, messageId: 'pendingSkeleton' });
        }
        if (errorIf === undefined) {
          context.report({ node: declarator, messageId: 'missingError', data: { component } });
          return;
        }
        if (pendingIf !== undefined && errorIf.range[0] < pendingIf.range[0]) {
          context.report({ node: errorIf, messageId: 'errorOrder' });
        }
        if (returnedElement(errorIf.consequent) !== component) {
          context.report({ node: errorIf, messageId: 'errorComponent', data: { component } });
        }
      },
    };
  },
};
