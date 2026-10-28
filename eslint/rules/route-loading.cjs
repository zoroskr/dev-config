const path = require('node:path');
const { calleeName, defaultExportFunction, enclosingFunction, hasFile } = require('./app-router.cjs');
const { unwrap } = require('./query-hooks.cjs');

const SKELETON = /Skeleton$/u;

const jsxName = (name) => {
  if (name.type === 'JSXMemberExpression') {
    return name.property.name;
  }
  return name.type === 'JSXNamespacedName' ? name.name.name : name.name;
};

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { gateCallees: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      missingLoading: 'A page that awaits `{{callee}}()` needs a sibling `loading.tsx` rendering the feature `*Skeleton`. See skill `nextjs-app-router`.',
      loadingSkeleton: 'A `loading.tsx` renders the feature\'s `*Skeleton` element. See skill `nextjs-app-router`.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const name = path.posix.basename(filename);
    const gateCallees = new Set(context.options[0]?.gateCallees ?? []);
    const { sourceCode } = context;
    if (name === 'loading.tsx') {
      let rendersSkeleton = false;
      return {
        JSXOpeningElement(node) {
          rendersSkeleton ||= SKELETON.test(jsxName(node.name));
        },
        'Program:exit'(node) {
          if (!rendersSkeleton) {
            context.report({ node, messageId: 'loadingSkeleton' });
          }
        },
      };
    }
    if (name !== 'page.tsx' || gateCallees.size === 0 || hasFile(path.posix.dirname(filename), 'loading.tsx')) {
      return {};
    }
    let reported = false;
    return {
      AwaitExpression(node) {
        const call = unwrap(node.argument);
        const callee = call?.type === 'CallExpression' ? calleeName(call) : null;
        if (reported || callee === null || !gateCallees.has(callee) || enclosingFunction(sourceCode, node) !== defaultExportFunction(sourceCode)) {
          return;
        }
        reported = true;
        context.report({ node, messageId: 'missingLoading', data: { callee } });
      },
    };
  },
};
