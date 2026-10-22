// The harness's own checks: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultKinds, plan, section, withSection } from '../tools/install.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((n) => (n === '.git' || n === 'node_modules' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const frontmatter = (text) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? Object.fromEntries(m[1].split(/\r?\n/).map((l) => /^(\w[\w-]*):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].replace(/^'|'$/g, '')])) : null;
};
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const SKILLS = readdirSync(join(ROOT, 'skills'));
const SHIPPED = ['skills', 'agents', 'templates', 'tools'].flatMap((d) => walk(join(ROOT, d)));

test('every skill has a SKILL.md whose name is its folder and whose description says when to use it', () => {
  assert.ok(SKILLS.length >= 5);
  for (const s of SKILLS) {
    const fm = frontmatter(read('skills', s, 'SKILL.md'));
    assert.ok(fm, `${s}: frontmatter`);
    assert.equal(fm.name, s);
    assert.match(fm.description, /^Use /, `${s}: description starts with "Use"`);
    assert.ok(fm.description.length <= 1024, `${s}: description at most 1024 characters`);
  }
});

test('every agent has a name and a description', () => {
  for (const a of readdirSync(join(ROOT, 'agents'))) {
    const fm = frontmatter(read('agents', a));
    assert.ok(fm?.name && fm?.description, a);
    assert.equal(fm.name, a.replace('.agent.md', ''));
  }
});

test('the orchestrate skill routes to every other skill, and every skill it names exists', () => {
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  const others = SKILLS.filter((s) => s !== 'orchestrate');
  for (const s of others) assert.ok(entry.includes(`\`${s}\``), `orchestrate names ${s}`);
  for (const m of entry.matchAll(/\| `([a-z-]+)` \|/g)) assert.ok(others.includes(m[1]), `${m[1]} exists`);
});

test('every goal and attention mode is named by the entry point, the modes skill and the installed section', () => {
  const MODES = ['show me the UX sooner', 'prove the risky assumption', 'make this production-ready', 'work with me', 'keep going unattended'];
  const texts = { orchestrate: read('skills', 'orchestrate', 'SKILL.md'), 'execution-modes': read('skills', 'execution-modes', 'SKILL.md'), section: section(null) };
  for (const mode of MODES) for (const [name, text] of Object.entries(texts)) assert.ok(text.toLowerCase().includes(mode.toLowerCase()), `${name} names "${mode}"`);
});

test('the throughput reviewer asks the same questions as the progress-review skill', () => {
  const labels = (text) => [...text.matchAll(/^\d+\. \*\*([^*]+):\*\*/gm)].map((m) => m[1]);
  const fromAgent = labels(read('agents', 'throughput-reviewer.agent.md'));
  assert.ok(fromAgent.length >= 8);
  assert.deepEqual(fromAgent, labels(read('skills', 'progress-review', 'SKILL.md')));
});

test('execution control only: no product-reasoning skills or templates, and no dependence on another harness', () => {
  const PRODUCT_SKILLS = ['craft', 'ground', 'definition-of-done', 'assumptions', 'design-system', 'ui-copy', 'perceived-performance', 'performance'];
  for (const s of PRODUCT_SKILLS) assert.ok(!SKILLS.includes(s), `${s} belongs to a product-reasoning harness`);
  for (const t of ['spec.md', 'definition-of-done.md', 'tokens']) assert.ok(!existsSync(join(ROOT, 'templates', t)), `templates/${t} belongs to a product-reasoning harness`);
  for (const f of SHIPPED) assert.doesNotMatch(readFileSync(f, 'utf8'), /agentic-craft|\bslate\b/i, `${relative(ROOT, f)} must work without another harness installed`);
});

test('project-agnostic: no project, person or machine names in skills, agents, templates or tools', () => {
  const BANNED = /\b(atiya|chopper|little planet|cozy life|personal-site|pebam)\b|[A-Z]:\\{1,2}Projects|\/Users\/[a-z]+\//i;
  for (const f of SHIPPED) {
    const text = readFileSync(f, 'utf8').replace(/https:\/\/github\.com\/prabinpebam\/agent-orchestration[\w/.-]*/g, '');
    const m = BANNED.exec(text);
    assert.equal(m, null, `${relative(ROOT, f)}: "${m?.[0]}"`);
    assert.doesNotMatch(text, /prabin/i, `${relative(ROOT, f)} names a person`);
  }
});

test('relative links in the markdown resolve', () => {
  for (const f of walk(ROOT).filter((x) => x.endsWith('.md'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || target.startsWith('<')) continue;
      assert.ok(existsSync(resolve(dirname(f), target)), `${relative(ROOT, f)} → ${target}`);
    }
  }
});

test('the installer copies skills and agents where each agent looks, for a project and for every project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orchestration-install-'));
  const copies = plan(dir, ['copilot', 'claude', 'agents'], false).map((c) => c.to);
  for (const p of [['.github', 'skills', 'orchestrate'], ['.github', 'agents', 'throughput-reviewer.agent.md'], ['.claude', 'skills', 'progress-review'], ['.claude', 'agents', 'throughput-reviewer.md'], ['.agents', 'skills', 'stage-validation']]) {
    assert.ok(copies.includes(join(dir, ...p)), p.join('/'));
  }
  assert.ok(!copies.some((c) => c.startsWith(join(dir, '.agents', 'agents'))), 'no agent files in the open skills layout');
  const everywhere = plan(dir, ['copilot', 'claude', 'agents'], true).map((c) => c.to);
  for (const p of [['.copilot', 'skills', 'orchestrate'], ['.claude', 'agents', 'throughput-reviewer.md'], ['.agents', 'skills', 'coordinate']]) {
    assert.ok(everywhere.includes(join(homedir(), ...p)), `global ${p.join('/')}`);
  }
});

test('the installer keeps the filled-in project facts and leaves other sections alone', () => {
  const first = withSection('# My project\n');
  assert.match(first, /<!-- agent-orchestration:start -->[\s\S]*### Project facts[\s\S]*<!-- agent-orchestration:end -->/);
  const filled = first.replace('<a path outside the repository, or an ignored folder inside it when the agent can\'t write outside>', '~/logs/progress.log');
  const again = withSection(filled);
  assert.match(again, /~\/logs\/progress\.log/);
  assert.equal((again.match(/agent-orchestration:start/g) ?? []).length, 1);

  const other = '# Project\n\n<!-- other-harness:start -->\n## Other\n\n### Project facts\n\n- **Spec:** docs/spec.md\n<!-- other-harness:end -->\n';
  const once = withSection(other);
  assert.ok(once.startsWith(other.trimEnd()), 'the other section is untouched');
  assert.equal(withSection(once), once, 'a second run changes nothing');
});

test('without --for, the installer adds Claude Code and the open skills layout when the project uses them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orchestration-kinds-'));
  assert.deepEqual(defaultKinds(dir), ['copilot']);
  mkdirSync(join(dir, '.claude'));
  mkdirSync(join(dir, '.agents'));
  assert.deepEqual(defaultKinds(dir), ['copilot', 'claude', 'agents']);
});

test('the installer runs from the command line and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orchestration-cli-'));
  writeFileSync(join(dir, 'AGENTS.md'), '# Project\n');
  const run = () => execFileSync(process.execPath, [join(ROOT, 'tools', 'install.mjs'), dir, '--for', 'copilot,agents', '--templates', 'docs/work'], { encoding: 'utf8' });
  assert.match(run(), /installed \d+ skills and \d+ agents for copilot, agents/);
  assert.ok(existsSync(join(dir, '.github', 'skills', 'orchestrate', 'SKILL.md')));
  assert.ok(existsSync(join(dir, '.agents', 'skills', 'orchestrate', 'SKILL.md')));
  assert.ok(existsSync(join(dir, 'docs', 'work', 'work-plan.md')));
  const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  writeFileSync(join(dir, 'docs', 'work', 'work-plan.md'), '# Filled-in plan\n');
  run();
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), after);
  assert.equal(readFileSync(join(dir, 'docs', 'work', 'work-plan.md'), 'utf8'), '# Filled-in plan\n', 'a filled-in template is never replaced');
});
