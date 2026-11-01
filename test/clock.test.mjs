// The session clock and guard: node --test test/clock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, HEAVY, MODE_FILE, commandOf, config, fileMode, findSession, hook, recognise, rolloverReason, samePath, step } from '../tools/clock.mjs';
import { CLOCK, CLOCK_HOOKS, GUARD_HOOKS, clockHooks, guardHooks, section } from '../tools/install.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 31, 9, 0);
const C = { ...DEFAULTS };

/** Runs events through the clock; each is [minutes after T0, event, input]. Returns the outputs and the last state. */
function run(/** @type {[number, string, object?][]} */ events, c = C, start = null) {
  let state = start;
  const outputs = events.map(([m, e, input]) => {
    const r = step(state, e, { cwd: '/p', ...(input ?? {}) }, T0 + m * MIN, c);
    state = r.state;
    return r.output;
  });
  outputs.state = state;
  return outputs;
}
const tool = (m, toolName = 'view', toolArgs = {}) => [m, 'postToolUse', { toolName, toolArgs }];
const pre = (m, toolName, toolArgs = {}, extra = {}) => [m, 'preToolUse', { toolName, toolArgs, ...extra }];
/** Tool calls every `every` minutes from `from` to `to`, so the session stays active. */
const busy = (from, to, every = 5) => Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => tool(from + i * every));
const said = (o) => String(o.additionalContext ?? '');
const denied = (o) => o.permissionDecision === 'deny';

test('a session start says what the clock asks for and how to mark the role and mode', () => {
  const [o] = run([[0, 'sessionStart']]);
  assert.match(said(o), /progress review every 30 active minutes/);
  assert.match(said(o), /90 active minutes, 300 tool calls, 2 compactions \(idle time not counted; the main chat never rolls over\)/);
  assert.match(said(o), /mark role main\|coordinator\|worker/);
  assert.match(said(o), /mark mode design\|ux-sooner\|assumption\|production-ready/);
  assert.match(said(o), /never disable the clock or loosen its limits/);
});

test('the clock is mandatory: the entry point, the installed section, the reviewer and every reminder say so', () => {
  const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
  assert.match(read('skills', 'orchestrate', 'SKILL.md'), /^description:.*mandatory session clock/m);
  assert.match(section(null), /\*\*mandatory\*\*/);
  assert.match(read('agents', 'throughput-reviewer.agent.md'), /missing clock or an ignored reminder is the top finding/);
  assert.match(read('skills', 'progress-review', 'SKILL.md'), /missing clock or an ignored reminder is the top finding/);
  const out = run([[0, 'sessionStart'], ...busy(5, 95), [96, 'agentStop', {}]]);
  assert.ok(out.some((o) => /^Session clock \(required\): progress review due/.test(said(o))));
  assert.ok(out.some((o) => /Session clock \(required\): roll over/.test(said(o))));
  assert.match(String(out.at(-1).reason), /^Session clock \(required\): this session should roll over/);
});

test('a progress review is asked for after 30 active minutes, and again every 5 minutes until done', () => {
  const out = run([[0, 'sessionStart'], ...busy(5, 25), tool(29), tool(30), tool(32), tool(35), tool(36)]);
  const at = (m) => said(out[out.length - [36, 35, 32, 30, 29].indexOf(m) - 1]);
  assert.equal(at(29), '');
  assert.match(at(30), /progress review due \(last \d\d:\d\d, 30 active minutes ago\)/);
  assert.match(at(30), /throughput-reviewer/);
  assert.equal(at(32), '', 'not again within 5 minutes');
  assert.match(at(35), /35 active minutes ago, 5 overdue/);
  assert.equal(at(36), '');
});

test('idle time never counts toward a review or a roll-over', () => {
  const out = run([[0, 'sessionStart'], tool(1), tool(200), tool(400), tool(401)]);
  for (const o of out) assert.equal(said(o).includes('Session clock (required)'), false);
  assert.ok(out.state.active <= 16 * MIN, `active ${out.state.active / MIN} minutes`);
  assert.equal(rolloverReason(out.state, T0 + 401 * MIN, C), null);
});

test('running the throughput reviewer or loading the progress-review skill counts as the review', () => {
  for (const done of [tool(30, 'task', { agent_type: 'throughput-reviewer', prompt: '…' }), tool(30, 'skill', { skill: 'progress-review' })]) {
    const out = run([[0, 'sessionStart'], ...busy(5, 25), done, ...busy(35, 55), tool(60)]);
    assert.equal(out.slice(1, -1).filter((o) => /review due/.test(said(o))).length, 0, `${done[2].toolName}: no reminder before 30 active minutes after it`);
    assert.match(said(out.at(-1)), /review due \(last \d\d:\d\d, 30 active minutes ago\)/);
  }
  assert.equal(recognise('task', { agent_type: 'explore' }), null);
  assert.equal(recognise('skill', { skill: 'coordinate' }), null);
  assert.equal(recognise('powershell', { command: 'node orchestration-clock.mjs mark review' }), null, 'the CLI marks its selected clock, never inferred');
});

test('a roll-over is asked for after 90 active minutes, the tool-call limit or the compaction limit', () => {
  const s = (o) => ({ role: '', active: 0, tools: 0, compactions: 0, ...o });
  assert.equal(rolloverReason(s({ active: 89 * MIN }), T0, C), null);
  assert.match(rolloverReason(s({ active: 90 * MIN }), T0, C), /active 90 minutes \(limit 90; idle time not counted\)/);
  assert.match(rolloverReason(s({ tools: 300 }), T0, C), /300 tool calls/);
  assert.match(rolloverReason(s({ compactions: 2 }), T0, C), /compacted 2 times/);
  assert.equal(rolloverReason(s({ active: 1e9, tools: 1e6, compactions: 9 }), T0, { ...C, rolloverMin: 0, rolloverTools: 0, rolloverCompactions: 0 }), null, '0 turns a limit off');

  const out = run([[0, 'sessionStart'], [1, 'preCompact'], tool(2), [3, 'preCompact'], tool(4), tool(6), tool(9)], { ...C, reviewMin: 0 });
  assert.equal(said(out[2]), '');
  assert.match(said(out[4]), /roll over to a new session as soon as possible, because its context has been compacted 2 times/);
  assert.match(said(out[4]), /commit the verified work, write the handoff/);
  assert.equal(said(out[5]), '', 'not again within 5 minutes');
  assert.match(said(out[6]), /due for 5 minutes/);
});

test('the main chat never rolls over and is never asked for a review', () => {
  const main = { ...step(null, 'sessionStart', { cwd: '/p' }, T0, C).state, role: 'main', tools: 5000, compactions: 9 };
  assert.equal(rolloverReason({ ...main, active: 1e9 }, T0, C), null);
  const out = run([...busy(0, 200), [201, 'agentStop', {}]], C, main);
  for (const o of out) assert.deepEqual(o, {});
});

test('a coordinator rolls over only at its context limits, never on time alone', () => {
  const coord = { ...step(null, 'sessionStart', { cwd: '/p' }, T0, C).state, role: 'coordinator' };
  assert.equal(rolloverReason({ ...coord, active: 500 * MIN }, T0, C), null);
  assert.match(rolloverReason({ ...coord, tools: 300 }, T0, C), /300 tool calls/);
  assert.match(rolloverReason({ ...coord, compactions: 2 }, T0, C), /compacted 2 times/);
  assert.match(said(run([tool(1)], C, { ...coord, tools: 299 })[0]), /Coordinators: hand the registry to one fresh coordinator; workers keep running/);
});

test('nobody is asked to roll over while the owner is steering', () => {
  const out = run([[0, 'sessionStart'], ...busy(5, 90), [91, 'userPromptSubmitted', {}], tool(92), tool(98), [99, 'agentStop', {}], tool(102), [103, 'agentStop', {}]], { ...C, reviewMin: 0 });
  const n = out.length;
  assert.equal(said(out[n - 5]), '', 'just after a prompt');
  assert.equal(said(out[n - 4]), '');
  assert.deepEqual(out[n - 3], {}, 'no block at the end of a turn while steering');
  assert.match(said(out[n - 2]), /roll over/, 'asked again once the owner has been quiet 10 minutes');
  assert.equal(out[n - 1].decision, 'block');
});

test('worker launches never silence the clock or weaken a limit', () => {
  assert.deepEqual([DEFAULTS.reviewMin, DEFAULTS.rolloverMin, DEFAULTS.rolloverTools, DEFAULTS.rolloverCompactions, DEFAULTS.idleMin, DEFAULTS.steerMin], [30, 90, 300, 2, 5, 10]);
  for (const name of ['create_session', 'new_session']) {
    assert.equal(recognise(name, { prompt: 'Read the handoff and resume' }), null);
    const start = step(null, 'sessionStart', {}, T0, C).state;
    const r = step({ ...start, tools: 299 }, 'postToolUse', { toolName: name }, T0 + MIN, C);
    assert.equal(r.state.rolledOver, 0);
    assert.match(said(r.output), /300 tool calls/);
  }
});

test('at the end of a turn with a roll-over due, it asks for one more turn, once, and never when already continuing', () => {
  const due = run([[0, 'sessionStart'], ...busy(5, 90), [91, 'agentStop', {}], [92, 'agentStop', {}]], { ...C, reviewMin: 0 });
  assert.equal(due.at(-2).decision, 'block');
  assert.match(String(due.at(-2).reason), /should roll over, because it has been active 9\d minutes/);
  assert.deepEqual(due.at(-1), {}, 'once');
  assert.deepEqual(run([[91, 'agentStop', { stopHookActive: true }]], C, { ...due.state, rolloverBlocked: 0 })[0], {});
});

test('the guard keeps the main chat free: shell, subagent, poll and wait tools are denied; talking and marking are not', () => {
  const out = run([[0, 'sessionStart'], pre(1, 'powershell', { command: 'node .github/hooks/orchestration-clock.mjs mark role main' }), pre(2, 'powershell', { command: 'git status' }), pre(3, 'task', {}), pre(4, 'read_agent', {}), pre(5, 'run_in_terminal', { command: 'pnpm build' }), pre(6, 'view', {}), pre(7, 'send_message', {}), pre(8, 'create_session', {}), pre(9, 'powershell', { command: 'node .github/hooks/orchestration-clock.mjs status' })]);
  assert.equal(out.state.role, 'main');
  assert.deepEqual(out[1], {}, 'marking the role is allowed');
  for (const i of [2, 3, 4, 5]) {
    assert.ok(denied(out[i]), `call ${i} denied`);
    assert.match(out[i].permissionDecisionReason, /^Guard \(MANDATORY\): this is the owner's main chat/);
  }
  for (const i of [6, 7, 8, 9]) assert.deepEqual(out[i], {}, `call ${i} allowed`);
  const other = run([pre(1, 'powershell', { command: 'node .github/hooks/orchestration-clock.mjs mark role main --session someone-else' })]);
  assert.equal(other.state.role, '', 'a mark for another session is left to the command line');
});

test('the guard enforces the mode: no tests, end-to-end runs, benchmarks or CI waits in strict design or show me the UX sooner', () => {
  const blocked = ['pnpm test', 'pnpm test:e2e', 'npm run test -- --watch=false', 'pnpm --filter @x/app exec playwright test e2e/a.spec.ts', 'pnpm exec vitest run src/a.test.ts', 'npx jest', 'node --test test/', 'gh run watch 123', 'gh pr checks 5 --watch', 'pnpm bench --check', 'cd app; pnpm test', 'dotnet test', 'pytest -q'];
  const allowed = ['pnpm build', 'pnpm typecheck', 'pnpm --filter @x/app run typecheck', 'pnpm check', 'pnpm ui:check', 'git commit -m "Fix the jest config note"', 'git status', 'gh run list', 'node tools/latest.mjs'];
  for (const c of blocked) assert.match(c, HEAVY, c);
  for (const c of allowed) assert.doesNotMatch(c, HEAVY, c);
  for (const mode of ['design', 'ux-sooner']) {
    const out = run([pre(0, 'powershell', { command: `node .github/hooks/orchestration-clock.mjs mark mode ${mode}` }), pre(1, 'powershell', { command: 'pnpm test:e2e' }), pre(2, 'powershell', { command: 'pnpm build' })]);
    assert.equal(out.state.mode, mode);
    assert.ok(denied(out[1]));
    assert.match(out[1].permissionDecisionReason, mode === 'design' ? /the mode is strict design/ : /the mode is show me the UX sooner/);
    assert.deepEqual(out[2], {});
  }
  assert.ok(denied(run([pre(0, 'bash', { command: 'pnpm test' }, { fileMode: 'design' })])[0]), 'the mode file counts');
  assert.deepEqual(run([pre(0, 'bash', { command: 'pnpm test' }, { fileMode: 'production-ready' })])[0], {});
  assert.deepEqual(run([pre(0, 'bash', { command: 'pnpm test' })])[0], {}, 'no mode, no mode gate');
  assert.deepEqual(run([pre(0, 'view', { command: 'pnpm test' }, { fileMode: 'design' })])[0], {}, 'only shell tools');
});

test('the guard keeps a coordinator\'s turns short: builds, tests and waits go to workers', () => {
  const start = { ...step(null, 'sessionStart', { cwd: '/p' }, T0, C).state, role: 'coordinator' };
  for (const c of ['pnpm build', 'pnpm test', 'Start-Sleep -Seconds 60', 'gh run watch 9']) assert.ok(denied(run([pre(1, 'powershell', { command: c })], C, start)[0]), c);
  for (const c of ['git status', 'git merge --ff-only fix-a', 'gh run list --limit 3']) assert.deepEqual(run([pre(1, 'powershell', { command: c })], C, start)[0], {}, c);
});

test('the guard reads both payload styles and the mode file, and never blocks a tool by failing', () => {
  assert.equal(commandOf('{"command":"pnpm test"}'), 'pnpm test');
  assert.equal(commandOf('pnpm test'), 'pnpm test');
  assert.equal(commandOf({ cmd: 'x' }), 'x');
  assert.equal(commandOf(null), '');
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const cwd = mkdtempSync(join(tmpdir(), 'guard-project-'));
  const env = { AO_CLOCK_DIR: dir };
  assert.equal(fileMode(cwd), '');
  mkdirSync(join(cwd, dirname(MODE_FILE)), { recursive: true });
  writeFileSync(join(cwd, MODE_FILE), 'ux-sooner\n');
  assert.equal(fileMode(cwd), 'ux-sooner');
  const o = JSON.parse(hook('preToolUse', JSON.stringify({ sessionId: 'g', cwd, toolName: 'powershell', toolArgs: JSON.stringify({ command: 'pnpm test:e2e' }) }), env, T0));
  assert.equal(o.permissionDecision, 'deny');
  assert.deepEqual(JSON.parse(hook('preToolUse', JSON.stringify({ session_id: 'g', cwd, tool_name: 'powershell', tool_input: { command: 'pnpm build' } }), env, T0)), {});
  assert.equal(hook('preToolUse', 'not json', env, T0), '{}');
  assert.equal(hook('preToolUse', '', { AO_CLOCK_DIR: join(dir, 'g.json', 'x') }, T0), '{}', 'an unwritable folder');
  rmSync(dir, { recursive: true });
  rmSync(cwd, { recursive: true });
});

test('limits come from the hook environment; bad values fall back to the defaults', () => {
  assert.deepEqual(config({ AO_REVIEW_MIN: '15', AO_ROLLOVER_MIN: '0', AO_ROLLOVER_TOOLS: 'lots', AO_IDLE_MIN: '3', AO_CLOCK_CMD: 'node x.mjs' }), { ...DEFAULTS, reviewMin: 15, rolloverMin: 0, idleMin: 3, cmd: 'node x.mjs' });
});

test('the hook keeps one state file per session, reads both payload styles, upgrades old state, and never fails the tool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-'));
  const env = { AO_CLOCK_DIR: dir };
  assert.match(hook('sessionStart', JSON.stringify({ sessionId: 's/1', cwd: '/p' }), env, T0), /Session clock on/);
  for (let m = 5; m <= 30; m += 5) hook('postToolUse', JSON.stringify({ session_id: 's/1', cwd: '/p', tool_name: 'view', tool_input: {} }), env, T0 + m * MIN);
  const state = JSON.parse(readFileSync(join(dir, 's_1.json'), 'utf8'));
  assert.equal(state.tools, 6);
  assert.equal(state.active, 30 * MIN);
  const old = { cwd: '/p', started: T0, seen: T0, tools: 3, compactions: 0, lastReview: T0, reviewNudged: 0, rolloverDue: 0, rolloverNudged: 0, rolloverBlocked: 0, rolledOver: 0, handedOverNudged: 0 };
  writeFileSync(join(dir, 'old.json'), JSON.stringify(old));
  assert.equal(hook('postToolUse', JSON.stringify({ sessionId: 'old', cwd: '/p', toolName: 'view' }), env, T0 + MIN), '{}');
  assert.equal(JSON.parse(readFileSync(join(dir, 'old.json'), 'utf8')).active, MIN);
  assert.equal(hook('postToolUse', 'not json', env, T0), '{}');
});

test('from the command line: a hook event on stdin, then mark and status for the only session in the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-cli-'));
  const cwd = mkdtempSync(join(tmpdir(), 'clock-project-'));
  const clock = join(ROOT, 'tools', 'clock.mjs');
  const env = { ...process.env, AO_CLOCK_DIR: dir, AO_REVIEW_MIN: '0' };
  const out = execFileSync(process.execPath, [clock, 'sessionStart'], { input: JSON.stringify({ sessionId: 'abc', cwd }), env, encoding: 'utf8' });
  assert.match(JSON.parse(out).additionalContext, /Session clock on/);
  assert.match(execFileSync(process.execPath, [clock, 'mark', 'review'], { cwd, env, encoding: 'utf8' }), /Marked review/);
  assert.match(execFileSync(process.execPath, [clock, 'mark', 'role', 'worker'], { cwd, env, encoding: 'utf8' }), /Marked role worker/);
  assert.match(execFileSync(process.execPath, [clock, 'mark', 'mode', 'design'], { cwd, env, encoding: 'utf8' }), /Marked mode design/);
  assert.match(execFileSync(process.execPath, [clock, 'status'], { cwd, env, encoding: 'utf8' }), /role worker, mode design, 0 tool calls, 0 compactions; last review \d\d:\d\d; no roll-over due/);
  assert.equal(spawnSync(process.execPath, [clock, 'mark', 'role', 'boss'], { cwd, env }).status, 2);
  assert.equal(spawnSync(process.execPath, [clock, 'mark', 'mode', 'fast'], { cwd, env }).status, 2);
});

test('explicit clock selection and handover leave other sessions alone; with several clocks, the hook records the role', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-roles-'));
  const cwd = mkdtempSync(join(tmpdir(), 'clock-roles-project-'));
  t.after(() => { rmSync(dir, { recursive: true }); rmSync(cwd, { recursive: true }); });
  const env = { ...process.env, AO_CLOCK_DIR: dir };
  const clock = join(ROOT, 'tools', 'clock.mjs');
  const cli = (...args) => spawnSync(process.execPath, [clock, ...args], { cwd, env, encoding: 'utf8' });
  for (const sessionId of ['coordinator', 'worker']) hook('sessionStart', JSON.stringify({ sessionId, cwd }), env, T0);
  const readState = (id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  const worker = readState('worker');
  const coordinator = readState('coordinator');
  for (const args of [['status'], ['mark', 'rollover']]) {
    const result = cli(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /More than one session clock.*--session/);
  }
  assert.match(cli('mark', 'role', 'coordinator').stdout, /guard hook recorded role coordinator/, 'ambiguous: the hook already recorded it');
  assert.equal(cli('mark', 'rollover', '--session', 'missing').status, 1);
  assert.equal(cli('mark', 'rollover', '--session').status, 2);
  assert.equal(cli('mark', 'typo', '--session', 'worker').status, 2);
  assert.deepEqual(readState('coordinator'), coordinator);
  assert.deepEqual(readState('worker'), worker);
  assert.match(cli('status', '--session', 'worker').stdout, /Session started/);
  assert.equal(cli('mark', 'review', '--session', 'coordinator').status, 0);
  assert.ok(readState('coordinator').lastReview > T0);
  assert.equal(cli('mark', 'rollover', '--session', 'coordinator').status, 0);
  assert.ok(readState('coordinator').rolledOver > T0);
  assert.deepEqual(readState('worker'), worker, 'the worker clock is not reset or marked by the coordinator handover');
  const now = Date.now() + MIN;
  const event = (id) => JSON.parse(hook('postToolUse', JSON.stringify({ sessionId: id, cwd, toolName: 'view' }), env, now));
  assert.match(said(event('coordinator')), /handed over to a new one/);
  assert.equal(said(event('coordinator')), '', 'the handed-over reminder is rate-limited');
  assert.deepEqual(JSON.parse(hook('agentStop', JSON.stringify({ sessionId: 'coordinator', cwd }), env, now)), {});
  hook('preToolUse', JSON.stringify({ sessionId: 'worker', cwd, toolName: 'powershell', toolArgs: { command: 'node orchestration-clock.mjs mark rollover --session missing' } }), env, now);
  assert.equal(readState('worker').rolledOver, 0, 'a failed mark is not a handover');
});

test('status and mark find the session when the hook reports the folder in another letter case on Windows', () => {
  assert.ok(samePath('e:\\Work\\app', 'E:\\Work\\app', 'win32'), 'drive letter');
  assert.ok(samePath('C:\\Work\\App\\', 'c:\\work\\app', 'win32'), 'case and trailing separator');
  assert.ok(!samePath('C:\\work\\app', 'C:\\work\\other', 'win32'));
  assert.ok(!samePath('/work/App', '/work/app', 'linux'), 'case-sensitive elsewhere');
  assert.ok(samePath('/work/app/', '/work/app', 'linux'));
  const dir = mkdtempSync(join(tmpdir(), 'clock-case-'));
  const cwd = mkdtempSync(join(tmpdir(), 'clock-case-project-'));
  const reported = process.platform === 'win32' ? cwd.replace(/^[A-Za-z]/, (d) => (d === d.toUpperCase() ? d.toLowerCase() : d.toUpperCase())) : cwd;
  hook('sessionStart', JSON.stringify({ sessionId: 'case', cwd: reported }), { AO_CLOCK_DIR: dir }, T0);
  assert.equal(findSession(dir, cwd)?.state.cwd, reported);
  assert.equal(findSession(dir, cwd, 'case')?.state.cwd, reported);
  assert.equal(findSession(dir, join(cwd, 'other'), 'case'), null, 'cannot mark a clock from another working copy');
});

test('the installer writes the clock and guard hooks once, keeps tuned copies, and the hooks run the installed script', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-install-'));
  const h = clockHooks(dir, false);
  const g = guardHooks(dir, false);
  assert.equal(h.file, join(dir, '.github', 'hooks', CLOCK_HOOKS));
  assert.equal(g.file, join(dir, '.github', 'hooks', GUARD_HOOKS));
  const json = JSON.parse(h.text);
  assert.equal(json.version, 1);
  assert.deepEqual(Object.keys(json.hooks), ['sessionStart', 'postToolUse', 'preCompact', 'agentStop']);
  assert.deepEqual(Object.keys(JSON.parse(g.text).hooks), ['preToolUse', 'userPromptSubmitted']);
  assert.equal(json.hooks.postToolUse[0].command, `node .github/hooks/${CLOCK} postToolUse`);
  assert.equal(JSON.parse(g.text).hooks.preToolUse[0].command, `node .github/hooks/${CLOCK} preToolUse`);
  for (const entries of Object.values(json.hooks)) {
    const env = entries[0].env;
    assert.deepEqual([env.AO_REVIEW_MIN, env.AO_ROLLOVER_MIN, env.AO_ROLLOVER_TOOLS, env.AO_ROLLOVER_COMPACTIONS], ['30', '90', '300', '2']);
  }
  assert.match(clockHooks(dir, true).text, /node \\"[^"]+\/\.copilot\/hooks\/orchestration-clock\.mjs\\" agentStop/);

  const install = () => execFileSync(process.execPath, [join(ROOT, 'tools', 'install.mjs'), dir, '--for', 'copilot'], { encoding: 'utf8' });
  assert.match(install(), /with the session clock/);
  assert.ok(existsSync(join(dir, '.github', 'hooks', CLOCK)));
  assert.ok(existsSync(g.file));
  writeFileSync(h.file, h.text.replace('"AO_REVIEW_MIN": "30"', '"AO_REVIEW_MIN": "20"'));
  assert.match(install(), /keep .*orchestration-clock\.json/);
  assert.match(readFileSync(h.file, 'utf8'), /"AO_REVIEW_MIN": "20"/);
  rmSync(g.file);
  assert.match(install(), /create .*orchestration-guard\.json/, 'an older install gains the guard');

  const out = execFileSync(process.execPath, [join(dir, '.github', 'hooks', CLOCK), 'sessionStart'], { input: '{"sessionId":"x"}', env: { ...process.env, AO_CLOCK_DIR: mkdtempSync(join(tmpdir(), 'clock-run-')) }, encoding: 'utf8' });
  assert.match(out, /Session clock on/);
});
