const path = require('node:path');
const { displayPath, nearestDynamicLayout, routeLocation, staticString } = require('./app-router.cjs');
const { unwrap } = require('./query-hooks.cjs');

const ROUTE_FILE = /^(page|layout)\.tsx?$/u;

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      repeatedDynamic: 'Do not repeat `export const dynamic = \'{{value}}\'`; the ancestor `{{layout}}` already sets it and descendants inherit it. See skill `nextjs-app-router`.',
    },
  },
  create(context) {
    const location = routeLocation(context);
    const kind = ROUTE_FILE.exec(path.posix.basename(location?.filename ?? ''))?.[1];
    if (location === null || kind === undefined) {
      return {};
    }
    const directory = path.posix.dirname(location.filename);
    const start = kind === 'layout' ? path.posix.dirname(directory) : directory;
    return {
      'ExportNamedDeclaration > VariableDeclaration[kind=\'const\'] > VariableDeclarator[id.name=\'dynamic\']': (node) => {
        const value = staticString(unwrap(node.init));
        const ancestor = value === null ? null : nearestDynamicLayout(start, location.appRoot);
        if (ancestor?.value === value) {
          context.report({ node, messageId: 'repeatedDynamic', data: { value, layout: displayPath(context, ancestor.file) } });
        }
      },
    };
  },
};
