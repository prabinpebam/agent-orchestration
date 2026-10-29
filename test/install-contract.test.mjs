import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepare, apply } from '../tools/install-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, '.contract-tests');
mkdirSync(work, { recursive: true });
const script = join(root, 'tools', 'install.mjs');
function tree(root) {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => e.isDirectory()
    ? [[`${e.name}/`, null], ...Object.entries(tree(join(root, e.name))).map(([k, v]) => [`${e.name}/${k}`, v])]
    : [[e.name, readFileSync(join(root, e.name)).toString('base64')]]));
}
function fixture(t) {
  const project = mkdtempSync(join(work, 'case-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const run = (...args) => {
    const r = spawnSync(process.execPath, [script, project, '--for', 'copilot,claude-code,codex,cursor', '--json', ...args], { encoding: 'utf8' });
    return { code: r.status, ...JSON.parse(r.stdout) };
  };
  return { project, run };
}
test('contract dry run, exact approval, idempotency, exact uninstall and JSON codes', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'AGENTS.md'), '# Owner notes\r\n\r\n');
  writeFileSync(join(f.project, 'CLAUDE.md'), '# Claude notes\n');
  const before = tree(f.project);
  const preview = f.run('--dry-run');
  assert.equal(preview.code, 0, preview.message);
  assert.ok(preview.plan.writes.length);
  assert.deepEqual(tree(f.project), before);
  assert.equal(f.run('--approve-plan', '0'.repeat(64)).code, 2);
  assert.deepEqual(tree(f.project), before);
  assert.equal(f.run('--approve-plan', preview.plan.digest).code, 0);
  assert.equal(f.run().plan.writes.length, 0);
  assert.equal(f.run('--uninstall').code, 0);
  assert.deepEqual(tree(f.project), before);
});
test('filled project facts survive updates and changed files block uninstall without loss', (t) => {
  const f = fixture(t);
  assert.equal(f.run().code, 0);
  const agents = join(f.project, 'AGENTS.md');
  const filled = readFileSync(agents, 'utf8').replace('### Project facts', '### Project facts\n\nMy facts stay.');
  writeFileSync(agents, filled);
  assert.equal(f.run().code, 0);
  assert.match(readFileSync(agents, 'utf8'), /My facts stay/);
  writeFileSync(agents, readFileSync(agents, 'utf8').replace('## Orchestration', '## My edited heading'));
  const editedSection = tree(f.project);
  assert.equal(f.run('--yes').code, 2);
  assert.deepEqual(tree(f.project), editedSection);
  writeFileSync(agents, filled);
  const skill = join(f.project, '.github', 'skills', 'orchestrate', 'SKILL.md');
  writeFileSync(skill, 'Owner changed this.');
  const before = tree(f.project);
  assert.equal(f.run('--yes', '--uninstall').code, 2);
  assert.deepEqual(tree(f.project), before);
});
test('unowned collisions and unsafe arguments cannot be approved by yes', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.project, '.github', 'skills', 'orchestrate'), { recursive: true });
  writeFileSync(join(f.project, '.github', 'skills', 'orchestrate', 'SKILL.md'), 'Mine');
  const before = tree(f.project);
  assert.equal(f.run('--yes').code, 2);
  assert.equal(f.run('--templates', '../outside').code, 1);
  assert.deepEqual(tree(f.project), before);
  assert.equal(existsSync(join(f.project, '.kit-state')), false);
});
test('malformed markers and ownership paths fail before writes', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.project, 'AGENTS.md'), '<!-- agent-orchestration:start -->\nMissing end');
  const before = tree(f.project);
  assert.equal(f.run().code, 1);
  assert.deepEqual(tree(f.project), before);
  rmSync(join(f.project, 'AGENTS.md'));
  assert.equal(f.run().code, 0);
  const file = join(f.project, '.kit-state', 'agent-orchestration.json');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  state.files['../outside'] = { hash: '0'.repeat(64), before: null };
  writeFileSync(file, JSON.stringify(state));
  const tampered = tree(f.project);
  assert.equal(f.run('--uninstall').code, 1);
  assert.deepEqual(tree(f.project), tampered);
});
test('the shared engine rolls back an injected write failure exactly', (t) => {
  const f = fixture(t), before = tree(f.project);
  const p = prepare({ id: 'fixture', root: f.project, entries: [{ path: 'a.txt', bytes: Buffer.from('A') }, { path: 'b.txt', bytes: Buffer.from('B') }], allowed: (path) => ['a.txt', 'b.txt'].includes(path) });
  assert.throws(() => apply(p, { beforeWrite: (_op, index) => { if (index === 1) throw new Error('Injected failure'); } }), /Injected failure/);
  assert.deepEqual(tree(f.project), before);
});
test('owner notes added outside the section survive a rerun and uninstall', (t) => {
  const f = fixture(t);
  assert.equal(f.run().code, 0);
  const agents = join(f.project, 'AGENTS.md');
  writeFileSync(agents, `${readFileSync(agents, 'utf8')}\n## Owner notes\n\nKeep these.\n`);
  assert.equal(f.run().code, 0);
  assert.equal(f.run('--uninstall').code, 0);
  const text = readFileSync(agents, 'utf8');
  assert.match(text, /## Owner notes\n\nKeep these\./);
  assert.doesNotMatch(text, /agent-orchestration:/);
  assert.equal(existsSync(join(f.project, '.kit-state')), false);
});
test('another kit section added after install survives a rerun and uninstall byte for byte', (t) => {
  const f = fixture(t);
  assert.equal(f.run().code, 0);
  const other = '<!-- other-kit:start -->\n## Other kit\n\n### Project facts\n\n- Other facts stay.\n<!-- other-kit:end -->';
  const agents = join(f.project, 'AGENTS.md');
  const p = prepare({ id: 'other-kit', root: f.project, allowed: (path) => path === 'AGENTS.md',
    entries: [{ path: 'AGENTS.md', section: { start: '<!-- other-kit:start -->', end: '<!-- other-kit:end -->', transform: (text) => `${text.trimEnd()}\n\n${other}\n` } }] });
  apply(p);
  assert.equal(f.run().code, 0);
  assert.equal(f.run('--uninstall').code, 0);
  const text = readFileSync(agents, 'utf8');
  assert.ok(text.includes(other));
  assert.doesNotMatch(text, /agent-orchestration:/);
});
test('uninstall leaves files created after install and existing clock hooks untouched', (t) => {
  const f = fixture(t);
  const hooks = join(f.project, '.github', 'hooks', 'orchestration-clock.json');
  mkdirSync(dirname(hooks), { recursive: true });
  writeFileSync(hooks, '{ "owner": "my own clock limits" }\n');
  const seeded = readFileSync(hooks);
  assert.equal(f.run().code, 0);
  assert.deepEqual(readFileSync(hooks), seeded);
  writeFileSync(join(f.project, 'CLAUDE.md'), '# Claude notes made later\r\n');
  const claude = readFileSync(join(f.project, 'CLAUDE.md'));
  const result = f.run('--uninstall');
  assert.equal(result.code, 0, result.message);
  assert.deepEqual(result.plan.conflicts, []);
  assert.deepEqual(readFileSync(hooks), seeded);
  assert.deepEqual(readFileSync(join(f.project, 'CLAUDE.md')), claude);
  assert.equal(existsSync(join(f.project, '.kit-state', 'agent-orchestration.json')), false);
  assert.equal(existsSync(join(f.project, 'AGENTS.md')), false);
});
test.after(() => { try { rmSync(work, { recursive: true, force: true }); } catch {} });
