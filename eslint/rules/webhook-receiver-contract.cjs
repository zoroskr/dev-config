const { keyName, memberName } = require('./app-router.cjs');
const { findVariable, isMemberNamed } = require('./process-env.cjs');
const { unwrap } = require('./query-hooks.cjs');

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const SECRET_NAME = /secret|token|key/iu;
const LOOPS = ['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'];
const MAX_HOPS = 5;

const expressionOf = (node) => {
  const target = unwrap(node);
  return target?.type === 'ChainExpression' ? expressionOf(target.expression) : target;
};

const isHeadersCall = node => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'headers';

const isHeaders = (node) => {
  const target = expressionOf(node);
  if (target?.type === 'AwaitExpression') {
    return isHeadersCall(expressionOf(target.argument));
  }
  return isMemberNamed(target, 'headers') || isHeadersCall(target) || (target?.type === 'Identifier' && target.name === 'headers');
};

const isHeaderRead = node => isMemberNamed(node.callee, 'get') && isHeaders(node.callee.object);

const isEnvPath = (node) => {
  const target = expressionOf(node);
  if (target?.type === 'Identifier') {
    return target.name === 'env';
  }
  return target?.type === 'MemberExpression' && (isMemberNamed(target, 'env') || isEnvPath(target.object));
};

const isSecretMember = node => SECRET_NAME.test(memberName(node) ?? '') && isEnvPath(node.object);

const isPublicConstant = (node) => {
  const target = expressionOf(node);
  return target.type === 'Literal'
    || (target.type === 'Identifier' && target.name === 'undefined')
    || (target.type === 'TemplateLiteral' && target.expressions.length === 0);
};

const destructuredKey = (identifier) => {
  const target = identifier.parent.type === 'AssignmentPattern' && identifier.parent.left === identifier ? identifier.parent : identifier;
  const property = target.parent;
  return property.type === 'Property' && property.value === target ? keyName(property.key, property.computed) : null;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      timingUnsafe: 'Do not compare a header value or a secret with `===`/`!==`; compare `Buffer`s with `timingSafeEqual` behind a length guard (hash a shared secret first). See skill `webhook-receivers`.',
      bareJson: 'Neutralise `req.json()` with `.catch(() => null)` so a malformed body reaches `safeParse` instead of escaping as a 500. See skill `webhook-receivers`.',
      iteration: 'Do not iterate in a webhook route (`for`, `while`, `.forEach`); payload iteration belongs in the service. See skill `webhook-receivers`.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function isSensitive(node, hops) {
      const target = expressionOf(node);
      switch (target?.type) {
        case 'CallExpression':
          return isHeaderRead(target);
        case 'MemberExpression':
          return isSecretMember(target);
        case 'LogicalExpression':
        case 'BinaryExpression':
          return isSensitive(target.left, hops) || isSensitive(target.right, hops);
        case 'TemplateLiteral':
          return target.expressions.some(expression => isSensitive(expression, hops));
        case 'Identifier':
          return hops > 0 && isSensitiveBinding(target, hops - 1);
        default:
          return false;
      }
    }

    function isSensitiveBinding(identifier, hops) {
      const [definition] = findVariable(sourceCode.getScope(identifier), identifier.name)?.defs ?? [];
      if (definition?.type !== 'Variable' || definition.node.init === null) {
        return false;
      }
      if (definition.node.id === definition.name) {
        return isSensitive(definition.node.init, hops);
      }
      return SECRET_NAME.test(destructuredKey(definition.name) ?? '') && isEnvPath(definition.node.init);
    }

    const isCaught = (call) => {
      for (let current = call; current.parent.type === 'MemberExpression' && current.parent.object === current;) {
        const member = current.parent;
        if (member.parent.type !== 'CallExpression' || member.parent.callee !== member) {
          return false;
        }
        if (isMemberNamed(member, 'catch')) {
          return true;
        }
        current = member.parent;
      }
      return false;
    };

    const isParameter = (node) => {
      const target = expressionOf(node);
      return target?.type === 'Identifier' && findVariable(sourceCode.getScope(target), target.name)?.defs[0]?.type === 'Parameter';
    };

    const reportIteration = node => context.report({ node, messageId: 'iteration' });

    return {
      BinaryExpression(node) {
        if (EQUALITY.has(node.operator)
          && !isPublicConstant(node.left)
          && !isPublicConstant(node.right)
          && (isSensitive(node.left, MAX_HOPS) || isSensitive(node.right, MAX_HOPS))) {
          context.report({ node, messageId: 'timingUnsafe' });
        }
      },
      CallExpression(node) {
        if (isMemberNamed(node.callee, 'forEach')) {
          reportIteration(node);
        } else if (isMemberNamed(node.callee, 'json') && node.arguments.length === 0 && isParameter(node.callee.object) && !isCaught(node)) {
          context.report({ node, messageId: 'bareJson' });
        }
      },
      ...Object.fromEntries(LOOPS.map(loop => [loop, reportIteration])),
    };
  },
};
