import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bin = join(root, 'bin/check-skills.js');
const scratch = mkdtempSync(join(tmpdir(), 'zoroskr-check-skills-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const USAGE = 'Usage: zoroskr-check-skills <skills-dir> [--globals <dir>] [--author <name>] [--skip <name>[,<name>]]\n';
const ORDER = 'Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References';

const frontmatter = ({
  name = 'demo',
  description = '"Trigger: demo work. Does demo things."',
  license = 'Apache-2.0',
  author = 'zoroskr',
  version = '"1.0"',
  tier = 'tactical',
} = {}) => [
  '---',
  ...name === null ? [] : [`name: ${name}`],
  ...description === null ? [] : [`description: ${description}`],
  ...license === null ? [] : [`license: ${license}`],
  'metadata:',
  ...author === null ? [] : [`  author: ${author}`],
  ...version === null ? [] : [`  version: ${version}`],
  ...tier === null ? [] : [`  tier: ${tier}`],
  '---',
].join('\n');

const SECTIONS = {
  'Activation Contract': 'Load for demo work.',
  'Hard Rules': '- Never break the demo.',
  'Decision Gates': '| Case | Action |\n| --- | --- |\n| a | b |',
  'Execution Steps': '1. Do the demo.',
  'Output Contract': 'Report the demo.',
  'References': '- `references/demo.md`',
};

const body = (sections = SECTIONS) => Object.entries(sections).map(([heading, text]) => `## ${heading}\n\n${text}\n`).join('\n');

const skill = (options = {}, sections = SECTIONS) => `${frontmatter(options)}\n\n# Demo\n\n${body(sections)}`;

function skillsDir(skills) {
  const dir = mkdtempSync(join(scratch, 'skills-'));
  for (const [folder, content] of Object.entries(skills)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture skills inside the test temp directory
    mkdirSync(join(dir, folder), { recursive: true });
    if (content !== null) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture skills inside the test temp directory
      writeFileSync(join(dir, folder, 'SKILL.md'), content);
    }
  }
  return dir;
}

function checkSkills(...args) {
  const result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const problems = (...lines) => ({ status: 1, stdout: lines.map(line => `${line}\n`).join(''), stderr: '' });
const clean = { status: 0, stdout: '', stderr: '' };

test('a skill following the style guide is clean', () => {
  const dir = skillsDir({ demo: skill(), notes: null });
  assert.deepEqual(checkSkills(dir), clean);
});

test('References may be omitted', () => {
  const { References: _references, ...sections } = SECTIONS;
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({}, sections) })), clean);
});

test('the name must equal the folder', () => {
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ name: 'other' }) })), problems('demo: name "other" does not match the folder'));
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ name: null }) })), problems('demo: name is missing'));
});

test('a file without frontmatter is reported once', () => {
  assert.deepEqual(checkSkills(skillsDir({ demo: `# Demo\n\n${body()}` })), problems('demo: frontmatter is missing'));
});

test('the description is one quoted line of at most 250 chars starting with Trigger:', () => {
  const at250 = `"Trigger: ${'x'.repeat(241)}"`;
  const over250 = `"Trigger: ${'x'.repeat(242)}"`;
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: at250 }) })), clean);
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: '\'Trigger: single quoted. Works.\'' }) })), clean);
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: over250 }) })), problems('demo: description is 251 chars; max 250'));
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: 'Trigger: unquoted. Does things.' }) })), problems('demo: description must be one quoted line'));
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: '>\n  Trigger: folded. Does things.' }) })), problems('demo: description must be one quoted line'));
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: '"Does things. Trigger: later."' }) })), problems('demo: description must start with "Trigger:"'));
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({ description: null }) })), problems('demo: description is missing'));
});

test('license, metadata.author, metadata.version and metadata.tier are required', () => {
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({ license: null, author: null, version: null, tier: null }) })),
    problems('demo: license is missing', 'demo: metadata.author is missing', 'demo: metadata.version is missing', 'demo: metadata.tier is missing'),
  );
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({ tier: 'huge' }) })),
    problems('demo: metadata.tier "huge" is not one of tactical, domain, architectural'),
  );
});

test('the body token estimate (UTF-8 bytes / 4, frontmatter excluded) stays within the tier hard max', () => {
  const sized = (tier, tokens) => `${frontmatter({ tier })}\n${body()}${'é'.repeat(2)}${'x'.repeat(tokens * 4 - Buffer.byteLength(body()) - 4)}`;
  for (const [tier, max] of [['tactical', 1000], ['domain', 2000], ['architectural', 3000]]) {
    assert.deepEqual(checkSkills(skillsDir({ demo: sized(tier, max) })), clean, tier);
    assert.deepEqual(checkSkills(skillsDir({ demo: `${sized(tier, max)}y` })), problems(`demo: body is ${max + 1} tokens; tier ${tier} max ${max}`), tier);
  }
});

test('required sections are present and in style-guide order', () => {
  const { 'Hard Rules': _rules, 'Output Contract': _output, ...missing } = SECTIONS;
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({}, missing) })),
    problems('demo: section "## Hard Rules" is missing', 'demo: section "## Output Contract" is missing'),
  );
  const { 'Activation Contract': activation, 'Hard Rules': rules, ...rest } = SECTIONS;
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({}, { 'Hard Rules': rules, 'Activation Contract': activation, ...rest }) })),
    problems(`demo: section "## Activation Contract" is out of order; expected ${ORDER}`),
  );
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({}, { ...SECTIONS, Notes: 'Extra section.' }) })),
    clean,
  );
});

test('headings inside fenced code are not sections', () => {
  const fenced = { ...SECTIONS, 'Execution Steps': '```md\n## Activation Contract\n```' };
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({}, fenced) })), clean);
});

test('PR and issue numbers are rejected in the body and description', () => {
  const sections = { ...SECTIONS, 'Hard Rules': '- Fixed in #42 and https://github.com/o/r/pull/7 and https://github.com/o/r/issues/9.' };
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({}, sections) })),
    problems('demo: PR/issue reference "#42"', 'demo: PR/issue reference "/pull/7"', 'demo: PR/issue reference "/issues/9"'),
  );
  assert.deepEqual(
    checkSkills(skillsDir({ demo: skill({ description: '"Trigger: see #12. Does things."' }) })),
    problems('demo: PR/issue reference "#12"'),
  );
  const harmless = { ...SECTIONS, 'Hard Rules': '- Use `#000` and `color: #123`; anchors like [x](#hard-rules); headings `## 2`.\n\n```css\na { color: #111; }\n```' };
  assert.deepEqual(checkSkills(skillsDir({ demo: skill({}, harmless) })), clean);
});

test('--globals checks that Extends global names an existing global', () => {
  const globals = skillsDir({ base: skill({ name: 'base' }) });
  const extending = name => skill({}, { ...SECTIONS, 'Activation Contract': `Extends global \`${name}\`; load it first. Apply to demo work.` });
  assert.deepEqual(checkSkills(skillsDir({ demo: extending('base') }), '--globals', globals), clean);
  assert.deepEqual(
    checkSkills(skillsDir({ demo: extending('missing') }), '--globals', globals),
    problems('demo: Extends global `missing` names no skill in the globals dir'),
  );
  assert.deepEqual(checkSkills(skillsDir({ demo: extending('missing') })), clean);
  const late = skill({}, { ...SECTIONS, 'Activation Contract': 'Apply to demo work.\n\nExtends global `base`; load it first.' });
  assert.deepEqual(
    checkSkills(skillsDir({ demo: late }), '--globals', globals),
    problems('demo: Activation Contract must start with "Extends global `base`; load it first."'),
  );
  const pair = skillsDir({ base: skill({ name: 'base' }), other: skill({ name: 'other' }) });
  const variants = [
    'Extends global `base` and `other`; load them first. Apply to demo work.',
    'Extends global `base` (pagination UI); load it first. Apply to demo work.',
    'Extends global `base`; load it first (it owns the shape).',
  ];
  for (const contract of variants) {
    assert.deepEqual(checkSkills(skillsDir({ demo: skill({}, { ...SECTIONS, 'Activation Contract': contract }) }), '--globals', pair), clean);
  }
  const listed = [
    ['Extends global `base` and `gone`; load them first. Apply to demo work.', ['gone']],
    ['Extends global `base`, `other` and `gone`; load them first.', ['gone']],
    ['Extends global `base` (pagination UI) and `gone` (forms); load them first.', ['gone']],
    ['Extends global `lost`, `gone`; load them first.', ['lost', 'gone']],
  ];
  for (const [contract, missingNames] of listed) {
    assert.deepEqual(
      checkSkills(skillsDir({ demo: skill({}, { ...SECTIONS, 'Activation Contract': contract }) }), '--globals', pair),
      problems(...missingNames.map(name => `demo: Extends global \`${name}\` names no skill in the globals dir`)),
      contract,
    );
  }
  const elsewhere = skill({}, { ...SECTIONS, 'Hard Rules': '- Extends global `missing` is mentioned outside the contract.' });
  assert.deepEqual(checkSkills(skillsDir({ demo: elsewhere }), '--globals', globals), clean);
});

test('--author checks only skills by that metadata.author', () => {
  const dir = skillsDir({ demo: skill({ name: 'wrong' }), other: skill({ name: 'nope', author: 'someone-else' }), bare: '# No frontmatter\n' });
  assert.deepEqual(checkSkills(dir, '--author', 'zoroskr'), problems('demo: name "wrong" does not match the folder'));
  assert.deepEqual(
    checkSkills(dir),
    problems('bare: frontmatter is missing', 'demo: name "wrong" does not match the folder', 'other: name "nope" does not match the folder'),
  );
  const quoted = skillsDir({ demo: skill({ author: '"zoroskr"', name: 'x' }) });
  assert.deepEqual(checkSkills(quoted, '--author', 'zoroskr'), problems('demo: name "x" does not match the folder'));
});

test('--author trims the name and still checks skills whose metadata.author is missing', () => {
  const dir = skillsDir({
    demo: skill({ name: 'wrong' }),
    padded: skill({ author: '" zoroskr "', name: 'p' }),
    unowned: skill({ name: 'unowned', author: null }),
    empty: skill({ author: '""', name: 'empty' }),
    other: skill({ name: 'nope', author: 'someone-else' }),
  });
  const expected = problems(
    'demo: name "wrong" does not match the folder',
    'empty: metadata.author is missing',
    'padded: name "p" does not match the folder',
    'unowned: metadata.author is missing',
  );
  assert.deepEqual(checkSkills(dir, '--author', 'zoroskr'), expected);
  assert.deepEqual(checkSkills(dir, '--author', '  zoroskr '), expected);
});

test('CRLF frontmatter parses like LF', () => {
  const crlf = text => text.replaceAll('\n', '\r\n');
  assert.deepEqual(checkSkills(skillsDir({ demo: crlf(skill()) })), clean);
  assert.deepEqual(checkSkills(skillsDir({ demo: crlf(skill()) }), '--author', 'zoroskr'), clean);
  assert.deepEqual(
    checkSkills(skillsDir({ demo: crlf(skill({ name: 'wrong', description: '"Does things."' })) }), '--author', 'zoroskr'),
    problems('demo: name "wrong" does not match the folder', 'demo: description must start with "Trigger:"'),
  );
  const globals = skillsDir({ base: skill({ name: 'base' }) });
  const extending = crlf(skill({}, { ...SECTIONS, 'Activation Contract': 'Extends global `base` and `gone`; load them first.' }));
  assert.deepEqual(
    checkSkills(skillsDir({ demo: extending }), '--globals', globals),
    problems('demo: Extends global `gone` names no skill in the globals dir'),
  );
});

test('usage errors exit 2', () => {
  const dir = skillsDir({ demo: skill() });
  assert.deepEqual(checkSkills(), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkSkills(dir, 'extra'), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkSkills(dir, '--unknown'), { status: 2, stdout: '', stderr: USAGE });
  assert.deepEqual(checkSkills(dir, '--globals'), { status: 2, stdout: '', stderr: USAGE });
  const missing = join(scratch, 'missing');
  assert.deepEqual(checkSkills(missing), { status: 2, stdout: '', stderr: `zoroskr-check-skills: ${missing} is not a directory\n` });
  assert.deepEqual(checkSkills(dir, '--globals', missing), { status: 2, stdout: '', stderr: `zoroskr-check-skills: ${missing} is not a directory\n` });
});

test('the package publishes both bins, sorted, with their files', () => {
  const { bin: bins, files } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(bins, { 'zoroskr-check-deps': 'bin/check-deps.js', 'zoroskr-check-skills': 'bin/check-skills.js' });
  assert.deepEqual(Object.keys(bins), Object.keys(bins).toSorted());
  assert.ok(files.includes('bin/check-skills.js'));
  assert.deepEqual(files, files.toSorted());
});

test('--skip leaves named skills out of the check', () => {
  const dir = skillsDir({ demo: skill({ name: 'wrong' }), vendor: '# No frontmatter\n', other: skill({ name: 'nope' }) });
  assert.deepEqual(checkSkills(dir, '--skip', 'vendor', '--skip', 'other'), problems('demo: name "wrong" does not match the folder'));
  assert.deepEqual(checkSkills(dir, '--skip', 'vendor,other'), problems('demo: name "wrong" does not match the folder'));
});
