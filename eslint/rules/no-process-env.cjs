const { processEnvVisitors } = require('./process-env.cjs');

const DEFAULT_ENV_FILES = ['(?:^|/)env\\.ts$'];

module.exports = {
  meta: {
    type: 'problem',
    schema: [{
      type: 'object',
      properties: { envFiles: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    }],
    messages: {
      processEnv: 'Do not read `process.env`; import `env` from the validated env module and read `env.X`. See skill `code-hygiene`.',
    },
  },
  create(context) {
    const envFiles = (context.options[0]?.envFiles ?? DEFAULT_ENV_FILES).map(
      // eslint-disable-next-line security/detect-non-literal-regexp -- consumer-configured filename pattern
      source => new RegExp(source, 'u'),
    );
    const filename = context.filename.replaceAll('\\', '/');
    if (envFiles.some(pattern => pattern.test(filename))) {
      return {};
    }
    return processEnvVisitors(context, node => context.report({ node, messageId: 'processEnv' }));
  },
};
