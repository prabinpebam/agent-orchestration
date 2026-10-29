// The session clock: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, config, hook, findSession, recognise, rolloverReason, samePath, step } from '../tools/clock.mjs';
import { clockHooks, CLOCK, CLOCK_HOOKS } from '../tools/install.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 31, 9, 0);
const C = { ...DEFAULTS };

/** Runs events through the clock; each is [minutes after T0, event, input]. Returns the outputs. */
function run(/** @type {[number, string, object?][]} */ events, c = C) {
  let state = null;
  return events.map(([m, e, input]) => {
    const r = step(state, e, { cwd: '/p', ...(input ?? {}) }, T0 + m * MIN, c);
    state = r.state;
    return r.output;
  });
}
const tool = (m, toolName = 'view', toolArgs = {}) => [m, 'postToolUse', { toolName, toolArgs }];
const said = (o) => String(o.additionalContext ?? '');

test('a session start says what the clock will ask for', () => {
  const [o] = run([[0, 'sessionStart']]);
  assert.match(said(o), /progress review every 30 minutes/);
  assert.match(said(o), /90 minutes, 300 tool calls, 2 compactions/);
});

test('the clock is mandatory: the entry point, the installed section, the reviewer and every reminder say so', () => {
  const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
  const entry = read('skills', 'orchestrate', 'SKILL.md');
  assert.match(entry, /^## The clock: required/m);
  assert.match(entry, /\*\*The clock is mandatory\.\*\*/);
  assert.match(entry, /\*\*Never weaken it\.\*\*/);
  assert.match(entry, /\*\*Without hooks, be the clock by hand\.\*\*/);
  assert.match(entry, /^description:.*mandatory session clock/m);
  assert.match(read('tools', 'install.mjs'), /session clock[^\n]*\*\*mandatory\*\*[^\n]*never disable it/);
  assert.match(read('agents', 'throughput-reviewer.agent.md'), /missing clock or an ignored reminder is the top finding/);
  assert.match(read('skills', 'progress-review', 'SKILL.md'), /missing clock or an ignored reminder is the top finding/);
  const out = run([[0, 'sessionStart'], tool(31), [91, 'postToolUse', { toolName: 'view' }], [92, 'agentStop', {}]]);
  assert.match(said(out[0]), /mandatory/);
  assert.match(said(out[0]), /never disable the clock or loosen its limits/);
  assert.match(said(out[1]), /^Session clock \(required\): progress review due/);
  assert.match(said(out[2]), /Session clock \(required\): roll over/);
  assert.match(String(out[3].reason), /^Session clock \(required\): this session should roll over/);
});

test('a progress review is asked for after the interval, not before, and again every 5 minutes until it is done', () => {
  const out = run([[0, 'sessionStart'], tool(10), tool(29), tool(30), tool(32), tool(35), tool(36)]);
  assert.equal(said(out[1]), '');
  assert.equal(said(out[2]), '');
  assert.match(said(out[3]), /progress review due \(last \d\d:\d\d, 30 minutes ago\)/);
  assert.match(said(out[3]), /throughput-reviewer/);
  assert.equal(said(out[4]), '', 'not again within 5 minutes');
  assert.match(said(out[5]), /35 minutes ago, 5 overdue/);
  assert.equal(said(out[6]), '');
});

test('running the throughput reviewer or loading the progress-review skill counts as the review', () => {
  for (const done of [tool(31, 'task', { agent_type: 'throughput-reviewer', prompt: '…' }), tool(31, 'skill', { skill: 'progress-review' })]) {
    const out = run([[0, 'sessionStart'], tool(30), done, tool(40), tool(61)]);
    assert.match(said(out[1]), /review due/);
    assert.equal(said(out[3]), '', `${done[1].toolName}: no reminder 9 minutes after the review`);
    assert.match(said(out[4]), /review due \(last \d\d:\d\d, 30 minutes ago\)/, `${done[1].toolName}: due again 30 minutes after it`);
  }
  assert.equal(recognise('task', { agent_type: 'explore' }), null);
  assert.equal(recognise('skill', { skill: 'coordinate' }), null);
  for (const command of ['mark review', 'mark rollover']) {
    assert.equal(recognise('powershell', { command: `node orchestration-clock.mjs ${command}` }), null, 'the CLI updates only its selected clock on success, never inferred from tool arguments');
  }
});

test('a roll-over is asked for after the time limit, the tool-call limit or the compaction limit', () => {
  assert.equal(rolloverReason({ started: T0, tools: 0, compactions: 0 }, T0 + 89 * MIN, C), null);
  assert.match(rolloverReason({ started: T0, tools: 0, compactions: 0 }, T0 + 90 * MIN, C), /run 90 minutes/);
  assert.match(rolloverReason({ started: T0, tools: 300, compactions: 0 }, T0, C), /300 tool calls/);
  assert.match(rolloverReason({ started: T0, tools: 0, compactions: 2 }, T0, C), /compacted 2 times/);
  assert.equal(rolloverReason({ started: T0, tools: 1e6, compactions: 9 }, T0 + 1e9, { ...C, rolloverMin: 0, rolloverTools: 0, rolloverCompactions: 0 }), null, '0 turns a limit off');

  const out = run([[0, 'sessionStart'], [5, 'preCompact'], tool(6), [7, 'preCompact'], tool(8), tool(10), tool(13)], { ...C, reviewMin: 0 });
  assert.equal(said(out[2]), '');
  assert.match(said(out[4]), /roll over to a new session as soon as possible, because its context has been compacted 2 times/);
  assert.match(said(out[4]), /commit the verified work, write the handoff/);
  assert.equal(said(out[5]), '', 'not again within 5 minutes');
  assert.match(said(out[6]), /due for 5 minutes/);
});

test('worker launches never silence the coordinator or weaken any clock limit', () => {
  assert.deepEqual([DEFAULTS.reviewMin, DEFAULTS.rolloverMin, DEFAULTS.rolloverTools, DEFAULTS.rolloverCompactions], [30, 90, 300, 2]);
  for (const name of ['create_session', 'mcp_create_session', 'new_session', 'start_session']) {
    assert.equal(recognise(name, { prompt: 'Read the handoff and resume' }), null);
    const out = run([[0, 'sessionStart'], tool(1, name), tool(30), tool(90), [91, 'agentStop', {}]]);
    assert.match(said(out[2]), /progress review due/);
    assert.match(said(out[3]), /run 90 minutes/);
    assert.match(said(out[3]), /Coordinators: hand the registry\/queue to one fresh coordinator/);
    assert.match(said(out[3]), /without waiting for or restarting workers/);
    assert.equal(out[4].decision, 'block');
  }
  const start = step(null, 'sessionStart', {}, T0, C).state;
  for (const [state, expected] of [[{ ...start, tools: 299 }, /300 tool calls/], [{ ...start, compactions: 2 }, /compacted 2 times/]]) {
    const result = step(state, 'postToolUse', { toolName: 'create_session' }, T0 + MIN, C);
    assert.equal(result.state.rolledOver, 0);
    assert.match(said(result.output), expected);
  }
});

test('at the end of a turn with a roll-over due, it asks for one more turn, once, and never when already continuing', () => {
  const before = run([[0, 'sessionStart'], [80, 'agentStop', {}]]);
  assert.deepEqual(before[1], {});
  const due = run([[0, 'sessionStart'], [91, 'agentStop', {}], [92, 'agentStop', {}]]);
  assert.equal(due[1].decision, 'block');
  assert.match(String(due[1].reason), /should roll over, because it has run 91 minutes/);
  assert.match(String(due[1].reason), /ask them in one line/);
  assert.deepEqual(due[2], {}, 'once');
  assert.deepEqual(run([[0, 'sessionStart'], [91, 'agentStop', { stopHookActive: true }]])[1], {});
});

test('limits come from the hook environment; bad values fall back to the defaults', () => {
  assert.deepEqual(config({ AO_REVIEW_MIN: '15', AO_ROLLOVER_MIN: '0', AO_ROLLOVER_TOOLS: 'lots', AO_CLOCK_CMD: 'node x.mjs' }), { ...DEFAULTS, reviewMin: 15, rolloverMin: 0, cmd: 'node x.mjs' });
});

test('the hook keeps one state file per session, reads both payload styles, and never fails the tool', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-'));
  const env = { AO_CLOCK_DIR: dir };
  assert.match(hook('sessionStart', JSON.stringify({ sessionId: 's/1', cwd: '/p' }), env, T0), /Session clock on/);
  assert.equal(hook('postToolUse', JSON.stringify({ session_id: 's/1', cwd: '/p', tool_name: 'view', tool_input: {} }), env, T0 + 31 * MIN).includes('review due'), true);
  const state = JSON.parse(readFileSync(join(dir, 's_1.json'), 'utf8'));
  assert.equal(state.tools, 1);
  assert.equal(hook('postToolUse', 'not json', env, T0), '{}');
  assert.equal(hook('postToolUse', '', { AO_CLOCK_DIR: join(dir, 's_1.json', 'x') }, T0), '{}', 'an unwritable folder');
});

test('from the command line: a hook event on stdin, then mark and status for the only session in the folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-cli-'));
  const cwd = mkdtempSync(join(tmpdir(), 'clock-project-'));
  const clock = join(ROOT, 'tools', 'clock.mjs');
  const env = { ...process.env, AO_CLOCK_DIR: dir, AO_REVIEW_MIN: '0' };
  const out = execFileSync(process.execPath, [clock, 'sessionStart'], { input: JSON.stringify({ sessionId: 'abc', cwd }), env, encoding: 'utf8' });
  assert.match(JSON.parse(out).additionalContext, /Session clock on/);
  assert.match(execFileSync(process.execPath, [clock, 'mark', 'review'], { cwd, env, encoding: 'utf8' }), /Marked review/);
  assert.match(execFileSync(process.execPath, [clock, 'status'], { cwd, env, encoding: 'utf8' }), /0 tool calls, 0 compactions; last review \d\d:\d\d; no roll-over due/);
});

test('explicit clock selection and successful handover leave other sessions and their limits alone', (t) => {
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
  assert.deepEqual(readState('worker'), worker, 'worker clock is not reset or marked by coordinator handover');
  const now = Date.now() + MIN;
  const event = (id, name = 'view', args = {}) => JSON.parse(hook('postToolUse', JSON.stringify({ sessionId: id, cwd, toolName: name, toolArgs: args }), env, now));
  assert.match(said(event('coordinator')), /handed over to a new one/);
  assert.equal(said(event('coordinator')), '', 'handed-over reminder is rate-limited');
  assert.match(said(event('worker', 'powershell', { command: 'node orchestration-clock.mjs mark rollover --session missing' })), /roll over/, 'a failed mark is not treated as handover by the hook');
  assert.equal(readState('worker').rolledOver, 0);
  assert.deepEqual(JSON.parse(hook('agentStop', JSON.stringify({ sessionId: 'coordinator', cwd }), env, now)), {});
});

test('status and mark find the session when the hook reports the folder in another letter case on Windows', () => {
  assert.ok(samePath('e:\\Projects\\app', 'E:\\Projects\\app', 'win32'), 'drive letter');
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

test('the installer writes the Copilot hooks once, keeps a tuned copy, and the hooks run the installed clock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clock-install-'));
  const h = clockHooks(dir, false);
  assert.equal(h.file, join(dir, '.github', 'hooks', CLOCK_HOOKS));
  const json = JSON.parse(h.text);
  assert.equal(json.version, 1);
  assert.deepEqual(Object.keys(json.hooks), ['sessionStart', 'postToolUse', 'preCompact', 'agentStop']);
  assert.equal(json.hooks.postToolUse[0].command, `node .github/hooks/${CLOCK} postToolUse`);
  for (const entries of Object.values(json.hooks)) {
    const env = entries[0].env;
    assert.deepEqual([env.AO_REVIEW_MIN, env.AO_ROLLOVER_MIN, env.AO_ROLLOVER_TOOLS, env.AO_ROLLOVER_COMPACTIONS], ['30', '90', '300', '2']);
  }
  assert.match(clockHooks(dir, true).text, /node \\"[^"]+\/\.copilot\/hooks\/orchestration-clock\.mjs\\" agentStop/);

  const install = () => execFileSync(process.execPath, [join(ROOT, 'tools', 'install.mjs'), dir, '--for', 'copilot'], { encoding: 'utf8' });
  assert.match(install(), /with the session clock/);
  assert.ok(existsSync(join(dir, '.github', 'hooks', CLOCK)));
  writeFileSync(h.file, h.text.replace('"AO_REVIEW_MIN": "30"', '"AO_REVIEW_MIN": "20"'));
  assert.match(install(), /keep .*orchestration-clock\.json/);
  assert.match(readFileSync(h.file, 'utf8'), /"AO_REVIEW_MIN": "20"/);

  const out = execFileSync(process.execPath, [join(dir, '.github', 'hooks', CLOCK), 'sessionStart'], { input: '{"sessionId":"x"}', env: { ...process.env, AO_CLOCK_DIR: mkdtempSync(join(tmpdir(), 'clock-run-')) }, encoding: 'utf8' });
  assert.match(out, /Session clock on/);
});
