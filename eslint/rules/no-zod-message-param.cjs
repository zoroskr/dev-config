const { importedName, zodImportSpecifier } = require('./zod-binding.cjs');

const DATA_FIRST_METHODS = new Set([
  'catch',
  'decode',
  'decodeAsync',
  'default',
  'encode',
  'encodeAsync',
  'enum',
  'extend',
  'interface',
  'literal',
  'looseObject',
  'merge',
  'object',
  'omit',
  'parse',
  'parseAsync',
  'partial',
  'pick',
  'prefault',
  'required',
  'safeDecode',
  'safeDecodeAsync',
  'safeEncode',
  'safeEncodeAsync',
  'safeExtend',
  'safeParse',
  'safeParseAsync',
  'spa',
  'strictObject',
]);
const DATA_FUNCTIONS = new Set([
  'decode',
  'decodeAsync',
  'encode',
  'encodeAsync',
  'parse',
  'parseAsync',
  'safeDecode',
  'safeDecodeAsync',
  'safeEncode',
  'safeEncodeAsync',
  'safeParse',
  'safeParseAsync',
]);
const METADATA_METHODS = new Set(['meta', 'register']);
const CHAIN_LINKS = new Map([
  ['CallExpression', 'callee'],
  ['ChainExpression', 'expression'],
  ['MemberExpression', 'object'],
  ['TSNonNullExpression', 'expression'],
]);

const chainRoot = (node) => {
  let current = node;
  while (CHAIN_LINKS.has(current.type)) {
    current = current[CHAIN_LINKS.get(current.type)];
  }
  return current.type === 'Identifier' ? current : null;
};

const callTarget = (scope, { callee }) => {
  if (callee.type === 'Identifier') {
    const specifier = zodImportSpecifier(scope, callee.name);
    return { name: specifier.type === 'ImportSpecifier' ? importedName(specifier) : callee.name, isTopLevel: true };
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return { name: null, isTopLevel: false };
  }
  const isTopLevel = callee.object.type === 'Identifier' && zodImportSpecifier(scope, callee.object.name) !== null;
  return { name: callee.property.name, isTopLevel };
};

const isMessageKey = ({ type, computed, key }) => type === 'Property'
  && ((key.type === 'Identifier' && !computed && key.name === 'message')
    || (key.type === 'Literal' && key.value === 'message'));

const paramArguments = (scope, node) => {
  const { name, isTopLevel } = callTarget(scope, node);
  if (METADATA_METHODS.has(name)) {
    return [];
  }
  if (isTopLevel && DATA_FUNCTIONS.has(name)) {
    return node.arguments.slice(2);
  }
  return DATA_FIRST_METHODS.has(name) ? node.arguments.slice(1) : node.arguments;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      messageParam: 'Zod 4 deprecates the `message` param; pass `{ error: \'…\' }` instead (`ctx.addIssue({ message })` is fine). See skill `zod-schemas`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const scope = context.sourceCode.getScope(node);
        const root = chainRoot(node.callee);
        if (root === null || zodImportSpecifier(scope, root.name) === null) {
          return;
        }
        for (const argument of paramArguments(scope, node)) {
          if (argument.type === 'ObjectExpression') {
            argument.properties.filter(isMessageKey).forEach(property => context.report({ node: property, messageId: 'messageParam' }));
          }
        }
      },
    };
  },
};
