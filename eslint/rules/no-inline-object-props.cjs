const { isKeyNamed } = require('./process-env.cjs');
const { unwrap } = require('./query-hooks.cjs');

const COMPONENT = /^[A-Z]/u;

const isComponent = ({ name }) => name.type === 'JSXMemberExpression' || (name.type === 'JSXIdentifier' && COMPONENT.test(name.name));

const branches = (expression) => {
  const node = unwrap(expression);
  if (node.type === 'ConditionalExpression') {
    return [...branches(node.consequent), ...branches(node.alternate)];
  }
  if (node.type === 'LogicalExpression') {
    return [...branches(node.left), ...branches(node.right)];
  }
  if (node.type === 'SequenceExpression') {
    return branches(node.expressions.at(-1));
  }
  return [node];
};

const inlineObjects = expression => branches(expression).filter(node => node.type === 'ObjectExpression');

const spreadProps = argument => inlineObjects(argument).flatMap(object => object.properties.flatMap((property) => {
  if (property.type === 'SpreadElement') {
    return spreadProps(property.argument);
  }
  return isKeyNamed(property, 'style') ? [] : inlineObjects(property.value);
}));

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      inline: 'Do not pass an inline object literal to a component prop; build `const props` first. See skill `react-data-containers`.',
    },
  },
  create(context) {
    const report = (node) => {
      context.report({ node, messageId: 'inline' });
    };
    return {
      JSXOpeningElement(element) {
        if (!isComponent(element)) {
          return;
        }
        for (const attribute of element.attributes) {
          if (attribute.type === 'JSXSpreadAttribute') {
            spreadProps(attribute.argument).forEach(report);
          } else if (attribute.name.name !== 'style' && attribute.value?.type === 'JSXExpressionContainer') {
            inlineObjects(attribute.value.expression).forEach(report);
          }
        }
      },
    };
  },
};
