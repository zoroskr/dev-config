const TYPES_FILE = /(?:^|\.)types\.tsx?$/u;

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      typesFile: 'Do not create `types.ts` or `*.types.ts` files; export each type beside its schema or define it where it is used. See skill `zod-schemas`.',
    },
  },
  create(context) {
    const basename = context.filename.replaceAll('\\', '/').split('/').at(-1) ?? '';
    if (!TYPES_FILE.test(basename)) {
      return {};
    }
    return {
      Program(node) {
        context.report({ node, messageId: 'typesFile' });
      },
    };
  },
};
