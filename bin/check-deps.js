#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { parseArgs } from 'node:util';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const VERSION_CORE = /^\d+\.\d+\.\d+/u;
const VERSION_SUFFIX = /^[-+][\da-z.+-]+$/iu;
const SKILL = 'See skill `dependency-bumps`.';
const USAGE = 'Usage: check-deps --base <git-ref> [--prefix <dir>]\n';

class UsageError extends Error {}

function parseOptions(args) {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { base: { type: 'string' }, prefix: { type: 'string', default: '.' } },
      allowPositionals: true,
    });
    if (values.base === undefined || positionals.length > 0) {
      throw new UsageError(USAGE);
    }
    return { base: values.base, prefix: posix.normalize(values.prefix.replaceAll('\\', '/')).replace(/\/$/u, '') };
  } catch (error) {
    throw error instanceof UsageError ? error : new UsageError(USAGE);
  }
}

function git(...args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function readWorking(file) {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- manifest path from the --prefix argument
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readBase(base, file) {
  const result = git('show', `${base}:./${file}`);
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}

const entries = manifest => Object.entries(manifest ?? {})
  .filter(([section]) => SECTIONS.includes(section))
  .sort(([a], [b]) => SECTIONS.indexOf(a) - SECTIONS.indexOf(b))
  .flatMap(([section, dependencies]) => Object.entries(dependencies ?? {}).map(([name, spec]) => ({ section, name, spec })));

const isExactVersion = (spec) => {
  const core = VERSION_CORE.exec(spec)?.[0];
  const suffix = core === undefined ? null : spec.slice(core.length);
  return suffix === '' || (suffix !== null && VERSION_SUFFIX.test(suffix));
};

const entryKey = ({ section, name }) => `${section}\0${name}`;

function pinProblems(manifestPath, manifest, baseManifest) {
  if (baseManifest === null) {
    return [];
  }
  const existing = new Set(entries(baseManifest).map(({ name }) => name));
  return entries(manifest)
    .filter(({ name, spec }) => !existing.has(name) && !isExactVersion(spec))
    .map(({ section, name, spec }) => `${manifestPath}: new dependency \`${name}\` in ${section} is "${spec}"; pin an exact version (\`npm install --save-exact\`). ${SKILL}`);
}

function lockProblems(lockPath, manifest, lock) {
  if (lock === null) {
    return [`${lockPath}: not found; commit the lockfile CI installs from. ${SKILL}`];
  }
  const locked = new Map(entries(lock.packages?.['']).map(entry => [entryKey(entry), entry.spec]));
  return entries(manifest)
    .filter(entry => locked.get(entryKey(entry)) !== entry.spec)
    .map(({ section, name, spec }) => {
      const lockSpec = locked.get(entryKey({ section, name }));
      return `${lockPath}: packages[""].${section}.${name} is ${lockSpec === undefined ? 'missing' : `"${lockSpec}"`} but package.json has "${spec}"; sync the lockfile. ${SKILL}`;
    });
}

function main(args) {
  const { base, prefix } = parseOptions(args);
  const manifestPath = posix.join(prefix, 'package.json');
  const lockPath = posix.join(prefix, 'package-lock.json');
  const manifest = readWorking(manifestPath);
  if (manifest === null) {
    throw new UsageError(`check-deps: ${manifestPath} not found\n`);
  }
  if (git('rev-parse', '--verify', '--quiet', `${base}^{commit}`).status !== 0) {
    throw new UsageError(`check-deps: unknown git ref \`${base}\`\n`);
  }
  return [
    ...pinProblems(manifestPath, manifest, readBase(base, manifestPath)),
    ...lockProblems(lockPath, manifest, readWorking(lockPath)),
  ];
}

try {
  const problems = main(process.argv.slice(2));
  process.stdout.write(problems.map(problem => `${problem}\n`).join(''));
  process.exitCode = problems.length > 0 ? 1 : 0;
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  process.stderr.write(error.message);
  process.exitCode = 2;
}
