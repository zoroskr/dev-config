const { keyName, memberName } = require('./app-router.cjs');
const { exportedName, findVariable, isMemberNamed } = require('./process-env.cjs');
const { unwrap } = require('./query-hooks.cjs');

const EQUALITY = new Set(['===', '!==', '==', '!=']);
const SECRET_NAME = /secret|token|key|signature|digest|hmac|password/iu;
const STRING_METHODS = new Set(['toString', 'slice', 'substring', 'substr', 'trim', 'trimStart', 'trimEnd', 'replace', 'replaceAll', 'toLowerCase', 'toUpperCase']);
const SPLIT = new Set(['split']);
const LOOPS = ['ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement', 'DoWhileStatement'];
const MAX_HOPS = 5;

const expressionOf = (node) => {
  const target = unwrap(node);
  return target?.type === 'ChainExpression' ? expressionOf(target.expression) : target;
};

const isHeadersCall = node => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'headers';

const isEnvPath = (node) => {
  const target = expressionOf(node);
  if (target?.type === 'Identifier') {
    return target.name === 'env';
  }
  return target?.type === 'MemberExpression' && (isMemberNamed(target, 'env') || isEnvPath(target.object));
};

const isSecretMember = node => SECRET_NAME.test(memberName(node) ?? '') && isEnvPath(node.object);

const isStaticString = (node) => {
  const target = unwrap(node);
  return (target?.type === 'Literal' && typeof target.value === 'string')
    || (target?.type === 'TemplateLiteral' && target.expressions.length === 0);
};

const isPublicName = name => !SECRET_NAME.test(name);

const isImportBinding = (variable) => {
  const [definition] = variable?.defs ?? [];
  if (definition?.type !== 'ImportBinding') {
    return false;
  }
  return definition.node.type !== 'ImportSpecifier' || isPublicName(exportedName(definition.node.imported));
};

const isPublicBinding = (variable) => {
  const [definition] = variable?.defs ?? [];
  if (!isPublicName(variable?.name ?? '')) {
    return false;
  }
  return isImportBinding(variable)
    || (definition?.type === 'Variable'
      && definition.parent.kind === 'const'
      && definition.node.id === definition.name
      && isStaticString(definition.node.init));
};

const isPublicNamespace = (variable) => {
  const [definition] = variable?.defs ?? [];
  return isPublicName(variable?.name ?? '') && (definition?.type === 'TSEnumName' || isImportBinding(variable));
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

    const bindingDefinition = identifier => findVariable(sourceCode.getScope(identifier), identifier.name)?.defs[0] ?? null;

    const bindingInit = (identifier) => {
      const definition = bindingDefinition(identifier);
      return definition?.type === 'Variable' && definition.node.id === definition.name ? definition.node.init : null;
    };

    const isHeadersDestructure = (identifier) => {
      const definition = bindingDefinition(identifier);
      return definition?.type === 'Variable' && definition.node.id !== definition.name && destructuredKey(definition.name) === 'headers';
    };

    const isGlobalString = node => node.type === 'Identifier' && node.name === 'String' && (findVariable(sourceCode.getScope(node), 'String')?.defs.length ?? 0) === 0;

    function isHeaders(node, hops) {
      const target = expressionOf(node);
      switch (target?.type) {
        case 'AwaitExpression':
          return isHeadersCall(expressionOf(target.argument));
        case 'Identifier':
          return target.name === 'headers' || isHeadersDestructure(target) || (hops > 0 && isHeaders(bindingInit(target), hops - 1));
        default:
          return isMemberNamed(target, 'headers') || isHeadersCall(target);
      }
    }

    const isHeaderRead = node => isMemberNamed(node.callee, 'get') && isHeaders(node.callee.object, MAX_HOPS);

    const isStringMethodOn = (node, methods, hops) => node.type === 'CallExpression'
      && node.callee.type === 'MemberExpression'
      && methods.has(memberName(node.callee))
      && isSensitive(node.callee.object, hops);

    const isPublicMember = (node) => {
      const target = expressionOf(node);
      if (target?.type === 'Identifier') {
        return isPublicNamespace(findVariable(sourceCode.getScope(target), target.name));
      }
      if (target?.type !== 'MemberExpression' || isEnvPath(target)) {
        return false;
      }
      const name = memberName(target);
      return typeof name === 'string' && isPublicName(name) && isPublicMember(target.object);
    };

    const isPublicConstant = (node) => {
      const target = expressionOf(node);
      return target.type === 'Literal'
        || isStaticString(target)
        || (target.type === 'MemberExpression' && isPublicMember(target))
        || (target.type === 'Identifier' && (target.name === 'undefined' || isPublicBinding(findVariable(sourceCode.getScope(target), target.name))));
    };

    const isSplitIndex = (node, hops) => node.type === 'CallExpression'
      && isMemberNamed(node.callee, 'at')
      && isStringMethodOn(expressionOf(node.callee.object), SPLIT, hops);

    function isSensitive(node, hops) {
      const target = expressionOf(node);
      switch (target?.type) {
        case 'CallExpression':
          return isHeaderRead(target)
            || isStringMethodOn(target, STRING_METHODS, hops)
            || isSplitIndex(target, hops)
            || (isGlobalString(target.callee) && isSensitive(target.arguments[0], hops));
        case 'MemberExpression':
          return isSecretMember(target) || (target.computed && isStringMethodOn(expressionOf(target.object), SPLIT, hops));
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

    const isRequest = (node, hops) => {
      const target = expressionOf(node);
      if (target?.type === 'CallExpression') {
        return isMemberNamed(target.callee, 'clone') && target.arguments.length === 0 && isRequest(target.callee.object, hops);
      }
      return target?.type === 'Identifier'
        && (bindingDefinition(target)?.type === 'Parameter' || (hops > 0 && isRequest(bindingInit(target), hops - 1)));
    };

    const isTimingUnsafe = (left, right) => !isPublicConstant(left)
      && !isPublicConstant(right)
      && (isSensitive(left, MAX_HOPS) || isSensitive(right, MAX_HOPS));

    const reportIteration = node => context.report({ node, messageId: 'iteration' });

    return {
      BinaryExpression(node) {
        if (EQUALITY.has(node.operator) && isTimingUnsafe(node.left, node.right)) {
          context.report({ node, messageId: 'timingUnsafe' });
        }
      },
      SwitchCase(node) {
        if (node.test !== null && isTimingUnsafe(node.parent.discriminant, node.test)) {
          context.report({ node, messageId: 'timingUnsafe' });
        }
      },
      CallExpression(node) {
        if (isMemberNamed(node.callee, 'forEach')) {
          reportIteration(node);
        } else if (isMemberNamed(node.callee, 'json') && node.arguments.length === 0 && isRequest(node.callee.object, MAX_HOPS) && !isCaught(node)) {
          context.report({ node, messageId: 'bareJson' });
        }
      },
      ...Object.fromEntries(LOOPS.map(loop => [loop, reportIteration])),
    };
  },
};
