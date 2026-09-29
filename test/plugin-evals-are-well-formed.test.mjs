// The plugin eval suite (evals/, read by `claude plugin eval`) is shaped the way the plugin-evals
// docs describe it, and it covers every plugin skill. This test does NOT run the evals — that is a
// release-time act (evals/README.md). It keeps the files loadable: `claude plugin eval` treats an
// unknown prompt.md key as an error, so a typo here would only surface at release, on a subscription.
//
// Shape, from docs/reference/anthropic-agentic-engineering-2026-09-27/notes/03 §5 and 06 KQ3:
//   evals/<case>/prompt.md     frontmatter (closed key set) + the prompt as the body
//   evals/<case>/graders/*.md  frontmatter `type` + that type's options; an `llm` body is its rubric
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, 'evals');
const SKILLS = readdirSync(join(ROOT, 'skills')).filter((d) => existsSync(join(ROOT, 'skills', d, 'SKILL.md')));
// Output and mock directories the tool owns; they are not cases.
const NOT_CASES = new Set(['results', 'mocks']);

const CASE_KEYS = new Set(['schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome',
  'model', 'max_turns', 'timeout_seconds', 'allowed_tools', 'append_system_prompt', 'env']);
const COMMON_GRADER_KEYS = ['type', 'weight', 'arm'];
// `baseline` is left out on purpose: the doc base names no keys for its reference transcript.
const GRADER_KEYS = {
  regex: { required: ['pattern'], optional: ['flags', 'match', 'target'] },
  tool_used: { required: ['tool'], optional: ['input_match', 'min', 'max'] },
  tool_order: { required: ['before', 'after'], optional: [] },
  file_exists: { required: ['path'], optional: ['exists'] },
  llm: { required: [], optional: ['target'] },
};

// The subset of YAML these files use: `key: scalar`, a double- or single-quoted string, or a flow
// list `[a, b]`. Anything else fails loudly rather than being half-read.
function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  assert.ok(m, `${file}: no --- frontmatter --- block`);
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `${file}: cannot read frontmatter line ${JSON.stringify(line)}`);
    const [, key, raw] = kv;
    assert.ok(!(key in data), `${file}: duplicate key ${key}`);
    data[key] = scalar(raw, file);
  }
  return { data, body: m[2].trim() };
}
function scalar(raw, file) {
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (raw.startsWith("'")) { assert.ok(raw.endsWith("'"), `${file}: unterminated '${raw}`); return raw.slice(1, -1).replaceAll("''", "'"); }
  if (raw.startsWith('[')) {
    assert.ok(raw.endsWith(']'), `${file}: unterminated list ${raw}`);
    return raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).map((s) => scalar(s, file));
  }
  assert.ok(raw !== '' && !raw.startsWith('{') && !raw.startsWith('|') && !raw.startsWith('>'),
    `${file}: value ${JSON.stringify(raw)} is outside the subset this test reads`);
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw;
}

const caseDirs = readdirSync(EVALS)
  .filter((d) => !NOT_CASES.has(d) && statSync(join(EVALS, d)).isDirectory());

test('evals/ holds at least one case, and evals/results/ is gitignored', () => {
  assert.ok(caseDirs.length > 0, 'no case directories under evals/');
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(ignore.includes('evals/results/'), '.gitignore must carry evals/results/ — run output is never committed');
});

for (const dir of caseDirs) {
  test(`evals/${dir}: prompt.md and graders are in the documented shape`, () => {
    const promptFile = join(EVALS, dir, 'prompt.md');
    assert.ok(existsSync(promptFile), `evals/${dir}/prompt.md is missing`);
    const { data, body } = frontmatter(promptFile);
    for (const k of Object.keys(data)) assert.ok(CASE_KEYS.has(k), `evals/${dir}/prompt.md: unknown key ${k} (the tool errors on it)`);
    assert.ok(body.length > 0, `evals/${dir}/prompt.md: the prompt body is empty`);
    if ('runs' in data) assert.ok(Number.isInteger(data.runs) && data.runs >= 1 && data.runs <= 50, `evals/${dir}: runs must be 1..50`);
    if ('max_turns' in data) assert.ok(Number.isInteger(data.max_turns) && data.max_turns >= 1 && data.max_turns <= 200, `evals/${dir}: max_turns 1..200`);
    if ('timeout_seconds' in data) assert.ok(Number.isInteger(data.timeout_seconds) && data.timeout_seconds >= 1 && data.timeout_seconds <= 3600, `evals/${dir}: timeout_seconds 1..3600`);

    const gradersDir = join(EVALS, dir, 'graders');
    const graders = existsSync(gradersDir) ? readdirSync(gradersDir).filter((f) => f.endsWith('.md')) : [];
    assert.ok(graders.length >= 1, `evals/${dir}: needs at least one graders/*.md`);
    for (const g of graders) {
      const file = join(gradersDir, g);
      const { data: gd, body: gb } = frontmatter(file);
      const spec = GRADER_KEYS[gd.type];
      assert.ok(spec, `evals/${dir}/graders/${g}: type ${JSON.stringify(gd.type)} is not one of ${Object.keys(GRADER_KEYS).join(', ')}`);
      const allowed = new Set([...COMMON_GRADER_KEYS, ...spec.required, ...spec.optional]);
      for (const k of Object.keys(gd)) assert.ok(allowed.has(k), `evals/${dir}/graders/${g}: key ${k} is not a ${gd.type} option`);
      for (const k of spec.required) assert.ok(k in gd, `evals/${dir}/graders/${g}: ${gd.type} needs ${k}`);
      if ('arm' in gd) assert.ok(['with-only', 'both'].includes(gd.arm), `evals/${dir}/graders/${g}: arm is with-only or both`);
      if ('weight' in gd) assert.ok(typeof gd.weight === 'number' && gd.weight > 0, `evals/${dir}/graders/${g}: weight is a positive number`);
      if (gd.type === 'regex') {
        assert.doesNotThrow(() => new RegExp(gd.pattern, gd.flags ?? ''), `evals/${dir}/graders/${g}: pattern does not compile`);
        if ('match' in gd) assert.match(String(gd.match), /^(contains|not_contains|count:\d+)$/, `evals/${dir}/graders/${g}: match`);
        if ('target' in gd) assert.ok(['last_message', 'trace', 'files'].includes(gd.target), `evals/${dir}/graders/${g}: target`);
      }
      if (gd.type === 'tool_used') {
        for (const k of ['min', 'max']) if (k in gd) assert.ok(Number.isInteger(gd[k]) && gd[k] >= 0, `evals/${dir}/graders/${g}: ${k} is a whole number`);
      }
      if (gd.type === 'llm') assert.ok(gb.length > 0, `evals/${dir}/graders/${g}: an llm grader's body is its rubric and is empty`);
    }
  });
}

// Every case names its skill in `tags` next to `trigger` or `near-miss`. A trigger case asserts the
// Skill tool loaded that skill at least once; a near-miss asserts it never did.
function skillCase(dir) {
  const { data } = frontmatter(join(EVALS, dir, 'prompt.md'));
  const tags = data.tags ?? [];
  const skills = tags.filter((t) => SKILLS.includes(t));
  const kind = tags.find((t) => t === 'trigger' || t === 'near-miss');
  const graders = readdirSync(join(EVALS, dir, 'graders')).map((g) => frontmatter(join(EVALS, dir, 'graders', g)).data);
  return { skills, kind, graders };
}

test('every plugin skill has a natural-phrasing trigger case with a tool_used Skill grader', () => {
  const covered = new Set();
  for (const dir of caseDirs) {
    const { skills, kind, graders } = skillCase(dir);
    assert.equal(skills.length, 1, `evals/${dir}: tags must name exactly one plugin skill (have ${JSON.stringify(skills)})`);
    assert.ok(kind, `evals/${dir}: tags must carry trigger or near-miss`);
    assert.ok(dir.startsWith(`${skills[0]}--`), `evals/${dir}: the directory starts with its skill name, then --`);
    const skillGraders = graders.filter((g) => g.type === 'tool_used' && g.tool === 'Skill' && g.input_match === skills[0]);
    assert.ok(skillGraders.length >= 1, `evals/${dir}: no tool_used grader on the Skill tool for ${skills[0]}`);
    assert.ok(graders.some((g) => !(g.type === 'tool_used' && g.tool === 'Skill')), `evals/${dir}: needs a result grader besides the Skill one`);
    if (kind === 'trigger') {
      assert.ok(skillGraders.some((g) => (g.min ?? 1) >= 1), `evals/${dir}: a trigger case asserts min >= 1`);
      covered.add(skills[0]);
    } else {
      assert.ok(skillGraders.some((g) => g.max === 0), `evals/${dir}: a near-miss case asserts max: 0`);
    }
  }
  const missing = SKILLS.filter((s) => !covered.has(s));
  assert.deepEqual(missing, [], `plugin skills with no trigger case: ${missing.join(', ')}`);
});

test('cmp-new, grill-me and cmp-doctor each carry a near-miss negative', () => {
  const negatives = new Set(caseDirs.map(skillCase).filter((c) => c.kind === 'near-miss').map((c) => c.skills[0]));
  for (const s of ['cmp-new', 'grill-me', 'cmp-doctor']) assert.ok(negatives.has(s), `no near-miss case for ${s}`);
});
