#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const BIN = 'zoroskr-check-skills';
const USAGE = `Usage: ${BIN} <skills-dir> [--globals <dir>] [--author <name>] [--skip <name>[,<name>]]\n`;
const TIER_MAX = new Map([['tactical', 1000], ['domain', 2000], ['architectural', 3000]]);
const SECTIONS = ['Activation Contract', 'Hard Rules', 'Decision Gates', 'Execution Steps', 'Output Contract', 'References'];
const OPTIONAL_SECTIONS = new Set(['References']);
const DESCRIPTION_MAX = 250;
const QUOTED = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/u;
const FENCE = /^\s*(?:```|~~~)/u;
const ISSUE_HASH = /(?<![\w&/#])#\d+(?![\w-])/gu;
const ISSUE_URL = [/\/pull\/\d+/gu, /\/issues\/\d+/gu];
const EXTENDS = /Extends global ([^;\n]*)/gu;
const BACKTICKED_NAME = /^`([^`]+)`/u;
const SEPARATOR = /^[\s,]*/u;

class UsageError extends Error {}

function parseOptions(args) {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { globals: { type: 'string' }, author: { type: 'string' }, skip: { type: 'string', multiple: true } },
      allowPositionals: true,
    });
    if (positionals.length !== 1) {
      throw new UsageError(USAGE);
    }
    return { dir: positionals[0], globals: values.globals, author: values.author, skip: new Set((values.skip ?? []).flatMap(value => value.split(',')).map(name => name.trim())) };
  } catch (error) {
    throw error instanceof UsageError ? error : new UsageError(USAGE);
  }
}

function assertDirectory(dir) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- skills directory from the command line
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new UsageError(`${BIN}: ${dir} is not a directory\n`);
  }
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    return value.slice(1, -1).replaceAll(/\\(.)/gu, '$1');
  }
  if (value.startsWith('\'') && value.endsWith('\'') && value.length > 1) {
    return value.slice(1, -1).replaceAll('\'\'', '\'');
  }
  return value;
}

function parseSkill(text) {
  const lines = text.split('\n');
  const delimiters = lines.map(line => line.replace(/\r$/u, ''));
  const end = delimiters.indexOf('---', 1);
  if (delimiters[0] !== '---' || end === -1) {
    return null;
  }
  const fields = new Map();
  let parent = '';
  for (const line of delimiters.slice(1, end)) {
    const match = /^( *)([A-Za-z][\w-]*):(.*)$/u.exec(line);
    if (match === null) {
      continue;
    }
    const [, indent, key, raw] = match;
    parent = indent === '' ? key : parent;
    fields.set(indent === '' ? key : `${parent}.${key}`, raw.trim());
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

function bodySections(body) {
  const sections = [];
  let fenced = false;
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
    }
    const heading = fenced ? null : /^## (\S.*)$/u.exec(line.trimEnd());
    if (heading !== null) {
      sections.push({ title: heading[1], lines: [] });
    } else if (sections.length > 0) {
      sections.at(-1).lines.push(line);
    }
  }
  return sections;
}

const withoutCode = text => text
  .split('\n')
  .filter((line, index, lines) => !FENCE.test(line) && lines.slice(0, index).filter(previous => FENCE.test(previous)).length % 2 === 0)
  .join('\n')
  .replaceAll(/`[^`\n]*`/gu, '');

function frontmatterProblems(folder, fields) {
  const problems = [];
  const name = fields.get('name');
  if (name === undefined) {
    problems.push('name is missing');
  } else if (unquote(name) !== folder) {
    problems.push(`name "${unquote(name)}" does not match the folder`);
  }
  const description = fields.get('description');
  if (description === undefined) {
    problems.push('description is missing');
  } else if (!QUOTED.test(description)) {
    problems.push('description must be one quoted line');
  } else {
    const length = [...unquote(description)].length;
    if (length > DESCRIPTION_MAX) {
      problems.push(`description is ${length} chars; max ${DESCRIPTION_MAX}`);
    }
    if (!unquote(description).startsWith('Trigger:')) {
      problems.push('description must start with "Trigger:"');
    }
  }
  for (const key of ['license', 'metadata.author', 'metadata.version', 'metadata.tier']) {
    if (unquote(fields.get(key) ?? '').trim() === '') {
      problems.push(`${key} is missing`);
    }
  }
  const tier = fields.get('metadata.tier');
  if (tier !== undefined && tier !== '' && !TIER_MAX.has(unquote(tier))) {
    problems.push(`metadata.tier "${unquote(tier)}" is not one of ${[...TIER_MAX.keys()].join(', ')}`);
  }
  return problems;
}

function budgetProblems(fields, body) {
  const tier = unquote(fields.get('metadata.tier') ?? '');
  const max = TIER_MAX.get(tier);
  if (max === undefined) {
    return [];
  }
  const tokens = Math.ceil(Buffer.byteLength(body) / 4);
  return tokens > max ? [`body is ${tokens} tokens; tier ${tier} max ${max}`] : [];
}

function sectionProblems(sections) {
  const titles = sections.map(({ title }) => title);
  const missing = SECTIONS
    .filter(title => !OPTIONAL_SECTIONS.has(title) && !titles.includes(title))
    .map(title => `section "## ${title}" is missing`);
  let highest = -1;
  const outOfOrder = [];
  for (const title of titles.filter(title => SECTIONS.includes(title))) {
    const index = SECTIONS.indexOf(title);
    if (index < highest) {
      outOfOrder.push(`section "## ${title}" is out of order; expected ${SECTIONS.join(', ')}`);
    }
    highest = Math.max(highest, index);
  }
  return [...missing, ...outOfOrder];
}

function referenceProblems(texts) {
  return texts.flatMap(text => [
    ...withoutCode(text).match(ISSUE_HASH) ?? [],
    ...ISSUE_URL.flatMap(pattern => text.match(pattern) ?? []),
  ]).map(reference => `PR/issue reference "${reference}"`);
}

function extendedNames(list) {
  const names = [];
  let rest = list.replaceAll(/\([^)]*\)/gu, '');
  let match = BACKTICKED_NAME.exec(rest);
  while (match !== null) {
    names.push(match[1]);
    rest = rest.slice(match[0].length).replace(SEPARATOR, '');
    rest = rest.startsWith('and ') ? rest.slice('and '.length).trimStart() : rest;
    match = BACKTICKED_NAME.exec(rest);
  }
  return names;
}

function extendsProblems(sections, globals) {
  const activation = sections.find(({ title }) => title === 'Activation Contract');
  if (globals === undefined || activation === undefined) {
    return [];
  }
  const text = activation.lines.join('\n');
  const names = [...text.matchAll(EXTENDS)].flatMap(([, list]) => extendedNames(list));
  if (names.length === 0) {
    return [];
  }
  const lead = `Extends global \`${names[0]}\`; load it first.`;
  const first = (activation.lines.find(line => line.trim() !== '') ?? '').trim();
  const opensWithExtends = first.startsWith(`Extends global \`${names[0]}\``) && /; load (?:it|them) first/u.test(first.split('.')[0] ?? '');
  return [
    ...opensWithExtends ? [] : [`Activation Contract must start with "${lead}"`],
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- globals directory from the command line
    ...names.filter(name => !existsSync(join(globals, name, 'SKILL.md'))).map(name => `Extends global \`${name}\` names no skill in the globals dir`),
  ];
}

function skillProblems(folder, text, { globals, author }) {
  const skill = parseSkill(text);
  if (skill === null) {
    return author === undefined ? ['frontmatter is missing'] : [];
  }
  const { fields, body } = skill;
  const skillAuthor = unquote(fields.get('metadata.author') ?? '').trim();
  if (author !== undefined && skillAuthor !== '' && skillAuthor !== author.trim()) {
    return [];
  }
  const sections = bodySections(body);
  return [
    ...frontmatterProblems(folder, fields),
    ...budgetProblems(fields, body),
    ...sectionProblems(sections),
    ...referenceProblems([unquote(fields.get('description') ?? ''), body]),
    ...extendsProblems(sections, globals),
  ];
}

function main(args) {
  const options = parseOptions(args);
  assertDirectory(options.dir);
  if (options.globals !== undefined) {
    assertDirectory(options.globals);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- skills directory from the command line
  return readdirSync(options.dir)
    .toSorted()
    .filter(folder => !options.skip.has(folder))
    .map(folder => ({ folder, file: join(options.dir, folder, 'SKILL.md') }))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- skill file inside the skills directory
    .filter(({ file }) => existsSync(file))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- skill file inside the skills directory
    .flatMap(({ folder, file }) => skillProblems(folder, readFileSync(file, 'utf8'), options).map(problem => `${folder}: ${problem}`));
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
