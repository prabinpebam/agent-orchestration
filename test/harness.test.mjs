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
  const MODES = ['strict design', 'show me the UX sooner', 'prove the risky assumption', 'make this production-ready', 'work with me', 'keep going unattended'];
  const texts = { orchestrate: read('skills', 'orchestrate', 'SKILL.md'), 'execution-modes': read('skills', 'execution-modes', 'SKILL.md'), section: section(null) };
  for (const mode of MODES) for (const [name, text] of Object.entries(texts)) assert.ok(text.toLowerCase().includes(mode.toLowerCase()), `${name} names "${mode}"`);
});

test('the throughput reviewer runs the progress-review questions instead of copying them', () => {
  const labels = (text) => [...text.matchAll(/^\d+\. \*\*([^*]+):\*\*/gm)].map((m) => m[1]);
  assert.ok(labels(read('skills', 'progress-review', 'SKILL.md')).length >= 8);
  const agent = read('agents', 'throughput-reviewer.agent.md');
  assert.match(agent, /every question in the `progress-review` skill/);
  assert.deepEqual(labels(agent).filter((l) => !['Verdict', 'Top finding', 'Action'].includes(l)), [], 'no duplicated questions');
});

const CHECKLISTED = [['skills', 'orchestrate', 'SKILL.md'], ['skills', 'coordinate', 'SKILL.md'], ['agents', 'throughput-reviewer.agent.md']];

test('MANDATORY: a short pre-action checklist of yes/no questions comes first in the entry point, the coordinator skill and the agent', () => {
  for (const p of CHECKLISTED) {
    const text = read(...p);
    assert.match(text.split('\n## ')[1] ?? '', /^Pre-action checklist \(MANDATORY\)/, `${p.join('/')}: the first section is the checklist`);
    const items = (text.split('\n## ')[1].split('\n## ')[0].match(/^\d+\. .*$/gm) ?? []);
    assert.ok(items.length >= 3 && items.length <= 7, `${p.join('/')}: 3 to 7 items`);
    for (const i of items) assert.match(i, /\? → /, `${p.join('/')}: "${i.slice(0, 40)}" is a question with its fix`);
  }
});

test('the checklist covers the audit\'s detection signals: role, mode, completion, docs, owner reports, ownership, ready to try', () => {
  const list = read('skills', 'orchestrate', 'SKILL.md').split('\n## ')[1];
  for (const label of ['Role', 'Mode', 'Completion', 'Docs', 'Owner reports', 'Ownership', 'Ready to try']) assert.match(list, new RegExp(`\\*\\*${label}\\.\\*\\*`), label);
  assert.match(list, /main chat about to run a shell, build, test, subagent, poll or wait/);
  assert.match(list, /any test before the owner approved the design, or the full suite outside production-ready/);
  assert.match(list, /Say "In progress:" with what's running, who has it and when the owner will see it/);
  assert.match(list, /project's documentation system[^\n]*same commit/);
  assert.match(list, /their main chat[^\n]*decision, something to try or a safety blocker[^\n]*IDs or code/);
  assert.match(list, /stale \(no action in 30 minutes, no acknowledgement\)/);
  assert.match(list, /opened that review build myself and reached the change through the normal UI/);
});

test('the mode ladder: strict design first, then show me the UX sooner, then production-ready, each with what it allows and forbids', () => {
  const modes = read('skills', 'execution-modes', 'SKILL.md');
  const ladder = modes.split('## The ladder')[1].split('\n## ')[0];
  const rows = ladder.split('\n').filter((l) => /^\| \*\*/.test(l));
  assert.deepEqual(rows.map((r) => /\*\*([^*]+)\*\*/.exec(r)[1]), ['Strict design', 'Show me the UX sooner', 'Make this production-ready', 'Prove the risky assumption']);
  assert.match(ladder, /\| Checks allowed \| Forbidden \| Ends when \|/);
  assert.match(rows[0], /real design system/);
  assert.match(rows[0], /It renders, and the owner can open it/);
  assert.match(rows[0], /Implementation, wiring, data, persistence, tests of any kind, CI, hardening/);
  assert.match(rows[0], /The owner approves the design/);
  assert.match(rows[1], /The full suite, end-to-end runs, captures, benchmarks, CI waits, hardening, any unnecessary test/);
  assert.match(modes, /Up\*\* only on the owner's explicit approval/);
  assert.match(read('skills', 'orchestrate', 'SKILL.md'), /\*\*strict design\*\*[^\n]*→ \*\*show me the UX sooner\*\*[^\n]*→ \*\*make this production-ready\*\*/);
});

test('MANDATORY: no tests on unapproved designs, stated once in the ladder and linked from the checklist', () => {
  const rule = '**MANDATORY: no tests on unapproved designs.**';
  const owners = [...SKILLS.map((s) => ['skills', s, 'SKILL.md']), ['agents', 'throughput-reviewer.agent.md']].filter((p) => read(...p).includes(rule));
  assert.deepEqual(owners, [['skills', 'execution-modes', 'SKILL.md']], 'one place');
  assert.match(read('skills', 'execution-modes', 'SKILL.md'), /never run the full suite in show me the UX sooner/);
  assert.match(read('skills', 'orchestrate', 'SKILL.md'), /\[mode\]\(\.\.\/execution-modes\/SKILL\.md#the-ladder\)/);
  assert.match(read('skills', 'stage-validation', 'SKILL.md'), /The owner has explicitly signed off on the change's design/);
});

test('handing over is not completion, and a repeated host reminder gets no new content', () => {
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  assert.match(entry, /call a completion tool, while something I dispatched isn't verified/);
  assert.match(entry, /an identical repeat gets no new content\. Never call the completion tool to silence one/);
  assert.match(read('skills', 'coordinate', 'SKILL.md'), /It's "in progress" until verified/);
});

test('the main chat only talks to the owner, never rolls over, and is the only place owner reports go', () => {
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  const coord = read('skills', 'coordinate', 'SKILL.md');
  assert.match(entry, /\| Main chat \| Talks to the owner[^|]*Always ready for the next prompt\. \| Runs commands, builds, tests, subagents, polls, waits or launches\. Rolls over\. \|/);
  assert.match(entry, /\*\*The main chat never rolls over\.\*\*/);
  assert.match(coord, /\*\*The owner's main chat never rolls over\.\*\*/);
  assert.match(coord, /\*\*To the owner's main chat only\*\*, and only: a decision only the owner can make, something new ready to try, or a safety blocker\. At most 3 plain lines/);
  assert.match(coord, /never create a second one/);
});

test('coordinator churn is capped and nobody rolls over while the owner is steering', () => {
  const coord = read('skills', 'coordinate', 'SKILL.md');
  assert.match(coord, /\*\*One long-lived coordinator\.\*\* It hands over only at its context limits \(tool calls or compactions\), never on elapsed time alone, and never while the owner is steering/);
  assert.match(read('skills', 'orchestrate', 'SKILL.md'), /idle time never counts/);
});

test('documentation diligence: owner input and every increment go into the project\'s documentation system', () => {
  assert.match(read('skills', 'orchestrate', 'SKILL.md'), /\*\*Record\.\*\* Requirements, decisions and changed behaviour go into the project's documentation system in the same commit/);
  assert.match(section(null), /- \*\*Documentation system:\*\* </);
  assert.match(section(null), /- \*\*Owner's main chat:\*\* </);
  assert.match(read('skills', 'progress-review', 'SKILL.md'), /\*\*Records:\*\* Is every owner requirement, attachment and reference in the project's documentation system/);
});

test('the hooks are mandatory and enforce the role and mode by mechanism', () => {
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  assert.match(entry, /^## Hooks \(MANDATORY\)/m);
  assert.match(entry, /mark role main\|coordinator\|worker/);
  assert.match(entry, /mark mode design\|ux-sooner\|assumption\|production-ready/);
  assert.match(entry, /`\.agent-orchestration\/mode`/);
  assert.match(section(null), /hooks in `\.github\/hooks\/` are \*\*mandatory\*\*[^\n]*never disable them or loosen their limits/);
});

test('lean: few MANDATORY markers, no narrative, and a word budget for skills and agents', () => {
  const files = [...SKILLS.map((s) => ['skills', s, 'SKILL.md']), ['agents', 'throughput-reviewer.agent.md']];
  const all = files.map((p) => read(...p)).join('\n');
  assert.ok((all.match(/MANDATORY/g) ?? []).length <= 6, 'MANDATORY marks only the hard rules');
  const words = all.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 4500, `skills and agents total ${words} words (budget 4500)`);
  assert.doesNotMatch(all, /learned in|VS Code agent sessions|we found that/i, 'no history or narrative');
  assert.match(read('skills', 'coordinate', 'SKILL.md'), /^Log line: /m);
  for (const p of files.filter((p) => p[1] !== 'coordinate')) assert.doesNotMatch(read(...p), /^Log line: /m, 'the log format lives in one place');
  for (const p of files.filter((p) => p[1] !== 'stage-validation')) assert.doesNotMatch(read(...p), /full-suite trigger\.\*\*/, 'the trigger lives in one place');
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

test('the review build is required everywhere it applies: validated commits only, isolated, opened before "ready", named in reports and handoffs', () => {
  const texts = {
    orchestrate: read('skills', 'orchestrate', 'SKILL.md'),
    'stage-validation': read('skills', 'stage-validation', 'SKILL.md'),
    coordinate: read('skills', 'coordinate', 'SKILL.md'),
    section: section(null),
    'handoff template': read('templates', 'handoff.md'),
    README: read('README.md'),
  };
  for (const [name, text] of Object.entries(texts)) assert.match(text, /review build/i, `${name} names the review build`);
  const sv = texts['stage-validation'];
  assert.match(sv, /## The review build/);
  assert.match(sv, /Built from the last validated commit only, in its own checkout/);
  assert.match(sv, /named, with how to open it, in every report and handoff/);
  assert.match(sv, /open that build yourself, reach the change through the normal UI \(not behind a flag\)/);
  assert.match(texts.coordinate, /the review build and how to open it/, 'the handoff names it');
  assert.match(texts.section, /- \*\*Review build:\*\* <how to start and refresh it/, 'the installed facts ask for it');
});

test('a re-run adds a fact the harness gained since to filled-in facts, keeping every filled-in value', () => {
  const old = '# P\n\n<!-- agent-orchestration:start -->\n## Orchestration (old wording)\n\n### Project facts (fill in; the skills read these)\n\n- **Product intent:** docs/spec.md\n- **Progress log:** ~/logs/p.log\n- **Reviews and escalation:** review every 20 minutes\n<!-- agent-orchestration:end -->\n';
  const once = withSection(old);
  assert.match(once, /- \*\*Product intent:\*\* docs\/spec\.md/);
  assert.match(once, /- \*\*Progress log:\*\* ~\/logs\/p\.log/);
  assert.match(once, /- \*\*Review build:\*\* <how to start/);
  assert.match(once, /- \*\*Coordinator registry:\*\* <where the registry is/);
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
