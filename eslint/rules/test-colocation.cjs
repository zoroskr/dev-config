const path = require('node:path');
const { hasFile } = require('./app-router.cjs');
const { matchesGlobs, relativeFilename } = require('./query-hooks.cjs');

const TEST_FILE = /^(?<stem>.+?)(?:\.integration)?\.test\.tsx?$/u;
const TESTS_FOLDERS = new Set(['tests', '__tests__']);

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { ignores: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      testsFolder: 'Do not put tests in a `{{folder}}/` folder; co-locate the test beside its source with a mirrored name (`Foo.tsx` → `Foo.test.tsx`). See skill `vitest-testing`.',
      missingSource: '`{{name}}` has no sibling `{{stem}}.ts` or `{{stem}}.tsx`; co-locate the test beside its source with a mirrored name (a behavior split such as `foo.router.read.test.ts` beside `foo.router.ts` is fine). See skill `vitest-testing`.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const name = path.posix.basename(filename);
    const stem = TEST_FILE.exec(name)?.groups?.stem;
    if (stem === undefined || matchesGlobs(context, context.options[0]?.ignores ?? [])) {
      return {};
    }
    const folder = relativeFilename(context).split('/').slice(0, -1).find(segment => TESTS_FOLDERS.has(segment));
    const directory = path.posix.dirname(filename);
    const stems = stem.includes('.') ? [stem, stem.slice(0, stem.lastIndexOf('.'))] : [stem];
    if (folder === undefined && stems.some(candidate => [`${candidate}.ts`, `${candidate}.tsx`].some(source => hasFile(directory, source)))) {
      return {};
    }
    return {
      Program(node) {
        if (folder === undefined) {
          context.report({ node, messageId: 'missingSource', data: { name, stem } });
        } else {
          context.report({ node, messageId: 'testsFolder', data: { folder } });
        }
      },
    };
  },
};
