const eslintDirective = /^eslint-(?:disable|enable|disable-next-line|disable-line)(?:$|[ \t])/u;
const typescriptDirective = /^@ts-(?:expect-error|ignore|check|nocheck)$|^@ts-(?:expect-error|ignore)[ \t:][^\r\n]+$/u;
const referenceDirective = /^\/\s*<reference\s+(?:(?:path|types|lib)=(?:"[^"<>\r\n]+"|'[^'<>\r\n]+')|no-default-lib=(?:"true"|'true'))\s*\/>$/u;
const lineScopedOnlyRule = /^(?:no-restricted-syntax|ts\/no-explicit-any|ts\/no-unsafe-[\w-]+)$/u;

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Comments are forbidden, including JSDoc. Keep only supported tooling directives. See skill `code-hygiene`.',
      blockDisable: 'Do not disable `no-restricted-syntax`, `ts/no-explicit-any` or `ts/no-unsafe-*` for a whole block or file; use a line-scoped `eslint-disable-next-line` with a reason, or fix the code. See skill `typescript-strict`.',
    },
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
            const names = rules.split(',').map(name => name.trim());
            if (rules === '' || names.every(name => name.replace(/^@/u, '').split('/').every(segment => /^[\w-]+$/u.test(segment)))) {
              if (/^eslint-disable(?:$|[ \t])/u.test(value) && names.some(name => lineScopedOnlyRule.test(name))) {
                context.report({ loc: comment.loc, messageId: 'blockDisable' });
              }
              continue;
            }
          }
          if (comment.type === 'Line' && (typescriptDirective.test(value) || referenceDirective.test(value))) {
            continue;
          }
          context.report({ loc: comment.loc, messageId: 'forbidden' });
        }
      },
    };
  },
};
