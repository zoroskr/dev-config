import zoroskr from './eslint/index.js';

export default zoroskr(
  { react: false, ignores: ['test/fixtures/**', 'odd/**'] },
  { files: ['test/**/*.test.js'], rules: { 'test/no-import-node-test': 'off' } },
  { files: ['tsconfig/*.json'], rules: { 'no-secrets/no-secrets': 'off' } },
);
