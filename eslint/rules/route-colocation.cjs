const path = require('node:path');
const { childDirectories, displayPath, hasPage, isGroup, routeLocation } = require('./app-router.cjs');

const CATEGORIES = new Set(['components', 'constants', 'hooks', 'schemas', 'utils']);
const PAGE_FILE = /^page\.tsx?$/u;

const isPrivate = name => /^[_@]/u.test(name);
const isStaticSegment = name => !isGroup(name) && !/^\[.+\]$/u.test(name) && !isPrivate(name);
const isRouteChild = name => !isGroup(name) && !isPrivate(name) && !CATEGORIES.has(name);

const INDEX_GROUP = '(index)';
const GLOBAL_GROUP = '(global)';

const hasChildPage = (directory, accepts) => childDirectories(directory)
  .some(child => accepts(child) && hasPage(`${directory}/${child}`));

const hasPageThroughGroups = directory => hasPage(directory)
  || childDirectories(directory).some(child => isGroup(child) && child !== GLOBAL_GROUP && hasPageThroughGroups(`${directory}/${child}`));

const hasPageBelow = directory => hasPage(directory)
  || childDirectories(directory).some(child => child !== GLOBAL_GROUP && !isPrivate(child) && !CATEGORIES.has(child) && hasPageBelow(`${directory}/${child}`));

const hasChildRoute = directory => childDirectories(directory).some((child) => {
  if (isRouteChild(child)) {
    return hasPageThroughGroups(`${directory}/${child}`);
  }
  return isGroup(child) && child !== INDEX_GROUP && child !== GLOBAL_GROUP && hasPageBelow(`${directory}/${child}`);
});

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      floatingComponents: 'Do not keep a `components/` folder beside the sub-routes of `{{dir}}/`; move its files to `(index)/`, `(global)/` or the one sub-route that uses them. See skill `nextjs-app-router`.',
      indexPage: '`{{dir}}/` has sub-routes, so its root page lives in `{{dir}}/(index)/page.tsx`. See skill `nextjs-app-router`.',
    },
  },
  create(context) {
    const location = routeLocation(context);
    if (location === null) {
      return {};
    }
    const { filename, appRoot } = location;
    const segments = filename.slice(appRoot.length + 1).split('/');
    const floating = segments.slice(0, -1)
      .map((segment, index) => (segment === 'components' ? [appRoot, ...segments.slice(0, index)].join('/') : null))
      .filter(directory => directory !== null && !isGroup(path.posix.basename(directory)) && (hasChildPage(directory, () => true) || hasChildRoute(directory)));
    const directory = path.posix.dirname(filename);
    const misplacedIndex = PAGE_FILE.test(segments.at(-1) ?? '')
      && directory !== appRoot
      && isStaticSegment(path.posix.basename(directory))
      && hasChildRoute(directory);
    if (floating.length === 0 && !misplacedIndex) {
      return {};
    }
    return {
      Program(node) {
        floating.forEach(dir => context.report({ node, messageId: 'floatingComponents', data: { dir: displayPath(context, dir) } }));
        if (misplacedIndex) {
          context.report({ node, messageId: 'indexPage', data: { dir: displayPath(context, directory) } });
        }
      },
    };
  },
};
