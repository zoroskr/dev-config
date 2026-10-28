const eslintDirective = /^eslint-(?:disable|enable|disable-next-line|disable-line)(?:$|[ \t])/u;
const typescriptDirective = /^@ts-(?:expect-error|ignore|check|nocheck)$|^@ts-(?:expect-error|ignore)[ \t:][^\r\n]+$/u;
const referenceDirective = /^\/\s*<reference\s+(?:(?:path|types|lib)=(?:"[^"<>\r\n]+"|'[^'<>\r\n]+')|no-default-lib=(?:"true"|'true'))\s*\/>$/u;
const lineScopedOnlyRule = /^(?:no-restricted-syntax|ts\/no-explicit-any|ts\/no-unsafe-[\w-]+)$/u;
const disableDirective = /^eslint-disable/u;
const inlineConfigDirective = /^eslint /u;
const beforeEveryDirective = { line: 0, column: -1 };

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Comments are forbidden, including JSDoc. Keep only supported tooling directives. See skill `code-hygiene`.',
      selfDisable: 'Do not disable `local/no-comments` or every rule with a bare `eslint-disable` directive (line {{line}}); name the rules to disable. See skill `code-hygiene`.',
      blockDisable: 'Do not disable `no-restricted-syntax`, `ts/no-explicit-any` or `ts/no-unsafe-*` for a whole block or file; use a line-scoped `eslint-disable-next-line` with a reason, or fix the code. See skill `typescript-strict`.',
      inlineConfig: 'Do not configure rules with inline `/* eslint … */` comments; configure them in the ESLint config. See skill `code-hygiene`.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const value = comment.value.trim();
          const normalized = value.replace(/\s+/gu, ' ');
          if (comment.type === 'Shebang') {
            continue;
          }
          if (comment.type === 'Block' && inlineConfigDirective.test(normalized)) {
            context.report({ loc: comment.loc, messageId: 'inlineConfig' });
            continue;
          }
          if (eslintDirective.test(normalized) && (comment.type === 'Block' || /^eslint-disable-(?:next-line|line)\b/u.test(normalized))) {
            const directive = normalized.split(' -- ', 1)[0];
            const rules = directive.replace(eslintDirective, '').trim();
            const names = rules.split(',').map(name => name.trim());
            if (rules === '' || names.every(name => name.replace(/^@/u, '').split('/').every(segment => /^[\w-]+$/u.test(segment)))) {
              if (disableDirective.test(normalized) && (rules === '' || names.includes('local/no-comments'))) {
                context.report({ loc: beforeEveryDirective, messageId: 'selfDisable', data: { line: comment.loc.start.line } });
              } else if (/^eslint-disable(?:$| )/u.test(normalized) && names.some(name => lineScopedOnlyRule.test(name))) {
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
