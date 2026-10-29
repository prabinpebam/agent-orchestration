// The harness's own checks: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultKinds, mergeFacts, plan, section, withSection } from '../tools/install.mjs';

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
  const question = (text, n) => text.split('\n').find((line) => line.startsWith(`${n}. `));
  for (const n of [6, 9]) assert.equal(question(read('agents', 'throughput-reviewer.agent.md'), n), question(read('skills', 'progress-review', 'SKILL.md'), n));
});

test('the free coordinator stays separate from execution in all skills and installed instructions', () => {
  for (const [name, text] of [
    ...SKILLS.map((s) => [s, read('skills', s, 'SKILL.md')]),
    ['section', section(null)], ['README', read('README.md')], ['AGENTS', read('AGENTS.md')],
  ]) {
    assert.match(text, /coordinator/i, `${name}: coordinator role`);
    assert.match(text, /worker/i, `${name}: worker role`);
  }
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  assert.match(entry, /never does implementation, builds, test suites or long commands itself/);
  assert.match(entry, /No sleeps, polling loops, blocking waits or watchers/);
  assert.match(entry, /End each turn/);
  assert.match(entry, /before acting on a new prompt or creating any worker or continuation/);
  assert.match(section(null), /Keep coordinator turns short and end them/);
  assert.match(read('skills', 'stage-validation', 'SKILL.md'), /Workers run checks/);
  const coordinate = read('skills', 'coordinate', 'SKILL.md');
  for (const [name, text] of [['orchestrate', entry], ['coordinate', coordinate], ['section', section(null)], ['README', read('README.md')], ['AGENTS', read('AGENTS.md')]]) {
    assert.match(text, /[Ee]nding a (coordinator )?turn is not complet|doesn't complete the owner's task/, `${name}: yielding is not completion`);
    assert.match(text, /silence (automated )?keep-working reminders/, `${name}: never complete to silence reminders`);
  }
  for (const text of [entry, coordinate, section(null), read('README.md')]) {
    assert.match(text, /can't idle with work pending/);
    assert.match(text, /supported continuation/);
  }
});

test('the registry, prompt triage and event-driven completion prevent duplicate writers', () => {
  const coordinate = read('skills', 'coordinate', 'SKILL.md');
  for (const prompt of ['Same area as a running writer', 'Independent of running work', 'Depends on running work', 'Correction']) {
    assert.ok(coordinate.includes(`| ${prompt} |`), prompt);
  }
  for (const text of [coordinate, read('templates', 'work-plan.md'), read('templates', 'handoff.md')]) {
    assert.match(text, /\| Task \| Owner worker \| Working copy \| State \| Trigger \| Completion signal \|/);
    assert.match(text, /One writer per working copy/);
    assert.match(text, /live worker list/);
  }
  assert.match(coordinate, /read \*\*unread messages and completion records, the live worker list, and the registry\/queue\*\*/);
  assert.match(coordinate, /Record a launch as pending before dispatch/);
  assert.match(coordinate, /An uncertain launch or missing reply is not permission to retry/);
  assert.match(coordinate, /stale or duplicate report cannot release the queue twice/);
  assert.match(coordinate, /Only the coordinator updates its registry/);
  assert.match(coordinate, /Never wait in a loop/);
  assert.match(coordinate, /If messaging is absent, workers write records/);
  assert.match(coordinate, /without waiting for workers or stopping their work/);
  assert.match(coordinate, /Worker clocks and limits are unchanged/);
});

test('portability names the VS Code lesson without promising concurrency in every tool', () => {
  for (const text of [read('skills', 'orchestrate', 'SKILL.md'), read('README.md')]) {
    assert.match(text, /VS Code agent sessions/);
    assert.match(text, /until its turn ended/);
    assert.match(text, /hooks fired between turns/);
    assert.match(text, /Other tools.*may behave differently/);
    for (const question of ['parallel conversations or agents', 'messages reach a busy conversation', 'notify on completion', 'registry persist', 'input.*mid-turn']) {
      assert.match(text, new RegExp(question), question);
    }
    assert.match(text, /[Ss]ingle-threaded/);
    assert.match(text, /queue in a file/);
    assert.match(text, /owner to re-prompt/);
  }
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

test('the review build is required everywhere it applies: validated commits only, isolated, kept running, named in reports and handoffs', () => {
  const texts = {
    orchestrate: read('skills', 'orchestrate', 'SKILL.md'),
    'stage-validation': read('skills', 'stage-validation', 'SKILL.md'),
    coordinate: read('skills', 'coordinate', 'SKILL.md'),
    section: section(null),
    'handoff template': read('templates', 'handoff.md'),
    'work-plan template': read('templates', 'work-plan.md'),
    README: read('README.md'),
  };
  for (const [name, text] of Object.entries(texts)) assert.match(text, /review build/i, `${name} names the review build`);
  for (const name of ['orchestrate', 'stage-validation', 'section', 'README']) assert.match(texts[name], /validated commit/i, `${name}: only validated commits`);
  for (const name of ['orchestrate', 'section', 'README']) assert.match(texts[name], /isolated/i, `${name}: isolated from development`);
  assert.match(texts.orchestrate, /Review build\.\*\* Before the first increment/, 'orchestrate starts it');
  assert.match(texts.orchestrate, /→ refresh the review build →/, 'the loop refreshes it');
  assert.match(texts['stage-validation'], /## The review build/);
  assert.match(texts.coordinate, /Name the review build in every status report/);
  assert.match(texts.coordinate, /\*\*Review build:\*\* where it is/, 'the handoff names it');
  assert.match(texts['handoff template'], /## Review build/);
  assert.match(section(null), /- \*\*Review build:\*\* <how to start and refresh it/, 'the installed facts ask for it');
});

test('a re-run adds a fact the harness gained since to filled-in facts, keeping every filled-in value', () => {
  const old = '# P\n\n<!-- agent-orchestration:start -->\n## Orchestration (old wording)\n\n### Project facts (fill in; the skills read these)\n\n- **Product intent:** docs/spec.md\n- **Progress log:** ~/logs/p.log\n- **Reviews and escalation:** review every 20 minutes\n<!-- agent-orchestration:end -->\n';
  const once = withSection(old);
  assert.match(once, /- \*\*Product intent:\*\* docs\/spec\.md/);
  assert.match(once, /- \*\*Progress log:\*\* ~\/logs\/p\.log/);
  assert.match(once, /- \*\*Review build:\*\* <how to start/);
  assert.match(once, /- \*\*Coordinator registry:\*\* <session-store location/);
  assert.ok(once.indexOf('**Review build:**') < once.indexOf('**Reviews and escalation:** review every 20 minutes'), 'added before the last fact');
  assert.equal((once.match(/\*\*Review build:\*\*/g) ?? []).length, 1);
  const filled = once.replace(/- \*\*Review build:\*\* <[^\n]*/, '- **Review build:** a worktree at the last validated commit, port 4000')
    .replace(/- \*\*Coordinator registry:\*\* <[^\n]*/, '- **Coordinator registry:** ignored queue.json; worker messages and completion records');
  const again = withSection(filled);
  assert.match(again, /- \*\*Review build:\*\* a worktree at the last validated commit, port 4000/);
  assert.match(again, /- \*\*Coordinator registry:\*\* ignored queue\.json; worker messages and completion records/);
  assert.equal((again.match(/\*\*Coordinator registry:\*\*/g) ?? []).length, 1);
  assert.equal(withSection(again), again, 'a third run changes nothing');
  assert.equal(mergeFacts(null, '- **A:** <a>'), '- **A:** <a>');
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
  for (const s of SKILLS) assert.equal(readFileSync(join(dir, '.github', 'skills', s, 'SKILL.md'), 'utf8'), read('skills', s, 'SKILL.md'));
  for (const a of readdirSync(join(ROOT, 'agents'))) assert.equal(readFileSync(join(dir, '.github', 'agents', a), 'utf8'), read('agents', a));
  assert.ok(existsSync(join(dir, '.agents', 'skills', 'orchestrate', 'SKILL.md')));
  assert.ok(existsSync(join(dir, 'docs', 'work', 'work-plan.md')));
  const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  writeFileSync(join(dir, 'docs', 'work', 'work-plan.md'), '# Filled-in plan\n');
  run();
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), after);
  assert.equal(readFileSync(join(dir, 'docs', 'work', 'work-plan.md'), 'utf8'), '# Filled-in plan\n', 'a filled-in template is never replaced');
});
