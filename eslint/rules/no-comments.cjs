const eslintDirective = /^eslint-(?:disable|enable|disable-next-line|disable-line)(?:$|[ \t])/u;
const typescriptDirective = /^@ts-(?:expect-error|ignore|check|nocheck)$|^@ts-(?:expect-error|ignore)[ \t:][^\r\n]+$/u;
const referenceDirective = /^\/\s*<reference\s+(?:(?:path|types|lib)=(?:"[^"<>\r\n]+"|'[^'<>\r\n]+')|no-default-lib=(?:"true"|'true'))\s*\/>$/u;

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { forbidden: 'Comments are forbidden, including JSDoc. Keep only supported tooling directives.' },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const value = comment.value.trim();
          if (comment.type === 'Shebang') {
            continue;
          }
          if (eslintDirective.test(value) && !/[\r\n]/u.test(value) && (comment.type === 'Block' || /^eslint-disable-(?:next-line|line)\b/u.test(value))) {
            const directive = value.split(/[ \t]+--[ \t]+/u, 1)[0];
            const rules = directive.replace(eslintDirective, '').trim();
            if (rules === '' || rules.split(',').every(name => name.trim().replace(/^@/u, '').split('/').every(segment => /^[\w-]+$/u.test(segment)))) {
              continue;
            }
          }
          if (comment.type === 'Line' && (typescriptDirective.test(value) || referenceDirective.test(value) || value === 'organize-imports-ignore')) {
            continue;
          }
          context.report({ loc: comment.loc, messageId: 'forbidden' });
        }
      },
    };
  },
};
