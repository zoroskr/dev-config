import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(root, 'bin/check-deps.js');
const scratch = mkdtempSync(join(tmpdir(), 'zoroskr-check-deps-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const SKILL = 'See skill `dependency-bumps`.';
const USAGE = 'Usage: zoroskr-check-deps --base <git-ref> [--prefix <dir>]\n';
const pin = (manifest, section, name, spec) => `${manifest}: new dependency \`${name}\` in ${section} is "${spec}"; pin an exact version (\`npm install --save-exact\`). ${SKILL}`;
const drift = (lock, section, name, lockSpec, spec) => `${lock}: packages[""].${section}.${name} is ${lockSpec === undefined ? 'missing' : `"${lockSpec}"`} but package.json has "${spec}"; sync the lockfile. ${SKILL}`;
const stale = (lock, section, name, lockSpec) => `${lock}: packages[""].${section}.${name} is "${lockSpec}" but package.json has none; sync the lockfile. ${SKILL}`;
const noLock = lock => `${lock}: not found; commit the lockfile CI installs from. ${SKILL}`;

function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function write(cwd, files) {
  for (const [path, content] of Object.entries(files)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture repository inside the test temp directory
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture repository inside the test temp directory
    writeFileSync(join(cwd, path), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
}

const manifest = sections => ({ name: 'app', version: '1.0.0', ...sections });
const lockfile = sections => ({ name: 'app', lockfileVersion: 3, packages: { '': { name: 'app', ...sections } } });
const pair = (sections, lockSections = sections) => ({ 'package.json': manifest(sections), 'package-lock.json': lockfile(lockSections) });

function repo(base, head, dir = '.') {
  const cwd = mkdtempSync(join(scratch, 'repo-'));
  git(cwd, 'init', '-q', '-b', 'main');
  write(cwd, { 'README.md': 'app\n' });
  write(join(cwd, dir), base);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  write(join(cwd, dir), head);
  return cwd;
}

function checkDeps(cwd, ...args) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const failure = lines => ({ status: 1, stdout: lines.map(line => `${line}\n`).join(''), stderr: '' });
const success = { status: 0, stdout: '', stderr: '' };

const base = pair({ dependencies: { zod: '^4.0.0' }, devDependencies: { eslint: '^9.0.0' } });

test('a new dependency pinned to an exact version with a synced lock passes', () => {
  const head = pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': '1.3.0' }, devDependencies: { eslint: '^9.0.0', tsx: '4.19.2-beta.1' } });
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), success);
});

for (const spec of ['^1.3.0', '~1.3.0', '>=1.3.0', '<2.0.0', '>1', '<=1.3.0', '*', '1.x', '1.3.x', '1.3.X', '1', '1.3', '1.3.0 || 2.0.0', '1.3.0 - 1.4.0', 'latest', 'next', '', '=1.3.0', 'v1.3.0']) {
  test(`a new dependency at "${spec}" is rejected`, () => {
    const head = pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': spec }, devDependencies: { eslint: '^9.0.0' } });
    assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([pin('package.json', 'dependencies', 'left-pad', spec)]));
  });
}

test('every section counts and each new range is reported once', () => {
  const head = pair({
    dependencies: { 'zod': '^4.0.0', 'left-pad': '^1.3.0' },
    devDependencies: { eslint: '^9.0.0', tsx: '~4.19.0' },
    optionalDependencies: { fsevents: 'latest' },
  });
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([
    pin('package.json', 'dependencies', 'left-pad', '^1.3.0'),
    pin('package.json', 'devDependencies', 'tsx', '~4.19.0'),
    pin('package.json', 'optionalDependencies', 'fsevents', 'latest'),
  ]));
});

test('existing dependencies keep their ranges, raised or moved between sections', () => {
  const head = pair({ dependencies: { zod: '^4.1.5', eslint: '^9.39.4' } });
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), success);
});

test('peer dependencies are not checked', () => {
  const head = pair({ dependencies: { zod: '^4.0.0' }, devDependencies: { eslint: '^9.0.0' }, peerDependencies: { react: '^19.0.0' } });
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), success);
});

test('a lock root spec that differs from the manifest is rejected', () => {
  const head = pair(
    { dependencies: { zod: '^4.1.5' }, devDependencies: { eslint: '^9.0.0' } },
    { dependencies: { zod: '^4.0.0' }, devDependencies: { eslint: '^9.0.0' } },
  );
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([drift('package-lock.json', 'dependencies', 'zod', '^4.0.0', '^4.1.5')]));
});

test('a dependency missing from the lock root, or in another lock section, is rejected', () => {
  const head = pair(
    { dependencies: { 'zod': '^4.0.0', 'left-pad': '1.3.0' }, devDependencies: { eslint: '^9.0.0' } },
    { dependencies: { zod: '^4.0.0' }, devDependencies: { 'eslint': '^9.0.0', 'left-pad': '1.3.0' } },
  );
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([
    drift('package-lock.json', 'dependencies', 'left-pad', undefined, '1.3.0'),
    stale('package-lock.json', 'devDependencies', 'left-pad', '1.3.0'),
  ]));
});

test('a lock root entry removed from the manifest is rejected in every section', () => {
  const head = pair(
    { dependencies: { zod: '^4.0.0' } },
    { dependencies: { 'zod': '^4.0.0', 'left-pad': '1.3.0' }, devDependencies: { eslint: '^9.0.0' }, optionalDependencies: { fsevents: '2.3.3' } },
  );
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([
    stale('package-lock.json', 'dependencies', 'left-pad', '1.3.0'),
    stale('package-lock.json', 'devDependencies', 'eslint', '^9.0.0'),
    stale('package-lock.json', 'optionalDependencies', 'fsevents', '2.3.3'),
  ]));
});

test('lock root peer dependencies and other packages are not compared with the manifest', () => {
  const head = pair({ dependencies: { zod: '^4.0.0' }, devDependencies: { eslint: '^9.0.0' } });
  head['package-lock.json'].packages[''].peerDependencies = { react: '^19.0.0' };
  head['package-lock.json'].packages['node_modules/left-pad'] = { version: '1.3.0' };
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), success);
});

test('a new range and a stale lock are both reported, pins first', () => {
  const head = pair(
    { dependencies: { 'zod': '^4.0.0', 'left-pad': '^1.3.0' }, devDependencies: { eslint: '^9.0.0' } },
    { dependencies: { zod: '^4.0.0' }, devDependencies: { eslint: '^9.0.0' } },
  );
  assert.deepEqual(checkDeps(repo(base, head), '--base', 'main'), failure([
    pin('package.json', 'dependencies', 'left-pad', '^1.3.0'),
    drift('package-lock.json', 'dependencies', 'left-pad', undefined, '^1.3.0'),
  ]));
});

test('a missing lockfile is rejected', () => {
  const cwd = repo({ 'package.json': manifest({ dependencies: { zod: '^4.0.0' } }) }, {});
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), failure([noLock('package-lock.json')]));
});

test('a lockfile without a root package reports every dependency', () => {
  const cwd = repo({ 'package.json': manifest({ dependencies: { zod: '^4.0.0' } }), 'package-lock.json': { lockfileVersion: 1 } }, {});
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), failure([drift('package-lock.json', 'dependencies', 'zod', undefined, '^4.0.0')]));
});

test('a manifest absent at base makes every dependency new', () => {
  const cwd = repo({}, pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': '1.3.0' }, devDependencies: { tsx: 'latest' } }));
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), failure([
    pin('package.json', 'dependencies', 'zod', '^4.0.0'),
    pin('package.json', 'devDependencies', 'tsx', 'latest'),
  ]));
  write(cwd, pair({ dependencies: { 'zod': '4.0.0', 'left-pad': '1.3.0' } }, { dependencies: { zod: '4.0.0' } }));
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), failure([drift('package-lock.json', 'dependencies', 'left-pad', undefined, '1.3.0')]));
  write(cwd, pair({ dependencies: { 'zod': '4.0.0', 'left-pad': '1.3.0' } }));
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), success);
});

test('--prefix checks a nested npm project against its own files at base', () => {
  const cwd = repo(base, pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': '^1.3.0' }, devDependencies: { eslint: '^9.0.0' } }), 'functions');
  write(cwd, pair({ dependencies: { 'zod': '^4.0.0', 'right-pad': '^1.0.0' } }));
  assert.deepEqual(checkDeps(cwd, '--base', 'main', '--prefix', 'functions'), failure([pin('functions/package.json', 'dependencies', 'left-pad', '^1.3.0')]));
  assert.deepEqual(checkDeps(join(cwd, 'functions'), '--base', 'main'), failure([pin('package.json', 'dependencies', 'left-pad', '^1.3.0')]));
  assert.deepEqual(checkDeps(cwd, '--prefix', './functions/', '--base', 'main'), failure([pin('functions/package.json', 'dependencies', 'left-pad', '^1.3.0')]));
});

test('the working tree is read, not the index', () => {
  const cwd = repo(base, base);
  write(cwd, pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': '^1.3.0' }, devDependencies: { eslint: '^9.0.0' } }));
  git(cwd, 'add', '-A');
  write(cwd, base);
  assert.deepEqual(checkDeps(cwd, '--base', 'main'), success);
});

test('the base can be any commit-ish', () => {
  const cwd = repo(base, base);
  git(cwd, 'commit', '-q', '--allow-empty', '-m', 'next');
  write(cwd, pair({ dependencies: { 'zod': '^4.0.0', 'left-pad': '^1.3.0' }, devDependencies: { eslint: '^9.0.0' } }));
  assert.deepEqual(checkDeps(cwd, '--base', 'HEAD~1'), failure([pin('package.json', 'dependencies', 'left-pad', '^1.3.0')]));
});

test('usage errors exit 2 without checking', () => {
  const cwd = repo(base, base);
  assert.deepEqual(checkDeps(cwd), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkDeps(cwd, '--base'), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkDeps(cwd, '--base', 'main', '--unknown'), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkDeps(cwd, '--base', 'main', 'extra'), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkDeps(cwd, '--base', 'nope'), { status: 2, stdout: '', stderr: 'zoroskr-check-deps: unknown git ref `nope`\n' });
  assert.deepEqual(checkDeps(cwd, '--base', 'main', '--prefix', 'missing'), { status: 2, stdout: '', stderr: 'zoroskr-check-deps: missing/package.json not found\n' });
});

test('the bin is published as zoroskr-check-deps', () => {
  const { bin: bins } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(bins['zoroskr-check-deps'], 'bin/check-deps.js');
});
